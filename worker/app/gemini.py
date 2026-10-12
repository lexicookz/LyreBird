"""Gemini client and the one call the worker makes.

The Gemini API key lives only in the worker, so every model call goes through
here. Nothing in this module touches Supabase — the router owns that — which
keeps the model call testable on its own.
"""

from __future__ import annotations

import random
import re
import time
from functools import lru_cache
from pathlib import Path

from google import genai
from google.genai import types

import json

from pydantic import BaseModel

from app.analysis import AnalysisResult
from app.brief_schema import BrandProfile, BriefDraft
from app.config import settings
from app.prompts import load, load_latest

# The prompt itself lives in app/prompts/analyse.v<n>.txt, not here. Which
# version ran is written to analyses.prompt_version, and published versions
# are never edited -- see app/prompts.py for why that matters.
PROMPT_NAME = "analyse"
BRIEF_PROMPT_NAME = "brief"


# Low but not zero: the taxonomy fields should be near-deterministic, while
# the prose fields still need to read like language.
TEMPERATURE = 0.1

# Google processes an uploaded video before it can be referenced. These bound
# the wait so a stuck upload fails rather than hanging the request.
_POLL_INTERVAL_SECONDS = 2.0
_POLL_TIMEOUT_SECONDS = 10 * 60


# An unbounded call is the failure mode BE-14 is about: pull the network and
# the request never returns, so the app shows a spinner forever. A video
# analysis is slow but not unbounded, so this is generous and finite.
_REQUEST_TIMEOUT_MS = 5 * 60 * 1000

# Retry schedule.
#
# This was one retry two seconds later, which BE-14 specified for a dropped
# connection -- the right shape for that failure, and the wrong one for the
# failure we actually get. Gemini returns 503 "this model is currently
# experiencing high demand" intermittently, and two seconds is nowhere near
# long enough to ride that out: the deployed worker failed three analyses out
# of three while the same call from a laptop succeeded three times out of
# four. Capacity needs waiting, not immediacy.
#
# The delay doubles from _RETRY_BASE_SECONDS, and _RETRY_BUDGET_SECONDS caps
# the whole call -- attempts included, not just the sleeping. That is what
# keeps a dead API from multiplying the wait, which was the original concern:
# slow failures use the budget up in two or three attempts, fast ones get all
# of them.
_RETRY_BASE_SECONDS = 2.0
_RETRY_MAX_SLEEP_SECONDS = 20.0
_RETRY_BUDGET_SECONDS = 60.0

# Substrings that mean "this might work if we try again". Matched against the
# exception type and message because the SDK surfaces transport failures from
# several underlying libraries rather than one exception class.
#
# 429 and RESOURCE_EXHAUSTED are in here deliberately: a per-minute rate limit
# clears inside the budget, which is the common case on a shared key with the
# whole group testing at once. A daily quota does not, and retrying it would
# be fifteen wasted seconds -- but the API says which it is, so _retry_after()
# reads the delay it asks for and _call_model refuses to retry past the
# budget. See GeminiQuotaExceeded.
_TRANSIENT_MARKERS = (
    "timeout",
    "timed out",
    "deadline",
    "connection",
    "connect",
    "unavailable",
    "503",
    "504",
    "429",
    "resource_exhausted",
    "rate limit",
    "temporarily",
    "reset by peer",
)


class GeminiError(RuntimeError):
    """The model call failed, or returned something that is not a valid
    AnalysisResult. Either way nothing should be written to the database."""


class GeminiTimeout(GeminiError):
    """Timed out or could not reach the API, after every retry. Separate from
    GeminiError so the caller can say so in the row rather than reporting a
    network problem as a bad analysis."""


class GeminiQuotaExceeded(GeminiError):
    """The key's quota is gone and waiting will not help within this request.

    Distinct because the response to it is different in kind. A 503 or a
    dropped connection means try again; this means the project has spent its
    allowance, and on the free tier that allowance is 20 generate_content
    calls per day per model, shared by everyone using the key. Retrying is
    pure waste, and telling the user to 'try again in a moment' is wrong by
    about sixteen hours.
    """

    def __init__(self, message: str, retry_after_seconds: float | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


def _looks_transient(exc: BaseException) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return any(marker in text for marker in _TRANSIENT_MARKERS)


# The quota subset of _TRANSIENT_MARKERS. Those markers answer "is this worth
# retrying", which is all _call_model needs to ask -- its budget sorts out the
# rest. upload_and_wait has no retry loop and so no budget, so it has to ask
# the narrower question directly: is the key out of allowance.
#
# Deliberately narrower than "did the API name a delay": an overloaded model
# sometimes names one too, and a 503 that clears in twenty seconds is a
# timeout, not a spent quota.
_QUOTA_MARKERS = (
    "429",
    "resource_exhausted",
    "rate limit",
)


def _looks_like_quota(exc: BaseException) -> bool:
    """Whether a raw SDK exception is the key running out of allowance.

    The status code is checked first and the message only as a fallback: the
    SDK sets `code` on its own ClientError, but the same rejection can arrive
    wrapped by an underlying transport library with nothing but a string.
    """
    for attribute in ("code", "status_code"):
        if getattr(exc, attribute, None) == 429:
            return True
    text = f"{type(exc).__name__} {exc}".lower()
    return any(marker in text for marker in _QUOTA_MARKERS)


# Gemini answers a 429 with how long to wait, in two shapes in the same
# payload: a RetryInfo field, and a sentence. Either is worth more than a
# guess -- "retry in 16 hours" and "retry in 20 seconds" arrive as the same
# exception type and want opposite responses.
_RETRY_INFO = re.compile(r"'retryDelay':\s*'(\d+(?:\.\d+)?)s'")
_RETRY_SENTENCE = re.compile(
    r"retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?", re.IGNORECASE
)


def _retry_after(exc: BaseException) -> float | None:
    """How long the API asked us to wait, in seconds, if it said."""
    text = str(exc)

    found = _RETRY_INFO.search(text)
    if found:
        return float(found.group(1))

    found = _RETRY_SENTENCE.search(text)
    if found and any(found.groups()):
        hours, minutes, seconds = found.groups()
        return (
            float(hours or 0) * 3600 + float(minutes or 0) * 60 + float(seconds or 0)
        )
    return None


def _humanise(seconds: float) -> str:
    if seconds >= 3600:
        return f"about {seconds / 3600:.0f} hours"
    if seconds >= 60:
        return f"about {seconds / 60:.0f} minutes"
    return f"{seconds:.0f} seconds"


def _quota_exceeded(
    exc: BaseException, retry_after: float | None
) -> GeminiQuotaExceeded:
    """The message a user will read off the clip row, not a stack trace.

    error_message goes straight to the screen, so it has to say what is
    actually wrong. "Quota exceeded for metric
    generativelanguage.googleapis.com/generate_content_free_tier_requests"
    does not tell anyone that the team shares one key and has used the day's
    twenty analyses.

    retry_after is optional because the upload path can recognise a spent
    quota without being told how long to wait. Saying so is better than
    implying a number we do not have.
    """
    waiting = (
        f"the API asks us to wait {_humanise(retry_after)}"
        if retry_after is not None
        else "the API did not say for how long"
    )
    return GeminiQuotaExceeded(
        f"The Gemini key has used its quota for now -- {waiting}. On the free "
        f"tier that allowance is shared by everyone using the key, so this is "
        f"not something retrying will fix. Original error: "
        f"{type(exc).__name__}: {exc}",
        retry_after_seconds=retry_after,
    )


def _backoff(attempt: int) -> float:
    """Seconds to wait before attempt + 1, doubling and jittered.

    The jitter is not decoration. Five people testing at once hit the same
    overloaded model, back off by the same amount, and come back together --
    which is the load pattern that caused the 503 in the first place.
    Spreading the retries is what stops a queue forming.
    """
    base = min(_RETRY_BASE_SECONDS * (2 ** (attempt - 1)), _RETRY_MAX_SLEEP_SECONDS)
    return base * random.uniform(0.5, 1.5)


@lru_cache(maxsize=1)
def get_client() -> genai.Client:
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=_REQUEST_TIMEOUT_MS),
    )


def upload_and_wait(path: Path):
    """Upload a video through the Files API and block until it is usable.

    An upload is PROCESSING for a while after it lands; referencing it before
    it is ACTIVE fails. Returns the file handle to pass to generate_content.
    """
    client = get_client()

    try:
        uploaded = client.files.upload(file=str(path))
    except Exception as exc:
        if _looks_like_quota(exc):
            # Checked before _looks_transient, which matches every quota
            # rejection too now that 429 is one of its markers.
            #
            # There is no retry loop here, so nothing absorbs the wait the way
            # _call_model's budget does, and the whole delay falls to the
            # caller however short it is. Leaving this as a GeminiTimeout
            # would hand the app a 504, which it renders as "try again in a
            # moment" -- wrong by most of a day once the free tier's twenty
            # calls are gone, and with no Retry-After to correct it.
            raise _quota_exceeded(exc, _retry_after(exc)) from exc
        if _looks_transient(exc):
            raise GeminiTimeout(f"Could not reach Gemini to upload the video: {exc}") from exc
        raise GeminiError(f"Upload rejected: {type(exc).__name__}: {exc}") from exc

    deadline = time.monotonic() + _POLL_TIMEOUT_SECONDS
    while uploaded.state.name in ("PENDING", "PROCESSING"):
        if time.monotonic() > deadline:
            raise GeminiTimeout(
                f"Gemini was still processing the upload after "
                f"{_POLL_TIMEOUT_SECONDS // 60} minutes."
            )
        time.sleep(_POLL_INTERVAL_SECONDS)
        uploaded = client.files.get(name=uploaded.name)

    if uploaded.state.name == "FAILED":
        raise GeminiError("Gemini could not process the video.")

    return uploaded


def delete_file(name: str) -> None:
    """Best effort. An orphaned upload expires on Google's side anyway, so a
    failure here must not fail a request whose real work already succeeded."""
    try:
        get_client().files.delete(name=name)
    except Exception:
        pass


def _describe_empty_response(response) -> str:
    """Why the SDK could not give us a parsed object.

    This used to say "returned a response that does not match the schema"
    whatever the cause, which is a confident claim about the model's output
    and was wrong in the one case we actually hit: the JSON was fine as far
    as it went, and simply stopped mid-word because the response ran out of
    room. Hours went into looking for the mismatched field.

    finish_reason says which it was, so report it. MAX_TOKENS is a budget to
    raise; SAFETY and RECITATION are the model declining and no amount of
    retrying changes them; STOP with unparseable text is the only case that
    really is a malformed response.
    """
    candidate = next(iter(getattr(response, "candidates", None) or []), None)
    finish = getattr(candidate, "finish_reason", None)
    finish_name = getattr(finish, "name", None) or (str(finish) if finish else "unknown")

    usage = getattr(response, "usage_metadata", None)
    counts = {
        "prompt": getattr(usage, "prompt_token_count", None),
        "output": getattr(usage, "candidates_token_count", None),
        "thinking": getattr(usage, "thoughts_token_count", None),
    }
    tokens = ", ".join(f"{k}={v}" for k, v in counts.items() if v is not None)
    tokens = f" Tokens: {tokens}." if tokens else ""

    raw = (getattr(response, "text", "") or "")[:500]

    if finish_name == "MAX_TOKENS":
        return (
            "Gemini ran out of output tokens before finishing the JSON, so the "
            "response is cut off rather than wrong. Raising max_output_tokens is "
            "the fix -- note that on a thinking model the reasoning is charged to "
            f"the same budget.{tokens} Truncated response: {raw}"
        )

    if finish_name in {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"}:
        return (
            f"Gemini declined to answer for this video (finish_reason "
            f"{finish_name}). This is the model refusing, not a bad request, so "
            f"retrying it unchanged will refuse again.{tokens}"
        )

    return (
        f"Gemini returned a response that does not match the schema "
        f"(finish_reason {finish_name}).{tokens} Response: {raw}"
    )


def _call_model(contents: list, schema: type[BaseModel]) -> BaseModel:
    """One model call, retried on transient failures, with BE-14's validation.

    Shared by every generation the worker does, so a brief fails the same way
    an analysis does rather than growing its own error handling.
    """
    client = get_client()

    def _once():
        return client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=TEMPERATURE,
            ),
        )

    started = time.monotonic()
    deadline = started + _RETRY_BUDGET_SECONDS
    attempts = settings.gemini_max_attempts

    response = None
    last: BaseException | None = None

    for attempt in range(1, attempts + 1):
        try:
            response = _once()
            last = None
            break
        except Exception as exc:
            if not _looks_transient(exc):
                # A rejected request or a bad key will fail the same way twice.
                raise GeminiError(f"{type(exc).__name__}: {exc}") from exc

            last = exc

            # If the API said how long to wait, believe it over the backoff
            # curve -- it knows whether this clears in ten seconds or tomorrow.
            asked = _retry_after(exc)
            delay = max(_backoff(attempt), asked or 0.0)

            if asked is not None and asked > _RETRY_BUDGET_SECONDS:
                raise _quota_exceeded(exc, asked) from exc

            if attempt == attempts:
                break

            if time.monotonic() + delay >= deadline:
                # Sleeping would spend the budget without leaving time for the
                # attempt it is waiting for, so stop here and report honestly
                # rather than waiting out the clock to fail anyway.
                break
            time.sleep(delay)

    if last is not None:
        elapsed = time.monotonic() - started
        raise GeminiTimeout(
            f"Gemini was unreachable after {attempt} attempt"
            f"{'s' if attempt != 1 else ''} over {elapsed:.0f}s: "
            f"{type(last).__name__}: {last}"
        ) from last

    # With a response_schema the SDK parses and validates for us, and leaves
    # `parsed` as None when the model returned something it could not use.
    # Nothing is persisted either way, but *why* it could not be used is the
    # difference between a prompt problem and a budget problem, so the
    # message has to distinguish them -- see _describe_empty_response.
    parsed = getattr(response, "parsed", None)
    if parsed is None:
        raise GeminiError(_describe_empty_response(response))

    if not isinstance(parsed, schema):
        # Defensive: older SDK versions hand back a dict here.
        try:
            parsed = schema.model_validate(parsed)
        except Exception as exc:
            raise GeminiError(f"Response did not validate against {schema.__name__}: {exc}") from exc

    return parsed


def analyse(video_file, prompt_version: str | None = None) -> tuple[AnalysisResult, str]:
    """Run the analysis prompt against an uploaded video.

    Raises GeminiError rather than returning a partial result: the caller's
    job is to write a row or write nothing, and a half-parsed payload is the
    junk the ticket is explicit about not storing.

    Returns the result and the prompt version that produced it, so the caller
    writes the version that actually ran rather than the one it assumed.
    Passing an older version re-runs that exact prompt, which is how two
    analyses of one clip become comparable.
    """
    prompt, version = load(prompt_version) if prompt_version else load_latest(PROMPT_NAME)
    result = _call_model([video_file, prompt], AnalysisResult)
    return result, version  # type: ignore[return-value]


def write_brief(
    analysis_payload: dict,
    brand_profile: BrandProfile,
    prompt_version: str | None = None,
) -> tuple[BriefDraft, str]:
    """Adapt one clip's analysis into a brief for one brand.

    Text to text: the video is never re-uploaded. The analysis already
    describes it, and sending the file again would cost an upload and a
    minute to tell the model something it is being given in the prompt.

    Takes a BrandProfile rather than a raw brands row, so the mapping from
    column to prompt lives in one place (BrandProfile.from_brand) instead of
    being re-derived here.
    """
    prompt, version = load(prompt_version) if prompt_version else load_latest(BRIEF_PROMPT_NAME)

    contents = [
        prompt,
        "SOURCE VIDEO BREAKDOWN:\n" + json.dumps(analysis_payload, indent=2, ensure_ascii=False),
        "BRAND PROFILE:\n" + brand_profile.model_dump_json(indent=2),
    ]
    result = _call_model(contents, BriefDraft)
    return result, version  # type: ignore[return-value]

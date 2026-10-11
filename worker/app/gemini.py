"""Gemini client and the one call the worker makes.

The Gemini API key lives only in the worker, so every model call goes through
here. Nothing in this module touches Supabase — the router owns that — which
keeps the model call testable on its own.
"""

from __future__ import annotations

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

# One retry, as the ticket specifies -- enough to ride out a dropped
# connection, few enough that a genuinely unreachable API fails quickly
# instead of multiplying the wait.
_RETRY_BACKOFF_SECONDS = 2.0

# Substrings that mean "this might work if we try again". Matched against the
# exception type and message because the SDK surfaces transport failures from
# several underlying libraries rather than one exception class.
_TRANSIENT_MARKERS = (
    "timeout",
    "timed out",
    "deadline",
    "connection",
    "connect",
    "unavailable",
    "503",
    "504",
    "temporarily",
    "reset by peer",
)


class GeminiError(RuntimeError):
    """The model call failed, or returned something that is not a valid
    AnalysisResult. Either way nothing should be written to the database."""


class GeminiTimeout(GeminiError):
    """Timed out or could not reach the API, after the retry. Separate from
    GeminiError so the caller can say so in the row rather than reporting a
    network problem as a bad analysis."""


def _looks_transient(exc: BaseException) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return any(marker in text for marker in _TRANSIENT_MARKERS)


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


def _call_model(contents: list, schema: type[BaseModel]) -> BaseModel:
    """One model call with the retry and validation rules BE-14 set out.

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

    try:
        response = _once()
    except Exception as first:
        if not _looks_transient(first):
            # A rejected request or a bad key will fail the same way twice.
            raise GeminiError(f"{type(first).__name__}: {first}") from first

        time.sleep(_RETRY_BACKOFF_SECONDS)
        try:
            response = _once()
        except Exception as second:
            raise GeminiTimeout(
                f"Gemini was unreachable after one retry: {type(second).__name__}: {second}"
            ) from second

    # With a response_schema the SDK parses and validates for us, and leaves
    # `parsed` as None when the model returned something that does not fit.
    # That is the loud failure: the raw text goes in the message so the cause
    # is visible, but nothing is persisted.
    parsed = getattr(response, "parsed", None)
    if parsed is None:
        raw = (getattr(response, "text", "") or "")[:500]
        raise GeminiError(f"Gemini returned a response that does not match the schema: {raw}")

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

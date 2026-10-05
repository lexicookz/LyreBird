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

from app.analysis import AnalysisResult
from app.config import settings

# Bumped whenever the prompt below changes. It is written to
# analyses.prompt_version so two runs can be told apart later — the whole
# reason analyses live in their own table rather than as a column on clips.
PROMPT_VERSION = "analyse-v1"

PROMPT = (
    "Analyse this short-form video and fill in every field.\n\n"
    "Transcribe speech verbatim. Report the on-screen text as it appears, in "
    "order. Break the video into its structural beats — the moves it makes, "
    "not a shot list of camera angles. Describe pacing in terms a creator "
    "would use. Classify the funnel stage and format from the options given, "
    "choosing the closest fit rather than leaving a field empty.\n\n"
    "Describe only what is in the video. Do not infer the brand, the product "
    "or the creator's intent from outside it."
)

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


def analyse(video_file) -> AnalysisResult:
    """Run the analysis prompt against an uploaded video.

    Raises GeminiError rather than returning a partial result: the caller's
    job is to write a row or write nothing, and a half-parsed payload is the
    junk the ticket is explicit about not storing.
    """
    client = get_client()

    def _call():
        return client.models.generate_content(
            model=settings.gemini_model,
            contents=[video_file, PROMPT],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AnalysisResult,
                temperature=TEMPERATURE,
            ),
        )

    try:
        response = _call()
    except Exception as first:
        if not _looks_transient(first):
            # A rejected request or a bad key will fail the same way twice.
            raise GeminiError(f"{type(first).__name__}: {first}") from first

        time.sleep(_RETRY_BACKOFF_SECONDS)
        try:
            response = _call()
        except Exception as second:
            raise GeminiTimeout(
                f"Gemini was unreachable after one retry: {type(second).__name__}: {second}"
            ) from second

    # With a response_schema the SDK parses and validates for us, and leaves
    # `parsed` as None when the model returned something that does not fit.
    # That is the loud failure the ticket asks for — the raw text goes in the
    # message so the cause is visible, but nothing is persisted.
    parsed = getattr(response, "parsed", None)
    if parsed is None:
        raw = (getattr(response, "text", "") or "")[:500]
        raise GeminiError(f"Gemini returned a response that does not match the schema: {raw}")

    if not isinstance(parsed, AnalysisResult):
        # Defensive: older SDK versions hand back a dict here.
        try:
            parsed = AnalysisResult.model_validate(parsed)
        except Exception as exc:
            raise GeminiError(f"Response did not validate against AnalysisResult: {exc}") from exc

    return parsed

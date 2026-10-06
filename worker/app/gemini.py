"""The worker's Gemini client and the calls it makes.

The call itself lives in pipeline/gemini_call.py, shared with the pipeline so
there is one implementation rather than two that drift. This module supplies
the worker's half: its client, its policy, and the error types the routers
already handle.

The policy here is BE-14's and is deliberately different from the pipeline's.
A request has a phone waiting on it, so one retry and then a clear failure
beats riding out a rate limit for several minutes.

Nothing here touches Supabase -- the routers own that -- which keeps the model
call testable on its own.
"""

from __future__ import annotations

from functools import lru_cache

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.analysis import AnalysisResult
from app.config import settings
from app.prompts import load, load_latest

# The prompts live in app/prompts/<name>.v<n>.txt, not here. Which version ran
# is written to analyses.prompt_version, and published versions are never
# edited -- see app/prompts.py for why that matters.
PROMPT_NAME = "analyse"

# Low but not zero: the taxonomy fields should be near-deterministic, while
# the prose fields still need to read like language.
TEMPERATURE = 0.1

# An unbounded call is the failure mode BE-14 is about: pull the network and
# the request never returns, so the app shows a spinner forever.
_REQUEST_TIMEOUT_MS = 5 * 60 * 1000

# One retry, as BE-14 specifies -- two attempts in total. Enough to ride out a
# dropped connection, few enough that an unreachable API fails quickly instead
# of multiplying the wait.
_MAX_ATTEMPTS = 2
_RETRY_BACKOFF_SECONDS = 2.0

# Transport failures, which the SDK surfaces from several underlying libraries
# rather than one exception class -- hence matching on the text.
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
    """The call failed, or returned something that does not match the schema.
    Either way nothing should be written to the database."""


class GeminiTimeout(GeminiError):
    """Timed out or could not be reached, after the retry. Separate from
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


def _translate(exc: BaseException) -> GeminiError:
    """Map the shared module's errors onto the worker's two, which the routers
    turn into 504 and 422 respectively."""
    from gemini_call import GeminiRateLimited, GeminiUploadFailed

    if isinstance(exc, GeminiRateLimited) or _looks_transient(exc):
        return GeminiTimeout(str(exc))
    if isinstance(exc, GeminiUploadFailed):
        return GeminiError(str(exc))
    return GeminiError(f"{type(exc).__name__}: {exc}")


def upload_and_wait(path):
    """Upload a video through the Files API and block until it is usable."""
    import gemini_call

    try:
        return gemini_call.upload_and_wait(get_client(), str(path))
    except Exception as exc:
        raise _translate(exc) from exc


def delete_file(name: str) -> None:
    """Best effort. An orphaned upload expires on Google's side anyway, so a
    failure here must not fail a request whose real work already succeeded."""
    try:
        get_client().files.delete(name=name)
    except Exception:
        pass


def _call(contents: list, schema: type[BaseModel]) -> BaseModel:
    import gemini_call

    try:
        return gemini_call.generate(
            get_client(),
            contents,
            schema,
            model=settings.gemini_model,
            temperature=TEMPERATURE,
            max_attempts=_MAX_ATTEMPTS,
            # Wider than the shared default: BE-14 is about a dropped
            # network, not just a busy service, so transport timeouts and
            # connection resets count as worth one more go.
            should_retry=_looks_transient,
            backoff_seconds=lambda _attempt: _RETRY_BACKOFF_SECONDS,
            # No next_client: the worker has one key, and rotating mid-call
            # would orphan the uploaded file, which belongs to the project of
            # the key that uploaded it.
        )
    except Exception as exc:
        raise _translate(exc) from exc


def analyse(video_file, prompt_version: str | None = None) -> tuple[AnalysisResult, str]:
    """Run the analysis prompt against an uploaded video.

    Returns the result and the prompt version that produced it, so the caller
    writes the version that actually ran rather than the one it assumed.
    Passing an older version re-runs that exact prompt, which is how two
    analyses of one clip become comparable.
    """
    prompt, version = load(prompt_version) if prompt_version else load_latest(PROMPT_NAME)
    result = _call([video_file, prompt], AnalysisResult)
    return result, version  # type: ignore[return-value]

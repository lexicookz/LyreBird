"""The Gemini call, in one place.

Both /pipeline and /worker analyse video with the Files API and a
response_schema. They had grown separate copies that had quietly diverged on
three things that matter: how many times to retry, which model to use, and
whether the upload and the generate call share a client. This module is the
one implementation; the callers supply the policy.

It lives beside schema.py because the pipeline owns the analysis contract and
the worker already imports from here. It deliberately reads no environment and
raises nothing at import time, so importing it cannot break a service that
only wants one of its functions.

Policy is injected rather than chosen here, because the two callers genuinely
want different things:

  * the pipeline runs batches, so riding out a rate limit with many backed-off
    attempts is the right trade
  * the worker serves a request with a phone waiting on it, so BE-14 allows
    exactly one retry before reporting a timeout

Neither is wrong, and hard-coding either would be.
"""

from __future__ import annotations

import time
from typing import Callable, Iterable, Protocol, Sequence, TypeVar

from google.genai import types
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

# Upload processing is not instant; a file must reach ACTIVE before it can be
# referenced. These bound the wait so a stuck upload fails rather than hanging.
POLL_INTERVAL_SECONDS = 2.0
POLL_TIMEOUT_SECONDS = 10 * 60

# Errors that mean "the service is busy, not that the request is wrong".
RATE_LIMIT_MARKERS = ("429", "503", "resource_exhausted", "unavailable")


class _Client(Protocol):
    files: object
    models: object


class GeminiCallError(RuntimeError):
    """The call failed in a way that will not improve by trying again."""


class GeminiRateLimited(GeminiCallError):
    """Ran out of attempts while the service was rate limiting or unavailable."""


class GeminiUploadFailed(GeminiCallError):
    """Google could not process the uploaded video, or never finished."""


def looks_rate_limited(exc: BaseException) -> bool:
    text = f"{type(exc).__name__} {exc}".lower()
    return any(marker in text for marker in RATE_LIMIT_MARKERS)


def upload_and_wait(
    client: _Client,
    path: str,
    *,
    poll_interval: float = POLL_INTERVAL_SECONDS,
    timeout: float = POLL_TIMEOUT_SECONDS,
    on_progress: Callable[[str], None] | None = None,
):
    """Upload a video and block until it is usable.

    Returns the file handle. The caller must pass the SAME client to
    `generate` afterwards: Files API resources belong to the project behind
    the key that uploaded them, so referencing one with a different key fails
    in a way that looks like a missing file.
    """
    uploaded = client.files.upload(file=path)  # type: ignore[attr-defined]

    deadline = time.monotonic() + timeout
    while uploaded.state.name in ("PENDING", "PROCESSING"):
        if time.monotonic() > deadline:
            raise GeminiUploadFailed(
                f"Gemini was still processing the upload after {timeout / 60:.0f} minutes."
            )
        if on_progress:
            on_progress(uploaded.state.name)
        time.sleep(poll_interval)
        uploaded = client.files.get(name=uploaded.name)  # type: ignore[attr-defined]

    if uploaded.state.name == "FAILED":
        raise GeminiUploadFailed("Gemini could not process the video.")

    return uploaded


def generate(
    client: _Client,
    contents: Sequence[object],
    schema: type[T],
    *,
    model: str,
    temperature: float = 0.1,
    max_attempts: int = 1,
    should_retry: Callable[[BaseException], bool] | None = None,
    backoff_seconds: Callable[[int], float] | None = None,
    next_client: Callable[[], _Client] | None = None,
    on_retry: Callable[[int, BaseException], None] | None = None,
) -> T:
    """One structured-output call, retried according to the caller's policy.

    max_attempts counts total attempts, so 1 means no retry.

    should_retry decides what is worth another go, and defaults to rate limits
    and unavailability. The worker passes a wider test that also covers
    transport timeouts, because BE-14 is about a dropped network rather than a
    busy service. Whatever it returns False for is raised immediately: a
    rejected request or a bad key fails identically every time, and retrying
    only multiplies the wait.

    next_client lets a caller rotate keys between attempts. It is NOT used for
    the first attempt, which keeps the client that uploaded the file -- see
    upload_and_wait.

    Returns the parsed model. A reply that does not fit `schema` raises rather
    than returning something half-formed: the caller's job is to write a row
    or write nothing.
    """
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        temperature=temperature,
    )

    retryable = should_retry or looks_rate_limited

    attempt_client = client
    last_error: BaseException | None = None

    for attempt in range(max_attempts):
        try:
            response = attempt_client.models.generate_content(  # type: ignore[attr-defined]
                model=model, contents=list(contents), config=config
            )
            return _parse(response, schema)
        except GeminiCallError:
            raise
        except Exception as exc:  # noqa: BLE001 - the SDK raises several types
            if not retryable(exc):
                raise GeminiCallError(f"{type(exc).__name__}: {exc}") from exc

            last_error = exc
            if attempt + 1 >= max_attempts:
                break

            if on_retry:
                on_retry(attempt + 1, exc)
            time.sleep(backoff_seconds(attempt) if backoff_seconds else 2.0)
            if next_client:
                attempt_client = next_client()

    raise GeminiRateLimited(
        f"Gemini was unreachable after {max_attempts} attempt(s): {last_error}"
    ) from last_error


def _parse(response: object, schema: type[T]) -> T:
    """With a response_schema the SDK validates for us and leaves `parsed` as
    None when the reply does not fit. That is the loud failure: the raw text
    goes in the message so the cause is visible, but nothing is returned."""
    parsed = getattr(response, "parsed", None)
    if parsed is None:
        raw = (getattr(response, "text", "") or "")[:500]
        raise GeminiCallError(f"Gemini returned a response that does not match the schema: {raw}")

    if isinstance(parsed, schema):
        return parsed

    # Older SDK versions hand back a dict here.
    try:
        return schema.model_validate(parsed)
    except Exception as exc:  # noqa: BLE001
        raise GeminiCallError(
            f"Response did not validate against {schema.__name__}: {exc}"
        ) from exc


def exponential_backoff(cap_seconds: float = 30.0) -> Callable[[int], float]:
    """2, 4, 8 ... capped. What the pipeline's batch runs want."""

    def _delay(attempt: int) -> float:
        return min(2 ** (attempt + 1), cap_seconds)

    return _delay


__all__: Iterable[str] = (
    "GeminiCallError",
    "GeminiRateLimited",
    "GeminiUploadFailed",
    "exponential_backoff",
    "generate",
    "looks_rate_limited",
    "upload_and_wait",
)

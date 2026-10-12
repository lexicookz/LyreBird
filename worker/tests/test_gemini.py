"""Quota handling in the Gemini client.

The classification tests matter more than they look: GeminiQuotaExceeded,
GeminiTimeout and GeminiError all mean "no row was written", but they mean
very different things to the caller, and the only thing separating them is
what _looks_like_quota and _looks_transient make of a raw SDK exception.
"""

import os
from types import SimpleNamespace

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")

from pydantic import BaseModel

from app import gemini


class Trivial(BaseModel):
    """Stands in for AnalysisResult. Never reached: every test here fails
    before the response is parsed."""

    value: str = ""


class FakeClientError(Exception):
    """Shaped like google.genai.errors.ClientError: a status code on the
    exception, and the server's JSON flattened into the message."""

    def __init__(self, message, code=None):
        super().__init__(message)
        if code is not None:
            self.code = code


# What a real 429 looks like once the SDK has stringified it.
QUOTA_MESSAGE = (
    "429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'You exceeded "
    "your current quota, please check your plan and billing details.', "
    "'status': 'RESOURCE_EXHAUSTED', 'details': [{'@type': "
    "'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '53s'}]}}"
)


# ---------- classification ----------


def test_quota_is_recognised_from_the_status_code():
    # No marker in the text at all: the code alone has to carry it.
    assert gemini._looks_like_quota(FakeClientError("something went wrong", code=429))


def test_quota_is_recognised_from_the_message_when_there_is_no_code():
    # The same rejection re-raised by a transport library, string only.
    assert gemini._looks_like_quota(RuntimeError(QUOTA_MESSAGE))


def test_a_transport_failure_is_not_read_as_quota():
    assert not gemini._looks_like_quota(TimeoutError("connection timed out"))


def test_quota_wins_over_the_transient_markers():
    """The overlap the ordering in _call_model exists for.

    A rejection can satisfy both predicates -- this one carries
    RESOURCE_EXHAUSTED and a "503" that _TRANSIENT_MARKERS matches. Nothing
    stops a real one doing the same, so quota has to be decided first or the
    message decides for us.
    """
    exc = FakeClientError("RESOURCE_EXHAUSTED: quota exceeded, 503 try again later")

    assert gemini._looks_like_quota(exc)
    assert gemini._looks_transient(exc)  # it really does look transient too


# ---------- Retry-After ----------


def test_retry_after_comes_from_the_retry_info_detail():
    exc = gemini._quota_exceeded(FakeClientError(QUOTA_MESSAGE, code=429), "spent")

    assert exc.retry_after_seconds == 53


def test_retry_after_rounds_a_fractional_delay_up():
    # Rounding down would send the caller back one second early, into the
    # same rejection.
    exc = gemini._quota_exceeded(RuntimeError("retryDelay: '1.2s'"), "spent")

    assert exc.retry_after_seconds == 2


def test_retry_after_falls_back_to_a_default_without_retry_info():
    exc = gemini._quota_exceeded(FakeClientError("quota exceeded", code=429), "spent")

    assert exc.retry_after_seconds == gemini._DEFAULT_RETRY_AFTER_SECONDS


def test_quota_message_keeps_the_underlying_detail():
    exc = gemini._quota_exceeded(RuntimeError("quota exceeded"), "Gemini quota exhausted")

    assert str(exc) == "Gemini quota exhausted: quota exceeded"


# ---------- the retry budget ----------


def _client_raising(*exceptions):
    """A fake genai client that raises its way down `exceptions`, recording
    how many calls it took."""
    calls = []

    def generate_content(**kwargs):
        calls.append(kwargs)
        raise exceptions[len(calls) - 1]

    return SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)), calls


def test_a_quota_rejection_is_not_retried(monkeypatch):
    """The point of checking quota before _looks_transient.

    Retrying two seconds into a spent quota buys nothing and costs a second
    call against the same exhausted key.
    """
    client, calls = _client_raising(FakeClientError(QUOTA_MESSAGE, code=429))
    monkeypatch.setattr(gemini, "get_client", lambda: client)
    monkeypatch.setattr(gemini.time, "sleep", lambda _seconds: pytest.fail("slept"))

    with pytest.raises(gemini.GeminiQuotaExceeded) as raised:
        gemini._call_model(["prompt"], Trivial)

    assert len(calls) == 1
    assert raised.value.retry_after_seconds == 53


def test_a_transient_failure_that_retries_into_quota_is_a_quota_error(monkeypatch):
    """A dropped connection followed by a 429 is a 429, not a 504."""
    client, calls = _client_raising(
        TimeoutError("connection reset by peer"),
        FakeClientError(QUOTA_MESSAGE, code=429),
    )
    monkeypatch.setattr(gemini, "get_client", lambda: client)
    monkeypatch.setattr(gemini.time, "sleep", lambda _seconds: None)

    with pytest.raises(gemini.GeminiQuotaExceeded) as raised:
        gemini._call_model(["prompt"], Trivial)

    assert len(calls) == 2
    assert raised.value.retry_after_seconds == 53


def test_two_transport_failures_are_still_a_timeout(monkeypatch):
    """Guards the ordering from the other side: adding the quota branch must
    not turn an unreachable API into a 429."""
    client, calls = _client_raising(
        TimeoutError("connection reset by peer"),
        TimeoutError("connection reset by peer"),
    )
    monkeypatch.setattr(gemini, "get_client", lambda: client)
    monkeypatch.setattr(gemini.time, "sleep", lambda _seconds: None)

    with pytest.raises(gemini.GeminiTimeout):
        gemini._call_model(["prompt"], Trivial)

    assert len(calls) == 2


def test_a_rejected_request_is_still_a_plain_gemini_error(monkeypatch):
    client, calls = _client_raising(FakeClientError("400 INVALID_ARGUMENT", code=400))
    monkeypatch.setattr(gemini, "get_client", lambda: client)
    monkeypatch.setattr(gemini.time, "sleep", lambda _seconds: pytest.fail("slept"))

    with pytest.raises(gemini.GeminiError) as raised:
        gemini._call_model(["prompt"], Trivial)

    assert not isinstance(raised.value, gemini.GeminiQuotaExceeded)
    assert not isinstance(raised.value, gemini.GeminiTimeout)
    assert len(calls) == 1


# ---------- the upload path ----------


def test_quota_on_upload_is_a_quota_error(monkeypatch):
    """The upload is a separate call against the same key, and hits the same
    wall before the model is ever reached."""

    def upload(**_kwargs):
        raise FakeClientError(QUOTA_MESSAGE, code=429)

    monkeypatch.setattr(
        gemini,
        "get_client",
        lambda: SimpleNamespace(files=SimpleNamespace(upload=upload)),
    )

    with pytest.raises(gemini.GeminiQuotaExceeded) as raised:
        gemini.upload_and_wait("video.mp4")

    assert raised.value.retry_after_seconds == 53
    assert "upload" in str(raised.value)


def test_quota_exceeded_is_a_gemini_error():
    """Callers that only care about "nothing was written" can still catch the
    one base class."""
    assert issubclass(gemini.GeminiQuotaExceeded, gemini.GeminiError)
    assert not issubclass(gemini.GeminiQuotaExceeded, gemini.GeminiTimeout)

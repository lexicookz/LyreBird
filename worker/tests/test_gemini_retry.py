"""The retry policy around a Gemini call.

This had no tests, which is how it reached production retrying once after
two seconds against a failure that needs tens of seconds. The sleeping is
patched out everywhere here -- what is under test is how many attempts are
made and what is raised, not the wall clock.
"""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from app import gemini
from app.gemini import GeminiError, GeminiQuotaExceeded, GeminiTimeout


class Tiny(BaseModel):
    value: str


class Parsed:
    """Stands in for the SDK's response object."""

    def __init__(self, value: str = "ok") -> None:
        self.parsed = Tiny(value=value)
        self.text = '{"value": "ok"}'


def overloaded() -> Exception:
    """What Gemini actually returns when the model is busy."""
    return RuntimeError(
        "ServerError: 503 UNAVAILABLE. {'error': {'code': 503, 'message': "
        "'This model is currently experiencing high demand.', 'status': 'UNAVAILABLE'}}"
    )


@pytest.fixture
def no_sleeping(monkeypatch):
    """Record the delays instead of serving them."""
    slept: list[float] = []
    monkeypatch.setattr(gemini.time, "sleep", slept.append)
    return slept


@pytest.fixture
def calls(monkeypatch):
    """Drive generate_content from a list of outcomes."""

    def arrange(*outcomes):
        attempts: list[int] = []

        class FakeModels:
            def generate_content(self, **kwargs):
                attempts.append(1)
                outcome = outcomes[min(len(attempts), len(outcomes)) - 1]
                if isinstance(outcome, Exception):
                    raise outcome
                return outcome

        class FakeClient:
            models = FakeModels()

        monkeypatch.setattr(gemini, "get_client", lambda: FakeClient())
        return attempts

    return arrange


def test_succeeds_without_retrying_when_the_api_is_healthy(calls, no_sleeping):
    attempts = calls(Parsed())
    result = gemini._call_model(["hello"], Tiny)

    assert result.value == "ok"
    assert len(attempts) == 1
    assert no_sleeping == []


def test_rides_out_a_503_that_clears(calls, no_sleeping, monkeypatch):
    monkeypatch.setattr(gemini.settings, "gemini_max_attempts", 4)
    attempts = calls(overloaded(), overloaded(), Parsed())

    result = gemini._call_model(["hello"], Tiny)

    # The old policy gave up here: two attempts, two seconds apart.
    assert result.value == "ok"
    assert len(attempts) == 3
    assert len(no_sleeping) == 2


def test_waits_longer_each_time(calls, no_sleeping, monkeypatch):
    monkeypatch.setattr(gemini.settings, "gemini_max_attempts", 4)
    calls(overloaded(), overloaded(), overloaded(), Parsed())

    gemini._call_model(["hello"], Tiny)

    # Jittered, so compare ranges rather than values. What matters is that
    # the wait grows: a flat delay is the thing that did not work.
    assert len(no_sleeping) == 3
    assert no_sleeping[0] < no_sleeping[2]
    for i, delay in enumerate(no_sleeping):
        base = gemini._RETRY_BASE_SECONDS * (2**i)
        assert base * 0.5 <= delay <= base * 1.5


def test_gives_up_after_the_configured_attempts(calls, no_sleeping, monkeypatch):
    monkeypatch.setattr(gemini.settings, "gemini_max_attempts", 3)
    attempts = calls(overloaded())

    with pytest.raises(GeminiTimeout) as caught:
        gemini._call_model(["hello"], Tiny)

    assert len(attempts) == 3
    # The count goes in the message: "it failed" and "it failed three times
    # over a minute" send the reader to different places.
    assert "3 attempts" in str(caught.value)
    assert "503" in str(caught.value)


def test_the_budget_stops_it_waiting_past_the_deadline(calls, monkeypatch):
    """A slow failure should use the budget up, not sleep through it."""
    monkeypatch.setattr(gemini.settings, "gemini_max_attempts", 10)
    monkeypatch.setattr(gemini, "_RETRY_BUDGET_SECONDS", 30.0)

    # Every attempt burns 12 seconds of a 30 second budget.
    clock = {"now": 0.0}
    monkeypatch.setattr(gemini.time, "monotonic", lambda: clock["now"])
    monkeypatch.setattr(gemini.time, "sleep", lambda s: clock.__setitem__("now", clock["now"] + s))

    real_generate = {"n": 0}

    class FakeModels:
        def generate_content(self, **kwargs):
            real_generate["n"] += 1
            clock["now"] += 12.0
            raise overloaded()

    class FakeClient:
        models = FakeModels()

    monkeypatch.setattr(gemini, "get_client", lambda: FakeClient())

    with pytest.raises(GeminiTimeout):
        gemini._call_model(["hello"], Tiny)

    # Nowhere near ten attempts, and it stopped rather than running over.
    assert real_generate["n"] < 10
    assert clock["now"] <= gemini._RETRY_BUDGET_SECONDS + 12.0


def test_a_rejected_request_is_not_retried(calls, no_sleeping):
    """A bad key or a malformed request fails the same way twice."""
    attempts = calls(ValueError("API key not valid. Please pass a valid API key."))

    with pytest.raises(GeminiError) as caught:
        gemini._call_model(["hello"], Tiny)

    assert len(attempts) == 1
    assert no_sleeping == []
    assert not isinstance(caught.value, GeminiTimeout)


def test_a_rate_limit_is_retried(calls, no_sleeping, monkeypatch):
    """429 clears within the budget often enough to be worth waiting for."""
    monkeypatch.setattr(gemini.settings, "gemini_max_attempts", 3)
    attempts = calls(
        RuntimeError("ClientError: 429 RESOURCE_EXHAUSTED. Quota exceeded for requests"),
        Parsed(),
    )

    assert gemini._call_model(["hello"], Tiny).value == "ok"
    assert len(attempts) == 2


def daily_quota_gone() -> Exception:
    """The real 429 from a free-tier key that has spent its 20 calls."""
    return RuntimeError(
        "ClientError: 429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': "
        "'You exceeded your current quota.\\n* Quota exceeded for metric: "
        "generativelanguage.googleapis.com/generate_content_free_tier_requests, "
        "limit: 20, model: gemini-3.6-flash\\nPlease retry in 15h59m51.343176997s.', "
        "'status': 'RESOURCE_EXHAUSTED', 'details': [{'@type': "
        "'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '57591s'}]}}"
    )


def test_a_daily_quota_is_not_retried_at_all(calls, no_sleeping, monkeypatch):
    monkeypatch.setattr(gemini.settings, "gemini_max_attempts", 4)
    attempts = calls(daily_quota_gone())

    with pytest.raises(GeminiQuotaExceeded) as caught:
        gemini._call_model(["hello"], Tiny)

    # One attempt, no sleeping. Retrying something the API said to come back
    # for in sixteen hours is fifteen seconds of pure waste.
    assert len(attempts) == 1
    assert no_sleeping == []
    assert caught.value.retry_after_seconds == pytest.approx(57591)


def test_the_quota_message_says_what_a_reader_needs(calls, no_sleeping):
    calls(daily_quota_gone())

    with pytest.raises(GeminiQuotaExceeded) as caught:
        gemini._call_model(["hello"], Tiny)

    message = str(caught.value)
    # This lands in clips.error_message and goes straight to the screen.
    assert "about 16 hours" in message
    assert "shared" in message
    assert "retrying will" in message


def test_a_short_retry_after_is_honoured_rather_than_refused(calls, no_sleeping, monkeypatch):
    """A per-minute limit is the retryable kind, and the wait is respected."""
    monkeypatch.setattr(gemini.settings, "gemini_max_attempts", 3)
    attempts = calls(
        RuntimeError(
            "ClientError: 429 RESOURCE_EXHAUSTED. {'error': {'code': 429, "
            "'details': [{'@type': 'type.googleapis.com/google.rpc.RetryInfo', "
            "'retryDelay': '18s'}]}}"
        ),
        Parsed(),
    )

    assert gemini._call_model(["hello"], Tiny).value == "ok"
    assert len(attempts) == 2
    # Backoff alone would have waited about 2s; the API asked for 18.
    assert no_sleeping == [pytest.approx(18.0)]


@pytest.mark.parametrize(
    "text, expected",
    [
        ("'retryDelay': '57591s'", 57591.0),
        ("'retryDelay': '18s'", 18.0),
        ("Please retry in 15h59m51.343176997s.", 15 * 3600 + 59 * 60 + 51.343176997),
        ("Please retry in 30s.", 30.0),
        ("503 UNAVAILABLE. high demand", None),
    ],
)
def test_retry_after_reads_both_shapes(text, expected):
    found = gemini._retry_after(RuntimeError(text))
    if expected is None:
        assert found is None
    else:
        assert found == pytest.approx(expected)


def test_one_attempt_is_still_allowed(calls, no_sleeping, monkeypatch):
    """gemini_max_attempts=1 means no retry, and must not sleep or crash."""
    monkeypatch.setattr(gemini.settings, "gemini_max_attempts", 1)
    attempts = calls(overloaded())

    with pytest.raises(GeminiTimeout) as caught:
        gemini._call_model(["hello"], Tiny)

    assert len(attempts) == 1
    assert no_sleeping == []
    assert "1 attempt " in str(caught.value)

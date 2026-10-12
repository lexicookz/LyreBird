"""What the worker says when Gemini gives back nothing usable.

These messages are not developer trivia: they are written to
clips.error_message and shown on the screen. The old one asserted the
model's output did not match the schema regardless of what actually
happened, and the one real occurrence was a response that ran out of
tokens mid-word -- the JSON was correct as far as it reached. Saying
"does not match the schema" sent the reader looking for a bad field.
"""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from app import gemini
from app.gemini import GeminiError


class Tiny(BaseModel):
    value: str


class Usage:
    def __init__(self, prompt=2831, output=632, thoughts=731):
        self.prompt_token_count = prompt
        self.candidates_token_count = output
        self.thoughts_token_count = thoughts


class Finish:
    def __init__(self, name: str) -> None:
        self.name = name


class Candidate:
    def __init__(self, finish_reason) -> None:
        self.finish_reason = finish_reason


class Response:
    """Stands in for the SDK response when `parsed` came back None."""

    def __init__(self, finish: str | None, text: str = "", usage=None) -> None:
        self.parsed = None
        self.text = text
        self.candidates = [Candidate(Finish(finish))] if finish else []
        self.usage_metadata = usage


@pytest.fixture
def returns(monkeypatch):
    def arrange(response):
        class FakeModels:
            def generate_content(self, **kwargs):
                return response

        class FakeClient:
            models = FakeModels()

        monkeypatch.setattr(gemini, "get_client", lambda: FakeClient())

    return arrange


TRUNCATED = '{\n  "hook": "my best tip",\n  "transcript": "and then you start implementing the perso'


def test_a_truncated_response_is_not_reported_as_a_schema_mismatch(returns):
    returns(Response("MAX_TOKENS", TRUNCATED, Usage()))

    with pytest.raises(GeminiError) as caught:
        gemini._call_model(["hello"], Tiny)

    message = str(caught.value)
    assert "ran out of output tokens" in message
    assert "cut off rather than wrong" in message
    assert "does not match the schema" not in message
    # The token counts are the evidence for raising the budget, and on a
    # thinking model the reasoning competes for the same room.
    assert "thinking=731" in message
    assert "max_output_tokens" in message


def test_a_refusal_says_retrying_will_not_help(returns):
    returns(Response("SAFETY", "", Usage(output=0, thoughts=0)))

    with pytest.raises(GeminiError) as caught:
        gemini._call_model(["hello"], Tiny)

    message = str(caught.value)
    assert "declined" in message
    assert "refuse again" in message


def test_a_genuinely_malformed_response_still_says_so(returns):
    returns(Response("STOP", "not json at all", Usage()))

    with pytest.raises(GeminiError) as caught:
        gemini._call_model(["hello"], Tiny)

    message = str(caught.value)
    assert "does not match the schema" in message
    assert "STOP" in message
    assert "not json at all" in message


def test_a_response_with_no_candidates_does_not_crash(returns):
    """Reporting the failure must not fail: this runs on the error path."""
    returns(Response(None, "", None))

    with pytest.raises(GeminiError) as caught:
        gemini._call_model(["hello"], Tiny)

    assert "unknown" in str(caught.value)


def test_the_raw_response_is_capped(returns):
    """error_message is a database column and a screen, not a log file."""
    returns(Response("STOP", "x" * 5000, Usage()))

    with pytest.raises(GeminiError) as caught:
        gemini._call_model(["hello"], Tiny)

    assert str(caught.value).count("x") == 500

"""How the brief endpoints report a Gemini failure.

Only the three failure paths are covered here. They share one `try` in
_generate_and_insert, and GeminiQuotaExceeded and GeminiTimeout are both
subclasses of GeminiError, so the `except` order is the whole behaviour: get
it wrong and a spent quota is reported as a malformed model response, which
tells the app to give up on a request that would succeed in a minute.
"""

import os
from types import SimpleNamespace
from uuid import UUID

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import briefs


CLIP_ID = UUID("11111111-1111-4111-8111-111111111111")
OWNER_ID = UUID("22222222-2222-4222-8222-222222222222")
BRAND_ID = UUID("33333333-3333-4333-8333-333333333333")
ANALYSIS_ID = UUID("44444444-4444-4444-8444-444444444444")
BRIEF_ID = UUID("55555555-5555-4555-8555-555555555555")

TIMESTAMPS = {
    "created_at": "2026-10-08T00:00:00Z",
    "updated_at": "2026-10-08T00:00:00Z",
}


class FakeTable:
    """Swallows the whole PostgREST builder chain and hands back fixed rows.

    The brief endpoints only ever read, so select/eq/order/limit all collapse
    to the same thing: these tests never reach an insert.
    """

    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def insert(self, _data):  # pragma: no cover - a failure never gets here
        raise AssertionError("nothing should be inserted when the model call fails")

    def execute(self):
        return SimpleNamespace(data=self.rows)


class FakeClient:
    def __init__(self, **tables):
        self.tables = tables

    def table(self, name):
        return FakeTable(self.tables.get(name, []))


def rows(**overrides):
    """Every row the brief endpoints read, consistently owned by OWNER_ID."""
    tables = {
        "clips": [
            {
                "id": str(CLIP_ID),
                "owner_id": str(OWNER_ID),
                "storage_path": f"{OWNER_ID}/original-480p.mp4",
                "status": "ready",
                "title": "Test clip",
                **TIMESTAMPS,
            }
        ],
        "brands": [
            {
                "id": str(BRAND_ID),
                "owner_id": str(OWNER_ID),
                "name": "Test brand",
                "product_summary": "A thing that does a thing",
                "target_audience": "People who need the thing",
                "tone_of_voice": "Dry",
                "keywords": [],
                "constraints": [],
                **TIMESTAMPS,
            }
        ],
        "analyses": [
            {
                "id": str(ANALYSIS_ID),
                "owner_id": str(OWNER_ID),
                "clip_id": str(CLIP_ID),
                "payload": {"summary": "a video about a thing"},
                "model_version": "gemini-3.8-flash",
                "prompt_version": "analyse-v2",
                **TIMESTAMPS,
            }
        ],
        "briefs": [
            {
                "id": str(BRIEF_ID),
                "owner_id": str(OWNER_ID),
                "clip_id": str(CLIP_ID),
                "brand_id": str(BRAND_ID),
                "analysis_id": str(ANALYSIS_ID),
                **TIMESTAMPS,
            }
        ],
    }
    tables.update(overrides)
    return tables


app = FastAPI()
app.include_router(briefs.router)
client = TestClient(app)

REQUEST = {"clip_id": str(CLIP_ID), "brand_id": str(BRAND_ID)}


def fail_with(monkeypatch, exception):
    monkeypatch.setattr(briefs, "get_client", lambda: FakeClient(**rows()))

    def fail(_payload, _profile, _prompt_version):
        raise exception

    monkeypatch.setattr(briefs, "write_brief", fail)


# ---------- POST /briefs ----------


def test_create_returns_429_with_retry_after_when_the_quota_is_spent(monkeypatch):
    fail_with(
        monkeypatch,
        briefs.GeminiQuotaExceeded("Gemini quota exhausted: out of quota", retry_after_seconds=53),
    )

    response = client.post("/briefs", json=REQUEST)

    assert response.status_code == 429
    # The header is the point. Without it the app has nothing to back off by
    # and retries straight back into the same wall.
    assert response.headers["Retry-After"] == "53"
    assert response.json() == {"detail": "Gemini quota exhausted: out of quota"}


def test_create_omits_retry_after_when_the_api_did_not_say_how_long(monkeypatch):
    """retry_after_seconds is optional -- a quota rejection that carried no
    RetryInfo still has to come back as a 429, just without the header."""
    fail_with(monkeypatch, briefs.GeminiQuotaExceeded("quota is gone"))

    response = client.post("/briefs", json=REQUEST)

    assert response.status_code == 429
    assert "Retry-After" not in response.headers


def test_create_still_returns_504_when_gemini_is_unreachable(monkeypatch):
    fail_with(monkeypatch, briefs.GeminiTimeout("Gemini was unreachable after one retry"))

    response = client.post("/briefs", json=REQUEST)

    assert response.status_code == 504
    assert "Retry-After" not in response.headers


def test_create_still_returns_422_when_the_response_does_not_validate(monkeypatch):
    fail_with(monkeypatch, briefs.GeminiError("Gemini returned a response that does not match"))

    response = client.post("/briefs", json=REQUEST)

    assert response.status_code == 422
    assert "Retry-After" not in response.headers


# ---------- POST /briefs/{brief_id}/regenerate ----------


def test_regenerate_returns_429_with_retry_after_when_the_quota_is_spent(monkeypatch):
    """Regenerate goes through the same _generate_and_insert, but it is the
    endpoint a user hits repeatedly, so it is the one that most needs to say
    "not yet" rather than "that failed"."""
    fail_with(
        monkeypatch,
        briefs.GeminiQuotaExceeded("Gemini quota exhausted: out of quota", retry_after_seconds=7),
    )

    response = client.post(f"/briefs/{BRIEF_ID}/regenerate")

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "7"


@pytest.mark.parametrize(
    "exception, expected",
    [
        (briefs.GeminiTimeout("unreachable"), 504),
        (briefs.GeminiError("did not validate"), 422),
    ],
)
def test_regenerate_keeps_the_other_two_failures_distinct(monkeypatch, exception, expected):
    fail_with(monkeypatch, exception)

    response = client.post(f"/briefs/{BRIEF_ID}/regenerate")

    assert response.status_code == expected

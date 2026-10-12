"""Reusing an analysis when the same file is analysed again.

The point of the cache is the free tier: twenty generate_content calls a
day, per model, for the whole project. These check that a hit skips the
model entirely and a miss does not, and -- the part that would be a silent
bug -- that the key is narrow enough not to serve the wrong answer.
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import clips

client = TestClient(app)

CLIP_ID = "11111111-2222-4333-8444-555555555555"
OWNER_ID = "99999999-8888-4777-8666-555555555555"
PAYLOAD = {"hook": "an earlier answer", "transcript": "cached"}


def clip_row(**overrides):
    row = {
        "id": CLIP_ID,
        "owner_id": OWNER_ID,
        "recording_id": None,
        "storage_path": f"{OWNER_ID}/video.mp4",
        "thumbnail_path": None,
        "thumbnail_url": None,
        "status": "processing",
        "error_message": None,
        "title": "A clip",
        "tags": [],
        "duration_seconds": 12,
        "position_in_parent": None,
        "video_hash": None,
        "created_at": "2026-10-12T00:00:00Z",
        "updated_at": "2026-10-12T00:00:00Z",
    }
    row.update(overrides)
    return row


class Bucket:
    def download(self, path):
        return b"the same bytes every time"


class Storage:
    def from_(self, bucket):
        return Bucket()


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table_name = table
        self.filters = {}
        self.pending_update = None

    def select(self, *_a, **_k):
        return self

    def update(self, data):
        self.pending_update = data
        return self

    def insert(self, data):
        self.client.inserted.append(data)
        self.pending_update = None
        self._row = {"id": "aaaaaaaa-0000-4000-8000-000000000001", **data}
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self.pending_update is not None:
            self.client.updates.append(self.pending_update)
            return SimpleNamespace(data=[self.pending_update])
        if getattr(self, "_row", None) is not None:
            return SimpleNamespace(data=[self._row])
        if self.table_name == "analyses":
            self.client.cache_lookups.append(dict(self.filters))
            return SimpleNamespace(data=self.client.cache_rows)
        return SimpleNamespace(data=self.client.rows)


class FakeClient:
    def __init__(self, rows, cache_rows=None):
        self.rows = rows
        self.cache_rows = cache_rows or []
        self.updates = []
        self.inserted = []
        self.cache_lookups = []
        self.storage = Storage()

    def table(self, name):
        return Query(self, name)


@pytest.fixture
def no_model(monkeypatch):
    """Fail loudly if anything reaches Gemini."""
    calls = []

    def boom(*_a, **_k):
        calls.append(1)
        raise AssertionError("the model was called on a cache hit")

    monkeypatch.setattr(clips, "upload_and_wait", boom)
    monkeypatch.setattr(clips, "analyse", boom)
    return calls


@pytest.fixture
def model_runs(monkeypatch):
    """Record that the model ran, and return a payload."""
    runs = []

    class Result:
        def model_dump(self, **_k):
            return {"hook": "a fresh answer"}

    monkeypatch.setattr(
        clips, "upload_and_wait", lambda *_a: SimpleNamespace(name="files/x")
    )
    monkeypatch.setattr(clips, "delete_file", lambda *_a: None)
    monkeypatch.setattr(
        clips,
        "analyse",
        lambda *_a, **_k: (runs.append(1), (Result(), "analyse-v2"))[1],
    )
    return runs


def test_a_hit_skips_the_model_entirely(monkeypatch, no_model):
    fake = FakeClient([clip_row()], cache_rows=[{"payload": PAYLOAD}])
    monkeypatch.setattr(clips, "get_client", lambda: fake)

    response = client.post(f"/clips/{CLIP_ID}/analyse")

    assert response.status_code == 200
    body = response.json()
    assert body["cached"] is True
    assert body["payload"] == PAYLOAD


def test_a_hit_still_writes_a_row_for_this_clip(monkeypatch, no_model):
    """Otherwise the clip looks unanalysed however many copies were done."""
    fake = FakeClient([clip_row()], cache_rows=[{"payload": PAYLOAD}])
    monkeypatch.setattr(clips, "get_client", lambda: fake)

    client.post(f"/clips/{CLIP_ID}/analyse")

    assert len(fake.inserted) == 1
    assert fake.inserted[0]["clip_id"] == CLIP_ID
    assert fake.inserted[0]["payload"] == PAYLOAD


def test_a_miss_calls_the_model(monkeypatch, model_runs):
    fake = FakeClient([clip_row()], cache_rows=[])
    monkeypatch.setattr(clips, "get_client", lambda: fake)

    response = client.post(f"/clips/{CLIP_ID}/analyse")

    assert response.status_code == 200
    assert response.json()["cached"] is False
    assert len(model_runs) == 1


def test_the_hash_is_recorded_only_with_a_successful_analysis(monkeypatch, model_runs):
    fake = FakeClient([clip_row()], cache_rows=[])
    monkeypatch.setattr(clips, "get_client", lambda: fake)

    client.post(f"/clips/{CLIP_ID}/analyse")

    # One write, carrying the hash alongside 'ready'. The column means "this
    # file has an analysis"; written on a failure it would advertise a cache
    # entry that is not there.
    assert len(fake.updates) == 1
    update = fake.updates[0]
    assert update["status"] == "ready"
    assert len(update["video_hash"]) == 64  # sha256 hex


def test_the_lookup_is_scoped_to_owner_hash_model_and_prompt(monkeypatch, model_runs):
    fake = FakeClient([clip_row()], cache_rows=[])
    monkeypatch.setattr(clips, "get_client", lambda: fake)

    client.post(f"/clips/{CLIP_ID}/analyse")

    assert len(fake.cache_lookups) == 1
    where = fake.cache_lookups[0]
    # Owner, because the worker bypasses RLS and this must not be the one
    # place that crosses that boundary.
    assert where["owner_id"] == OWNER_ID
    assert len(where["clips.video_hash"]) == 64
    # Prompt version, because a new prompt exists to produce a different
    # answer -- serving the old one makes a prompt change do nothing.
    assert where["prompt_version"] == "analyse-v2"
    # Model, for the same reason, and because model_version is recorded on
    # the row as the provenance of the payload.
    assert "model_version" in where


def test_an_explicit_prompt_version_is_used_as_the_key(monkeypatch, model_runs):
    fake = FakeClient([clip_row()], cache_rows=[])
    monkeypatch.setattr(clips, "get_client", lambda: fake)

    client.post(f"/clips/{CLIP_ID}/analyse?prompt_version=analyse-v1")

    assert fake.cache_lookups[0]["prompt_version"] == "analyse-v1"


def test_the_hash_comes_from_the_file_not_the_stored_column(monkeypatch, model_runs):
    """/prepare re-encodes in place, so a stored hash can be stale."""
    stale = "0" * 64
    fake = FakeClient([clip_row(video_hash=stale)], cache_rows=[])
    monkeypatch.setattr(clips, "get_client", lambda: fake)

    client.post(f"/clips/{CLIP_ID}/analyse")

    assert fake.cache_lookups[0]["clips.video_hash"] != stale
    assert fake.updates[0]["video_hash"] != stale

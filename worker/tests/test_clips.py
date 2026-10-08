import os
from types import SimpleNamespace
from uuid import UUID

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import clips


CLIP_ID = UUID("11111111-1111-4111-8111-111111111111")
OWNER_ID = UUID("22222222-2222-4222-8222-222222222222")


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class FakeClient:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        assert name == "clips"
        return FakeQuery(self.rows)


def clip_row(**overrides):
    row = {
        "id": str(CLIP_ID),
        "owner_id": str(OWNER_ID),
        "recording_id": None,
        "storage_path": f"{OWNER_ID}/original.mp4",
        "thumbnail_path": None,
        "thumbnail_url": None,
        "status": "processing",
        "title": "Test clip",
        "tags": [],
        "duration_seconds": None,
        "position_in_parent": None,
        "created_at": "2026-10-08T00:00:00Z",
        "updated_at": "2026-10-08T00:00:00Z",
    }
    row.update(overrides)
    return row


app = FastAPI()
app.include_router(clips.router)
client = TestClient(app)


def test_prepare_rejects_invalid_clip_id():
    response = client.post("/clips/not-a-uuid/prepare")

    assert response.status_code == 422


def test_prepare_returns_404_when_clip_does_not_exist(monkeypatch):
    monkeypatch.setattr(clips, "get_client", lambda: FakeClient([]))

    response = client.post(f"/clips/{CLIP_ID}/prepare")

    assert response.status_code == 404
    assert response.json() == {
        "detail": f"No clip with id {CLIP_ID}",
    }


def test_prepare_rejects_storage_path_outside_owner_directory(monkeypatch):
    row = clip_row(storage_path="another-user/original.mp4")
    monkeypatch.setattr(clips, "get_client", lambda: FakeClient([row]))

    response = client.post(f"/clips/{CLIP_ID}/prepare")

    assert response.status_code == 409
    assert "Refusing to touch it" in response.json()["detail"]


def test_prepare_returns_existing_result_when_already_prepared(monkeypatch):
    thumbnail_path = f"{OWNER_ID}/original-thumb.jpg"
    row = clip_row(
        status="ready",
        thumbnail_path=thumbnail_path,
        duration_seconds="12.5",
    )
    monkeypatch.setattr(clips, "get_client", lambda: FakeClient([row]))

    response = client.post(f"/clips/{CLIP_ID}/prepare")

    assert response.status_code == 200
    assert response.json() == {
        "clip_id": str(CLIP_ID),
        "storage_path": f"{OWNER_ID}/original.mp4",
        "thumbnail_path": thumbnail_path,
        "original_bytes": 0,
        "clip_bytes": 0,
        "thumbnail_bytes": 0,
        "duration_seconds": 12.5,
        "original_deleted": False,
        "already_prepared": True,
    }
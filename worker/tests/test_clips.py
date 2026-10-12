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

class MissingFileBucket:
    def download(self, path):
        raise RuntimeError("object not found")


class MissingFileStorage:
    def from_(self, bucket):
        assert bucket == clips.CLIPS_BUCKET
        return MissingFileBucket()


class MissingFileClient(FakeClient):
    def __init__(self, rows):
        super().__init__(rows)
        self.storage = MissingFileStorage()

class DownloadBucket:
    def download(self, path):
        return b"fake video bytes"


class DownloadStorage:
    def from_(self, bucket):
        assert bucket == clips.CLIPS_BUCKET
        return DownloadBucket()


class TrackingQuery:
    def __init__(self, fake_client):
        self.fake_client = fake_client
        self.update_data = None

    def select(self, *_args, **_kwargs):
        return self

    def update(self, data):
        self.update_data = data
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.update_data is not None:
            self.fake_client.updates.append(self.update_data)
            return SimpleNamespace(data=[self.update_data])

        return SimpleNamespace(data=self.fake_client.rows)


class TrackingClient:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []
        self.storage = DownloadStorage()

    def table(self, name):
        assert name == "clips"
        return TrackingQuery(self)

class SuccessfulBucket:
    def download(self, path):
        return b"original video"

    def upload(self, **_kwargs):
        return None


class SuccessfulStorage:
    def from_(self, bucket):
        assert bucket in {
            clips.CLIPS_BUCKET,
            clips.THUMBNAILS_BUCKET,
        }
        return SuccessfulBucket()


class UpdateFailureQuery:
    def __init__(self, rows):
        self.rows = rows
        self.is_update = False

    def select(self, *_args, **_kwargs):
        return self

    def update(self, _data):
        self.is_update = True
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.is_update:
            return SimpleNamespace(data=[])

        return SimpleNamespace(data=self.rows)


class UpdateFailureClient:
    def __init__(self, rows):
        self.rows = rows
        self.storage = SuccessfulStorage()

    def table(self, name):
        assert name == "clips"
        return UpdateFailureQuery(self.rows)

class DeleteFailureBucket:
    def download(self, path):
        return b"original video"

    def upload(self, **_kwargs):
        return None

    def remove(self, _paths):
        raise RuntimeError("delete failed")


class DeleteFailureStorage:
    def from_(self, bucket):
        assert bucket in {
            clips.CLIPS_BUCKET,
            clips.THUMBNAILS_BUCKET,
        }
        return DeleteFailureBucket()


class SuccessfulUpdateQuery:
    def __init__(self, rows):
        self.rows = rows
        self.update_data = None

    def select(self, *_args, **_kwargs):
        return self

    def update(self, data):
        self.update_data = data
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.update_data is not None:
            return SimpleNamespace(data=[self.update_data])

        return SimpleNamespace(data=self.rows)


class DeleteFailureClient:
    def __init__(self, rows):
        self.rows = rows
        self.storage = DeleteFailureStorage()

    def table(self, name):
        assert name == "clips"
        return SuccessfulUpdateQuery(self.rows)


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

def test_prepare_returns_404_when_source_file_cannot_be_downloaded(monkeypatch):
    row = clip_row()
    monkeypatch.setattr(
        clips,
        "get_client",
        lambda: MissingFileClient([row]),
    )

    response = client.post(f"/clips/{CLIP_ID}/prepare")

    assert response.status_code == 404
    assert response.json() == {
        "detail": (
            f"could not download '{OWNER_ID}/original.mp4' "
            "from clips: object not found"
        ),
    }

def test_prepare_returns_422_and_marks_clip_failed_when_media_processing_fails(
    monkeypatch,
):
    fake_client = TrackingClient([clip_row()])
    monkeypatch.setattr(clips, "get_client", lambda: fake_client)

    def fail_downscale(_source, _destination):
        raise clips.MediaError("ffmpeg failed")

    monkeypatch.setattr(clips, "downscale_to_480p", fail_downscale)

    response = client.post(f"/clips/{CLIP_ID}/prepare")

    assert response.status_code == 422
    assert response.json() == {
        "detail": "ffmpeg failed",
    }
    # BE-14: the row records why, not just that it failed. Without the reason
    # the app can only show a generic error and offer a blind retry.
    assert fake_client.updates == [
        {"status": "failed", "error_message": "Transcode failed: ffmpeg failed"},
    ]

def test_prepare_returns_500_when_clip_row_cannot_be_updated(monkeypatch):
    fake_client = UpdateFailureClient([clip_row()])
    monkeypatch.setattr(clips, "get_client", lambda: fake_client)

    def fake_downscale(_source, destination):
        destination.write_bytes(b"prepared video")

    def fake_thumbnail(_source, destination):
        destination.write_bytes(b"thumbnail")

    monkeypatch.setattr(clips, "downscale_to_480p", fake_downscale)
    monkeypatch.setattr(clips, "extract_thumbnail", fake_thumbnail)
    monkeypatch.setattr(clips, "probe_duration_seconds", lambda _source: 12.5)

    response = client.post(f"/clips/{CLIP_ID}/prepare")

    assert response.status_code == 500
    assert response.json() == {
        "detail": "uploaded the prepared files but could not update the clip row",
    }

def test_prepare_succeeds_when_original_file_cannot_be_deleted(monkeypatch):
    fake_client = DeleteFailureClient([clip_row()])
    monkeypatch.setattr(clips, "get_client", lambda: fake_client)

    def fake_downscale(_source, destination):
        destination.write_bytes(b"prepared video")

    def fake_thumbnail(_source, destination):
        destination.write_bytes(b"thumbnail")

    monkeypatch.setattr(clips, "downscale_to_480p", fake_downscale)
    monkeypatch.setattr(clips, "extract_thumbnail", fake_thumbnail)
    monkeypatch.setattr(clips, "probe_duration_seconds", lambda _source: 12.5)

    response = client.post(f"/clips/{CLIP_ID}/prepare")

    assert response.status_code == 200

    body = response.json()
    assert body["storage_path"] == f"{OWNER_ID}/original-480p.mp4"
    assert body["thumbnail_path"] == f"{OWNER_ID}/original-thumb.jpg"
    assert body["duration_seconds"] == 12.5
    assert body["original_deleted"] is False
    assert body["already_prepared"] is False


class FakeUpload:
    """Stands in for the handle upload_and_wait returns."""

    name = "files/abc123"


def fail_analysis_with(monkeypatch, exception):
    """Point the analyse route at a Gemini that fails one specific way.

    Returns the list of uploads that were released, so a test can check the
    file was cleaned up on the way out rather than left to expire on Google's
    side.
    """
    deleted = []
    monkeypatch.setattr(clips, "upload_and_wait", lambda _source: FakeUpload())
    monkeypatch.setattr(clips, "delete_file", lambda name: deleted.append(name))

    def fail(_uploaded, _prompt_version):
        raise exception

    monkeypatch.setattr(clips, "analyse", fail)
    return deleted


def test_analyse_returns_429_with_retry_after_when_the_quota_is_spent(monkeypatch):
    fake_client = TrackingClient([clip_row()])
    monkeypatch.setattr(clips, "get_client", lambda: fake_client)
    deleted = fail_analysis_with(
        monkeypatch,
        clips.GeminiQuotaExceeded(
            "Gemini quota exhausted: out of quota", retry_after_seconds=53
        ),
    )

    response = client.post(f"/clips/{CLIP_ID}/analyse")

    assert response.status_code == 429
    # Without the header the app has nothing to back off by, so it retries
    # straight back into the same wall.
    assert response.headers["Retry-After"] == "53"
    assert response.json() == {"detail": "Gemini quota exhausted: out of quota"}
    # Still recorded on the row: a clip left at 'processing' is
    # indistinguishable from one still queued, whatever the reason.
    assert fake_client.updates == [
        {
            "status": "failed",
            "error_message": (
                "Analysis hit the Gemini quota: Gemini quota exhausted: out of quota"
            ),
        },
    ]
    # The upload is released even though the analysis never ran.
    assert deleted == ["files/abc123"]


def test_analyse_still_returns_504_when_gemini_is_unreachable(monkeypatch):
    """Guards the except order from the other side: the quota branch sits
    above this one, and both are subclasses of GeminiError."""
    fake_client = TrackingClient([clip_row()])
    monkeypatch.setattr(clips, "get_client", lambda: fake_client)
    fail_analysis_with(
        monkeypatch, clips.GeminiTimeout("Gemini was unreachable after one retry")
    )

    response = client.post(f"/clips/{CLIP_ID}/analyse")

    assert response.status_code == 504
    assert "Retry-After" not in response.headers
    assert fake_client.updates == [
        {
            "status": "failed",
            "error_message": "Analysis timed out: Gemini was unreachable after one retry",
        },
    ]


def test_analyse_still_returns_422_when_the_response_does_not_validate(monkeypatch):
    fake_client = TrackingClient([clip_row()])
    monkeypatch.setattr(clips, "get_client", lambda: fake_client)
    fail_analysis_with(
        monkeypatch, clips.GeminiError("Gemini returned a response that does not match")
    )

    response = client.post(f"/clips/{CLIP_ID}/analyse")

    assert response.status_code == 422
    assert "Retry-After" not in response.headers
    assert fake_client.updates == [
        {
            "status": "failed",
            "error_message": (
                "Analysis failed: Gemini returned a response that does not match"
            ),
        },
    ]

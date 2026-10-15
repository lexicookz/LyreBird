from types import SimpleNamespace
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import recordings


RECORDING_ID = UUID("11111111-1111-4111-8111-111111111111")
OWNER_ID = UUID("22222222-2222-4222-8222-222222222222")
EXISTING_CLIP_ID = UUID("33333333-3333-4333-8333-333333333333")


class AlreadySplitClient:
    def __init__(self, recording_rows, clip_rows):
        self.recording_rows = recording_rows
        self.clip_rows = clip_rows

    def table(self, name):
        if name == "recordings":
            return AlreadySplitQuery(self.recording_rows)
        if name == "clips":
            return AlreadySplitQuery(self.clip_rows)
        raise AssertionError(name)


class AlreadySplitQuery:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


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
        assert name == "recordings"
        return FakeQuery(self.rows)

class MissingFileBucket:
    def download(self, _path):
        raise RuntimeError("object not found")


class MissingFileStorage:
    def from_(self, bucket):
        assert bucket == recordings.RECORDINGS_BUCKET
        return MissingFileBucket()


class MissingFileClient(FakeClient):
    def __init__(self, rows):
        super().__init__(rows)
        self.storage = MissingFileStorage()

class DownloadBucket:
    def download(self, _path):
        return b"fake recording bytes"


class DownloadStorage:
    def from_(self, bucket):
        assert bucket == recordings.RECORDINGS_BUCKET
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
        assert name == "recordings"
        return TrackingQuery(self)


def recording_row(**changes):
    row = {
        "id": str(RECORDING_ID),
        "owner_id": str(OWNER_ID),
        "source": "screen_recording",
        "source_url": None,
        "storage_path": f"{OWNER_ID}/recording.mp4",
        "duration_seconds": None,
        "status": "uploaded",
        "error_message": None,
        "created_at": "2026-10-15T00:00:00Z",
        "updated_at": "2026-10-15T00:00:00Z",
    }
    row.update(changes)
    return row


app = FastAPI()
app.include_router(recordings.router)
client = TestClient(app)


def test_split_rejects_invalid_recording_id():
    response = client.post("/recordings/not-a-uuid/split")

    assert response.status_code == 422


def test_split_returns_404_when_recording_does_not_exist(monkeypatch):
    monkeypatch.setattr(recordings, "get_client", lambda: FakeClient([]))

    response = client.post(f"/recordings/{RECORDING_ID}/split")

    assert response.status_code == 404
    assert response.json()["detail"] == f"No recording with id {RECORDING_ID}"


def test_split_rejects_recording_without_storage_path(monkeypatch):
    fake = FakeClient([recording_row(storage_path=None)])
    monkeypatch.setattr(recordings, "get_client", lambda: fake)

    response = client.post(f"/recordings/{RECORDING_ID}/split")

    assert response.status_code == 409
    assert "has no storage_path" in response.json()["detail"]


def test_split_rejects_storage_path_outside_owner_directory(monkeypatch):
    fake = FakeClient([recording_row(storage_path="another-user/recording.mp4")])
    monkeypatch.setattr(recordings, "get_client", lambda: fake)

    response = client.post(f"/recordings/{RECORDING_ID}/split")

    assert response.status_code == 409
    assert "is not under" in response.json()["detail"]

def test_split_returns_existing_clips_when_already_split(monkeypatch):
    recording = recording_row(
        status="split",
        duration_seconds="12.5",
    )
    existing_clips = [
        {
            "id": str(EXISTING_CLIP_ID),
            "storage_path": f"{OWNER_ID}/recording-000.mp4",
            "position_in_parent": 0,
            "duration_seconds": "12.5",
        }
    ]
    fake = AlreadySplitClient([recording], existing_clips)
    monkeypatch.setattr(recordings, "get_client", lambda: fake)

    response = client.post(f"/recordings/{RECORDING_ID}/split")

    assert response.status_code == 200
    assert response.json() == {
        "recording_id": str(RECORDING_ID),
        "clips": [
            {
                "clip_id": str(EXISTING_CLIP_ID),
                "storage_path": f"{OWNER_ID}/recording-000.mp4",
                "position_in_parent": 0,
                "start_seconds": 0.0,
                "end_seconds": 0.0,
                "duration_seconds": 12.5,
                "bytes": 0,
            }
        ],
        "boundaries": [],
        "duration_seconds": 12.5,
        "original_deleted": False,
        "already_split": True,
    }

def test_split_returns_404_when_source_file_cannot_be_downloaded(monkeypatch):
    fake = MissingFileClient([recording_row()])
    monkeypatch.setattr(recordings, "get_client", lambda: fake)

    response = client.post(f"/recordings/{RECORDING_ID}/split")

    assert response.status_code == 404
    assert response.json() == {
        "detail": (
            f"could not download '{OWNER_ID}/recording.mp4' "
            "from recordings: object not found"
        )
    }

def test_split_returns_422_and_marks_failed_when_duration_is_missing(
    monkeypatch,
):
    fake = TrackingClient([recording_row()])
    monkeypatch.setattr(recordings, "get_client", lambda: fake)
    monkeypatch.setattr(
        recordings,
        "probe_duration_seconds",
        lambda _source: None,
    )

    response = client.post(f"/recordings/{RECORDING_ID}/split")

    assert response.status_code == 422
    assert response.json() == {
        "detail": "could not read the recording's duration; is it a video?"
    }
    assert fake.updates == [
        {"status": "processing"},
        {
            "status": "failed",
            "error_message": "could not read the recording's duration",
        },
    ]

def test_split_returns_422_and_marks_failed_when_boundary_detection_fails(
    monkeypatch,
):
    fake = TrackingClient([recording_row()])
    monkeypatch.setattr(recordings, "get_client", lambda: fake)
    monkeypatch.setattr(
        recordings,
        "probe_duration_seconds",
        lambda _source: 30.0,
    )

    def fail_boundaries(_source):
        raise RuntimeError("detector failed")

    monkeypatch.setattr(recordings, "find_boundaries", fail_boundaries)

    response = client.post(f"/recordings/{RECORDING_ID}/split")

    assert response.status_code == 422
    assert response.json() == {
        "detail": "could not detect boundaries: detector failed"
    }
    assert fake.updates == [
        {"status": "processing"},
        {
            "status": "failed",
            "error_message": "Boundary detection failed: detector failed",
        },
    ]

def test_split_rejects_more_than_maximum_number_of_clips(monkeypatch):
    fake = TrackingClient([recording_row()])
    monkeypatch.setattr(recordings, "get_client", lambda: fake)
    monkeypatch.setattr(
        recordings,
        "probe_duration_seconds",
        lambda _source: 120.0,
    )
    monkeypatch.setattr(recordings, "find_boundaries", lambda _source: [])

    excessive_spans = [
        (float(index), float(index + 2))
        for index in range(recordings.MAX_CLIPS + 1)
    ]
    monkeypatch.setattr(
        recordings,
        "segments",
        lambda _boundaries, _duration, _minimum: excessive_spans,
    )

    response = client.post(f"/recordings/{RECORDING_ID}/split")

    assert response.status_code == 422
    assert "over the 60 limit" in response.json()["detail"]
    assert fake.updates == [
        {"status": "processing"},
        {
            "status": "failed",
            "error_message": (
                "detector found 61 segments, over the 60 limit"
            ),
        },
    ]
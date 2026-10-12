"""Recording endpoints — splitting a screen recording into clips."""

from __future__ import annotations

import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import get_client
from app.media import MediaError, cut_segment, probe_duration_seconds
from app.models import Recording
from app.scroll import find_boundaries, segments

router = APIRouter(prefix="/recordings", tags=["recordings"])

RECORDINGS_BUCKET = "recordings"
CLIPS_BUCKET = "clips"

# A span shorter than this is not somebody's video, it is a detection that
# fired twice on one swipe. segments() folds them into the neighbour.
MIN_CLIP_SECONDS = 1.5

# Splitting into hundreds of clips is a detector failure, not a long
# recording, and each one costs a transcode and an upload. Refuse rather
# than spend ten minutes producing nonsense.
MAX_CLIPS = 60


class SplitClip(BaseModel):
    clip_id: UUID
    storage_path: str
    position_in_parent: int
    start_seconds: float
    end_seconds: float
    duration_seconds: float
    bytes: int


class SplitResult(BaseModel):
    recording_id: UUID
    clips: list[SplitClip]
    boundaries: list[float]
    duration_seconds: float | None
    original_deleted: bool
    already_split: bool = False


def _fetch(client, recording_id: UUID) -> Recording:
    response = (
        client.table("recordings").select("*").eq("id", str(recording_id)).execute()
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail=f"No recording with id {recording_id}")
    return Recording.model_validate(rows[0])


def _fail(client, recording_id: UUID, message: str) -> None:
    client.table("recordings").update(
        {"status": "failed", "error_message": message[:1000]}
    ).eq("id", str(recording_id)).execute()


def _existing_clips(client, recording_id: UUID) -> list[dict]:
    response = (
        client.table("clips")
        .select("*")
        .eq("recording_id", str(recording_id))
        .order("position_in_parent")
        .execute()
    )
    return response.data or []


@router.post("/{recording_id}/split", response_model=SplitResult)
def split_recording(recording_id: UUID) -> SplitResult:
    """Cut a screen recording into one clip per video in the feed.

    `def` rather than `async def` deliberately, as elsewhere in the worker:
    decoding, ffmpeg and the storage calls all block, so FastAPI runs this
    in a threadpool. An `async def` would hold the event loop for the whole
    split and stall every other request, /health included.

    Ordering is the part worth reading. Segments are uploaded, then the rows
    are written, then the recording is marked, and only then is the original
    deleted. Any failure before the delete leaves the recording exactly as
    it was and costs nothing but some orphaned objects; deleting earlier
    would destroy the only copy of somebody's recording on the strength of a
    detector we have not validated yet.
    """
    client = get_client()
    recording = _fetch(client, recording_id)

    if not recording.storage_path:
        raise HTTPException(
            status_code=409,
            detail=f"recording {recording_id} has no storage_path; nothing to split",
        )

    # The worker holds the service role key and bypasses RLS, so the path
    # convention is not enforced for us -- we honour it ourselves. A file
    # written outside <owner_id>/ is unreadable by the user who owns it,
    # because the storage policies compare (storage.foldername(name))[1]
    # against auth.uid().
    owner_prefix = f"{recording.owner_id}/"
    if not recording.storage_path.startswith(owner_prefix):
        raise HTTPException(
            status_code=409,
            detail=(
                f"recording {recording_id} has storage_path "
                f"{recording.storage_path!r}, which is not under {owner_prefix!r}. "
                "Refusing to touch it: the path convention is what makes the "
                "output readable by its owner."
            ),
        )

    if recording.status == "split":
        # Idempotent rather than an error: a split is slow, so a client that
        # times out and retries is the expected case, not a mistake. Doing it
        # again would duplicate every clip.
        existing = _existing_clips(client, recording_id)
        return SplitResult(
            recording_id=recording.id,
            clips=[
                SplitClip(
                    clip_id=UUID(row["id"]),
                    storage_path=row["storage_path"],
                    position_in_parent=row.get("position_in_parent") or index,
                    start_seconds=0.0,
                    end_seconds=0.0,
                    duration_seconds=float(row.get("duration_seconds") or 0.0),
                    bytes=0,
                )
                for index, row in enumerate(existing)
            ],
            boundaries=[],
            duration_seconds=(
                float(recording.duration_seconds)
                if recording.duration_seconds is not None
                else None
            ),
            original_deleted=False,
            already_split=True,
        )

    storage = client.storage
    try:
        original_bytes = storage.from_(RECORDINGS_BUCKET).download(recording.storage_path)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=(
                f"could not download {recording.storage_path!r} from "
                f"{RECORDINGS_BUCKET}: {exc}"
            ),
        ) from exc

    client.table("recordings").update({"status": "processing"}).eq(
        "id", str(recording.id)
    ).execute()

    stem = Path(recording.storage_path).name.rsplit(".", 1)[0]
    written: list[SplitClip] = []

    with tempfile.TemporaryDirectory(prefix="lyrebird-split-") as tmp:
        tmp_dir = Path(tmp)
        source = tmp_dir / Path(recording.storage_path).name
        source.write_bytes(original_bytes)

        duration = probe_duration_seconds(source)
        if not duration:
            _fail(client, recording.id, "could not read the recording's duration")
            raise HTTPException(
                status_code=422,
                detail="could not read the recording's duration; is it a video?",
            )

        try:
            boundaries = find_boundaries(source)
        except Exception as exc:
            _fail(client, recording.id, f"Boundary detection failed: {exc}")
            raise HTTPException(
                status_code=422, detail=f"could not detect boundaries: {exc}"
            ) from exc

        spans = segments(boundaries, duration, MIN_CLIP_SECONDS)
        if len(spans) > MAX_CLIPS:
            _fail(
                client,
                recording.id,
                f"detector found {len(spans)} segments, over the {MAX_CLIPS} limit",
            )
            raise HTTPException(
                status_code=422,
                detail=(
                    f"detected {len(spans)} segments in {duration:.0f}s, which is "
                    f"over the {MAX_CLIPS} limit. That is a detector failure rather "
                    f"than a long recording -- the recording is untouched."
                ),
            )

        uploaded_paths: list[str] = []
        try:
            for index, (start, end) in enumerate(spans):
                piece = tmp_dir / f"{stem}-{index:03d}.mp4"
                cut_segment(source, piece, start, end)

                clip_path = f"{owner_prefix}{stem}-{index:03d}.mp4"
                data = piece.read_bytes()
                storage.from_(CLIPS_BUCKET).upload(
                    path=clip_path,
                    file=data,
                    file_options={"content-type": "video/mp4", "upsert": "true"},
                )
                uploaded_paths.append(clip_path)

                written.append(
                    SplitClip(
                        clip_id=UUID(int=0),  # replaced once the row exists
                        storage_path=clip_path,
                        position_in_parent=index,
                        start_seconds=round(start, 3),
                        end_seconds=round(end, 3),
                        duration_seconds=round(end - start, 3),
                        bytes=len(data),
                    )
                )
                piece.unlink(missing_ok=True)
        except MediaError as exc:
            # Leave the uploaded pieces: they are unreferenced, and removing
            # them could fail too and mask the real error. The recording is
            # untouched, which is the part that matters.
            _fail(client, recording.id, f"Split failed: {exc}")
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    rows = [
        {
            "owner_id": str(recording.owner_id),
            "recording_id": str(recording.id),
            "storage_path": clip.storage_path,
            "position_in_parent": clip.position_in_parent,
            "duration_seconds": clip.duration_seconds,
            "title": f"Clip {clip.position_in_parent + 1}",
            # 'processing', the default: the clip exists, its analysis does
            # not. The app asks for that separately.
            "status": "processing",
        }
        for clip in written
    ]

    inserted = client.table("clips").insert(rows).execute()
    created = inserted.data or []
    if len(created) != len(rows):
        _fail(
            client,
            recording.id,
            f"cut {len(rows)} segments but wrote {len(created)} clip rows",
        )
        raise HTTPException(
            status_code=500,
            detail=(
                f"uploaded {len(rows)} segments but only {len(created)} clip rows "
                f"were written; the recording is untouched"
            ),
        )

    # model_copy does not validate, so the id is converted here rather than
    # handed over as the string PostgREST returns -- otherwise the field is
    # declared UUID and holds a str, which only shows up as a serializer
    # warning at the point the response is written.
    by_path = {row["storage_path"]: row for row in created}
    written = [
        clip.model_copy(update={"clip_id": UUID(by_path[clip.storage_path]["id"])})
        for clip in written
    ]

    client.table("recordings").update(
        {"status": "split", "error_message": None, "duration_seconds": duration}
    ).eq("id", str(recording.id)).execute()

    # Last, and only now. The clips are in storage and the rows point at
    # them, so the recording is no longer the only copy of this footage.
    original_deleted = True
    try:
        storage.from_(RECORDINGS_BUCKET).remove([recording.storage_path])
    except Exception:
        # Not worth failing a successful split over. The row says 'split',
        # so nothing will read the original again; it is wasted bytes.
        original_deleted = False

    return SplitResult(
        recording_id=recording.id,
        clips=written,
        boundaries=[round(b.time, 3) for b in boundaries],
        duration_seconds=duration,
        original_deleted=original_deleted,
    )

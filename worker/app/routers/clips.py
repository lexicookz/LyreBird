"""Clip processing endpoints."""

from __future__ import annotations

import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import get_client
from app.media import MediaError, downscale_to_480p, extract_thumbnail, probe_duration_seconds
from app.models import Clip

router = APIRouter(prefix="/clips", tags=["clips"])

CLIPS_BUCKET = "clips"
THUMBNAILS_BUCKET = "thumbnails"


class PrepareResult(BaseModel):
    """What /prepare did. Sizes are returned so a caller can verify the
    transcode actually shrank the file without going to storage."""

    clip_id: UUID
    storage_path: str
    thumbnail_path: str
    original_bytes: int
    clip_bytes: int
    thumbnail_bytes: int
    duration_seconds: float | None
    original_deleted: bool
    already_prepared: bool = False


def _fetch_clip(client, clip_id: UUID) -> Clip:
    response = client.table("clips").select("*").eq("id", str(clip_id)).execute()
    rows = response.data or []
    if not rows:
        raise HTTPException(status_code=404, detail=f"No clip with id {clip_id}")
    return Clip.model_validate(rows[0])


@router.post("/{clip_id}/prepare", response_model=PrepareResult)
def prepare_clip(clip_id: UUID) -> PrepareResult:
    """Downscale a clip to 480p, extract a thumbnail, and drop the original.

    Defined with `def` rather than `async def` on purpose: ffmpeg and the
    storage calls are blocking, so FastAPI runs this in a threadpool. An
    `async def` would block the event loop for the whole transcode and stall
    every other request, /health included.
    """
    client = get_client()
    clip = _fetch_clip(client, clip_id)

    # The worker holds the service role key and bypasses RLS entirely, so the
    # path convention is not enforced for us here — we have to honour it
    # ourselves. A file written outside <owner_id>/ is unreadable by the very
    # user who owns it, because the storage policies compare
    # (storage.foldername(name))[1] against auth.uid().
    owner_prefix = f"{clip.owner_id}/"
    if not clip.storage_path.startswith(owner_prefix):
        raise HTTPException(
            status_code=409,
            detail=(
                f"clip {clip_id} has storage_path {clip.storage_path!r}, which is not "
                f"under {owner_prefix!r}. Refusing to touch it: the path convention is "
                "what makes the file readable by its owner."
            ),
        )

    if clip.status == "ready" and clip.thumbnail_path:
        # Re-running would downscale an already-downscaled file and lose
        # quality for nothing, then delete the only copy.
        return PrepareResult(
            clip_id=clip.id,
            storage_path=clip.storage_path,
            thumbnail_path=clip.thumbnail_path,
            original_bytes=0,
            clip_bytes=0,
            thumbnail_bytes=0,
            duration_seconds=float(clip.duration_seconds) if clip.duration_seconds is not None else None,
            original_deleted=False,
            already_prepared=True,
        )

    original_path = clip.storage_path
    stem = Path(original_path).name.rsplit(".", 1)[0]
    prepared_path = f"{owner_prefix}{stem}-480p.mp4"
    thumbnail_path = f"{owner_prefix}{stem}-thumb.jpg"

    if prepared_path == original_path:
        raise HTTPException(
            status_code=409,
            detail="prepared file would overwrite the original; rename the source first",
        )

    storage = client.storage
    try:
        original_bytes = storage.from_(CLIPS_BUCKET).download(original_path)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"could not download {original_path!r} from {CLIPS_BUCKET}: {exc}",
        ) from exc

    with tempfile.TemporaryDirectory(prefix="lyrebird-prepare-") as tmp:
        tmp_dir = Path(tmp)
        source = tmp_dir / f"source-{stem}"
        prepared = tmp_dir / "prepared.mp4"
        thumbnail = tmp_dir / "thumbnail.jpg"

        source.write_bytes(original_bytes)

        try:
            downscale_to_480p(source, prepared)
            extract_thumbnail(prepared, thumbnail)
            duration = probe_duration_seconds(prepared)
        except MediaError as exc:
            # Leave a trail on the row: a clip stuck at 'processing' forever is
            # indistinguishable from one still in the queue.
            client.table("clips").update({"status": "failed"}).eq("id", str(clip.id)).execute()
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        prepared_data = prepared.read_bytes()
        thumbnail_data = thumbnail.read_bytes()

        # Order matters from here. Upload the new files, then point the row at
        # them, and only then delete the original. Any failure before the row
        # update leaves the clip exactly as it was; deleting first would strand
        # a row pointing at a file that no longer exists.
        storage.from_(CLIPS_BUCKET).upload(
            path=prepared_path,
            file=prepared_data,
            file_options={"content-type": "video/mp4", "upsert": "true"},
        )
        storage.from_(THUMBNAILS_BUCKET).upload(
            path=thumbnail_path,
            file=thumbnail_data,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )

        update = {
            "storage_path": prepared_path,
            "thumbnail_path": thumbnail_path,
            "status": "ready",
        }
        if duration is not None:
            update["duration_seconds"] = duration

        updated = client.table("clips").update(update).eq("id", str(clip.id)).execute()
        if not (updated.data or []):
            raise HTTPException(
                status_code=500,
                detail="uploaded the prepared files but could not update the clip row",
            )

        original_deleted = True
        try:
            storage.from_(CLIPS_BUCKET).remove([original_path])
        except Exception:
            # The row already points at the prepared file, so the clip works.
            # Say the original survived rather than claiming a clean run.
            original_deleted = False

        return PrepareResult(
            clip_id=clip.id,
            storage_path=prepared_path,
            thumbnail_path=thumbnail_path,
            original_bytes=len(original_bytes),
            clip_bytes=len(prepared_data),
            thumbnail_bytes=len(thumbnail_data),
            duration_seconds=duration,
            original_deleted=original_deleted,
        )

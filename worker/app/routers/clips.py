"""Clip processing endpoints."""

from __future__ import annotations

import tempfile
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.db import get_client
from app.gemini import (
    GeminiError,
    GeminiQuotaExceeded,
    GeminiTimeout,
    analyse,
    delete_file,
    upload_and_wait,
)
from app.prompts import PromptError, load as load_prompt, versions
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


def _record_failure(client, clip_id: UUID, message: str) -> None:
    """Mark a clip failed and say why.

    Without the message the app can only show a generic error and offer a
    blind retry — the spinning-forever case BE-14 is about. Truncated because
    a provider stack trace can be enormous and the row is read by a phone.
    """
    client.table("clips").update(
        {"status": "failed", "error_message": message[:1000]}
    ).eq("id", str(clip_id)).execute()


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
            _record_failure(client, clip.id, f"Transcode failed: {exc}")
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


class AnalyseResult(BaseModel):
    """The analyses row that was written."""

    analysis_id: UUID
    clip_id: UUID
    model_version: str
    prompt_version: str
    payload: dict


@router.post("/{clip_id}/analyse", response_model=AnalyseResult)
def analyse_clip(
    clip_id: UUID,
    prompt_version: str | None = Query(
        default=None,
        description=(
            "Run a specific prompt version, e.g. 'analyse-v1'. Defaults to the "
            "latest. Re-running an older version is how two analyses of the "
            "same clip become comparable."
        ),
    ),
) -> AnalyseResult:
    """Send a clip to Gemini and store the breakdown.

    `def` rather than `async def` for the same reason as /prepare: the upload,
    the poll and the model call all block, so FastAPI runs this in a
    threadpool instead of stalling the event loop for the whole analysis.

    Deliberately not idempotent. Analyses are append-only and each run records
    its model_version and prompt_version, because the point of keeping them in
    their own table is that two runs can be compared rather than one
    overwriting the other.
    """
    client = get_client()

    # Fail before doing any work if the caller named a version that does not
    # exist -- uploading a video first and then discovering the typo wastes
    # a minute and an upload.
    if prompt_version is not None:
        try:
            load_prompt(prompt_version)
        except PromptError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    clip = _fetch_clip(client, clip_id)

    # Same guard as /prepare. The worker bypasses RLS, so a path outside the
    # owner's folder is a sign something is wrong with the row, not a file to
    # go fetch anyway.
    owner_prefix = f"{clip.owner_id}/"
    if not clip.storage_path.startswith(owner_prefix):
        raise HTTPException(
            status_code=409,
            detail=(
                f"clip {clip_id} has storage_path {clip.storage_path!r}, which is not "
                f"under {owner_prefix!r}."
            ),
        )

    try:
        video_bytes = client.storage.from_(CLIPS_BUCKET).download(clip.storage_path)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"could not download {clip.storage_path!r} from {CLIPS_BUCKET}: {exc}",
        ) from exc

    uploaded_name: str | None = None
    with tempfile.TemporaryDirectory(prefix="lyrebird-analyse-") as tmp:
        source = Path(tmp) / Path(clip.storage_path).name
        source.write_bytes(video_bytes)

        try:
            uploaded = upload_and_wait(source)
            uploaded_name = uploaded.name
            result, used_version = analyse(uploaded, prompt_version)
        except GeminiQuotaExceeded as exc:
            # Above the GeminiError branch it inherits from, or a spent
            # quota gets reported as a malformed response. The row still
            # records the failure -- a clip left at 'processing' is
            # indistinguishable from one still queued however it failed --
            # but the response carries Retry-After, so the app waits the
            # quota window out instead of retrying straight back into it.
            _record_failure(client, clip.id, f"Analysis hit the Gemini quota: {exc}")
            raise HTTPException(
                status_code=429,
                detail=str(exc),
                headers={"Retry-After": str(exc.retry_after_seconds)},
            ) from exc
        except GeminiTimeout as exc:
            # Already retried once inside analyse(). 504 rather than 422: the
            # request is worth repeating later, which a malformed response is
            # not.
            _record_failure(client, clip.id, f"Analysis timed out: {exc}")
            raise HTTPException(status_code=504, detail=str(exc)) from exc
        except GeminiError as exc:
            # Fail loudly, store nothing. A clip left at 'processing' forever
            # is indistinguishable from one still in the queue, so the row
            # records that this run failed and why.
            _record_failure(client, clip.id, f"Analysis failed: {exc}")
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        finally:
            if uploaded_name:
                delete_file(uploaded_name)

    payload = result.model_dump(mode="json")

    inserted = (
        client.table("analyses")
        .insert(
            {
                "owner_id": str(clip.owner_id),
                "clip_id": str(clip.id),
                "payload": payload,
                "model_version": settings.gemini_model,
                "prompt_version": used_version,
            }
        )
        .execute()
    )
    rows = inserted.data or []
    if not rows:
        raise HTTPException(status_code=500, detail="analysis succeeded but the row could not be written")

    # Only now is the clip genuinely ready: there is an analysis to show.
    # error_message is cleared too — a message from an earlier failed run
    # sitting beside status 'ready' reads as a current problem.
    client.table("clips").update(
        {"status": "ready", "error_message": None}
    ).eq("id", str(clip.id)).execute()

    return AnalyseResult(
        analysis_id=rows[0]["id"],
        clip_id=clip.id,
        model_version=settings.gemini_model,
        prompt_version=used_version,
        payload=payload,
    )


@router.get("/prompt-versions", response_model=list[str])
def list_prompt_versions() -> list[str]:
    """Every analysis prompt version available to re-run, oldest first."""
    return versions("analyse")

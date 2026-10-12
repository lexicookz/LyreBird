"""Brief generation.

Text to text: this reads a clip's existing analysis and a brand profile and
writes a brief. The video is never touched — it was already described by
/clips/{id}/analyse, and re-uploading it would cost a minute to tell the model
something the prompt already contains.

The brief shape itself lives in app/brief_schema.py, the single source of
truth shared with the app through worker/schemas/*.json and types/brief.ts.
This module only decides which rows to read and when to write.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.brief_schema import BrandProfile, to_brief_columns
from app.config import settings
from app.db import get_client
from app.gemini import GeminiError, GeminiQuotaExceeded, GeminiTimeout, write_brief
from app.models import Brand
from app.prompts import PromptError, load as load_prompt, versions

router = APIRouter(prefix="/briefs", tags=["briefs"])


class BriefRequest(BaseModel):
    clip_id: UUID
    brand_id: UUID


class BriefResponse(BaseModel):
    """The briefs row that was written.

    The flat fields are the editable copy the screens read; payload is the
    draft exactly as the model produced it. Both are returned so a caller can
    see what was generated as well as what was stored.
    """

    brief_id: UUID
    clip_id: UUID
    brand_id: UUID
    analysis_id: UUID
    model_version: str
    prompt_version: str
    hook: str
    script: str
    shot_list: list[str]
    caption: str
    hashtags: list[str]
    cta: str
    payload: dict


def _one(client, table: str, row_id: UUID, label: str) -> dict:
    rows = client.table(table).select("*").eq("id", str(row_id)).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail=f"No {label} with id {row_id}")
    return rows[0]


def _generate_and_insert(
    client,
    clip: dict,
    brand: dict,
    prompt_version: str | None,
) -> BriefResponse:
    """Generate a brief and insert it. Always an insert, never an update.

    Both the first brief and every regenerate come through here, so there is
    no path in the worker that can overwrite an existing brief — the property
    BE-17 depends on is structural rather than remembered.
    """
    analyses = (
        client.table("analyses")
        .select("*")
        .eq("clip_id", clip["id"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not analyses:
        raise HTTPException(
            status_code=409,
            detail=(
                f"clip {clip['id']} has no analysis yet. "
                f"POST /clips/{clip['id']}/analyse first."
            ),
        )
    analysis = analyses[0]

    try:
        profile = BrandProfile.from_brand(Brand.model_validate(brand))
    except Exception as exc:
        # A brands row that will not map is a data problem, not a model one,
        # and would otherwise surface as a confusing 422 from the model call.
        raise HTTPException(
            status_code=409,
            detail=f"brand {brand['id']} cannot be read as a profile: {exc}",
        ) from exc

    try:
        draft, used_version = write_brief(analysis["payload"], profile, prompt_version)
    except GeminiQuotaExceeded as exc:
        # Before GeminiTimeout: a quota failure is a GeminiError too, and
        # 422 would tell the screen the brief was malformed when the truth is
        # that the key is spent. Matches the handling in routers/clips.py.
        headers = (
            {"Retry-After": str(int(exc.retry_after_seconds))}
            if exc.retry_after_seconds
            else None
        )
        raise HTTPException(status_code=429, detail=str(exc), headers=headers) from exc
    except GeminiTimeout as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except GeminiError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # to_brief_columns owns the mapping from draft to columns: the flat ones
    # the screens edit, plus payload exactly as generated. Deriving shot_list
    # or script here instead would be a second definition of that mapping, and
    # the two would drift the first time the schema changed.
    columns = to_brief_columns(
        draft, prompt_version=used_version, model_version=settings.gemini_model
    )

    inserted = (
        client.table("briefs")
        .insert(
            {
                **columns,
                "owner_id": clip["owner_id"],
                "clip_id": clip["id"],
                "brand_id": brand["id"],
                "analysis_id": analysis["id"],
            }
        )
        .execute()
    )
    rows = inserted.data or []
    if not rows:
        raise HTTPException(
            status_code=500, detail="brief was generated but the row could not be written"
        )

    return BriefResponse(
        brief_id=rows[0]["id"],
        clip_id=UUID(clip["id"]),
        brand_id=UUID(brand["id"]),
        analysis_id=analysis["id"],
        model_version=settings.gemini_model,
        prompt_version=used_version,
        hook=columns["hook"],
        script=columns["script"],
        shot_list=columns["shot_list"],
        caption=columns["caption"],
        hashtags=columns["hashtags"],
        cta=columns["cta"],
        payload=columns["payload"],
    )


@router.post("", response_model=BriefResponse)
def create_brief(
    request: BriefRequest,
    prompt_version: str | None = Query(
        default=None,
        description="Run a specific brief prompt version, e.g. 'brief-v1'. Defaults to the latest.",
    ),
) -> BriefResponse:
    """Generate a brief for one clip adapted to one brand.

    `def` rather than `async def`: the model call blocks, so FastAPI runs this
    in a threadpool instead of stalling the event loop.
    """
    client = get_client()

    if prompt_version is not None:
        try:
            load_prompt(prompt_version)
        except PromptError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    clip = _one(client, "clips", request.clip_id, "clip")
    brand = _one(client, "brands", request.brand_id, "brand")

    # The worker holds the service role key and bypasses RLS, so nothing in
    # the database stops it joining one user's clip to another user's brand.
    # The resulting brief would carry one owner_id while being derived from
    # someone else's content — a leak RLS could not catch afterwards, because
    # the row would look perfectly legitimate.
    if clip["owner_id"] != brand["owner_id"]:
        raise HTTPException(
            status_code=403,
            detail="clip and brand belong to different users",
        )

    return _generate_and_insert(client, clip, brand, prompt_version)


@router.post("/{brief_id}/regenerate", response_model=BriefResponse)
def regenerate_brief(
    brief_id: UUID,
    prompt_version: str | None = Query(
        default=None,
        description="Run a specific brief prompt version. Defaults to the latest.",
    ),
) -> BriefResponse:
    """Write a fresh brief for the same clip and brand.

    The existing brief is read for its clip and brand and then left entirely
    alone — regenerate inserts, it never updates. So a brief someone has
    edited by hand survives, and so does one they have not: nothing is lost
    either way, and the app can show the history by ordering the briefs for a
    (clip, brand) pair by created_at.

    The new brief is generated from the analysis and the brand profile, not
    from the brief being replaced. Feeding the old text back in would drift
    further from the source with every regenerate.
    """
    client = get_client()

    if prompt_version is not None:
        try:
            load_prompt(prompt_version)
        except PromptError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing = _one(client, "briefs", brief_id, "brief")
    clip = _one(client, "clips", UUID(existing["clip_id"]), "clip")
    brand = _one(client, "brands", UUID(existing["brand_id"]), "brand")

    # Same check as create: the worker bypasses RLS, and a brief whose clip
    # and brand have drifted apart would quietly produce a cross-owner row.
    if clip["owner_id"] != brand["owner_id"]:
        raise HTTPException(status_code=403, detail="clip and brand belong to different users")

    return _generate_and_insert(client, clip, brand, prompt_version)


@router.get("/prompt-versions", response_model=list[str])
def list_brief_prompt_versions() -> list[str]:
    """Every brief prompt version available, oldest first."""
    return versions("brief")

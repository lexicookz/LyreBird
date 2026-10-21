"""Pydantic models mirroring the tables in
supabase/migrations/20260901000000_init.sql.

Field names, nullability and the check-constraint vocabularies are copied from
the migration — if you change a column there, change it here in the same commit.

Note that these describe rows as they come *out* of PostgREST. Columns with
database defaults (id, created_at, updated_at, and the array/status columns) are
required here because a selected row always has them.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

# Check-constraint vocabularies, mirrored from the migration.
RecordingSource = Literal["screen_recording", "camera_roll", "link"]
RecordingStatus = Literal["uploaded", "processing", "split", "failed", "purged"]
ClipStatus = Literal["processing", "ready", "failed"]
BriefStatus = Literal["draft", "edited", "scheduled", "published", "archived"]
CalendarPlatform = Literal["tiktok", "instagram", "youtube", "other"]

StorageBucket = Literal["recordings", "clips", "thumbnails"]


class _Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Profile(_Base):
    """public.profiles — mirrors auth.users. `id` *is* the user id, so this is
    the one table without a separate owner_id."""

    id: UUID
    display_name: str | None = None
    created_at: datetime
    updated_at: datetime


class Brand(_Base):
    """public.brands"""

    id: UUID
    owner_id: UUID
    name: str
    product_summary: str | None = None
    target_audience: str | None = None
    tone_of_voice: str | None = None
    keywords: list[str] = []
    # Adapt inputs. niche supersedes product_summary, which the app still uses.
    niche: str | None = None
    goal: str | None = None
    constraints: list[str] = []
    style_profile: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class Recording(_Base):
    """public.recordings — staging only; rows are purged once split."""

    id: UUID
    owner_id: UUID
    source: RecordingSource
    source_url: str | None = None
    storage_path: str | None = None
    duration_seconds: Decimal | None = None
    status: RecordingStatus = "uploaded"
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class Clip(_Base):
    """public.clips — recording_id is null for direct camera-roll imports."""

    id: UUID
    owner_id: UUID
    recording_id: UUID | None = None
    storage_path: str
    thumbnail_path: str | None = None
    # A directly renderable URL, as opposed to thumbnail_path which points into
    # the private thumbnails bucket. A clip may have either, both or neither.
    thumbnail_url: str | None = None
    status: ClipStatus = "processing"
    # Why the last run failed, or None. Cleared on success -- a stale message
    # beside status = 'ready' would read as a current problem.
    error_message: str | None = None
    title: str | None = None
    tags: list[str] = []
    duration_seconds: Decimal | None = None
    position_in_parent: int | None = None
    # sha256 of the file at storage_path, set when the clip is analysed. Goes
    # stale if /prepare re-encodes the file afterwards, so the worker rehashes
    # what it downloads rather than trusting this.
    video_hash: str | None = None
    created_at: datetime
    updated_at: datetime


class Analysis(_Base):
    """public.analyses — one row per Gemini run, kept so runs stay comparable.

    `payload` is unstructured jsonb on purpose: the prompt changes often. Give it
    a real shape at the point of use, not here.
    """

    id: UUID
    owner_id: UUID
    clip_id: UUID
    payload: dict[str, Any]
    model_version: str
    prompt_version: str
    created_at: datetime
    # No updated_at — analyses are append-only.


class Brief(_Base):
    """public.briefs — one per (clip, brand) adaptation."""

    id: UUID
    owner_id: UUID
    clip_id: UUID | None = None
    brand_id: UUID
    analysis_id: UUID | None = None
    hook: str | None = None
    script: str | None = None
    shot_list: Any | None = None  # jsonb, shape not yet fixed
    caption: str | None = None
    # The brief's own call to action -- authored content, distinct from the cta
    # inside analyses.payload, which describes what the source clip did.
    cta: str | None = None
    hashtags: list[str] = []
    status: BriefStatus = "draft"
    # Set together when Adapt generated the brief; all null for hand-made ones.
    payload: dict[str, Any] | None = None
    prompt_version: str | None = None
    model_version: str | None = None
    created_at: datetime
    updated_at: datetime


class CalendarEntry(_Base):
    """public.calendar_entries"""

    id: UUID
    owner_id: UUID
    brief_id: UUID
    scheduled_for: date
    platform: CalendarPlatform | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

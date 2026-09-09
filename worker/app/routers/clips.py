"""Clip processing endpoints.

Registered so the mount point and prefix are settled, but intentionally empty.

TODO: add the clip ingest/analysis endpoints (upload -> ffmpeg -> Gemini ->
write rows back to Supabase). Each will be a separate task.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/clips", tags=["clips"])

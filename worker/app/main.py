"""LYREBIRD video worker.

Handles the work the mobile app cannot do itself: ffmpeg, and any call that
needs the Gemini API key. Everything else goes straight from the app to
Supabase under RLS.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import briefs, clips, health, recordings

app = FastAPI(title="LYREBIRD Worker", version="0.1.0")

# The Expo client runs from a different origin in dev (and from the device in
# release), so this is permissive for now. Narrow it before anything ships.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(clips.router)
app.include_router(briefs.router)
app.include_router(recordings.router)

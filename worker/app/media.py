"""ffmpeg wrappers.

This is the reason the worker exists as a separate service: the mobile app
cannot run ffmpeg, so downscaling and thumbnailing happen here.

Everything shells out to the ffmpeg/ffprobe binaries rather than binding a
library. The Docker image installs both; a local run needs them on PATH.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

# A 200MB phone capture is typically 1080p or 4K. 480p with CRF 28 is the
# quality floor that still reads well on a phone, and is what keeps the output
# comfortably inside the size budget the ticket asks for.
TARGET_HEIGHT = 480
VIDEO_CRF = 28
AUDIO_BITRATE = "128k"

THUMBNAIL_AT_SECONDS = 1.0

_TIMEOUT_SECONDS = 15 * 60


class MediaError(RuntimeError):
    """ffmpeg or ffprobe failed. Carries the tail of stderr, which is where
    ffmpeg puts the actual reason."""


def _run(command: list[str]) -> str:
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as exc:
        raise MediaError(
            f"{command[0]} is not installed or not on PATH. The Docker image "
            "provides it; a local run needs it installed."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError(f"{command[0]} timed out after {_TIMEOUT_SECONDS}s") from exc

    if completed.returncode != 0:
        tail = (completed.stderr or "").strip().splitlines()[-8:]
        raise MediaError(f"{command[0]} failed ({completed.returncode}): " + " | ".join(tail))

    return completed.stdout


def probe_duration_seconds(source: Path) -> float | None:
    """Duration in seconds, or None when the container does not report one."""
    stdout = _run([
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json",
        str(source),
    ])
    try:
        value = json.loads(stdout)["format"]["duration"]
    except (KeyError, ValueError):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def downscale_to_480p(source: Path, destination: Path) -> None:
    """Re-encode to 480p H.264/AAC.

    scale=-2:480 fixes the height and derives the width, keeping the aspect
    ratio. The -2 (rather than -1) rounds to an even number, which H.264
    requires — an odd width makes libx264 fail outright.
    """
    _run([
        "ffmpeg",
        "-y",
        "-i", str(source),
        "-vf", f"scale=-2:{TARGET_HEIGHT}",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", str(VIDEO_CRF),
        "-c:a", "aac",
        "-b:a", AUDIO_BITRATE,
        # Puts the moov atom at the front so the file can start playing before
        # it has fully downloaded.
        "-movflags", "+faststart",
        str(destination),
    ])


def cut_segment(source: Path, destination: Path, start: float, end: float) -> None:
    """Cut [start, end) out of source, re-encoding.

    `-ss` before `-i` seeks the input, which is fast but lands on the nearest
    keyframe before the mark. With `-c copy` that is the cut you get, and a
    phone recording's keyframes are seconds apart -- so a clip would begin
    with the tail of the previous video. Re-encoding is what makes the
    boundary the one the detector found. The transcode costs real time, which
    is why a split is a slow endpoint and not a synchronous one forever.

    `-ss` still goes before `-i` for the fast seek; `-accurate_seek` (the
    default, stated here because the behaviour depends on it) then decodes
    from the keyframe to the exact mark and discards the difference.
    """
    if end <= start:
        raise MediaError(f"segment end {end} is not after start {start}")

    _run([
        "ffmpeg",
        "-y",
        "-accurate_seek",
        "-ss", f"{start:.3f}",
        "-t", f"{end - start:.3f}",
        "-i", str(source),
        "-vf", f"scale=-2:{TARGET_HEIGHT}",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", str(VIDEO_CRF),
        "-c:a", "aac",
        "-b:a", AUDIO_BITRATE,
        # A segment cut from the middle of a file keeps the source's start
        # time otherwise, so every clip but the first would report a
        # non-zero position and seek oddly in the player.
        "-reset_timestamps", "1",
        "-movflags", "+faststart",
        str(destination),
    ])

    if not destination.exists() or destination.stat().st_size == 0:
        raise MediaError(f"cutting {start:.3f}-{end:.3f}s produced an empty file")


def extract_thumbnail(source: Path, destination: Path, at_seconds: float = THUMBNAIL_AT_SECONDS) -> None:
    """Single JPEG frame at `at_seconds`.

    Falls back to the first frame for clips shorter than the seek point —
    seeking past the end produces no frame and an empty file rather than an
    error, so a short clip would otherwise get a broken thumbnail.
    """
    duration = probe_duration_seconds(source)
    seek = at_seconds if duration is None or duration > at_seconds else 0.0

    _run([
        "ffmpeg",
        "-y",
        # -ss before -i seeks by keyframe, which is much faster on a large file.
        "-ss", str(seek),
        "-i", str(source),
        "-frames:v", "1",
        "-vf", f"scale=-2:{TARGET_HEIGHT}",
        "-q:v", "3",
        str(destination),
    ])

    if not destination.exists() or destination.stat().st_size == 0:
        raise MediaError(f"thumbnail extraction produced no frame at {seek}s")

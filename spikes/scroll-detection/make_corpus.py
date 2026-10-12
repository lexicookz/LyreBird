"""Build test recordings with known scroll transitions.

A real corpus is five phone screen recordings of somebody scrolling. We do
not have those yet, so this builds stand-ins out of the one real video in
the repo: segments of it joined by `xfade=slideup`, which is the same
vertical translation a swipe produces.

What this gets right: real footage, real compression, a real slide, and --
the part that matters -- the in-video hard cuts that come along with the
footage. Telling a scroll apart from a cut inside a video is the whole
question, and a corpus of solid colours would not ask it.

What it gets wrong, and why the number this produces is not the answer the
ticket wants:
  - every segment comes from one source video, so consecutive "videos" share
    a palette and a subject. A real scroll lands on something unrelated and
    differs far more, so this is harder than reality.
  - xfade slides at a constant speed. A thumb accelerates, overshoots and
    bounces.
  - no UI chrome, no partial scroll that snaps back, no pause-and-resume.
"""
from __future__ import annotations

import json
import random
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parents[1] / "pipeline" / "eval_vids" / "best_tip_test1.mov"
OUT = HERE / "corpus"

FPS = 30
W, H = 576, 1024


def run(args: list[str]) -> None:
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{' '.join(args)}\n{proc.stderr[-2000:]}")


def cut(src: Path, start: float, dur: float, dest: Path) -> None:
    """One 'video' in the feed: a segment of the source, normalised."""
    run([
        "ffmpeg", "-y", "-v", "error",
        "-ss", f"{start}", "-t", f"{dur}", "-i", str(src),
        "-an", "-vf", f"scale={W}:{H},fps={FPS},setpts=PTS-STARTPTS",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", str(dest),
    ])


def build(name: str, segments: list[tuple[float, float]], swipes: list[float], seed: int) -> dict:
    """Join segments with slide-up transitions, and note where they land."""
    random.seed(seed)
    work = OUT / f".{name}"
    work.mkdir(parents=True, exist_ok=True)

    parts = []
    for i, (start, dur) in enumerate(segments):
        p = work / f"seg{i}.mp4"
        cut(SOURCE, start, dur, p)
        parts.append((p, dur))

    # xfade overlaps the two inputs, so each transition eats `swipe` seconds
    # off the running total. Offsets have to be computed on the timeline that
    # produces, not on the sum of the segment durations.
    current, truth = parts[0][0], []
    elapsed = parts[0][1]
    for i in range(1, len(parts)):
        swipe = swipes[i - 1]
        offset = elapsed - swipe
        out = work / f"join{i}.mp4"
        run([
            "ffmpeg", "-y", "-v", "error", "-i", str(current), "-i", str(parts[i][0]),
            "-filter_complex",
            f"[0:v][1:v]xfade=transition=slideup:duration={swipe}:offset={offset},format=yuv420p[v]",
            "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", str(out),
        ])
        # The midpoint of the slide is "the transition happened here".
        truth.append(round(offset + swipe / 2, 3))
        elapsed = elapsed + parts[i][1] - swipe
        current = out

    final = OUT / f"{name}.mp4"
    final.unlink(missing_ok=True)
    current.replace(final)
    for p in work.glob("*.mp4"):
        p.unlink()
    work.rmdir()

    return {
        "recording": final.name,
        "fps": FPS,
        "duration_seconds": round(elapsed, 3),
        "scroll_transitions": truth,
        "swipe_durations": [round(s, 3) for s in swipes],
        "synthetic": True,
    }


# Five recordings, deliberately not alike: different numbers of videos,
# different watch lengths, and swipes from a flick to a slow drag.
PLANS = [
    ("rec1-steady", [(0.5, 7.0), (9.0, 7.0), (17.0, 7.0), (2.0, 7.0)], [0.30, 0.30, 0.30], 1),
    ("rec2-fast-flicks", [(1.0, 3.5), (6.0, 3.0), (12.0, 4.0), (18.0, 3.0), (23.0, 3.5), (5.0, 4.0)],
     [0.12, 0.15, 0.12, 0.18, 0.12], 2),
    ("rec3-slow-drags", [(0.5, 9.0), (11.0, 9.0), (20.0, 8.0)], [0.55, 0.60], 3),
    ("rec4-mixed", [(2.0, 5.0), (8.0, 11.0), (20.0, 4.0), (1.0, 8.0), (14.0, 5.0)],
     [0.15, 0.45, 0.20, 0.35], 4),
    ("rec5-long-watch", [(0.5, 14.0), (16.0, 12.0)], [0.25], 5),
]


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"no source video at {SOURCE}")
    OUT.mkdir(exist_ok=True)
    manifest = []
    for name, segments, swipes, seed in PLANS:
        assert len(swipes) == len(segments) - 1, name
        print(f"building {name} ...", flush=True)
        manifest.append(build(name, segments, swipes, seed))

    (OUT / "ground-truth.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    total = sum(len(m["scroll_transitions"]) for m in manifest)
    print(f"\n{len(manifest)} recordings, {total} scroll transitions")
    for m in manifest:
        print(f"  {m['recording']:22} {m['duration_seconds']:6.1f}s  "
              f"{len(m['scroll_transitions'])} transitions at {m['scroll_transitions']}")


if __name__ == "__main__":
    main()

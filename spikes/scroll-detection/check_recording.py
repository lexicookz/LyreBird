"""Check a real recording before anyone measures against it.

Run this the moment recordings arrive. Every problem it looks for produces
a plausible-looking accuracy number rather than an error, which is the
worst way for a measurement to be wrong -- a transition noted against the
wrong clock reads as the detector missing it.

    .venv/Scripts/python.exe check_recording.py
    .venv/Scripts/python.exe check_recording.py corpus/real1.mp4
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

from detect import read_frames

HERE = Path(__file__).resolve().parent
CORPUS = HERE / "corpus"


def describe(path: Path, truth: list[float] | None) -> bool:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        print(f"  CANNOT OPEN {path.name} -- not a video, or an unsupported codec")
        return False
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    reported_fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()

    _, frames, times = read_frames(path)
    duration = float(times[-1]) if len(times) else 0.0
    ok = True

    print(f"\n{path.name}")
    print(f"  {width}x{height}, {len(frames)} frames, {duration:.1f}s, "
          f"reported {reported_fps:.1f} fps")

    if height < width:
        print("  WARNING  landscape. A phone feed is vertical -- is this the right file?")
        ok = False

    if duration < 30:
        print(f"  WARNING  only {duration:.0f}s. 60-90s gives the detector enough to be wrong on.")

    # Variable frame rate: the gaps between frames are not all the same.
    if len(times) > 2:
        gaps = np.diff(times)
        spread = float(gaps.max() - gaps.min())
        if spread > 0.5 / max(reported_fps, 1):
            print(f"  note     variable frame rate (gaps {gaps.min() * 1000:.0f}-"
                  f"{gaps.max() * 1000:.0f}ms). Handled -- timestamps come from the "
                  f"container, not from the average rate.")

    if reported_fps < 20:
        print(f"  WARNING  {reported_fps:.0f} fps is too low. A 0.2s swipe is a handful of "
              f"frames; below about 20 fps there is not enough to measure.")
        ok = False

    if truth is None:
        print("  WARNING  no scroll_transitions in ground-truth.json for this file")
        return False

    print(f"  ground truth: {len(truth)} transitions")
    if not truth:
        print("  WARNING  none listed. A recording with no marked swipes measures nothing.")
        return False

    out_of_range = [t for t in truth if t < 0 or t > duration]
    if out_of_range:
        print(f"  WARNING  {out_of_range} fall outside the {duration:.1f}s recording. "
              f"Times must be from the start of the video -- not the phone clock, "
              f"and not from before a trim.")
        ok = False

    close = [
        (a, b) for a, b in zip(sorted(truth), sorted(truth)[1:]) if b - a < 1.0
    ]
    if close:
        print(f"  WARNING  transitions less than 1s apart: {close}. The matcher works to "
              f"0.5s, so these cannot be told apart.")
        ok = False

    return ok


def main() -> int:
    manifest_path = CORPUS / "ground-truth.json"
    truths: dict[str, list[float]] = {}
    if manifest_path.exists():
        for entry in json.loads(manifest_path.read_text(encoding="utf-8")):
            truths[entry["recording"]] = entry.get("scroll_transitions")
    else:
        print(f"no {manifest_path} -- nothing to check against")
        return 1

    if len(sys.argv) > 1:
        paths = [Path(a) for a in sys.argv[1:]]
    else:
        paths = sorted(CORPUS.glob("*.mp4")) + sorted(CORPUS.glob("*.mov"))

    if not paths:
        print(f"no recordings in {CORPUS}")
        return 1

    results = [describe(p, truths.get(p.name)) for p in paths]
    good = sum(results)
    print(f"\n{good}/{len(results)} recordings look usable")
    return 0 if good == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())

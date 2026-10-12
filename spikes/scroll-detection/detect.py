"""Frame-difference scroll detection, as BE-21 specifies.

The signal is the mean absolute difference between consecutive frames,
greyscaled and downscaled first. Downscaling is not only for speed: at full
resolution, compression noise and any moving subject swamp the thing we are
looking for. At 64 px wide a swipe still moves every pixel and a talking
head barely moves any.

A transition is then a run of frames over a threshold, which is the number
the spike exists to find.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

WIDTH = 64  # frames are downscaled to this width before differencing


@dataclass
class Signal:
    fps: float
    diffs: np.ndarray  # mean abs difference per frame pair, 0-255
    times: np.ndarray  # timestamp of the later frame of each pair


def frame_difference(path: Path, width: int = WIDTH) -> Signal:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"could not open {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    diffs: list[float] = []
    prev = None
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        small = cv2.resize(
            frame, (width, max(1, round(h * width / w))), interpolation=cv2.INTER_AREA
        )
        grey = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev is not None:
            diffs.append(float(np.mean(np.abs(grey - prev))))
        prev = grey
    cap.release()

    arr = np.asarray(diffs, dtype=np.float32)
    times = (np.arange(len(arr)) + 1) / fps
    return Signal(fps=fps, diffs=arr, times=times)


def events(signal: Signal, threshold: float, min_gap: float = 0.35) -> list[float]:
    """Timestamps where a transition is called.

    A swipe spans several frames, so the frames over the threshold arrive in
    runs and each run is one event rather than one event per frame. min_gap
    then joins runs close enough together to be the same swipe: a slide that
    dips below the threshold part way through would otherwise be reported
    twice.

    The time reported is the diff-weighted centre of the run rather than its
    midpoint. The fastest part of a swipe is the middle, and weighting puts
    the mark there instead of at the average of a lopsided run.
    """
    over = signal.diffs > threshold
    if not over.any():
        return []

    runs: list[tuple[int, int]] = []
    start = None
    for i, flag in enumerate(over):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            runs.append((start, i - 1))
            start = None
    if start is not None:
        runs.append((start, len(over) - 1))

    merged: list[tuple[int, int]] = []
    for run in runs:
        if merged and (signal.times[run[0]] - signal.times[merged[-1][1]]) <= min_gap:
            merged[-1] = (merged[-1][0], run[1])
        else:
            merged.append(run)

    out = []
    for a, b in merged:
        weights = signal.diffs[a : b + 1]
        times = signal.times[a : b + 1]
        out.append(
            float(np.average(times, weights=weights))
            if weights.sum() > 0
            else float(times.mean())
        )
    return out

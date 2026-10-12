"""Where one video ends and the next begins in a screen recording.

Ported from the BE-21 spike (spikes/scroll-detection), which is where the
reasoning and the measurements live. The short version:

  Frame difference finds every transition and never misses one, but it
  cannot tell a scroll from a hard cut inside a video -- the cuts are the
  larger change, so no threshold separates them (precision 0.62).

  A scroll also translates the whole frame upward by about a screen
  height, which a cut does not. On the spike's corpus scrolls travelled
  0.98-1.16 screen heights and cuts 0.09-0.20, cleanly apart.

So: difference proposes, vertical travel confirms.

READ THIS BEFORE TRUSTING THE OUTPUT. Those numbers come from a corpus
built with ffmpeg's xfade, because we had no real screen recordings. The
negative result holds regardless -- the in-video cuts in it were real --
but the separation has never been measured against a real thumb, which
accelerates and rubber-bands, or against a comment sheet sliding up, which
is a screen-height of vertical travel that is *not* a transition. BE-21
stays open for exactly this. Treat boundaries from here as good enough to
show someone, not as correct.

Differs from the spike in one way that matters here: the spike holds every
decoded frame in memory, which is fine for a 30s corpus and about 100 MB
for a 90s recording -- a fifth of the Render instance. This streams the
first pass and seeks back only around the candidates, so it holds one
frame at a time.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

# Frames are downscaled to this width before differencing. Not only for
# speed: at full resolution, compression noise and a moving subject swamp
# the signal. At 64px a swipe still moves every pixel and a talking head
# barely moves any.
WIDTH = 64

# Propose a candidate above this mean absolute difference. Recall is 1.00
# anywhere from 5 to 25 on the spike corpus, so this is deliberately low --
# stage two is what provides precision, and a transition missed here can
# never be recovered.
DIFF_THRESHOLD = 9.0

# Confirm a candidate at this much vertical travel, in screen heights.
# Scrolls measured 0.98-1.16 and cuts 0.09-0.20; anything in between works,
# and this sits just above the cuts rather than at the midpoint so that a
# real swipe cut short by a seek is still kept.
TRAVEL_GATE = 0.35

# Runs of over-threshold frames closer together than this are one swipe.
MIN_GAP_SECONDS = 0.35

# How far either side of a candidate to measure travel over.
WINDOW_SECONDS = 0.45


@dataclass(frozen=True)
class Boundary:
    """A confirmed transition."""

    time: float
    peak_diff: float
    travel: float


def _downscale(frame, width: int = WIDTH):
    h, w = frame.shape[:2]
    small = cv2.resize(
        frame, (width, max(1, round(h * width / w))), interpolation=cv2.INTER_AREA
    )
    return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)


def _candidates(path: Path) -> tuple[list[tuple[float, float]], float]:
    """Pass one: stream the file, return (time, peak diff) per candidate.

    Holds one frame at a time. The two arrays it accumulates are one float
    per frame -- about 20 KB for a 90 second recording.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"could not open {path}")

    diffs: list[float] = []
    times: list[float] = []
    previous = None
    duration = 0.0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            # After the decode, not before: read before it, the first two
            # frames both report 0 and every later timestamp is one frame
            # early. Taken from the container rather than computed from an
            # average frame rate, because a phone screen recorder drops
            # frames while the screen is still -- which is while somebody is
            # watching -- and catches up during the swipe.
            position = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
            current = _downscale(frame)
            if previous is not None:
                diffs.append(float(np.mean(np.abs(current - previous))))
                times.append(position)
            previous = current
            duration = max(duration, position)
    finally:
        cap.release()

    if not diffs:
        return [], duration

    diff_array = np.asarray(diffs, dtype=np.float32)
    time_array = np.asarray(times, dtype=np.float64)
    if not np.all(np.diff(time_array) >= 0) or time_array[-1] <= 0:
        # Some containers report nothing usable. An average rate is worse
        # than real timestamps and better than zeros.
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        time_array = (np.arange(len(diff_array)) + 1) / fps
        duration = float(time_array[-1])

    over = diff_array > DIFF_THRESHOLD
    if not over.any():
        return [], duration

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
        if merged and (time_array[run[0]] - time_array[merged[-1][1]]) <= MIN_GAP_SECONDS:
            merged[-1] = (merged[-1][0], run[1])
        else:
            merged.append(run)

    out = []
    for a, b in merged:
        weights = diff_array[a : b + 1]
        window = time_array[a : b + 1]
        # The weighted centre, not the midpoint: the fastest part of a swipe
        # is the middle, and weighting puts the mark there rather than at the
        # average of a lopsided run.
        centre = (
            float(np.average(window, weights=weights))
            if weights.sum() > 0
            else float(window.mean())
        )
        out.append((centre, float(weights.max())))
    return out, duration


def _travel(path: Path, at: float) -> float:
    """Pass two: how far the picture slid vertically around `at`.

    Seeks rather than re-reading from the start. Phase correlation gives the
    translation between consecutive frames; summing the component going the
    dominant way gives the distance travelled, in screen heights. Summing
    the signed values instead would let jitter the other way cancel real
    travel out.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"could not open {path}")
    try:
        cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, at - WINDOW_SECONDS) * 1000.0)

        shifts: list[float] = []
        previous = None
        hann = None
        while True:
            position = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
            ok, frame = cap.read()
            if not ok or position > at + WINDOW_SECONDS:
                break
            current = _downscale(frame)
            if previous is not None:
                if hann is None:
                    hann = cv2.createHanningWindow(
                        (current.shape[1], current.shape[0]), cv2.CV_32F
                    )
                (_, dy), _ = cv2.phaseCorrelate(previous, current, hann)
                shifts.append(dy)
            previous = current

        if not shifts or previous is None:
            return 0.0
        arr = np.asarray(shifts)
        dominant = np.sign(np.sum(arr))
        same_way = arr[np.sign(arr) == dominant]
        return float(np.abs(same_way).sum() / previous.shape[0])
    finally:
        cap.release()


def find_boundaries(path: Path) -> list[Boundary]:
    """Confirmed scroll transitions, in order."""
    candidates, _ = _candidates(path)
    confirmed = []
    for at, peak in candidates:
        travel = _travel(path, at)
        if travel >= TRAVEL_GATE:
            confirmed.append(Boundary(time=at, peak_diff=peak, travel=travel))
    return confirmed


def segments(
    boundaries: list[Boundary], duration: float, minimum: float
) -> list[tuple[float, float]]:
    """Turn boundaries into (start, end) spans covering the whole recording.

    A boundary sits in the middle of a swipe, so each span carries a few
    frames of slide at its edges. Trimming them would need the swipe's
    extent, which the detector does not report, and a clip that starts a
    fifth of a second early is a smaller problem than one that starts after
    the hook.

    Spans shorter than `minimum` are folded into the previous one rather
    than dropped: a spurious detection should cost a seam in the middle of a
    clip, not a missing few seconds of somebody's video.
    """
    if duration <= 0:
        return []

    marks = [0.0] + [b.time for b in boundaries] + [duration]
    spans: list[tuple[float, float]] = []
    for start, end in zip(marks, marks[1:]):
        if end - start < minimum and spans:
            spans[-1] = (spans[-1][0], end)
        else:
            spans.append((start, end))

    # The first span can still be too short, with nothing before it to merge
    # into -- fold it forward instead.
    if len(spans) > 1 and spans[0][1] - spans[0][0] < minimum:
        spans[1] = (spans[0][0], spans[1][1])
        spans.pop(0)

    return [(s, e) for s, e in spans if e - s > 0]

"""The BE-23 metric: how many of the clips we would produce are correct.

Boundary precision and recall describe the detector. This describes what a
user would find in their library, which is what BE-23's threshold is about.
See docs/be23-detection-decision.md for why the unit is the clip.

A clip is correct when its start and its end are each within TOLERANCE of
the truth. The recording's own start and end always count as correct, since
nothing has to be detected for them.

The asymmetry this makes visible: a missed boundary ruins one clip, a
spurious one ruins two. Clip correctness is therefore strictly below
boundary F1, and that is the point -- it is the harsher and more honest
number.

    .venv/Scripts/python.exe clip_accuracy.py
"""
from __future__ import annotations

import json

import numpy as np

from detect import events, frame_difference
from measure import CORPUS
from vertical import measure as vertical_measure

TOLERANCE = 0.5
LATE_START = 0.3  # a clip starting this much late has cut into the hook

PROPOSE_AT = 9.0
GATE = 0.35  # matches worker/app/scroll.py


def spans(boundaries: list[float], duration: float) -> list[tuple[float, float]]:
    marks = [0.0] + sorted(boundaries) + [duration]
    return list(zip(marks, marks[1:]))


def score_clips(found: list[float], truth: list[float], duration: float):
    """Returns (correct, total, late_starts)."""
    produced = spans(found, duration)
    expected = spans(truth, duration)

    expected_starts = [s for s, _ in expected]
    expected_ends = [e for _, e in expected]

    correct = 0
    late = 0
    for start, end in produced:
        start_ok = any(abs(start - s) <= TOLERANCE for s in expected_starts)
        end_ok = any(abs(end - e) <= TOLERANCE for e in expected_ends)
        if start_ok and end_ok:
            correct += 1
        # Late means content is missing from the front. Early is harmless --
        # you get a moment of the previous video, not a lost hook.
        nearest = min(expected_starts, key=lambda s: abs(start - s))
        if start - nearest > LATE_START:
            late += 1
    return correct, len(produced), late


def report(label: str, boundaries_for) -> None:
    manifest = json.loads((CORPUS / "ground-truth.json").read_text(encoding="utf-8"))

    print(f"\n{label}")
    print(f"  {'recording':24} {'clips':>6} {'correct':>8} {'rate':>7} {'late':>6}")
    total_correct = total = total_late = 0
    per_recording = []
    for entry in manifest:
        duration = entry["duration_seconds"]
        truth = entry["scroll_transitions"]
        found = boundaries_for(entry)
        correct, produced, late = score_clips(found, truth, duration)
        total_correct += correct
        total += produced
        total_late += late
        rate = correct / produced if produced else 0.0
        per_recording.append(rate)
        print(f"  {entry['recording']:24} {produced:6} {correct:8} {rate:7.0%} {late:6}")

    overall = total_correct / total if total else 0.0
    print(f"  {'OVERALL':24} {total:6} {total_correct:8} {overall:7.0%} {total_late:6}")
    print(f"  worst recording: {min(per_recording):.0%}"
          f"   clips starting >{LATE_START}s late: {total_late / total:.0%}")

    # The rule from docs/be23-detection-decision.md, applied.
    if overall >= 0.80:
        verdict = "A (auto only)"
    elif overall >= 0.50:
        verdict = "B (auto + manual correction)"
    else:
        verdict = "C (manual only)"
    if min(per_recording) < 0.50 and verdict == "A (auto only)":
        verdict = "B (auto + correction) -- override: a single recording under 50%"
    if total_late / total > 0.20 and verdict == "A (auto only)":
        verdict = "B (auto + correction) -- override: too many clips clip the hook"
    print(f"  -> {verdict}")


def main() -> None:
    manifest = json.loads((CORPUS / "ground-truth.json").read_text(encoding="utf-8"))
    signals = {e["recording"]: frame_difference(CORPUS / e["recording"]) for e in manifest}
    confirmed: dict[str, list[float]] = {}
    for entry in manifest:
        path = CORPUS / entry["recording"]
        proposed = events(signals[entry["recording"]], PROPOSE_AT)
        confirmed[entry["recording"]] = [
            c.time for c in vertical_measure(path, proposed) if c.travel >= GATE
        ]

    report(
        "frame difference alone (what BE-21 as written would have shipped)",
        lambda e: events(signals[e["recording"]], PROPOSE_AT),
    )
    report(
        "difference + vertical travel (what BE-22 ships)",
        lambda e: confirmed[e["recording"]],
    )

    print(
        "\nBoth are measured on the synthetic corpus. The first is the one to "
        "\nbelieve: its false positives are real in-video cuts. The second is an "
        "\nupper bound -- see docs/be23-detection-decision.md section 2."
    )


if __name__ == "__main__":
    main()

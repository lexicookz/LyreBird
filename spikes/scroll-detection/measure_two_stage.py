"""Frame difference to propose, vertical travel to confirm.

Stage one is the detector BE-21 asked for, at a threshold low enough to
miss nothing (recall stays 1.00 anywhere from 5 to 25). Stage two throws
out the candidates that are not vertical slides. The question this answers
is whether two features separate what one could not.

Every video is decoded once and the measurements reused across the sweep.
The first version re-decoded all five for each of 146 gate values, which
is the same answer at roughly a hundred times the cost.
"""
from __future__ import annotations

import json
import sys

import numpy as np

from detect import events, frame_difference
from measure import CORPUS, Score, score
from vertical import measure as vertical_measure

PROPOSE_AT = 9.0


def main() -> None:
    manifest = json.loads((CORPUS / "ground-truth.json").read_text(encoding="utf-8"))

    # recording -> [(candidate, is_really_a_scroll)], measured once
    measured: dict[str, list] = {}
    for m in manifest:
        print(f"measuring {m['recording']} ...", flush=True)
        path = CORPUS / m["recording"]
        found = events(frame_difference(path), PROPOSE_AT)
        truth = m["scroll_transitions"]
        cands = vertical_measure(path, found)
        measured[m["recording"]] = [
            (c, any(abs(c.time - t) <= 0.5 for t in truth)) for c in cands
        ]

    print(f"\nevery candidate from stage one (threshold {PROPOSE_AT})")
    print(f"  {'recording':22} {'t':>8} {'peak diff':>10} {'travel':>8} {'coherence':>10}  truth")
    for name, rows in measured.items():
        for c, real in rows:
            print(
                f"  {name:22} {c.time:8.3f} {c.peak_diff:10.1f} {c.travel:8.2f} "
                f"{c.coherence:10.2f}  {'scroll' if real else 'CUT'}"
            )

    scrolls = [c.travel for rows in measured.values() for c, real in rows if real]
    cuts = [c.travel for rows in measured.values() for c, real in rows if not real]
    print("\nvertical travel, in screen heights")
    print(f"  scrolls ({len(scrolls):2}): min {min(scrolls):.2f}  max {max(scrolls):.2f}")
    print(f"  cuts    ({len(cuts):2}): min {min(cuts):.2f}  max {max(cuts):.2f}")
    separated = min(scrolls) > max(cuts)
    print(f"  separable by a single cut-off: {separated}")
    if separated:
        print(
            f"  any value in ({max(cuts):.2f}, {min(scrolls):.2f}) works; midpoint "
            f"{(max(cuts) + min(scrolls)) / 2:.2f}"
        )

    # --- score the two-stage detector --------------------------------------
    print("\ngate sweep")
    best = None
    for gate in np.arange(0.05, 1.51, 0.01):
        tp = fp = fn = 0
        for m in manifest:
            kept = [c.time for c, _ in measured[m["recording"]] if c.travel >= gate]
            sc = score(kept, m["scroll_transitions"])
            tp, fp, fn = tp + sc.tp, fp + sc.fp, fn + sc.fn
        pooled = Score(tp, fp, fn, [])
        if best is None or pooled.f1 > best[1].f1:
            best = (float(gate), pooled)
        if round(float(gate) * 100) % 20 == 0:
            print(
                f"  gate {gate:4.2f}: TP {tp:3} FP {fp:3} FN {fn:3}  "
                f"P={pooled.precision:.2f} R={pooled.recall:.2f} F1={pooled.f1:.2f}"
            )

    gate, pooled = best
    print(
        f"\nbest two-stage result: propose at {PROPOSE_AT}, confirm at travel >= {gate:.2f}"
        f"\n  P={pooled.precision:.2f} R={pooled.recall:.2f} F1={pooled.f1:.2f} "
        f"(TP {pooled.tp}, FP {pooled.fp}, FN {pooled.fn})"
    )

    print("\nper recording at that setting")
    print(f"  {'recording':22} {'truth':>6} {'kept':>5} {'TP':>4} {'FP':>4} {'FN':>4}")
    for m in manifest:
        kept = [c.time for c, _ in measured[m["recording"]] if c.travel >= gate]
        sc = score(kept, m["scroll_transitions"])
        print(
            f"  {m['recording']:22} {len(m['scroll_transitions']):6} {len(kept):5} "
            f"{sc.tp:4} {sc.fp:4} {sc.fn:4}"
        )


if __name__ == "__main__":
    sys.exit(main())

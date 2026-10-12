"""Score the detector against the ground truth, and sweep for a threshold.

"Accuracy" is the wrong word for this task and worth being precise about: a
detector that calls nothing at all is right about almost every frame,
because almost every frame is not a transition. What matters is how many of
the real transitions it found (recall) and how many of its calls were real
(precision). F1 is the single number; the per-recording table is what tells
you whether it is reliable or merely lucky on average.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from detect import events, frame_difference

HERE = Path(__file__).resolve().parent
CORPUS = HERE / "corpus"
TOLERANCE = 0.5  # seconds; a call this close to a real transition counts


@dataclass
class Score:
    tp: int
    fp: int
    fn: int
    offsets: list[float]

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if (self.tp + self.fp) else 0.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if (self.tp + self.fn) else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0


def score(found: list[float], truth: list[float], tolerance: float = TOLERANCE) -> Score:
    """One-to-one matching, closest pair first.

    Greedy nearest-match rather than "is there anything near it", so two
    calls on one transition count as one hit and one false positive. A
    detector that fires three times per swipe is not three times right.
    """
    pairs = sorted(
        (abs(f - t), fi, ti)
        for fi, f in enumerate(found)
        for ti, t in enumerate(truth)
        if abs(f - t) <= tolerance
    )
    used_f: set[int] = set()
    used_t: set[int] = set()
    offsets = []
    for _, fi, ti in pairs:
        if fi in used_f or ti in used_t:
            continue
        used_f.add(fi)
        used_t.add(ti)
        offsets.append(found[fi] - truth[ti])
    return Score(
        tp=len(used_t),
        fp=len(found) - len(used_f),
        fn=len(truth) - len(used_t),
        offsets=offsets,
    )


def main() -> None:
    manifest = json.loads((CORPUS / "ground-truth.json").read_text(encoding="utf-8"))

    print("reading recordings ...", flush=True)
    signals = {m["recording"]: frame_difference(CORPUS / m["recording"]) for m in manifest}

    # --- what the signal looks like at all --------------------------------
    print("\nframe-difference signal, per recording")
    print(f"  {'recording':24} {'median':>8} {'p99':>8} {'max':>8}  peak at each transition")
    for m in manifest:
        s = signals[m["recording"]]
        at = []
        for t in m["scroll_transitions"]:
            window = (s.times > t - 0.3) & (s.times < t + 0.3)
            at.append(round(float(s.diffs[window].max()), 1) if window.any() else 0.0)
        print(
            f"  {m['recording']:24} {np.median(s.diffs):8.2f} "
            f"{np.percentile(s.diffs, 99):8.2f} {s.diffs.max():8.2f}  {at}"
        )

    # --- sweep -------------------------------------------------------------
    print(f"\nthreshold sweep (tolerance {TOLERANCE}s, all five recordings pooled)")
    print(f"  {'thresh':>7} {'TP':>4} {'FP':>4} {'FN':>4} {'prec':>7} {'recall':>7} {'F1':>7}")
    best = None
    for threshold in np.arange(2.0, 60.1, 0.5):
        tp = fp = fn = 0
        for m in manifest:
            sc = score(events(signals[m["recording"]], float(threshold)), m["scroll_transitions"])
            tp, fp, fn = tp + sc.tp, fp + sc.fp, fn + sc.fn
        pooled = Score(tp, fp, fn, [])
        if best is None or pooled.f1 > best[1].f1:
            best = (float(threshold), pooled)
        if round(float(threshold) * 2) % 10 == 0:  # print every 5.0
            print(
                f"  {threshold:7.1f} {tp:4} {fp:4} {fn:4} "
                f"{pooled.precision:7.2f} {pooled.recall:7.2f} {pooled.f1:7.2f}"
            )

    threshold, pooled = best
    print(
        f"\nbest pooled F1 at threshold {threshold}: "
        f"P={pooled.precision:.2f} R={pooled.recall:.2f} F1={pooled.f1:.2f}"
    )

    # --- the honest part: per recording, at that one threshold --------------
    print(f"\nper recording at threshold {threshold}")
    print(
        f"  {'recording':24} {'truth':>6} {'found':>6} {'TP':>4} {'FP':>4} {'FN':>4} "
        f"{'prec':>6} {'recall':>7}  worst offset"
    )
    all_offsets: list[float] = []
    for m in manifest:
        found = events(signals[m["recording"]], threshold)
        sc = score(found, m["scroll_transitions"])
        all_offsets += sc.offsets
        worst = max((abs(o) for o in sc.offsets), default=float("nan"))
        print(
            f"  {m['recording']:24} {len(m['scroll_transitions']):6} {len(found):6} "
            f"{sc.tp:4} {sc.fp:4} {sc.fn:4} {sc.precision:6.2f} {sc.recall:7.2f}  {worst:6.3f}s"
        )

    if all_offsets:
        a = np.abs(all_offsets)
        print(f"\ntiming of the hits: mean offset {a.mean():.3f}s, worst {a.max():.3f}s")
        total = sum(len(m["scroll_transitions"]) for m in manifest)
        for tol in (0.1, 0.25, 0.5):
            hits = sum(
                score(events(signals[m["recording"]], threshold), m["scroll_transitions"], tol).tp
                for m in manifest
            )
            print(f"  within {tol}s: {hits}/{total} transitions")


if __name__ == "__main__":
    main()

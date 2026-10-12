"""What are the false positives?

The sweep gives recall 1.00 and precision 0.62, and the nine false calls do
not move between thresholds 10 and 25. That pattern says they are not noise
-- noise would thin out as the threshold rises. This prints them so they can
be named, and maps each one back to the position in the source footage it
came from, because every recording in the corpus is cut from one video and a
hard cut inside that video will show up in several of them at once.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from detect import events, frame_difference
from measure import CORPUS, score

THRESHOLD = 9.0


def main() -> None:
    manifest = json.loads((CORPUS / "ground-truth.json").read_text(encoding="utf-8"))

    for m in manifest:
        signal = frame_difference(CORPUS / m["recording"])
        found = events(signal, THRESHOLD)
        truth = m["scroll_transitions"]
        sc = score(found, truth)

        matched = set()
        pairs = sorted(
            (abs(f - t), fi, ti)
            for fi, f in enumerate(found)
            for ti, t in enumerate(truth)
            if abs(f - t) <= 0.5
        )
        used_t: set[int] = set()
        for _, fi, ti in pairs:
            if fi in matched or ti in used_t:
                continue
            matched.add(fi)
            used_t.add(ti)

        print(f"\n{m['recording']}  ({sc.tp} hits, {sc.fp} false)")
        for fi, f in enumerate(found):
            window = (signal.times > f - 0.2) & (signal.times < f + 0.2)
            peak = float(signal.diffs[window].max()) if window.any() else 0.0
            label = "scroll " if fi in matched else "FALSE  "
            print(f"    {label} t={f:7.3f}s  peak diff {peak:6.1f}")


if __name__ == "__main__":
    main()

"""What would this cost to run in the worker?

Render's free tier is 512 MB and one shared CPU, and /clips/{id}/prepare is
already the endpoint most likely to be killed there. Before anyone wires
scroll detection into it, the question is how long a minute of recording
takes and how much memory it holds at once.
"""
from __future__ import annotations

import json
import time
import tracemalloc

from detect import events, frame_difference
from measure import CORPUS
from vertical import measure as vertical_measure


def main() -> None:
    manifest = json.loads((CORPUS / "ground-truth.json").read_text(encoding="utf-8"))

    total_seconds = 0.0
    total_wall = 0.0
    peak_mb = 0.0

    print(f"  {'recording':22} {'length':>8} {'stage 1':>9} {'stage 2':>9} {'x real time':>12}")
    for m in manifest:
        path = CORPUS / m["recording"]

        tracemalloc.start()
        t0 = time.perf_counter()
        signal = frame_difference(path)
        t1 = time.perf_counter()
        found = events(signal, 9.0)
        vertical_measure(path, found)
        t2 = time.perf_counter()
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        length = m["duration_seconds"]
        wall = t2 - t0
        total_seconds += length
        total_wall += wall
        peak_mb = max(peak_mb, peak / 1e6)
        print(
            f"  {m['recording']:22} {length:7.1f}s {t1 - t0:8.2f}s {t2 - t1:8.2f}s "
            f"{length / wall:11.1f}x"
        )

    print(
        f"\n  {total_seconds:.0f}s of video in {total_wall:.1f}s "
        f"({total_seconds / total_wall:.1f}x real time)"
    )
    print(f"  a 3-minute recording would take about {180 / (total_seconds / total_wall):.0f}s")
    print(f"  peak python allocation, one recording: {peak_mb:.0f} MB")
    print(
        "\n  note: stage 2 decodes the file a second time. Sharing one decode "
        "between the stages would cut the total roughly to stage 1 alone."
    )


if __name__ == "__main__":
    main()

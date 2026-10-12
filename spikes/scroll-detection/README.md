# BE-21 · Scroll detection spike

**Question:** can frame-differencing with OpenCV find the scroll transitions
in a screen recording, and what threshold does it?

**Short answer: no, not on its own, and not at any threshold.** The reason is
specific and worth reading, because it also points at the fix. A second
feature — how far the picture travels vertically — separates the two cases
cleanly on the corpus I have.

**This does not close the ticket.** The done-when is a measured number on five
*real* recordings and the corpus here is semi-synthetic, for reasons set out
under [The corpus](#the-corpus). What the numbers below establish is which
approach is worth measuring properly; the measurement itself needs five real
screen recordings, which takes somebody ten minutes with a phone.

## Why frame difference alone fails

A scroll transition is a big change between consecutive frames. So is a hard
cut inside a video, and short-form content is full of them. The spike assumed
scrolls would be the bigger change. They are not:

| | peak frame difference |
| --- | --- |
| real scroll transitions (15) | 29.5 – 59.6 |
| hard cuts inside a video (9) | **50.5 – 96.3** |

The cuts are *stronger* than the scrolls, and they overlap. There is no
cut-off that keeps one and drops the other, which is not a tuning problem —
it is the feature measuring the wrong thing. Pooled over the five recordings:

```
best F1 at threshold 9.0:  precision 0.62   recall 1.00   F1 0.77
```

Precision never gets above 0.62 anywhere in the sweep. Raising the threshold
removes true scrolls before it removes the cuts, so it gets worse, not better:

```
 thresh   TP   FP   FN    prec  recall      F1
   10.0   15    9    0    0.62    1.00    0.77
   25.0   15    9    0    0.62    1.00    0.77
   35.0   12    9    3    0.57    0.80    0.67
   50.0    2    9   13    0.18    0.13    0.15
```

Two things that *did* work, and are worth keeping:

- **Recall is 1.00** anywhere from threshold 5 to 25. Frame difference never
  misses a transition — it just also calls things that are not one. That makes
  it a good first stage.
- **Timing is excellent.** Every hit lands within 0.04s of the true
  transition, which is well inside what splitting a clip needs.

The failure is entirely precision: 9 false calls against 15 real transitions
across 130s of video. That is 24 splits where 15 were wanted — 60% more clips
than there are videos, and every extra one is a cut through the middle of a
video rather than between two.

## What does work: vertical travel

A scroll has a property a cut does not — the whole picture slides upward by
about one screen height. A cut replaces the picture without moving it.
Phase correlation (`cv2.phaseCorrelate`) measures that translation per frame
pair; summing it across a candidate gives the distance travelled.

| | vertical travel (screen heights) |
| --- | --- |
| real scroll transitions (15) | 0.98 – 1.16 |
| hard cuts inside a video (9) | 0.09 – 0.20 |

Completely separated, with a wide gap — anything between 0.20 and 0.98 works
as the cut-off, so it is not a delicately tuned number. Using frame difference
to propose candidates and travel to confirm them:

```
propose at diff > 9.0, confirm at travel >= 0.21
precision 1.00   recall 1.00   F1 1.00   (15 found, 0 missed, 0 false)
```

**Do not read that 1.00 as "solved".** See below.

## The corpus

We have no real screen recordings. The only video in the repo is
`pipeline/eval_vids/best_tip_test1.mov`, a 29s vertical clip. So
`make_corpus.py` builds five recordings out of segments of it, joined with
ffmpeg's `xfade=slideup` — 130s of video, 15 transitions, varied watch lengths
and swipe speeds from a 0.12s flick to a 0.60s drag.

What that gets right, and it is more than it sounds: real footage, real
compression, a real vertical slide, and — the part that matters — the real
hard cuts that come with the footage. The nine false positives are genuine
in-video cuts, not artefacts I introduced. **The finding that frame difference
cannot separate scrolls from cuts does not depend on the corpus being
synthetic.** That result would hold on real recordings.

What it gets wrong, and why the 1.00 is not a real number:

- `xfade` slides at constant speed and is a geometrically perfect
  translation. A real swipe accelerates, overshoots, and rubber-bands at the
  ends. Phase correlation will have an easier time here than it will in life.
- Every segment is cut from one source, so consecutive "videos" share a
  subject and palette. A real scroll lands on something unrelated.
- No UI chrome, no partial scroll that snaps back, no pause-and-resume, no
  double-tap, no comment sheet opening over the top. A sheet sliding up is
  vertical travel that is **not** a transition, and nothing here tests it.

That last one is the risk the current design would walk into, and it is the
first thing to look for in real footage.

## Cost, if this goes in the worker

Measured on 130s of 576x1024 at 30fps:

| | |
| --- | --- |
| throughput | 3.4x real time (a 3-minute recording ≈ 53s) |
| peak memory | 32 MB |
| added to the image | opencv-python-headless 105 MB + numpy 38 MB |

Memory is fine. Two caveats for Render's free tier: that throughput is on a
laptop and the free instance is a shared CPU, so assume slower; and the
current code decodes the file twice, once per stage. Sharing one decode
between them roughly halves it and is easy.

Worth noting `/clips/{id}/prepare` is already the endpoint most at risk of
being OOM-killed on the free tier. Scroll detection on a full recording is
heavier than that, so this likely wants to be a background job rather than
something a request waits on.

## To actually close BE-21

**Five real screen recordings.** 60–90 seconds each of normal scrolling,
with the times you swiped written down — a rough `0:14, 0:31, 0:52` is
enough, the matching tolerance is half a second. Variety is the point: a
couple of fast flick-throughs, one where you linger, and at least one where
you open a comment sheet or scroll back up, since those are the cases most
likely to break it.

Drop them in `corpus/` with a ground-truth file in the same shape
`make_corpus.py` writes, and `measure.py` and `measure_two_stage.py` run
against them unchanged.

## Running it

```
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe make_corpus.py          # builds corpus/ from the sample video
.venv/Scripts/python.exe measure.py              # frame difference alone
.venv/Scripts/python.exe measure_two_stage.py    # with the vertical-travel confirm
.venv/Scripts/python.exe inspect_fps.py          # lists every call, hit or false
.venv/Scripts/python.exe cost.py                 # throughput and memory
```

| file | what it is |
| --- | --- |
| `detect.py` | frame differencing and threshold-to-events |
| `vertical.py` | phase-correlation vertical travel |
| `measure.py` | scoring, and the threshold sweep |
| `measure_two_stage.py` | both stages, and the gate sweep |
| `make_corpus.py` | builds the stand-in recordings |
| `inspect_fps.py` | names every candidate so false ones can be looked at |
| `cost.py` | throughput and memory |

Nothing here is imported by the worker or the app. It is a spike: if the
approach survives real recordings, the detector is about 60 lines to port.

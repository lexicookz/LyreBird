# BE-23 · Auto-detection or manual trim

**Status: criterion fixed, decision pending one input.** Updated 12 October 2026.

BE-23 says: if BE-21 comes in under about 80% accuracy, ship a manual trim UI
instead and drop auto-detection — and decide at the end of the spike rather
than in week 12.

The spike is done in the sense that matters: we know how the detector behaves
and why. It is not done in the sense BE-23 needs, because the accuracy number
in that sentence does not exist yet. Nobody has recorded a phone, so every
measurement we have is against a corpus built with ffmpeg.

What this document does is fix the criterion **now, before the data arrives**,
which is the part that is actually at risk of being decided in week 12. A
threshold chosen after seeing the number is not a threshold.

---

## 1. What "80% accuracy" has to mean

"Accuracy" is the wrong word for this task and needs replacing before it is
measured, not after. A detector that finds nothing is right about almost every
frame, because almost every frame is not a transition.

Three candidates, and they are not interchangeable:

| Metric | What it counts | Why not |
| --- | --- | --- |
| Boundary recall | transitions found / transitions real | Ignores false ones entirely. The spike scores 1.00 here while producing 60% too many clips. |
| Boundary F1 | the spike's headline | Closest to useful, but a user never sees a boundary. |
| **Clip correctness** | **clips whose both edges are right / clips produced** | **This is what lands in the library.** |

**The criterion is clip correctness.** A clip is correct when its start and its
end are each within **0.5s** of the truth — the same tolerance the spike's
harness uses, and about the length of a slow swipe.

Two consequences worth stating in advance, because both make the number
*harsher* than the boundary figures and that is the point:

- **One missed boundary ruins one clip** — the two videos arrive merged, and
  its analysis will describe two videos as one.
- **One spurious boundary ruins two** — both halves are truncated.

So clip correctness is strictly below boundary F1, and it should be. It is the
number a user would recognise as "how often did this work".

### Reported alongside it, not as the gate

- **Content lost from the start of a clip.** A clip that begins late has cut
  into the hook, which is the single field the whole product is built on. A
  clip that begins early merely carries a moment of the previous video. These
  are not equally bad and a symmetric tolerance hides that, so the fraction of
  clips starting more than 0.3s late is recorded separately.
- **Worst case per recording**, not just the mean. Five recordings averaging
  80% with one at 20% is a different product from five at 80%.

---

## 2. The numbers we have

All against `spikes/scroll-detection`'s corpus: five recordings, 15
transitions, 130s, **built with ffmpeg's `xfade` from segments of one real
video.** Real footage, real compression, real in-video cuts; synthetic slides.

| | precision | recall | F1 |
| --- | --- | --- | --- |
| Frame difference alone | 0.62 | 1.00 | 0.77 |
| Difference + vertical travel | 1.00 | 1.00 | 1.00 |

And end to end through `POST /recordings/{id}/split` (BE-22), on three of
those recordings: boundaries within **0.02s** of truth, every clip the length
of its span, 51/51 checks.

**Neither number is the one BE-23 asks for.** What each is worth:

- **The 0.62 is trustworthy and negative.** Frame difference alone cannot
  separate a scroll from a hard cut inside a video, because the cuts are the
  *larger* change (peaks of 50–96 against 29–60 for real scrolls). The cuts in
  the corpus are real, so this holds on real footage.

  Run through the clip metric (`clip_accuracy.py`), frame differencing alone
  scores **38%**, with one recording at **0%** and 24% of clips starting late:

  | | clips | correct | rate |
  | --- | --- | --- | --- |
  | rec1-steady | 6 | 2 | 33% |
  | rec2-fast-flicks | 7 | 5 | 71% |
  | rec3-slow-drags | 5 | 1 | 20% |
  | rec4-mixed | 7 | 3 | 43% |
  | rec5-long-watch | 4 | 0 | 0% |
  | **overall** | **29** | **11** | **38%** |

  So if "auto-detection" had meant frame differencing, BE-23 would already
  have tripped — and past the 80% line into **C**, not merely B.

  This is also the clearest argument for the metric in §1. The same detector
  scores 0.77 on boundary F1 and 38% on clips: a spurious boundary ruins the
  clip on each side of it, so errors roughly double on the way through. The
  boundary figure would have read as a near-miss. The clip figure is the
  product.
- **The 1.00 is not trustworthy.** `xfade` slides are geometrically perfect
  constant-speed translations. A thumb accelerates and rubber-bands. More
  importantly, nothing in the corpus contains **a comment sheet sliding up, a
  scroll back up, or a half-swipe that snaps back** — each of which is a
  screen-height of vertical travel that is *not* a transition, and therefore
  aimed squarely at the one feature the detector relies on. The corpus does
  not test the failure mode most likely to occur.

Expect the real number to be below 1.00. How far below is the whole question.

---

## 3. A finding that changes the options

**The app cannot import a screen recording at all.** `AddVideoMenu` offers one
row, Camera roll. Nothing in the app writes to `recordings` or uploads to that
bucket; `clips.recording_id` is set to `null` on every insert the app makes.

So the thing BE-23 frames as a choice between two features is really a choice
about what to build *on top of* an import path that does not exist in either
case. The import flow — pick or record, upload to `recordings`, insert the
row, call split, show progress — is needed identically whichever branch wins,
and it is the larger piece of work. Neither branch of BE-23 is reachable until
it exists.

That also means the cost comparison in the ticket is misleading. "Ship a
manual trim UI instead" is not cheaper than shipping auto-detection, because
the worker side of auto-detection is **already built and verified** (BE-22,
merged) while the trim UI is not built at all.

---

## 4. The options, as they actually stand

| | What ships | Already built | Still needed |
| --- | --- | --- | --- |
| **A. Auto only** | Split runs, clips appear | detector, `/split`, buckets, schema | import flow |
| **B. Auto + correct** | Split runs, user can adjust the seams | same | import flow, trim UI seeded from boundaries |
| **C. Manual only** | User marks the cuts themselves | buckets, schema, ffmpeg | import flow, trim UI from scratch, a `/split` variant taking explicit times |

B is the option the ticket does not name, and it only became available when
BE-22 landed. Its marginal cost over C is close to zero — the trim UI is the
same screen either way; the only difference is whether it opens with the
detector's boundaries pre-filled or with none. Its marginal cost over A is the
trim UI.

The case for B is that pre-filled seams are a saving whenever they are more
often right than wrong, and the user is the backstop for the cases the
detector cannot see — the comment sheet, the scroll back up — which are
exactly the cases we cannot currently measure.

The case against B is only that a bad pre-fill is worse than an empty one: if
most seams need dragging, the user is correcting rather than creating, which
is slower.

---

## 5. The rule, fixed in advance

Measured as defined in §1, on five real screen recordings, run through
`check_recording.py` first:

| Clip correctness | Decision |
| --- | --- |
| **≥ 80%** | **A** — ship auto-detection. A trim UI becomes a nice-to-have, not a dependency. |
| **50–79%** | **B** — ship auto-detection *and* a trim UI. The boundaries are a useful first draft; the user fixes the rest. |
| **< 50%** | **C** — drop auto-detection from the product flow. Below half, correcting is slower than marking from scratch. |

The 50% floor is where pre-filling stops paying for itself: a seam that is
wrong more often than right costs a drag to fix plus the attention to notice
it, against one drag to create.

Two overrides, both stated now so they are not negotiated later:

- **Any single recording under 50% sends the decision to B at best**, whatever
  the mean. An inconsistent splitter is worse than a consistent one, because
  the user cannot learn when to check it.
- **If more than 20% of clips start late by over 0.3s, B at best** regardless
  of the headline. Clipping the hook is the one error this product cannot
  absorb.

---

## 6. What would change this

The five recordings. `spikes/scroll-detection/README.md` holds the spec, and
the harnesses run against real files unchanged:

```
.venv/Scripts/python.exe check_recording.py     # are the files usable
.venv/Scripts/python.exe clip_accuracy.py       # the BE-23 number, and the verdict
```

`clip_accuracy.py` implements §1 and applies §5's rule, including both
overrides, and prints which option it lands on. The point of writing it before
the data is that the threshold cannot then be adjusted to suit the result.

The testing analyst has been asked.

Until then the honest position is: **the worker can split a recording
correctly, and nobody has shown it a real one.** BE-22 is merged behind that
caveat, and the API contract carries it where a caller will see it.

---

### Decision log

Tickets deferred rather than built are in `decision-log.md`.

| Date | Decision |
| --- | --- |
| 2026-10-12 | Criterion and thresholds fixed (this document). Outcome pending five real recordings. Frame-differencing alone already ruled out on evidence that does not depend on the corpus being synthetic. |

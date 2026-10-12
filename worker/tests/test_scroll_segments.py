"""Turning detected boundaries into the spans that become clips.

find_boundaries() needs a video and is covered end to end instead. This is
the arithmetic around it, which is where an off-by-one costs somebody the
start of their clip.
"""

from __future__ import annotations

import pytest

from app.scroll import Boundary, segments


def at(*times: float) -> list[Boundary]:
    return [Boundary(time=t, peak_diff=40.0, travel=1.0) for t in times]


def test_no_boundaries_is_one_clip_of_the_whole_recording():
    # A recording of a single video someone never scrolled past is not a
    # failure, and must not come back as zero clips.
    assert segments([], 42.0, 1.5) == [(0.0, 42.0)]


def test_each_boundary_starts_a_new_span():
    assert segments(at(10.0, 25.0), 40.0, 1.5) == [(0.0, 10.0), (10.0, 25.0), (25.0, 40.0)]


def test_the_spans_cover_the_recording_with_no_gaps():
    spans = segments(at(7.5, 19.25, 31.0), 44.0, 1.5)
    assert spans[0][0] == 0.0
    assert spans[-1][1] == 44.0
    for (_, end), (next_start, _) in zip(spans, spans[1:]):
        assert end == next_start


def test_a_short_span_folds_into_the_one_before_it():
    # Two detections on one swipe would otherwise produce a half-second
    # clip. Better a seam inside a clip than a clip of nothing.
    #
    # Which of the two boundaries survives is arbitrary -- they are 0.4s
    # apart and the real one is somewhere between them, so either cut is
    # equally close. What is not arbitrary is that there are two spans
    # rather than three and neither is tiny.
    spans = segments(at(10.0, 10.4), 30.0, 1.5)
    assert len(spans) == 2
    assert all(end - start >= 1.5 for start, end in spans)
    assert 10.0 <= spans[0][1] <= 10.4


def test_a_short_first_span_folds_forward_instead():
    # Nothing precedes it, so the rule above has nothing to merge into.
    # A swipe in the first second of a recording is the real case.
    spans = segments(at(0.6), 30.0, 1.5)
    assert spans == [(0.0, 30.0)]


def test_a_short_final_span_folds_back():
    spans = segments(at(20.0, 29.8), 30.0, 1.5)
    assert spans == [(0.0, 20.0), (20.0, 30.0)]


def test_several_spurious_detections_collapse_together():
    # Four detections on one swipe must still produce two clips, not five.
    spans = segments(at(10.0, 10.2, 10.5, 10.9), 30.0, 1.5)
    assert len(spans) == 2
    assert all(end - start >= 1.5 for start, end in spans)


def test_a_boundary_at_the_very_end_does_not_make_an_empty_span():
    spans = segments(at(30.0), 30.0, 1.5)
    assert all(end > start for start, end in spans)


def test_a_zero_length_recording_has_no_spans():
    assert segments([], 0.0, 1.5) == []


@pytest.mark.parametrize("duration", [5.0, 17.5, 60.0, 93.25])
def test_total_span_always_equals_the_duration(duration):
    spans = segments(at(2.0, 4.0, 30.0), duration, 1.5)
    if not spans:
        return
    covered = sum(end - start for start, end in spans)
    assert covered == pytest.approx(duration)

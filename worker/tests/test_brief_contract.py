"""The Adapt contract: what BriefDraft and BrandProfile accept and reject.

test_brief_schema.py covers the mapping onto a briefs row. This file covers
the contract itself: every rule that keeps a generated brief shootable, and
the guard against the schema keywords Gemini's response_schema rejects.

Each test name maps to a test case ID in the Design Thinking report (TC-xx).
"""

import copy
import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.brief_schema import (
    EXPORTS,
    SCHEMA_DIR,
    BrandProfile,
    BriefDraft,
)
from app.models import Brand

VALID = {
    "title": "Your grinder is not the problem",
    "funnel_stage": "TOFU",
    "target_duration_seconds": 28,
    "hook": {
        "line": "A better grinder will not save stale beans.",
        "on_screen_text": "NO ROAST DATE, NO SALE",
        "visual": "Overhead, beans hitting the scale",
    },
    "beats": [
        {"start_seconds": 0, "end_seconds": 2.5, "shot": "Overhead on the scale",
         "action": "Beans pour onto the scale", "voiceover": "", "on_screen_text": "NO ROAST DATE"},
        {"start_seconds": 2.5, "end_seconds": 11, "shot": "Hands on grinder dial",
         "action": "Adjust the grind", "voiceover": "Grind changes extraction.", "on_screen_text": ""},
        {"start_seconds": 11, "end_seconds": 28, "shot": "Two bags side by side",
         "action": "Hold on the dated bag", "voiceover": "It does not change staleness.", "on_screen_text": ""},
    ],
    "cta": "Check the bag in your cupboard right now.",
    "caption": "Roast date or it did not happen.",
    "hashtags": ["#specialtycoffee"],
    "why_it_works": [
        {"brief_element": "hook", "source_field": "hook",
         "source_detail": "Contrarian claim in the first line",
         "rationale": "Challenges an expensive habit the audience already has."}
    ],
    "production_notes": ["Cut on the grinder clicks."],
    "posting_slots": [
        {"day_offset": 1, "start_hour": 18, "end_hour": 20, "platform": "tiktok",
         "rationale": "Evening scroll."}
    ],
}


def draft(**changes):
    data = copy.deepcopy(VALID)
    data.update(changes)
    return data


# TC-01
def test_a_complete_brief_is_accepted():
    assert BriefDraft.model_validate(VALID).beats[-1].end_seconds == 28


# TC-02
def test_overlapping_beats_are_rejected():
    beats = copy.deepcopy(VALID["beats"])
    beats[1]["start_seconds"] = 2.0  # starts before beat 0 ends at 2.5
    with pytest.raises(ValidationError, match="must not overlap"):
        BriefDraft.model_validate(draft(beats=beats))


# TC-03
def test_a_beat_that_ends_before_it_starts_is_rejected():
    beats = copy.deepcopy(VALID["beats"])
    beats[0]["end_seconds"] = 0
    with pytest.raises(ValidationError, match="end_seconds must be after start_seconds"):
        BriefDraft.model_validate(draft(beats=beats))


# TC-04
def test_a_brief_with_no_beats_is_rejected():
    with pytest.raises(ValidationError):
        BriefDraft.model_validate(draft(beats=[]))


# TC-05
@pytest.mark.parametrize("count", [0, 4])
def test_posting_slots_must_be_one_to_three(count):
    slot = VALID["posting_slots"][0]
    with pytest.raises(ValidationError):
        BriefDraft.model_validate(draft(posting_slots=[slot] * count))


# TC-06
def test_a_posting_window_that_runs_backwards_is_rejected():
    slots = [dict(VALID["posting_slots"][0], start_hour=20, end_hour=18)]
    with pytest.raises(ValidationError, match="end_hour must be after start_hour"):
        BriefDraft.model_validate(draft(posting_slots=slots))


# TC-07
def test_a_slot_more_than_two_weeks_out_is_rejected():
    slots = [dict(VALID["posting_slots"][0], day_offset=14)]
    with pytest.raises(ValidationError):
        BriefDraft.model_validate(draft(posting_slots=slots))


# TC-08
def test_why_it_works_must_point_at_a_real_analysis_field():
    reasons = [dict(VALID["why_it_works"][0], source_field="vibes")]
    with pytest.raises(ValidationError):
        BriefDraft.model_validate(draft(why_it_works=reasons))


# TC-09
def test_a_brief_with_no_why_it_works_is_rejected():
    with pytest.raises(ValidationError):
        BriefDraft.model_validate(draft(why_it_works=[]))


# TC-10
@pytest.mark.parametrize("field,value", [
    ("funnel_stage", "AWARENESS"),
    ("target_duration_seconds", 0),
    ("target_duration_seconds", 181),
])
def test_out_of_range_brief_fields_are_rejected(field, value):
    with pytest.raises(ValidationError):
        BriefDraft.model_validate(draft(**{field: value}))


# TC-11
def test_brand_profile_rejects_unknown_keys():
    with pytest.raises(ValidationError):
        BrandProfile.model_validate({
            "name": "Fieldnote", "niche": "Coffee", "target_audience": "Home brewers",
            "tone": "Plain", "goal": "Follows", "budget": "high",
        })


# TC-12
def test_profile_falls_back_to_product_summary_and_tolerates_gaps():
    now = datetime.now(timezone.utc)
    brand = Brand(
        id=uuid4(), owner_id=uuid4(), name="Fieldnote",
        product_summary="Specialty coffee beans", niche=None,
        target_audience=None, tone_of_voice=None, goal=None,
        created_at=now, updated_at=now,
    )
    profile = BrandProfile.from_brand(brand)
    assert profile.niche == "Specialty coffee beans"
    assert profile.tone == "" and profile.goal == ""


# TC-13: regression guard for the two 422s found against the live API on 11 Oct
def _keys(node):
    if isinstance(node, dict):
        for key, value in node.items():
            yield key
            yield from _keys(value)
    elif isinstance(node, list):
        for item in node:
            yield from _keys(item)


@pytest.mark.parametrize("keyword", ["exclusiveMinimum", "exclusiveMaximum", "additionalProperties"])
def test_output_schema_has_no_keywords_gemini_rejects(keyword):
    assert keyword not in set(_keys(BriefDraft.model_json_schema()))


# TC-14
@pytest.mark.parametrize("filename", sorted(EXPORTS))
def test_committed_json_schemas_match_the_models(filename):
    committed = json.loads((SCHEMA_DIR / filename).read_text(encoding="utf-8"))
    assert committed == EXPORTS[filename].model_json_schema()

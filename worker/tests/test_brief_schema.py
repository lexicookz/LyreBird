"""to_brief_columns: the mapping from a generated BriefDraft to a briefs row."""

from app.brief_schema import BriefDraft, to_brief_columns

DRAFT = BriefDraft.model_validate(
    {
        "title": "Your grinder is not the problem",
        "funnel_stage": "TOFU",
        "target_duration_seconds": 28,
        "hook": {
            "line": "A better grinder will not save stale beans.",
            "on_screen_text": "NO ROAST DATE, NO SALE",
            "visual": "Overhead, beans hitting the scale",
        },
        "beats": [
            {
                "start_seconds": 0,
                "end_seconds": 2.5,
                "shot": "Overhead on the scale",
                "action": "Beans pour onto the scale",
                "voiceover": "",
                "on_screen_text": "NO ROAST DATE, NO SALE",
            },
            {
                "start_seconds": 2.5,
                "end_seconds": 11,
                "shot": "Hands on grinder dial",
                "action": "Adjust the grind",
                "voiceover": "Grind changes extraction.",
                "on_screen_text": "",
            },
            {
                "start_seconds": 11,
                "end_seconds": 28,
                "shot": "Two bags side by side",
                "action": "Hold on the dated bag",
                "voiceover": "It does not change staleness.",
                "on_screen_text": "",
            },
        ],
        "cta": "Check the bag in your cupboard right now.",
        "caption": "Roast date or it did not happen.",
        "hashtags": ["#specialtycoffee", "roastdate", "#"],
        "why_it_works": [
            {
                "brief_element": "hook",
                "source_field": "hook",
                "source_detail": "Contrarian claim in the first line",
                "rationale": "Challenges an expensive habit the audience already has.",
            }
        ],
        "production_notes": ["Cut on the grinder clicks."],
        "posting_slots": [
            {
                "day_offset": 1,
                "start_hour": 18,
                "end_hour": 20,
                "platform": "tiktok",
                "rationale": "Evening scroll.",
            }
        ],
    }
)


def columns():
    return to_brief_columns(DRAFT, prompt_version="brief-v1", model_version="gemini-2.5-flash")


def test_shot_list_is_plain_strings_one_per_beat():
    shot_list = columns()["shot_list"]
    assert shot_list == [
        "0-2.5s  Overhead on the scale",
        "2.5-11s  Hands on grinder dial",
        "11-28s  Two bags side by side",
    ]
    assert all(isinstance(s, str) for s in shot_list)


def test_script_joins_voiceover_and_skips_silent_beats():
    assert columns()["script"] == "Grind changes extraction. It does not change staleness."


def test_hashtags_are_stored_without_hash():
    assert columns()["hashtags"] == ["specialtycoffee", "roastdate"]


def test_payload_round_trips_and_versions_are_set():
    cols = columns()
    assert BriefDraft.model_validate(cols["payload"]) == DRAFT
    assert cols["prompt_version"] == "brief-v1"
    assert cols["model_version"] == "gemini-2.5-flash"
    assert cols["hook"] == DRAFT.hook.line

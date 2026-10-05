"""PROVISIONAL analysis schema.

    ⚠ This is not the agreed contract. BE-12 settles that with the AI
      engineer; this exists so BE-13 can be built and tested in the
      meantime. When BE-12 lands, replace this model and nothing else —
      everything downstream imports `AnalysisResult` from here.

What it mirrors: the analysis fields of `VideoAnalysis` in
`pipeline/schema.py`, which is what the Gemini call returns today.

What it deliberately leaves out: `id`, `title`, `thumbnailUrl`, `tags`,
`status` and `createdAt`. Those are columns on `clips`, and the model cannot
know them from the video — asking for them invites invented values into
fields the database already owns, and gives a clip two sources of truth for
its own title. Whether they stay out is one of BE-12's open questions.

Also not here yet: `audioStyle` and `whyItWorks`. BE-12 names them but their
shape is undecided — a string or an object — and guessing would mean writing
rows now that have to be migrated later.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class FunnelStage(str, Enum):
    """Mirrored from pipeline/schema.py. The vocabulary clash with the app's
    original top/middle/bottom was already settled in the pipeline's favour —
    see the note in types/index.ts."""

    TOFU = "TOFU"
    MOFU = "MOFU"
    BOFU = "BOFU"


class FormatTag(str, Enum):
    UGC_TESTIMONIAL = "ugc_testimonial"
    FOUNDER_POV = "founder_pov"
    PROBLEM_AGITATE_SOLVE = "problem_agitate_solve"


class AnalysisResult(BaseModel):
    """What Gemini is asked to return for one clip.

    Passed to the API as `response_schema`, so every field here is a
    constraint on the model's output, not just a parse of it. Descriptions
    are part of the prompt the model sees — they are worth writing properly.
    """

    hook: str = Field(description="The opening line or visual that stops the scroll.")
    transcript: str = Field(description="Full spoken transcript.")
    onScreenText: str = Field(description="All text burned into the video, in order of appearance.")
    shotBeats: list[str] = Field(
        description="The structural beats of the video, one short phrase each, in order."
    )
    pacing: str = Field(description="How the video is paced — cut rhythm, speed, energy.")
    cta: str = Field(description="What the viewer is asked to do, as stated in the video.")
    format: str = Field(description="How the video is shot, e.g. talking head, voiceover, skit.")
    funnelStage: FunnelStage = Field(description="Where this sits in the marketing funnel.")
    formatTag: FormatTag = Field(description="The recognised content pattern this follows.")

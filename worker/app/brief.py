"""What Gemini returns when asked to write a brief.

Shaped to the `briefs` table rather than invented: every field here maps to a
column, so writing the row is a rename and not a translation.

One constraint comes from the app rather than the database. `shot_list` is
jsonb, so Postgres would accept a list of objects — but `shotsOf()` in
data/briefs.ts filters the array to strings and treats anything else as
empty, which means a richer shape would be silently dropped on the way to the
screen rather than rejected. Plain strings it is.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class BriefDraft(BaseModel):
    """A brief written for one clip adapted to one brand.

    Passed to Gemini as `response_schema`, so the descriptions are part of the
    prompt the model sees.
    """

    hook: str = Field(
        description="The opening line, written for this brand's voice. One or two sentences."
    )
    script: str = Field(
        description=(
            "The spoken script, start to finish, in this brand's voice. Plain prose "
            "with no shot directions or timestamps."
        )
    )
    shotList: list[str] = Field(
        description=(
            "What to film, one short phrase per shot, in order. Three to seven. "
            "Each is a shot, not a beat of narrative."
        )
    )
    caption: str = Field(description="The post caption. No hashtags here — they go in hashtags.")
    hashtags: list[str] = Field(
        description="Five to ten hashtags, each starting with #, relevant to this brand."
    )
    cta: str = Field(
        description=(
            "What this brand wants the viewer to do. The brand's own call to action, "
            "not a copy of what the source clip asked for."
        )
    )

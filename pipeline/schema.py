"""The analysis contract (BE-12).

This is the single source of truth for what Gemini returns when it breaks down
a video. Agreed with the AI engineer rather than invented here, and deliberately
kept in /pipeline: the pipeline is what calls the model, so it owns the shape,
and /worker imports this module to validate a response before anything reaches
Supabase.

Mirrored by hand in types/index.ts as AnalysisPayload. Change a field here and
change it there in the same commit.
"""

from enum import Enum

from pydantic import BaseModel, Field


class FunnelStage(str, Enum):
  TOFU = "TOFU"
  MOFU = "MOFU"
  BOFU = "BOFU"


class VideoFormat(str, Enum):
  """How the video is made. Production style, as the UI labels it."""

  TALKING_HEAD = "talking_head"
  VOICEOVER = "voiceover"
  TEXT_OVERLAY = "text_overlay"
  SKIT = "skit"
  OTHER = "other"


class FormatTag(str, Enum):
  """The marketing framework the video follows. Deliberately separate from
  VideoFormat: a talking head can be a testimonial or a founder POV, and the
  UI has a label for each."""

  UGC_TESTIMONIAL = "ugc_testimonial"
  FOUNDER_POV = "founder_pov"
  PROBLEM_AGITATE_SOLVE = "problem_agitate_solve"


class AudioStyle(BaseModel):
  """Structured rather than one string, so a brief can adapt the music and the
  delivery separately. Sound effects are not here — they belong to the moment
  they happen in, so they are described in the relevant shotBeat."""

  backgroundMusic: str | None = Field(
    default=None, description="The vibe of the backing track, e.g. 'warm lo-fi, low energy'."
  )
  voiceover: str | None = Field(
    default=None, description="The tone of the delivery, e.g. 'calm, conversational, unhurried'."
  )


class VideoAnalysis(BaseModel):
  """One Gemini breakdown of one clip. Stored as analyses.payload.

  Nothing here identifies the clip. id, title, thumbnailUrl, tags, status and
  createdAt are columns on public.clips, set by the backend when the row is
  created — asking the model for them invites invented values into fields the
  database already owns.

  Fields are optional where the model may genuinely not be able to tell, and
  come back as null rather than an invented string. A missing field should not
  fail the whole analysis.
  """

  hook: str = Field(description="The opening line or visual that stops the scroll.")
  transcript: str | None = Field(default=None, description="Full spoken transcript, or null if nobody speaks.")
  onScreenText: list[str] = Field(default=[], description="Text burned into the video, in order of appearance.")
  shotBeats: list[str] = Field(
    default=[],
    description=(
      "The structure of the video, one beat per entry, in order, each prefixed "
      "with its timestamp: 'MM:SS - what happens'. Include the camera angle and "
      "any sound effect in the description."
    ),
  )
  pacing: str | None = Field(default=None, description="Cut rhythm, speed and energy.")
  audioStyle: AudioStyle = Field(
    default_factory=AudioStyle, description="The music and the delivery."
  )
  cta: str | None = Field(default=None, description="What the viewer is asked to do, as stated in the video.")
  whyItWorks: list[str] = Field(
    default=[],
    description=(
      "The reasons this video works, one per entry. A list rather than a "
      "paragraph so the app can show them separately and a brief can adapt "
      "them one at a time."
    ),
  )
  format: VideoFormat = Field(description="Production style.")
  funnelStage: FunnelStage = Field(description="Where this sits in the marketing funnel.")
  formatTag: FormatTag | None = Field(default=None, description="The marketing framework it follows.")
  description: str = Field(max_length=100, description="One line summarising the video.")

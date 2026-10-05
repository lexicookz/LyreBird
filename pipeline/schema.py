from enum import Enum
from pydantic import BaseModel, Field


class FunnelStage(str, Enum):
  TOFU = "TOFU"
  MOFU = "MOFU"
  BOFU = "BOFU"


class FormatTag(str, Enum):
  UGC_TESTIMONIAL = "ugc_testimonial"
  FOUNDER_POV = "founder_pov"
  PROBLEM_AGITATE_SOLVE = "problem_agitate_solve"


class VideoAnalysis(BaseModel):
  id: str
  title: str
  thumbnailUrl: str
  tags: list
  status: str
  createdAt: str
  hook: str
  transcript: str
  onScreenText: list[str]
  shotBeats: list[str]
  pacing: str
  cta: str
  format: str
  funnelStage: FunnelStage
  formatTag: FormatTag
  description: str = Field(max_length=100)


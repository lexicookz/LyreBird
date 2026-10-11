"""Analysis caching, borrowed from the pipeline.

Analysing a video costs a real API call and about a minute, and the team
flagged that explicitly. The pipeline already solved this, so rather than
write a second cache the worker uses that one -- the same way it uses
/pipeline for the analysis contract.

The key is the video's content hash combined with the prompt that would run.
Content rather than filename, because the same clip re-imported under a new
name is the same question; plus the prompt, because a new prompt version is a
different question and must not be answered from an old reply.
"""

from __future__ import annotations

import hashlib

# Puts /pipeline on the path. Importing this for the side effect rather than
# repeating the lookup -- see app/analysis.py for why it is done that way.
import app.analysis  # noqa: F401

from cache import (  # noqa: E402  (the path has to be set up first)
    compute_video_hash,
    get_cached_analysis,
    set_cached_analysis,
)


def analysis_cache_key(video_hash: str, prompt_text: str) -> str:
    """Matches the pipeline's own key, so the two share cache entries rather
    than each paying for the first analysis of the same clip."""
    return hashlib.sha256(f"{video_hash}\0{prompt_text}".encode("utf-8")).hexdigest()


__all__ = [
    "analysis_cache_key",
    "compute_video_hash",
    "get_cached_analysis",
    "set_cached_analysis",
]

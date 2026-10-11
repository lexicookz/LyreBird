"""The analysis contract, as used by the worker.

The contract itself lives in /pipeline/schema.py and is agreed with the AI
engineer (BE-12). The pipeline is what calls the model, so it owns the shape;
this module only re-exports it, so the worker validates a response against the
same definition rather than a copy that can drift.

Why a re-export rather than importing the pipeline at each call site: the
worker ships as its own Docker image, and where /pipeline sits relative to the
app differs between the repo and the image. Keeping that in one place means
there is one thing to fix if the layout changes, and the rest of the worker
can keep saying `from app.analysis import AnalysisResult`.
"""

from __future__ import annotations

import sys
from pathlib import Path

# /pipeline sits beside /worker in the repo and beside the app in the image.
# Its modules import each other flatly, so the directory goes on the path
# rather than being imported as a package.
#
# Every ancestor is checked rather than a fixed depth. The layout differs
# between the repo (worker/app, so ../../pipeline) and the image (/srv/app, so
# ../pipeline), and indexing a fixed level raises IndexError in the shallower
# one before any candidate can be tried.
_here = Path(__file__).resolve()
for _ancestor in _here.parents:
    _candidate = _ancestor / "pipeline"
    if (_candidate / "schema.py").is_file():
        if str(_candidate) not in sys.path:
            sys.path.insert(0, str(_candidate))
        break
else:  # pragma: no cover - only reachable if the image was built wrong
    raise ImportError(
        "Could not find pipeline/schema.py in any parent of the worker. It "
        "holds the agreed analysis contract (BE-12); the Docker image must "
        "copy that directory in beside the app."
    )

from schema import (  # noqa: E402  (the path has to be set up first)
    AudioStyle,
    FormatTag,
    FunnelStage,
    VideoAnalysis,
    VideoFormat,
)

# The worker's name for it. Everything downstream imports this, so if the
# contract ever moves again, only this module changes.
AnalysisResult = VideoAnalysis

__all__ = [
    "AnalysisResult",
    "AudioStyle",
    "FormatTag",
    "FunnelStage",
    "VideoAnalysis",
    "VideoFormat",
]

"""Prompt loading and versioning.

Prompts live in `app/prompts/<name>.v<n>.txt`, one file per version, never as
inline strings. Two reasons, and the second is the one that matters:

1. A prompt is the main thing that changes about this system. In a file it
   shows up in a diff as prose, which is reviewable; inline it is a wall of
   escaped string concatenation nobody reads.

2. **Published versions are immutable.** `analyses.prompt_version` records
   which prompt produced a row, and that record is only meaningful if the
   named prompt still says what it said at the time. Editing `analyse.v1.txt`
   after rows reference `analyse-v1` silently rewrites history: every one of
   those rows now claims to come from a prompt that no longer exists. So a
   change means a new file, never an edit to an existing one.

That immutability is what makes the comparison work — two analyses of the
same clip from different prompt versions can be diffed because each version
still means something fixed.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent / "prompts"

_FILENAME = re.compile(r"^(?P<name>[a-z0-9_-]+)\.v(?P<version>\d+)\.txt$")


class PromptError(RuntimeError):
    """A prompt could not be found or its filename does not say what version
    it is. Raised at load time rather than left to fail at the model call."""


def _parse(path: Path) -> tuple[str, int] | None:
    match = _FILENAME.match(path.name)
    if not match:
        return None
    return match.group("name"), int(match.group("version"))


@lru_cache(maxsize=1)
def _index() -> dict[str, dict[int, Path]]:
    found: dict[str, dict[int, Path]] = {}
    for path in sorted(PROMPTS_DIR.glob("*.txt")):
        parsed = _parse(path)
        if parsed is None:
            raise PromptError(
                f"{path.name} is in the prompts directory but is not named "
                "<name>.v<n>.txt, so there is no way to tell which version it is."
            )
        name, version = parsed
        found.setdefault(name, {})[version] = path
    return found


def versions(name: str) -> list[str]:
    """Every version of a prompt, oldest first, as they appear in
    analyses.prompt_version."""
    index = _index()
    if name not in index:
        raise PromptError(f"No prompt named {name!r} in {PROMPTS_DIR}")
    return [f"{name}-v{n}" for n in sorted(index[name])]


def latest_version(name: str) -> str:
    """The version a new analysis should use."""
    index = _index()
    if name not in index:
        raise PromptError(f"No prompt named {name!r} in {PROMPTS_DIR}")
    return f"{name}-v{max(index[name])}"


def load(version: str) -> tuple[str, str]:
    """Return (prompt text, version) for a version string like 'analyse-v2'.

    Takes the full version string rather than a name and a number so the
    caller passes around exactly what gets written to the database — there is
    no second format to keep in step.
    """
    name, _, suffix = version.rpartition("-v")
    if not name or not suffix.isdigit():
        raise PromptError(
            f"{version!r} is not a prompt version. Expected something like 'analyse-v2'."
        )

    index = _index()
    if name not in index:
        raise PromptError(f"No prompt named {name!r} in {PROMPTS_DIR}")

    number = int(suffix)
    if number not in index[name]:
        available = ", ".join(versions(name))
        raise PromptError(f"No {version!r}. Available: {available}")

    text = index[name][number].read_text(encoding="utf-8").strip()
    if not text:
        raise PromptError(f"{index[name][number].name} is empty.")
    return text, version


def load_latest(name: str) -> tuple[str, str]:
    return load(latest_version(name))

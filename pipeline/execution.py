"""Analyse a video from the command line, or from api.py.

The Gemini call itself lives in gemini_call.py, shared with the worker so
there is one implementation rather than two that drift apart. What stays here
is the pipeline's own policy: several API keys rotated between attempts, and
enough backed-off retries to ride out a rate limit, which is the right trade
for a batch run and the wrong one for a request with a phone waiting on it.
"""

import os
from itertools import cycle

from dotenv import load_dotenv
from google import genai

import gemini_call
from schema import VideoAnalysis

load_dotenv()

# Batch runs are long and hit rate limits; the worker serves one request with
# someone waiting on it and must not. Hence 20 here and 2 there.
MAX_ATTEMPTS = 20
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

PROMPT = (
    "Analyze this short-form video and extract the required fields precisely.\n"
    "Ensure the output strictly adheres to the requested JSON schema."
)

_key_cycle = None


def _api_keys():
    """Read the keys at call time, not at import.

    This module used to raise at import if no GEMINI_API_KEY_* was set, which
    meant anything importing it -- including the worker, which only wants the
    shared call -- died on startup.
    """
    keys = [
        value.strip()
        for name, value in sorted(os.environ.items())
        if name.startswith("GEMINI_API_KEY_") and value.strip()
    ]
    if not keys:
        # Fall back to the single-key name the worker and .env.example use, so
        # one key does not have to be renamed to run the pipeline.
        single = os.getenv("GEMINI_API_KEY", "").strip()
        if single:
            keys = [single]
    if not keys:
        raise ValueError(
            "No GEMINI_API_KEY_* or GEMINI_API_KEY found. Set at least one to run the pipeline."
        )
    return keys


def get_client():
    """Next key in the rotation."""
    global _key_cycle
    if _key_cycle is None:
        _key_cycle = cycle(_api_keys())
    # Deliberately not logged. Printing even a prefix of a key puts key
    # material into whatever captures stdout.
    return genai.Client(api_key=next(_key_cycle))


def analyze_video(video_path):
    """Upload a video and return its VideoAnalysis.

    One client does both the upload and the generate call. Files API uploads
    belong to the project behind the key that made them, so rotating keys
    between the two meant the analysis could reference a file that key cannot
    see -- a failure that reads like a missing file and comes and goes with
    the rotation.

    Rotation still happens between retries, which is where it helps: a retry
    re-sends the same file handle, and a fresh key is free to try.
    """
    client = get_client()

    video_file = gemini_call.upload_and_wait(
        client,
        video_path,
        on_progress=lambda state: print(f"Upload {state.lower()}..."),
    )
    print("Video active. Analyzing...")

    return gemini_call.generate(
        client,
        [video_file, PROMPT],
        VideoAnalysis,
        model=MODEL,
        temperature=0.1,
        max_attempts=MAX_ATTEMPTS,
        backoff_seconds=gemini_call.exponential_backoff(cap_seconds=30),
        next_client=get_client,
        on_retry=lambda attempt, exc: print(
            f"Rate limited (attempt {attempt}/{MAX_ATTEMPTS}), rotating key and retrying..."
        ),
    )


def main():
    result = analyze_video("eval_vids/best_tip_test1.mov")
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    main()

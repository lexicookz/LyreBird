import os
import time
from itertools import cycle

from typing import Optional
from cache import compute_video_hash, get_cached_analysis, set_cached_analysis 
from dotenv import load_dotenv
from google import genai
from google.genai import types
import json
from schema import VideoAnalysis

load_dotenv()


API_KEYS = [
    value.strip()
    for name, value in sorted(os.environ.items())
    if name.startswith("GEMINI_API_KEY_")
    and value.strip()
]


_key_cycle = None

def get_client():
    global _key_cycle
    if _key_cycle is None:
        _key_cycle = cycle(API_KEYS)
    api_key = next(_key_cycle)
    if not API_KEYS:
      raise ValueError("No GEMINI_API_KEY_* variables found.")
    
    print(f"Using key #{API_KEYS.index(api_key) + 1}")
    return genai.Client(api_key=api_key)

def roulette(client, contents, config, model="gemini-3.8-flash", max_attempts=1):
    last_error = None

    for attempt in range(max_attempts):
        try:
            if max_attempts > 1:
                print(f"Attempts {attempt + 1}/{max_attempts}")
            response = client.models.generate_content(model=model, contents=contents,config=config,)
            return response

        except Exception as e:
            error_text = str(e)

            if (
                "429" in error_text
                or "503" in error_text
                or "RESOURCE_EXHAUSTED" in error_text.upper()):
                wait_time = min(2 ** attempt, 30)

                print(
                    f"Rate-limited. "
                    f"Retrying in {wait_time}s...")
                time.sleep(wait_time)
                last_error = e
                continue
            raise
    raise last_error

#//////////////////////////////////////////////////////////////
def analyze_video(
    video_path: str,
    max_attempts: int = 1,
    client: Optional[genai.Client] = None,
    prompt: Optional[str] = None,
) -> str:
    #check cache
    video_hash = compute_video_hash(video_path)
    cached_data = get_cached_analysis(video_hash)
    if cached_data:
        print(f"Cache hit for [{video_hash[:8]}...]. Returning stored result.")
        return json.dumps(cached_data) if isinstance(cached_data, dict) else cached_data

    print(f"Cache miss for [{video_hash[:8]}...]. Running Gemini analysis...")

    if client is None:
        client = get_client()

    #upload video
    video_file = client.files.upload(file=video_path)

    #wait
    while video_file.state.name in ["PENDING", "PROCESSING"]:
        print("Processing video...")
        time.sleep(2)
        video_file = client.files.get(name=video_file.name)

    if video_file.state.name == "FAILED":
        raise ValueError("Video processing failed.")

    print("Video active. Analyzing...")

    contents = [
        video_file,
        """
        Analyze this short-form video and extract
        the required fields precisely.

        Ensure the output strictly adheres to
        the requested JSON schema.

        If an optional field cannot be determined from the video, return null.
        """,
    ]

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=VideoAnalysis,
        temperature=0.1,
    )
    #generate
    response = roulette(client=client, contents=contents, config=config, max_attempts=max_attempts)

    try:
        data_to_store = json.loads(response.text)
        set_cached_analysis(video_hash, data_to_store)
    except Exception as e:
        print(f"Warning: Failed to cache analysis: {e}")

    return response.text

#//////////////////////////////////////////////////////////////

def main():
    result = analyze_video("eval_vids/best_tip_test1.mov")
    print(result)


if __name__ == "__main__":
    main()
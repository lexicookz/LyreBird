import os
import time
from itertools import cycle

from dotenv import load_dotenv
from google import genai
from google.genai import types

from schema import VideoAnalysis

load_dotenv()


API_KEYS = [
    value.strip()
    for name, value in sorted(os.environ.items())
    if name.startswith("GEMINI_API_KEY_")
    and value.strip()
]

if not API_KEYS:
    raise ValueError("No GEMINI_API_KEY_* variables found.")

key_cycle = cycle(API_KEYS)

def get_client():
    api_key = next(key_cycle)
    print(f"Using key: {api_key[:8]}...")
    return genai.Client(api_key=api_key)

def roulette(contents,config,model="gemini-3.8-flash",max_attempts=20,):
    last_error = None
    for attempt in range(max_attempts):
        try:
            client = get_client()
            print(
                f"Attempt {attempt+1}/{max_attempts}"
            )
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


def analyze_video(video_path):
    client = get_client()

    video_file = client.files.upload(file=video_path)

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
        """,
    ]

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=VideoAnalysis,
        temperature=0.1,
    )

    return roulette(contents=contents, config=config)


def main():
    result = analyze_video("eval_vids/best_tip_test1.mov")
    print(result.text)


if __name__ == "__main__":
    main()
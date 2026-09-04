import time
from google import genai
from google.genai import types
from schema import VideoAnalysis

client = genai.Client()

# 1. Upload video via Files API
video_file = client.files.upload(file="eval_videos/video_001.mp4")

# Wait until processing completes
while video_file.state.name == "PROCESSING":
  time.sleep(2)
  video_file = client.files.get(name=video_file.name)

# 2. Query with structured response schema
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[
        video_file,
        (
            "Analyze this short-form video. Extract transcript, shot pacing, and"
            " classify taxonomy precisely."
        ),
    ],
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=VideoAnalysis,
        temperature=0.1,  # Low temperature for label consistency
    ),
)

print(response.text)

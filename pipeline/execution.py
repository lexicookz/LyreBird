import time
import os
from dotenv import load_dotenv
from google import genai
from google.genai import types
from schema import VideoAnalysis

load_dotenv()  
client = genai.Client()

# upload video via Files API
video_file = client.files.upload(file="eval_vids/best_tip_test1.mov")

#wait for processing completes
while video_file.state.name in ["PENDING", "PROCESSING"]:
  time.sleep(2)
  video_file = client.files.get(name=video_file.name)

if video_file.state.name == "FAILED":
    raise ValueError("Video processing failed on Google's servers.")

print("Video active. Analyzing...")

# query with structured response schema
response = client.models.generate_content(
    model="gemini-3.6-flash",
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
        temperature=0.1,  
    ),
)

print(response.text)

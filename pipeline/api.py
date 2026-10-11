import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from execution import MODEL, analyze_video
from schema import VideoAnalysis

# Reported back to the app so it stores the model that produced an analysis
# instead of a hardcoded guess.
MODEL_VERSION = MODEL

import traceback

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/analyze-video")
async def analyze_video_endpoint(file: UploadFile = File(...), prompt_version: str = "v2"):
    temp_path = f"temp_{file.filename}"
    try:
        # temporary save the uploaded file
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # run analysis
        result_json = analyze_video(temp_path, prompt_version=prompt_version)

        # analyze_video returns the model's JSON as a *string*. Returning it
        # straight gave the app {"data": "{\"hook\": ...}"} -- a string where
        # it expects an object, so every field read came back undefined and
        # nothing rendered. Parse and validate here instead, which also means
        # a reply that does not match the agreed contract fails at the API
        # rather than silently reaching the UI.
        analysis = VideoAnalysis.model_validate_json(result_json)

        return {
            "status": "success",
            "data": analysis.model_dump(mode="json"),
            # Returned so the app records what actually ran, rather than
            # hardcoding values that drift from the server's defaults.
            "model_version": MODEL_VERSION,
            "prompt_version": prompt_version,
        }

    except Exception as e:
        traceback.print_exc()
        print("ERROR TYPE:", type(e))
        print("ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
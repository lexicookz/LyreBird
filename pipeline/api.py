import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from execution import analyze_video
from schema import VideoAnalysis

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/analyze-video")
async def analyze_video_endpoint(file: UploadFile = File(...)):
    temp_path = f"temp_{file.filename}"
    try:
        # temporary save the uploaded file
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # run analysis 
        result_json = analyze_video(temp_path)
        return {"status": "success", "data": result_json}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
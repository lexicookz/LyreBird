import hashlib
import json
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

CACHE_FILE = os.path.join(os.path.dirname(__file__), "video_cache.json")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Connected to Supabase cache.")
    except Exception as e:
        print(f"Failed to connect to Supabase: {e}. Using local JSON.")

def compute_video_hash(file_path: str, chunk_size: int = 8192) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(chunk_size):
            hasher.update(chunk)
    return hasher.hexdigest()

def _load_local_cache() -> dict:
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def _save_local_cache(cache: dict):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)

def get_cached_analysis(video_hash: str) -> Optional[dict]:
    if supabase_client:
        try:
            res = (
                supabase_client.table("video_analyses")
                .select("analysis_data")
                .eq("video_hash", video_hash)
                .execute()
            )
            if res.data:
                return res.data[0]["analysis_data"]
        except Exception as e:
            print(f"Supabase read error: {e}")

    return _load_local_cache().get(video_hash)

def set_cached_analysis(video_hash: str, analysis_data: dict):
    if supabase_client:
        try:
            supabase_client.table("video_analyses").upsert({
                "video_hash": video_hash,
                "analysis_data": analysis_data
            }).execute()
        except Exception as e:
            print(f"Supabase write error: {e}")

    # Save to local JSON 
    cache = _load_local_cache()
    cache[video_hash] = analysis_data
    _save_local_cache(cache)
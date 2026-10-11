import os
from dotenv import load_dotenv
from google import genai

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY_1")
client = genai.Client(api_key=api_key)

for model in client.models.list():
    if "flash" in model.name:
        print(model.name)
        
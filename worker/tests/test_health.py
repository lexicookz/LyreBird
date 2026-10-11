import os

# app.config validates these values while importing app.main. These are inert
# test values; no real Supabase or Gemini request is made.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import health

app = FastAPI()
app.include_router(health.router)

client = TestClient(app)


def test_health_returns_200_when_database_is_reachable(monkeypatch):
    async def database_ok():
        return True, None

    monkeypatch.setattr(health, "_check_database", database_ok)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "ok",
    }


def test_health_returns_503_when_database_is_unreachable(monkeypatch):
    async def database_unreachable():
        return False, "ConnectError: database unavailable"

    monkeypatch.setattr(health, "_check_database", database_unreachable)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "database": "unreachable",
        "detail": "ConnectError: database unavailable",
    }
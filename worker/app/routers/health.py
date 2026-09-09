"""Liveness + dependency check."""

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import settings

router = APIRouter(tags=["health"])

# PostgREST only serves its root document once it has introspected the database,
# so a 2xx here means Postgres is actually reachable. We use it instead of
# selecting from a table so this check stays valid as the schema changes.
_PROBE_TIMEOUT_SECONDS = 5.0


async def _check_database() -> tuple[bool, str | None]:
    url = f"{settings.supabase_url.rstrip('/')}/rest/v1/"
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }
    try:
        async with httpx.AsyncClient(timeout=_PROBE_TIMEOUT_SECONDS) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        return False, f"{type(exc).__name__}: {exc}"

    if response.status_code >= 400:
        return False, f"PostgREST returned {response.status_code}"
    return True, None


@router.get("/health")
async def health() -> JSONResponse:
    database_ok, detail = await _check_database()
    body = {
        "status": "ok" if database_ok else "degraded",
        "database": "ok" if database_ok else "unreachable",
    }
    if detail:
        body["detail"] = detail
    return JSONResponse(status_code=200 if database_ok else 503, content=body)

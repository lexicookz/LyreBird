# LYREBIRD worker

FastAPI service for the work the mobile app can't do itself: ffmpeg, and any
call that needs the Gemini API key. Everything else goes straight from the Expo
app to Supabase under RLS.

## Configuration

Copy `.env.example` to `.env` and fill in all three values:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

The service refuses to start if any are missing. `.env` is gitignored — keep it
that way, both keys here are privileged.

## Run with Docker

```bash
docker build -t lyrebird-worker .
```

```bash
docker run --rm -p 8000:8000 --env-file .env lyrebird-worker
```

## Run with uvicorn

Requires Python 3.11.

```bash
python -m venv .venv && source .venv/bin/activate
```

```bash
pip install -r requirements.txt
```

```bash
uvicorn app.main:app --reload --port 8000
```

`ffmpeg` must be on your PATH for local runs; the Docker image installs it for
you.

## Endpoints

| Method | Path      | Notes                                              |
| ------ | --------- | -------------------------------------------------- |
| GET    | `/health` | 200 when Postgres is reachable, 503 when it isn't. |

`/clips` is mounted but has no routes yet.

## Brief schema

`app/brief_schema.py` defines what Adapt takes in (`BrandProfile`) and what
Gemini must return (`BriefDraft`). After changing it, re-export the JSON
Schema files the app and mock data are checked against:

```bash
python -m app.brief_schema
```

Then update `types/brief.ts` to match. `npm test` fails until you do.

```bash
curl -i localhost:8000/health
```

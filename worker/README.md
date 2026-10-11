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

## Deploying (Render)

`render.yaml` at the repo root is a Blueprint. In the Render dashboard:
**New → Blueprint → pick this repo**. Render reads the file, builds from
`worker/Dockerfile`, and redeploys on every push to `main`.

It will prompt for the three secrets, which are marked `sync: false` so they
stay out of the repo. Set them to the same values as your local `.env`:

| Variable | Where it comes from |
| -------- | ------------------- |
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **bypasses RLS**, treat as a password |
| `GEMINI_API_KEY` | Google AI Studio |

`PORT` is set by Render; do not add it yourself. The Dockerfile reads it and
falls back to 8000 locally.

### Things that will bite

**The health check gates the deploy.** `healthCheckPath` is `/health`, which
returns 503 when Postgres is unreachable. A wrong `SUPABASE_URL` or key fails
the deploy rather than going live broken — that is deliberate, but it means a
failed first deploy usually means bad credentials, not a bad build.

**Free instances sleep after 15 minutes idle.** The first request afterwards
waits roughly a minute for a cold start. Fine for `/health`; surprising if you
are timing an upload.

**Free is 512MB RAM and 0.1 CPU, and `/clips/{id}/prepare` will struggle.** It
downloads the whole video into memory before transcoding, so a 200MB clip is
likely to be killed for exceeding memory. The endpoint is verified end to end
locally; on a free instance expect `/health` to work and large transcodes not
to. Moving to Starter, or streaming the download to disk instead of holding it
in memory, is what fixes that.

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

| Method | Path                    | Notes                                               |
| ------ | ----------------------- | --------------------------------------------------- |
| GET    | `/health`               | 200 when Postgres is reachable, 503 when it isn't.  |
| POST   | `/clips/{id}/prepare`   | Downscale to 480p, thumbnail at 1s, drop the original. |

### `POST /clips/{id}/prepare`

Downloads the clip's current file, re-encodes it to 480p H.264/AAC, extracts a
JPEG thumbnail one second in, uploads both, points the row at them, and deletes
the original.

Paths follow the `<owner_id>/<filename>` convention. The worker uses the service
role key and so bypasses RLS: nothing stops it writing elsewhere, but a file
outside that prefix is unreadable by the user who owns it, because the storage
policies compare `(storage.foldername(name))[1]` to `auth.uid()`. The endpoint
refuses to touch a row whose `storage_path` breaks the convention.

The original is deleted **last**, after the row already points at the prepared
file. Any earlier failure leaves the clip exactly as it was rather than
stranding a row that references a file which no longer exists. If the delete
itself fails the response says so (`original_deleted: false`) instead of
reporting a clean run.

Re-running on an already-prepared clip is a no-op (`already_prepared: true`):
without that it would downscale an already-downscaled file and then delete the
only good copy.

Responses carry `original_bytes`, `clip_bytes` and `thumbnail_bytes` so a caller
can confirm the transcode actually shrank the file without going to storage.

```bash
curl -X POST localhost:8000/clips/<clip-uuid>/prepare
```

Status codes: `404` no such clip or the file is missing from storage, `409` the
row's path breaks the convention, `422` ffmpeg failed (the clip is marked
`failed`), `200` prepared.

## Brief schema

`app/brief_schema.py` defines what Adapt takes in (`BrandProfile`) and what
Gemini must return (`BriefDraft`). After changing it, re-export the JSON
Schema files the app and mock data are checked against:

```bash
python -m app.brief_schema
```

Then update `types/brief.ts` to match. `npm test` fails until you do.

`to_brief_columns()` turns a draft into the `briefs` columns for an insert.
Its tests run with:

```bash
pip install -r requirements-dev.txt
```

```bash
python -m pytest tests
```

```bash
curl -i localhost:8000/health
```

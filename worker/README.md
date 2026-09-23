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

```bash
curl -i localhost:8000/health
```

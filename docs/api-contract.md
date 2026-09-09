# API contract — worker

Endpoints exposed by the FastAPI worker in `/worker`. The mobile app talks to
Supabase directly for everything else; only work that needs ffmpeg or the Gemini
key belongs in this table.

| Endpoint  | Method | Request | Response                                                          | Status                                            |
| --------- | ------ | ------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| `/health` | GET    | —       | `{ "status": "ok", "database": "ok" }`                            | `200` healthy · `503` database unreachable (adds `detail`) |

`/clips` is mounted but has no routes yet — rows get added here as they land.

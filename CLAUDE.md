# LYREBIRD

Mobile app that breaks down short-form videos with AI and generates content
briefs. University group project (Group 05).

## Architecture

Two layers, and the split between them is deliberate:

1. **Supabase** (Postgres + auth + storage) is the data layer. The mobile app
   talks to it **directly**, authenticated as the end user, with Row Level
   Security doing the authorisation. There is no general-purpose backend API in
   front of it — don't build one.
2. **The FastAPI worker** (`/worker`) exists only for work the app genuinely
   cannot do itself:
   - anything needing `ffmpeg` (splitting recordings into clips, thumbnails)
   - anything needing the Gemini API key

If a feature can be expressed as a Supabase query under RLS, it belongs in the
app, not the worker. Adding a worker endpoint that just proxies a table read is
the main thing to avoid here.

## Layout

| Path                    | What it is                                                    |
| ----------------------- | ------------------------------------------------------------- |
| repo root               | The Expo app (React Native + TypeScript): `App.tsx`, `screens/`, `types/`, `data/`, `assets/` |
| `/worker`               | Python 3.11 FastAPI service — ffmpeg + Gemini                  |
| `/supabase`             | `config.toml`, `migrations/`, `seed.sql`                       |
| `/docs`                 | `api-contract.md` — worker endpoints                           |
| `/pipeline`             | Standalone Gemini pipeline scaffold (see note below)           |

Note: the Expo app lives at the **repo root**, not in an `/app` subdirectory.
Treat those root-level TypeScript files as owned by the app author and leave
them alone unless the task is explicitly about the app.

`/pipeline` (`schema.py`, `execution.py`) is an earlier standalone Gemini
scaffold that predates the worker. It overlaps with what `/worker` will do and
hasn't been reconciled yet — check with the team before building on it.

## Secrets

**The Gemini API key and the Supabase service role key never appear outside
`/worker`.** Not in the Expo app, not in `app.json`, not in `/supabase`, not in
docs or examples. The app uses only the Supabase URL and the **anon** key, which
are safe to ship because RLS constrains them.

Concretely:
- `/worker/.env` holds all three secrets and is gitignored. Only
  `/worker/.env.example`, with empty values, is committed.
- The worker's Supabase client uses the service role key, which **bypasses RLS
  entirely**. Any query written in the worker is responsible for its own
  `owner_id` filtering — the database will not do it for you there.

## Database conventions

**Every table carries `owner_id`** (a FK to `public.profiles`), even when the
owner could be derived by joining through a parent. This is what keeps every RLS
policy a single comparison:

```sql
using (auth.uid() = owner_id)
```

`public.profiles` is the one exception — its `id` *is* the user id, so its
policy compares against `id`.

When you add a table: give it `owner_id`, enable RLS, write the one-line policy,
and set `owner_id` on every insert from the worker.

Migrations live in `/supabase/migrations` and are append-only — add a new
timestamped file rather than editing one that has been applied.

## Storage

Buckets: `recordings`, `clips`, `thumbnails` — all private.

**Path convention: `<user_id>/<filename>`.** The storage RLS policies enforce it
by comparing `(storage.foldername(name))[1]` against `auth.uid()`, so a file
written to any other shape of path is unreadable by its own owner. The worker
must follow the same convention when it writes.

## Pydantic models

`/worker/app/models.py` mirrors the tables in the init migration by hand. If you
change a column, change both in the same commit.

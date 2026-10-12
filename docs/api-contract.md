# API contract — worker

Endpoints exposed by the FastAPI worker in `/worker`. The mobile app talks to
Supabase directly for everything else; only work that needs ffmpeg or the Gemini
key belongs in this table.

## Before the table

**Where it is.** `https://lyrebird-worker.onrender.com`, redeployed from `main`
automatically. The app reads it from `EXPO_PUBLIC_WORKER_URL`, which is in
`.env.example` already — those are inlined at build time, so a change needs
`npx expo start -c` and not a reload. Point it at `http://localhost:8000` only
if you are working on the worker itself; on a phone that has to be the
machine's LAN address, because `localhost` is the phone.

**The free instance sleeps after 15 minutes idle.** The first request after a
quiet spell takes about 50 seconds before the handler even starts. That is a
cold start, not a hang, and it stacks on top of the timings below.

**No authentication.** The worker takes no token, header or key. It is
reachable by anyone who knows the URL, which is a thing to fix before this is
public and is deliberately not a thing you have to work around today. Do not
send the Supabase anon key to it; it does not read one.

**CORS is `allow_origins=["*"]`** (`app/main.py`), so a browser client is not
blocked. Narrowed before anything ships.

**Everything is `POST` with no body unless the table says otherwise.** Ids go
in the path, options in the query string.

## Caching

`/clips/{clip_id}/analyse` reuses an earlier analysis when the file it
downloads hashes to something already analysed **for the same owner, by the
same model, with the same prompt version**. A hit writes its own `analyses`
row exactly as a fresh run does, so nothing downstream changes — the only
difference visible to a caller is `cached: true` and a response in seconds
rather than minutes.

This exists because the Gemini key is on the free tier: twenty
`generate_content` calls a day, per model, shared by everyone. Re-analysing
the same test video is free; changing the prompt version is not, by design.

| Endpoint                        | Method | Request                                                                 | Response                                                                                                                                                | Status                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`                       | GET    | —                                                                       | `{ "status": "ok", "database": "ok" }`                                                                                                                  | `200` healthy · `503` database unreachable (adds `detail`)                                                                                                                                                                                                                                                                   |
| `/clips/{clip_id}/prepare`      | POST   | no body; `clip_id` path param (UUID)                                    | `PrepareResult`: `clip_id`, `storage_path`, `thumbnail_path`, `original_bytes`, `clip_bytes`, `thumbnail_bytes`, `duration_seconds`, `original_deleted`, `already_prepared` | `200` prepared, or already prepared (`already_prepared: true`, byte counts `0`) · `404` no clip row, or the original could not be downloaded from `clips` · `409` `storage_path` is not under `<owner_id>/`, or the prepared name would overwrite the original · `422` ffmpeg failed (`MediaError`) · `500` files uploaded but the `clips` row update returned no rows |
| `/clips/{clip_id}/analyse`      | POST   | no body; `clip_id` path param (UUID); optional `?prompt_version=analyse-v2` | `AnalyseResult`: `analysis_id`, `clip_id`, `model_version`, `prompt_version`, `payload` (an `AnalysisResult`, see `app/analysis.py`), `cached`                     | `200` analysed · `400` unknown `prompt_version` · `404` no clip row, or the clip could not be downloaded from `clips` · `409` `storage_path` is not under `<owner_id>/` · `422` `GeminiError` · `429` `GeminiQuotaExceeded` (usually adds `Retry-After`) · `504` `GeminiTimeout` · `500` analysis succeeded but the `analyses` insert returned no rows                                      |
| `/clips/prompt-versions`        | GET    | —                                                                       | `["analyse-v1", "analyse-v2"]` — oldest first                                                                                                            | `200`                                                                                                                                                                                                                                                                                                                        |
| `/briefs`                       | POST   | `BriefRequest`: `{ "clip_id": UUID, "brand_id": UUID }`; optional `?prompt_version=brief-v1` | `BriefResponse`: `brief_id`, `clip_id`, `brand_id`, `analysis_id`, `model_version`, `prompt_version`, `hook`, `script`, `shot_list`, `caption`, `hashtags`, `cta`, `payload` | `200` written · `400` unknown `prompt_version` · `403` clip and brand have different `owner_id` · `404` no clip, or no brand · `409` the clip has no analysis yet, or the `brands` row will not map to a `BrandProfile` · `422` `GeminiError` · `429` `GeminiQuotaExceeded` (usually adds `Retry-After`) · `504` `GeminiTimeout` · `500` brief generated but the `briefs` insert returned no rows |
| `/briefs/{brief_id}/regenerate` | POST   | no body; `brief_id` path param (UUID); optional `?prompt_version=brief-v1` | `BriefResponse` — same shape; always a new row                                                                                                           | as `POST /briefs`, plus `404` no brief with that id                                                                                                                                                                                                                                                                          |
| `/briefs/prompt-versions`       | GET    | —                                                                       | `["brief-v1"]` — oldest first                                                                                                                            | `200`                                                                                                                                                                                                                                                                                                                        |
| `/recordings/{recording_id}/split` | POST | no body; `recording_id` path param (UUID) | `SplitResult`: `recording_id`, `clips` (each `clip_id`, `storage_path`, `position_in_parent`, `start_seconds`, `end_seconds`, `duration_seconds`, `bytes`), `boundaries` (detected transition times, seconds), `duration_seconds`, `original_deleted`, `already_split` | `200` split, or already split (`already_split: true`, spans and byte counts `0`) · `404` no recording row, or the file could not be downloaded from `recordings` · `409` the recording has no `storage_path`, or it is not under `<owner_id>/` · `422` the duration could not be read, boundary detection failed, ffmpeg failed (`MediaError`), or more than 60 segments were detected · `500` segments uploaded but fewer `clips` rows were written than expected |

Errors are FastAPI's default shape, `{ "detail": "..." }`. A path or query
param that is not a well-formed UUID is rejected by FastAPI itself as a `422`
before any handler runs, which is why `422` can also mean "bad request" on
endpoints that otherwise use it for a model failure.


## Splitting a recording

`POST /recordings/{recording_id}/split` cuts a screen recording into one clip
per video in the feed, using the detector in `app/scroll.py` (frame difference
to propose a boundary, vertical travel to confirm it -- see
`spikes/scroll-detection/README.md`).

Two things a caller should know:

- **It is slow and synchronous.** Every segment is re-encoded, because cutting
  with `-c copy` would land on the nearest keyframe and start each clip with
  the tail of the previous video. Budget roughly the length of the recording
  again, more on Render's shared CPU.
- **It is idempotent.** A recording already marked `split` returns its existing
  clips with `already_split: true` rather than cutting again. A slow endpoint
  gets retried, and splitting twice would duplicate every clip.

Ordering is deliberate: segments are uploaded, then the `clips` rows are
written, then the recording is marked `split`, and only then is the original
deleted. Any failure before that last step leaves the recording exactly as it
was.

**The boundaries are not validated against real footage yet.** BE-21 measured
the detector on a corpus built with ffmpeg rather than a phone, so treat the
clip edges as good enough to show someone, not as correct.

## The three Gemini failure modes

`/clips/{clip_id}/analyse` and both brief endpoints share one model client
(`app/gemini.py`), so they fail the same way:

- **`429`** — `GeminiQuotaExceeded`: the key's quota is gone and waiting will
  not help inside this request. Carries a **`Retry-After`** header, in whole
  seconds, whenever the API said how long to wait — which it usually does, in
  a `RetryInfo` field or in a sentence, and `app/gemini.py` reads either. When
  it said nothing the header is omitted and the status is still `429`, so a
  client must treat it as optional. The detail string is written for a person:
  it goes onto `clips.error_message` verbatim and from there to the screen.
- **`504`** — `GeminiTimeout`: Gemini was unreachable or kept failing until the
  retry budget ran out, or an upload was still `PROCESSING` after the
  10-minute poll budget. The detail says how many attempts were made and over
  how long. Worth repeating later.
- **`422`** — `GeminiError`: the upload was rejected, Gemini could not process
  the video, or the model returned something that did not validate against the
  response schema. Nothing is persisted, and repeating the request unchanged
  will fail the same way.

`GeminiQuotaExceeded` and `GeminiTimeout` both subclass `GeminiError`, so the
routers catch them in that order — quota, then timeout, then the base class.
Reversing it reports a spent quota as a malformed response, and that is the one
reading which tells the app to give up rather than come back.

Which of the `429` and the `504` you get depends on what the API asked for,
not on the status it sent. `429` and `RESOURCE_EXHAUSTED` are in
`_TRANSIENT_MARKERS` deliberately, because a per-minute rate limit clears in
seconds and is worth waiting out inside the request — the common case on a key
the whole group shares. So a model call is retried up to `GEMINI_MAX_ATTEMPTS`
times (default 4) with a doubling, jittered delay, under a 60-second budget
that covers the attempts themselves:

- if the delay the API asks for fits in that budget, the call waits and retries,
  and a failure that outlasts every attempt is a `504`;
- if the asked-for delay is longer than the budget — a spent daily quota says
  tens of thousands of seconds — the call gives up immediately with a `429`
  rather than spending the budget on something it already knows will fail.

So the same free-tier 429 can surface either way, and the distinction is the
useful one: `504` means come back in a moment, `429` means come back when
`Retry-After` says.

On `/clips/{clip_id}/analyse` the `429` can come from either call against the
key: the video upload or the model request. The upload has no retry loop, so
there is no budget to weigh an asked-for delay against — any quota rejection
there is reported straight away, with `Retry-After` when the API named a delay
and without it when it did not. An overloaded model is still a `504` on that
path, delay or no delay: the test is whether the key is out of allowance, not
whether the API asked us to wait.

## Rows the analyse and prepare paths write on failure

Both `/clips/{clip_id}/prepare` (on `MediaError`) and
`/clips/{clip_id}/analyse` (on any of the three Gemini failures, the `429`
included) set the clip's `status` to `failed` and write the reason to
`error_message`, truncated to 1000 characters, before returning the error.
A clip left at `processing` forever is indistinguishable from one still in
the queue, so the app reads that column rather than inferring from a timeout.

The `429` message is written there verbatim, where the other two get an
`Analysis ...` prefix, because `GeminiQuotaExceeded` already carries prose
meant for the screen — including that the key is shared and that retrying will
not help.

`/clips/{clip_id}/analyse` is deliberately **not** idempotent: `analyses` is
append-only and every run records its own `model_version` and `prompt_version`,
which is what makes two runs of the same clip comparable. `/briefs` and
`/briefs/{brief_id}/regenerate` insert for the same reason — no worker path
updates an existing brief, so a hand-edited one always survives a regenerate.

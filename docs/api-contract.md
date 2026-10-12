# API contract — worker

Endpoints exposed by the FastAPI worker in `/worker`. The mobile app talks to
Supabase directly for everything else; only work that needs ffmpeg or the Gemini
key belongs in this table.

| Endpoint                        | Method | Request                                                                 | Response                                                                                                                                                | Status                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`                       | GET    | —                                                                       | `{ "status": "ok", "database": "ok" }`                                                                                                                  | `200` healthy · `503` database unreachable (adds `detail`)                                                                                                                                                                                                                                                                   |
| `/clips/{clip_id}/prepare`      | POST   | no body; `clip_id` path param (UUID)                                    | `PrepareResult`: `clip_id`, `storage_path`, `thumbnail_path`, `original_bytes`, `clip_bytes`, `thumbnail_bytes`, `duration_seconds`, `original_deleted`, `already_prepared` | `200` prepared, or already prepared (`already_prepared: true`, byte counts `0`) · `404` no clip row, or the original could not be downloaded from `clips` · `409` `storage_path` is not under `<owner_id>/`, or the prepared name would overwrite the original · `422` ffmpeg failed (`MediaError`) · `500` files uploaded but the `clips` row update returned no rows |
| `/clips/{clip_id}/analyse`      | POST   | no body; `clip_id` path param (UUID); optional `?prompt_version=analyse-v2` | `AnalyseResult`: `analysis_id`, `clip_id`, `model_version`, `prompt_version`, `payload` (an `AnalysisResult`, see `app/analysis.py`)                     | `200` analysed · `400` unknown `prompt_version` · `404` no clip row, or the clip could not be downloaded from `clips` · `409` `storage_path` is not under `<owner_id>/` · `422` `GeminiError` · `429` `GeminiQuotaExceeded` (usually adds `Retry-After`) · `504` `GeminiTimeout` · `500` analysis succeeded but the `analyses` insert returned no rows                                      |
| `/clips/prompt-versions`        | GET    | —                                                                       | `["analyse-v1", "analyse-v2"]` — oldest first                                                                                                            | `200`                                                                                                                                                                                                                                                                                                                        |
| `/briefs`                       | POST   | `BriefRequest`: `{ "clip_id": UUID, "brand_id": UUID }`; optional `?prompt_version=brief-v1` | `BriefResponse`: `brief_id`, `clip_id`, `brand_id`, `analysis_id`, `model_version`, `prompt_version`, `hook`, `script`, `shot_list`, `caption`, `hashtags`, `cta`, `payload` | `200` written · `400` unknown `prompt_version` · `403` clip and brand have different `owner_id` · `404` no clip, or no brand · `409` the clip has no analysis yet, or the `brands` row will not map to a `BrandProfile` · `422` `GeminiError` · `429` `GeminiQuotaExceeded` (usually adds `Retry-After`) · `504` `GeminiTimeout` · `500` brief generated but the `briefs` insert returned no rows |
| `/briefs/{brief_id}/regenerate` | POST   | no body; `brief_id` path param (UUID); optional `?prompt_version=brief-v1` | `BriefResponse` — same shape; always a new row                                                                                                           | as `POST /briefs`, plus `404` no brief with that id                                                                                                                                                                                                                                                                          |
| `/briefs/prompt-versions`       | GET    | —                                                                       | `["brief-v1"]` — oldest first                                                                                                                            | `200`                                                                                                                                                                                                                                                                                                                        |

Errors are FastAPI's default shape, `{ "detail": "..." }`. A path or query
param that is not a well-formed UUID is rejected by FastAPI itself as a `422`
before any handler runs, which is why `422` can also mean "bad request" on
endpoints that otherwise use it for a model failure.

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

One gap worth knowing about on `/clips/{clip_id}/analyse`: only the model call
can produce a `429`. The video upload that precedes it runs through
`upload_and_wait`, which has no quota branch, so a quota rejection on the
upload itself matches `_TRANSIENT_MARKERS` and comes back as a `504`. Rare --
the upload is not what the per-day allowance counts -- but a client cannot
assume every quota failure on this endpoint is a `429`.

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

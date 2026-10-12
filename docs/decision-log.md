# Decision log

Tickets closed without being built, and why. One page so the reasoning
survives the sprint board.

A deferred ticket is not an abandoned one: each entry records the condition
that would bring it back, so the next person does not have to rediscover the
problem to know it was considered.

---

## BE-24 · Job queue — deferred, 12 October 2026

**The trigger never fired.** The ticket was written conditionally — *"trigger:
a request times out"* — and no request has.

The 504s that looked like timeouts were the worker's own error handling
turning a Gemini failure into a 504 status, not a request being cut off.
Render's proxy allows requests of roughly 100 minutes, and uvicorn imposes no
limit of its own. The longest thing the worker does is a split, at about the
recording's own length.

Three things that would also have to be solved, none of which are hard but all
of which are work for a problem we do not have:

- `for update skip locked`, which the ticket specifies, cannot be expressed
  through PostgREST. The worker has no direct Postgres connection, so it would
  need a plpgsql function called via `rpc()`.
- Render has no free Background Worker — web services, Postgres and Redis
  only. The poller would have to live inside the web service, which spins down
  after 15 minutes idle, so a claimed job needs a lease and a stale-job
  reclaim to survive the instance going away.
- Half the done-when ("the app gets an immediate job ID and polls for status")
  is app work, and the split path is not reachable from the app until BE-28.

**Revisit if:** a split or analysis is cut off rather than returning an error;
the app hangs on import once BE-28 ships, particularly on a recording over a
few minutes; or we move off Render's free tier, which changes the timeout
assumptions this rests on.

---

## BE-25 · Storage watchdog — deferred, 12 October 2026

**The thing it would have watched is now fixed at the source.**

The ticket assumed storage would creep toward the 1GB free tier. The reason it
would have is that `/clips/{id}/prepare` — which downscales to 480p, makes the
thumbnail and deletes the original — existed and nothing called it, so every
clip sat at full phone resolution. At around 9MB a clip, 1GB was about 110
clips.

The app now calls it on import. Measured on the test video, a clip goes from
2.69MB to 0.88MB, and that is an already-small 576x1024 file; a real 1080p
capture saves considerably more. At 0.88MB, 1GB is roughly 1,100 clips.

Usage at the time of writing: **18.2MB**, all of it in `clips`. `recordings`
and `thumbnails` are empty.

**Revisit if:** usage passes a few hundred MB, or we start keeping recordings
rather than deleting them after a split. The orphan case the ticket names is
real but narrow — `POST /recordings/{id}/split` deliberately leaves uploaded
segments behind if a later step fails, because removing them could fail too
and mask the original error. Worth a sweep when there is something to sweep.

---

## Related

- `be23-detection-decision.md` — BE-23's criterion, fixed before the data
  arrives rather than after. Outcome still pending five real recordings.
- `be28-screen-recording-import.md` — the frontend half of recording import,
  which several of the above depend on.

## Still open, and not deferrable

**The Gemini key is on the free tier: twenty `generate_content` calls per day,
per model, shared by everyone.** No amount of engineering fixes that; it needs
billing enabled on the Google Cloud project, or a key each. At the measured
token counts it is roughly one to two cents per analysis. This is the one
outstanding item that decides whether the product works in front of an
audience.

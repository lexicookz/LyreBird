-- Reuse an analysis when the same video is analysed again.
--
-- The Gemini key is on the free tier: twenty generate_content calls a day,
-- per model, shared by the whole team. Most of that gets spent re-analysing
-- the same handful of test videos, and the worker had no cache at all --
-- pipeline/cache.py has one, but it writes to a `video_analyses` table that
-- was never created, so its Supabase path silently fails and it falls back to
-- a JSON file that the container wipes on every deploy.
--
-- This is the cache key. The worker hashes the file it downloaded and looks
-- for an existing analysis of a clip with the same hash, the same owner, and
-- the same model and prompt version. A hit copies the payload into a new
-- analyses row rather than pointing at the old one, so the append-only
-- one-row-per-run shape the table was designed around still holds.
--
-- Owner-scoped deliberately. Two people uploading the same TikTok would both
-- benefit from sharing, but the worker runs with the service role and crossing
-- the owner boundary here would be the one place in the schema that does. Not
-- worth it for a cache.

alter table public.clips
  add column video_hash text;

comment on column public.clips.video_hash is
  'sha256 of the file at storage_path, set by the worker when it analyses the '
  'clip. Null until then, and stale after /prepare re-encodes the file -- the '
  'worker rehashes what it downloads rather than trusting this.';

-- Supports the cache lookup, which filters clips by hash within one owner.
-- Partial: the column is null for every clip that has never been analysed,
-- and those rows are never the answer to this query.
create index clips_video_hash_idx
  on public.clips (owner_id, video_hash)
  where video_hash is not null;

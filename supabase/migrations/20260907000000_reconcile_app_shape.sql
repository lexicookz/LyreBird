-- ============================================================
-- Group 05 — short-form video breakdown and brief tool
-- Migration 0002: reconcile the schema with the app's data shape (BE-27)
--
-- Three columns the UI needs and 0001 did not provide. In each case the app's
-- shape won: the screens were already built around these and the alternatives
-- were either underivable or semantically wrong.
-- ============================================================


-- ---------- clips.status ----------
-- The library screen renders per-clip state (processing / ready / failed).
-- 0001 put status only on recordings, which does not work: clips imported
-- straight from the camera roll have no recording row to inherit from, and a
-- clip can fail analysis while its parent recording split fine.
--
-- Vocabulary matches VideoStatus in types/index.ts exactly.
-- Default is 'processing': a clip exists before its analysis does.

alter table public.clips
  add column status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed'));

create index clips_owner_status_idx on public.clips (owner_id, status);


-- ---------- clips.thumbnail_url ----------
-- thumbnail_path stays the source of truth for files we generated into the
-- private thumbnails bucket. This column is for a directly renderable URL:
-- external imports that arrive with one, and anything the UI can show without
-- minting a signed URL first.
--
-- Nullable on purpose. A clip may have one, the other, both or neither, so
-- the frontend should fall back path -> signed URL -> placeholder.

alter table public.clips
  add column thumbnail_url text;


-- ---------- briefs.cta ----------
-- A brief's call to action is authored content and belongs to the brief. It is
-- not the same value as the cta inside analyses.payload, which describes what
-- the *source* clip did. Reading the brief's CTA from the analysis would mean
-- editing a brief mutated analysis history.

alter table public.briefs
  add column cta text;

-- Preserve generated briefs when their source clip is deleted.
-- The related analysis may still be deleted, in which case analysis_id
-- is already configured to become null.

alter table public.briefs
  drop constraint if exists briefs_clip_id_fkey;

alter table public.briefs
  alter column clip_id drop not null;

alter table public.briefs
  add constraint briefs_clip_id_fkey
  foreign key (clip_id)
  references public.clips (id)
  on delete set null;

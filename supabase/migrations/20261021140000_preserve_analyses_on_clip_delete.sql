-- Preserve analysis data and funnel stage when its source clip is deleted.

alter table public.analyses
  drop constraint if exists analyses_clip_id_fkey;

alter table public.analyses
  alter column clip_id drop not null;

alter table public.analyses
  add constraint analyses_clip_id_fkey
  foreign key (clip_id)
  references public.clips (id)
  on delete set null;

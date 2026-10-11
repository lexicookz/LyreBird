-- ============================================================
-- briefs: a user edit marks the row 'edited' (BE-17)
--
-- A regenerate must never overwrite work someone has done by hand. The rule
-- that makes that safe is knowing which briefs have been touched, and the
-- only reliable place to decide that is the database — the app writes to
-- briefs directly under RLS, the worker writes with the service role, and a
-- future script might do either. A check that lives in one client is a check
-- the other clients do not make.
--
-- Only draft -> edited, and only when the authored columns actually change.
-- Two things that deliberately do not trip it:
--
--   * an update that sets status itself (draft -> scheduled, say). The
--     condition requires status to be unchanged, so a deliberate transition
--     is never quietly rewritten to 'edited'.
--   * an update that touches nothing the user authors — thumbnail_url,
--     analysis_id, a no-op save. `is distinct from` rather than <> so a
--     column going to or from null counts as a change, and null = null does
--     not.
-- ============================================================

create or replace function public.briefs_mark_edited()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'draft'
     and new.status = old.status
     and (
          new.hook      is distinct from old.hook
       or new.script    is distinct from old.script
       or new.shot_list is distinct from old.shot_list
       or new.caption   is distinct from old.caption
       or new.cta       is distinct from old.cta
       or new.hashtags  is distinct from old.hashtags
     )
  then
    new.status := 'edited';
  end if;

  return new;
end;
$$;

drop trigger if exists briefs_mark_edited on public.briefs;

create trigger briefs_mark_edited
  before update on public.briefs
  for each row execute function public.briefs_mark_edited();

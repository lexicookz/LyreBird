-- ============================================================
-- calendar_entries.status (BE-19)
--
-- The calendar screen tracks a brief through draft -> planned -> filmed ->
-- posted, and the table had nowhere to put it: scheduled_for says when,
-- platform says where, nothing said how far along it is. It lived in
-- AsyncStorage instead, which is why the board did not survive a reinstall
-- and could not be seen from a second device.
--
-- No unique index on brief_id, though the app behaves as if there were one.
-- The schema allows a brief to be scheduled more than once on purpose, and
-- the seed uses it: brief 66666666-...-0002 goes to TikTok on the 9th and
-- Instagram on the 14th, with a note about trimming the cutdown. That is a
-- real case -- the same script posted to two platforms -- and an index
-- would have made it unrepresentable.
--
-- The app's one-entry-per-brief is therefore a UI simplification rather than
-- a rule, and schedule() keeps it by replacing a brief's entries rather than
-- relying on the database to refuse a second.
-- ============================================================

alter table public.calendar_entries
  add column status text not null default 'draft'
    check (status in ('draft', 'planned', 'filmed', 'posted'));

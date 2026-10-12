-- ============================================================
-- Bind rls_auto_enable() to the DDL event that should fire it.
--
-- Named ensure_rls deliberately: the remote already has an event trigger
-- under that name calling rls_auto_enable(), created by hand in the SQL
-- Editor. Matching it means this migration replaces that one rather than
-- adding a second trigger doing the same job -- so it is a no-op where the
-- binding already exists, and creates it where it does not, which is every
-- fresh db reset.
--
-- Confirmed before writing it:
--   select t.evtname, p.proname from pg_event_trigger t
--     join pg_proc p on p.oid = t.evtfoid;
--   -> ensure_rls | rls_auto_enable
--
-- The function arrived via the SQL Editor and was captured by db pull in
-- 20260915110939. The event trigger that invokes it was not: event triggers
-- are database-scoped rather than schema-scoped, so pg_dump and migra both
-- skip them. The result is a function that returns event_trigger and is
-- bound to nothing — an RLS backstop that silently protects nothing.
--
-- This matters because every policy in this schema is a single comparison
-- against owner_id, which only holds if RLS is actually enabled on the table.
-- A table added without `enable row level security` is readable by every
-- authenticated user, and nothing in review reliably catches that.
--
-- drop-if-exists keeps this idempotent: the remote may already carry a
-- binding created by hand, and re-running must not fail.
-- ============================================================

drop event trigger if exists ensure_rls;

create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

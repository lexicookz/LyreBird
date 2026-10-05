-- ============================================================
-- Group 05 — short-form video breakdown and brief tool
-- Adapt: what a brand profile feeds in, and what a generated brief stores
--
-- Columns only. No new tables, so the existing one-line owner_id policies on
-- brands and briefs already cover everything added here.
-- ============================================================


-- ---------- brands ----------
-- Peer feedback: "change product to niche". A profile can describe a niche, a
-- person or a brand, not just one product, so Adapt reads `niche` instead of
-- `product_summary`. product_summary stays because the app still reads and
-- writes it; the worker falls back to it while niche is empty.

alter table public.brands
  add column niche text;

-- What the content is for (follows, saves, sign-ups, sales...). Drives the CTA.
alter table public.brands
  add column goal text;

-- Words and claims every brief must avoid. Onboarding already collects these
-- as `avoid` in data/brandSetup.ts; this gives them somewhere to live.
alter table public.brands
  add column constraints text[] not null default '{}';

-- Derived from the user's own videos (style-profile work, later PR). Null until
-- then, and Adapt treats null as "no style signal".
alter table public.brands
  add column style_profile jsonb;


-- ---------- briefs ----------
-- The full structured brief Adapt generated, validated against BriefDraft in
-- worker/app/brief_schema.py. The flat columns (hook, script, shot_list, ...)
-- stay as the editable copy the screens read; payload is the original output.
--
-- Null for briefs made without the model, e.g. the copy-the-analysis draft in
-- data/briefs.ts.

alter table public.briefs
  add column payload jsonb;

-- Same pair analyses carries, same names. Prompts change weekly, so every
-- generated brief records which prompt and model produced it.
alter table public.briefs
  add column prompt_version text;

alter table public.briefs
  add column model_version text;

-- A generated brief that cannot be traced back to its prompt is not allowed.
alter table public.briefs
  add constraint briefs_payload_traceable
    check (payload is null or (prompt_version is not null and model_version is not null));

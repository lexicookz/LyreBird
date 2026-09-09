-- ============================================================
-- Group 05 — short-form video breakdown and brief tool
-- Migration 0001: initial schema, RLS, storage buckets
-- ============================================================

-- ---------- helpers ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------- profiles ----------
-- Mirrors auth.users so we can join on it and store app-level fields.

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------- brands ----------
-- The brand profile every downstream feature reads from.
-- One user can own several brands: agencies handle multiple clients.

create table public.brands (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  name            text not null,
  product_summary text,
  target_audience text,
  tone_of_voice   text,
  keywords        text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index brands_owner_idx on public.brands (owner_id);

create trigger brands_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();


-- ---------- recordings ----------
-- A raw upload. Deleted once split, so treat this as a staging table.

create table public.recordings (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  source           text not null check (source in ('screen_recording', 'camera_roll', 'link')),
  source_url       text,
  storage_path     text,
  duration_seconds numeric,
  status           text not null default 'uploaded'
                   check (status in ('uploaded', 'processing', 'split', 'failed', 'purged')),
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index recordings_owner_idx on public.recordings (owner_id, created_at desc);

create trigger recordings_updated_at
  before update on public.recordings
  for each row execute function public.set_updated_at();


-- ---------- clips ----------
-- The unit everything else hangs off. recording_id is null for direct
-- camera-roll imports that were never split.

create table public.clips (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  recording_id        uuid references public.recordings (id) on delete set null,
  storage_path        text not null,
  thumbnail_path      text,
  title               text,
  tags                text[] not null default '{}',
  duration_seconds    numeric,
  position_in_parent  int,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index clips_owner_idx on public.clips (owner_id, created_at desc);
create index clips_recording_idx on public.clips (recording_id);
-- Tag filtering for the library screen. Swap in tsvector later without
-- touching this index.
create index clips_tags_idx on public.clips using gin (tags);

create trigger clips_updated_at
  before update on public.clips
  for each row execute function public.set_updated_at();


-- ---------- analyses ----------
-- Gemini output. Deliberately its own table, not a column on clips:
-- prompts will change weekly and we want to compare runs, not lose them.

create table public.analyses (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  clip_id        uuid not null references public.clips (id) on delete cascade,
  payload        jsonb not null,
  model_version  text not null,
  prompt_version text not null,
  created_at     timestamptz not null default now()
);

create index analyses_clip_idx on public.analyses (clip_id, created_at desc);
create index analyses_payload_idx on public.analyses using gin (payload);


-- ---------- briefs ----------
-- One clip can produce many briefs — one per brand it's adapted for.

create table public.briefs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  clip_id     uuid not null references public.clips (id) on delete cascade,
  brand_id    uuid not null references public.brands (id) on delete cascade,
  analysis_id uuid references public.analyses (id) on delete set null,
  hook        text,
  script      text,
  shot_list   jsonb,
  caption     text,
  hashtags    text[] not null default '{}',
  status      text not null default 'draft'
              check (status in ('draft', 'edited', 'scheduled', 'published', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index briefs_owner_idx on public.briefs (owner_id, created_at desc);
create index briefs_clip_idx on public.briefs (clip_id);
create index briefs_brand_idx on public.briefs (brand_id);

create trigger briefs_updated_at
  before update on public.briefs
  for each row execute function public.set_updated_at();


-- ---------- calendar_entries ----------

create table public.calendar_entries (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  brief_id      uuid not null references public.briefs (id) on delete cascade,
  scheduled_for date not null,
  platform      text check (platform in ('tiktok', 'instagram', 'youtube', 'other')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index calendar_owner_date_idx on public.calendar_entries (owner_id, scheduled_for);

create trigger calendar_entries_updated_at
  before update on public.calendar_entries
  for each row execute function public.set_updated_at();


-- ============================================================
-- Row Level Security
-- Every table carries owner_id so each policy is a one-liner.
-- The FastAPI worker uses the service_role key and bypasses all of this.
-- ============================================================

alter table public.profiles         enable row level security;
alter table public.brands           enable row level security;
alter table public.recordings       enable row level security;
alter table public.clips            enable row level security;
alter table public.analyses         enable row level security;
alter table public.briefs           enable row level security;
alter table public.calendar_entries enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "own brands" on public.brands
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "own recordings" on public.recordings
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "own clips" on public.clips
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Analyses are written by the worker, so the app only needs read access.
create policy "read own analyses" on public.analyses
  for select to authenticated
  using (auth.uid() = owner_id);

create policy "own briefs" on public.briefs
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "own calendar entries" on public.calendar_entries
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);


-- ============================================================
-- Storage
-- Path convention: <user_id>/<filename>. The policies below rely on it.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false),
       ('clips', 'clips', false),
       ('thumbnails', 'thumbnails', false)
on conflict (id) do nothing;

create policy "own files read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('recordings', 'clips', 'thumbnails')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own files write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('recordings', 'clips', 'thumbnails')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own files delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('recordings', 'clips', 'thumbnails')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

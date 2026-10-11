-- ============================================================
-- Full-text search over clips (BE-20)
--
-- Searching currently happens in the app: every clip is downloaded and
-- filtered with includes(). That cannot find a word inside a transcript
-- unless the transcript is already on the device, and after BE-18 only a
-- page of clips is. So the search has to move to Postgres, and Postgres
-- needs something to search.
--
-- The awkward part is that the text lives in two tables. title and tags are
-- columns on clips; hook and transcript are keys inside analyses.payload,
-- which is jsonb. The document therefore has to be assembled, and kept
-- current when either side changes -- hence two triggers rather than the
-- usual one.
--
-- Weights, highest first:
--   A  title, tags   -- what the user named it and how they filed it
--   B  hook, on-screen text
--                    -- the line the clip opens on and the words burned
--                       into the frame. Both are short and distinctive, and
--                       the app already searched on-screen text, so leaving
--                       it out would lose something people can find today.
--   C  transcript    -- everything said in it. Lowest not because it
--                       matters least but because it is the longest: an
--                       unweighted transcript would drown a title match.
-- ============================================================

alter table public.clips
  add column search_tsv tsvector;

-- The document for one clip, assembled from the clip and its most recent
-- analysis. Marked stable rather than immutable: it reads another table, so
-- it cannot be used in an index expression -- which is why the result is
-- stored in a column and kept current by trigger instead.
create or replace function public.clips_search_document(
  p_clip_id uuid,
  p_title text,
  p_tags text[]
)
returns tsvector
language plpgsql
stable
as $$
declare
  latest jsonb;
begin
  select a.payload
    into latest
    from public.analyses a
   where a.clip_id = p_clip_id
   order by a.created_at desc
   limit 1;

  return
      setweight(to_tsvector('english', coalesce(p_title, '')), 'A')
   || setweight(to_tsvector('english', array_to_string(coalesce(p_tags, '{}'), ' ')), 'A')
   || setweight(to_tsvector('english', coalesce(latest->>'hook', '')), 'B')
      -- onScreenText is a json array, so it is flattened rather than cast:
      -- ->> would hand tsvector the brackets and quotes as well.
   || setweight(to_tsvector('english', coalesce(
        (select string_agg(value, ' ')
           from jsonb_array_elements_text(
             case when jsonb_typeof(latest->'onScreenText') = 'array'
                  then latest->'onScreenText' else '[]'::jsonb end)),
        '')), 'B')
   || setweight(to_tsvector('english', coalesce(latest->>'transcript', '')), 'C');
end;
$$;

-- The clip side: title or tags changed.
create or replace function public.clips_search_refresh()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv := public.clips_search_document(new.id, new.title, new.tags);
  return new;
end;
$$;

drop trigger if exists clips_search_refresh on public.clips;

create trigger clips_search_refresh
  before insert or update of title, tags on public.clips
  for each row execute function public.clips_search_refresh();

-- The analysis side: a clip's text arrives after the clip does, so without
-- this the transcript would never make it into the document. Analyses are
-- append-only, so a new row is the normal case rather than an edge one.
create or replace function public.analyses_refresh_clip_search()
returns trigger
language plpgsql
as $$
begin
  update public.clips c
     set search_tsv = public.clips_search_document(c.id, c.title, c.tags)
   where c.id = new.clip_id;
  return new;
end;
$$;

drop trigger if exists analyses_refresh_clip_search on public.analyses;

create trigger analyses_refresh_clip_search
  after insert or update of payload on public.analyses
  for each row execute function public.analyses_refresh_clip_search();

-- gin, not gist: this is a read-heavy index over a tsvector, which is what
-- gin is for. gist would be smaller and slower to search.
create index if not exists clips_search_idx
  on public.clips using gin (search_tsv);

-- Existing rows have no document yet.
update public.clips
   set search_tsv = public.clips_search_document(id, title, tags);

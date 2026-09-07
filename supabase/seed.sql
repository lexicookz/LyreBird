-- ============================================================
-- Seed data for local development.
--
-- Runs after all migrations on `supabase db reset`.
--
-- Contents: one test user, two brands, one recording, five clips,
-- three analyses, two briefs, two calendar entries.
--
-- Every row uses a fixed UUID and `on conflict do nothing`, so this is safe to
-- re-run and safe to paste into the SQL editor of a throwaway hosted project.
--
-- Rows in public.profiles are created by the on_auth_user_created trigger, so
-- the auth.users insert below is what brings the profile into existence.
--
-- Test login:  demo@lyrebird.test  /  lyrebird-demo
-- ============================================================


-- ---------- test user ----------
-- If your GoTrue version rejects these columns, sign up through the app
-- instead and replace the UUID below with the real one from auth.users.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'demo@lyrebird.test',
  crypt('lyrebird-demo', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Demo User"}'::jsonb
)
on conflict (id) do nothing;

-- Needed for email/password sign-in. Wrapped because the column set here
-- varies between GoTrue versions and it is not worth failing the whole seed.
do $seed$
begin
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  values (
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '{"sub":"11111111-1111-1111-1111-111111111111","email":"demo@lyrebird.test"}'::jsonb,
    'email', 'demo@lyrebird.test',
    now(), now(), now()
  )
  on conflict do nothing;
exception when others then
  raise notice 'skipped auth.identities seed: %', sqlerrm;
end
$seed$;


-- ---------- brands ----------

insert into public.brands (id, owner_id, name, product_summary, target_audience, tone_of_voice, keywords)
values
  ('22222222-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'Lumen Skincare',
   'A three-step barrier-repair routine sold as a single subscription box.',
   'Women 24-38 who have tried and abandoned multi-step K-beauty routines.',
   'Warm, plain-spoken, anti-hype. Never uses the word "glow".',
   '{"barrier repair","fragrance free","subscription","sensitive skin"}'),
  ('22222222-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   'Fieldnote Coffee',
   'Single-origin beans roasted to order and shipped within 48 hours.',
   'Home brewers aged 25-45 who already own a grinder and scale.',
   'Precise and nerdy, but never condescending. Numbers over adjectives.',
   '{"single origin","roast date","pour over","specialty coffee"}')
on conflict (id) do nothing;


-- ---------- recording ----------
-- One screen recording that was split into the first three clips below.
-- The other two clips were imported straight from the camera roll, which is
-- why their recording_id is null.

insert into public.recordings (id, owner_id, source, source_url, storage_path, duration_seconds, status)
values
  ('33333333-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'screen_recording',
   null,
   '11111111-1111-1111-1111-111111111111/competitor-sweep-sept.mp4',
   184.5,
   'split')
on conflict (id) do nothing;


-- ---------- clips ----------
-- Storage path convention is <user_id>/<filename>; see CLAUDE.md.

-- status mirrors reality here: the three clips that have an analysis row are
-- 'ready', the other two are mid-pipeline and failed respectively, so the
-- library screen has all three states to render.
--
-- thumbnail_url carries a directly renderable image because no files have been
-- uploaded to the private thumbnails bucket yet. thumbnail_path is still set to
-- the path those files will occupy once upload works.

insert into public.clips (
  id, owner_id, recording_id, storage_path, thumbnail_path, thumbnail_url,
  title, tags, duration_seconds, position_in_parent, status
)
values
  ('44444444-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '33333333-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111/clip-barrier-hook.mp4',
   '11111111-1111-1111-1111-111111111111/clip-barrier-hook.jpg',
   'https://picsum.photos/seed/lyrebird-clip1/400/700',
   'Barrier repair explained in 20 seconds',
   '{skincare,education,hook}', 21.4, 1, 'ready'),

  ('44444444-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   '33333333-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111/clip-routine-teardown.mp4',
   '11111111-1111-1111-1111-111111111111/clip-routine-teardown.jpg',
   'https://picsum.photos/seed/lyrebird-clip2/400/700',
   'Why your 10-step routine stopped working',
   '{skincare,problem_agitate_solve,ugc}', 34.9, 2, 'processing'),

  ('44444444-0000-4000-8000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   '33333333-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111/clip-founder-answer.mp4',
   '11111111-1111-1111-1111-111111111111/clip-founder-answer.jpg',
   'https://picsum.photos/seed/lyrebird-clip3/400/700',
   'Founder answers the fragrance question',
   '{skincare,founder_pov,faq}', 47.2, 3, 'ready'),

  ('44444444-0000-4000-8000-000000000004',
   '11111111-1111-1111-1111-111111111111',
   null,
   '11111111-1111-1111-1111-111111111111/clip-grinder-myth.mp4',
   '11111111-1111-1111-1111-111111111111/clip-grinder-myth.jpg',
   'https://picsum.photos/seed/lyrebird-clip4/400/700',
   'The grinder myth that wastes your beans',
   '{coffee,education,myth_busting}', 28.7, null, 'ready'),

  ('44444444-0000-4000-8000-000000000005',
   '11111111-1111-1111-1111-111111111111',
   null,
   '11111111-1111-1111-1111-111111111111/clip-roast-date.mp4',
   '11111111-1111-1111-1111-111111111111/clip-roast-date.jpg',
   'https://picsum.photos/seed/lyrebird-clip5/400/700',
   'Read the roast date, not the best-before',
   '{coffee,ugc,retention}', 19.8, null, 'failed')
on conflict (id) do nothing;


-- ---------- analyses ----------
-- Payload shape mirrors VideoAnalysis in pipeline/schema.py, which is what the
-- Gemini call actually returns. Note this uses that file's taxonomy
-- (TOFU/MOFU/BOFU) rather than the one in types/index.ts (top/middle/bottom):
-- the two disagree and have not been reconciled yet.

insert into public.analyses (id, owner_id, clip_id, payload, model_version, prompt_version)
values
  ('55555555-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '44444444-0000-4000-8000-000000000001',
   '{
      "hook": "Your skin barrier is not dry. It is damaged, and those need opposite fixes.",
      "transcript": "Everyone tells you to moisturise more. If your barrier is actually damaged, piling on occlusives traps the problem underneath. What you want first is to stop stripping it. Drop the acids for ten days, drop the physical exfoliant entirely, and give it ceramides in a fragrance-free base. Ten days. Then reassess.",
      "onScreenText": "DRY IS NOT DAMAGED",
      "shotBeats": [
        "0.0-2.1s  Extreme close up on cracked texture, hard cut in",
        "2.1-8.4s  Talking head, centred, no b-roll",
        "8.4-14.0s Split screen: acid bottle versus ceramide tub",
        "14.0-21.4s Talking head, leaning in, CTA delivered flat"
      ],
      "pacing": "Hard cut at 2.1s, then long holds. Only four shots in 21s, unusually slow for the format, and it works because the claim is contrarian.",
      "cta": "Save this and check back in ten days.",
      "format": "talking_head",
      "funnelStage": "TOFU",
      "formatTag": "problem_agitate_solve"
    }'::jsonb,
   'gemini-2.5-flash', 'v1'),

  ('55555555-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   '44444444-0000-4000-8000-000000000003',
   '{
      "hook": "We get asked why there is no fragrance about forty times a week, so here is the actual answer.",
      "transcript": "Fragrance is not evil. It is just the single most common contact allergen in skincare, and if your barrier is already compromised you are running an experiment on yourself every morning. We left it out because the people we built this for cannot afford that experiment. It does mean the product smells faintly of nothing, which some people hate.",
      "onScreenText": "FORTY TIMES A WEEK",
      "shotBeats": [
        "0.0-3.6s  Founder mid-sentence, handheld, no intro",
        "3.6-19.5s Static tripod, product held in frame",
        "19.5-33.0s Cutaway to ingredient list, finger tracking down",
        "33.0-47.2s Back to founder, shrug on the final line"
      ],
      "pacing": "Deliberately unpolished. The handheld open buys credibility before the tripod does the explaining.",
      "cta": "Ask us anything else in the comments.",
      "format": "talking_head",
      "funnelStage": "MOFU",
      "formatTag": "founder_pov"
    }'::jsonb,
   'gemini-2.5-flash', 'v1'),

  ('55555555-0000-4000-8000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   '44444444-0000-4000-8000-000000000004',
   '{
      "hook": "A better grinder will not save stale beans. Nothing will.",
      "transcript": "People spend four hundred dollars on a grinder and then buy beans roasted in March. Grind consistency changes extraction. It does not change staleness. If the bag has no roast date on it, that is the answer. The roaster knows and is not telling you.",
      "onScreenText": "NO ROAST DATE, NO SALE",
      "shotBeats": [
        "0.0-1.8s  Overhead on beans hitting the scale, sharp audio",
        "1.8-11.2s Hands only, grinder adjustment, voiceover",
        "11.2-22.5s Two bags side by side, one dated one not",
        "22.5-28.7s Overhead pour, voiceover lands the CTA"
      ],
      "pacing": "Hands and voiceover throughout, no face. Cuts land on the grinder clicks, which is what makes it feel tight.",
      "cta": "Check the bag in your cupboard right now.",
      "format": "voiceover",
      "funnelStage": "TOFU",
      "formatTag": "ugc_testimonial"
    }'::jsonb,
   'gemini-2.5-flash', 'v1')
on conflict (id) do nothing;


-- ---------- briefs ----------
-- One per (clip, brand) adaptation. The first is still a draft, the second has
-- been scheduled, so the calendar screen has something real to show.

insert into public.briefs (
  id, owner_id, clip_id, brand_id, analysis_id,
  hook, script, shot_list, caption, cta, hashtags, status
)
values
  ('66666666-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '44444444-0000-4000-8000-000000000001',
   '22222222-0000-4000-8000-000000000001',
   '55555555-0000-4000-8000-000000000001',
   'You are not under-moisturising. You are over-stripping.',
   'Open on the contrarian claim, no intro, no logo. Beat two: name the mistake the viewer is currently making by hand, acids plus physical exfoliant in the same week. Beat three: the ten-day reset, stated as a rule not a suggestion. Close flat, no sell. The product does not appear until the caption.',
   '[
      {"shot": 1, "duration_s": 2.5, "framing": "Extreme close up, dry texture", "note": "Hard cut in, no establishing shot"},
      {"shot": 2, "duration_s": 7.0, "framing": "Talking head, centred", "note": "No b-roll. Let the claim sit."},
      {"shot": 3, "duration_s": 6.0, "framing": "Split screen, two products", "note": "Acids left, ceramides right"},
      {"shot": 4, "duration_s": 6.5, "framing": "Talking head, leaning in", "note": "Deliver CTA flat, do not smile"}
    ]'::jsonb,
   'Ten days. No acids, no scrubs, ceramides only. Then tell me it is still dry.',
   'Save this and come back in ten days.',
   '{barrierrepair,fragrancefree,sensitiveskin,skincaretruth}',
   'draft'),

  ('66666666-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   '44444444-0000-4000-8000-000000000004',
   '22222222-0000-4000-8000-000000000002',
   '55555555-0000-4000-8000-000000000003',
   'Your grinder is not the problem. Check the date on the bag.',
   'Hands only, no face, voiceover throughout. Open on the scale for the audio. Beat two: state the four-hundred-dollar-grinder mistake without mocking anyone. Beat three: two bags, one dated and one not, and let the silence do the work. Close by telling them to go look in their own cupboard.',
   '[
      {"shot": 1, "duration_s": 2.0, "framing": "Overhead, beans onto scale", "note": "Lead with the sound, not the image"},
      {"shot": 2, "duration_s": 9.5, "framing": "Hands on grinder dial", "note": "Cuts land on the clicks"},
      {"shot": 3, "duration_s": 11.0, "framing": "Two bags side by side", "note": "Hold longer than feels comfortable"},
      {"shot": 4, "duration_s": 6.0, "framing": "Overhead pour", "note": "CTA over the pour, no on-screen text"}
    ]'::jsonb,
   'Roast date or it did not happen. Go check your cupboard, I will wait.',
   'Go check the bag in your cupboard right now.',
   '{specialtycoffee,roastdate,pourover,coffeetok}',
   'scheduled')
on conflict (id) do nothing;


-- ---------- calendar entries ----------

insert into public.calendar_entries (id, owner_id, brief_id, scheduled_for, platform, notes)
values
  ('77777777-0000-4000-8000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   '66666666-0000-4000-8000-000000000002',
   '2026-09-09',
   'tiktok',
   'Post 7pm AEST. Pair with the roast-date carousel already in drafts.'),
  ('77777777-0000-4000-8000-000000000002',
   '11111111-1111-1111-1111-111111111111',
   '66666666-0000-4000-8000-000000000002',
   '2026-09-14',
   'instagram',
   'Reel cutdown, same audio, trim shot 3 to 7s for the shorter attention curve.')
on conflict (id) do nothing;

// data/mockVideos.ts
// Fake data in the exact shape of the Supabase tables, typed against the
// generated types. Swapping a screen over to real data is now a one-line
// change: replace the import with the matching supabase query.
//
// Reconciled from the original flat `Video` mocks (BE-27). Two structural
// changes worth knowing about:
//
//   1. Analysis fields (hook, transcript, shotBeats, pacing, cta, format,
//      funnelStage) are no longer on the clip. They live on the matching row
//      in `mockAnalyses`, because the schema keeps analyses in their own table
//      so repeated Gemini runs stay comparable instead of overwriting.
//
//   2. `scheduledDate` is no longer on the brief. Scheduling lives in
//      `mockCalendarEntries`, so one brief can be posted to several platforms
//      on different dates.
//
// Content is unchanged from the original mocks -- only the shape moved.

import type {
  Brand,
  Brief,
  CalendarEntry,
  Clip,
  TypedAnalysis,
} from '../types';

// Stands in for the signed-in user. Every table carries owner_id so RLS stays
// a single comparison; see CLAUDE.md.
const OWNER_ID = '11111111-1111-1111-1111-111111111111';

// ---------- brands ----------

export const mockBrands: Brand[] = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    owner_id: OWNER_ID,
    name: 'Lyrebird',
    product_summary: 'A short-form content planning app for solo marketers',
    target_audience:
      'Solo marketers, founders, and small agencies making organic TikTok/Reels content',
    tone_of_voice:
      'Direct, practical, a little irreverent — no corporate marketing-speak',
    keywords: [],
    niche: null,
    goal: null,
    constraints: [],
    style_profile: null,
    created_at: '2026-08-19T09:00:00Z',
    updated_at: '2026-08-19T09:00:00Z',
  },
];

// ---------- clips ----------
// thumbnail_path is null throughout: these mocks never had files in the
// private thumbnails bucket, only directly renderable URLs. Real clips will
// usually have the path and may have neither, so screens should fall back
// url -> signed(path) -> placeholder.

export const mockClips: Clip[] = [
  {
    id: 'cccccccc-0000-4000-8000-000000000001',
    owner_id: OWNER_ID,
    recording_id: null,
    storage_path: `${OWNER_ID}/morning-routine.mp4`,
    thumbnail_path: null,
    thumbnail_url: 'https://picsum.photos/seed/v1/400/700',
    title: 'Morning routine that changed everything',
    tags: ['morning', 'routine', 'productivity'],
    duration_seconds: 34,
    position_in_parent: null,
    error_message: null,
    status: 'ready',
    created_at: '2026-08-20T08:00:00Z',
    updated_at: '2026-08-20T08:00:00Z',
  },
  {
    id: 'cccccccc-0000-4000-8000-000000000002',
    owner_id: OWNER_ID,
    recording_id: null,
    storage_path: `${OWNER_ID}/onboarding-emails.mp4`,
    thumbnail_path: null,
    thumbnail_url: 'https://picsum.photos/seed/v2/400/700',
    title: 'Why your onboarding emails are getting ignored',
    tags: ['marketing', 'email', 'saas'],
    duration_seconds: 41,
    position_in_parent: null,
    error_message: null,
    status: 'ready',
    created_at: '2026-08-22T14:30:00Z',
    updated_at: '2026-08-22T14:30:00Z',
  },
  {
    id: 'cccccccc-0000-4000-8000-000000000003',
    owner_id: OWNER_ID,
    recording_id: null,
    storage_path: `${OWNER_ID}/product-sells-itself.mp4`,
    thumbnail_path: null,
    thumbnail_url: 'https://picsum.photos/seed/v3/400/700',
    title: 'POV: your product finally sells itself',
    tags: ['product', 'demo', 'conversion'],
    duration_seconds: 28,
    position_in_parent: null,
    error_message: null,
    status: 'processing',
    created_at: '2026-08-25T09:15:00Z',
    updated_at: '2026-08-25T09:15:00Z',
  },
  {
    id: 'cccccccc-0000-4000-8000-000000000004',
    owner_id: OWNER_ID,
    recording_id: null,
    storage_path: `${OWNER_ID}/pricing-page-mistake.mp4`,
    thumbnail_path: null,
    thumbnail_url: 'https://picsum.photos/seed/v4/400/700',
    title: 'The pricing page mistake costing you customers',
    tags: ['pricing', 'cro', 'saas'],
    duration_seconds: 52,
    position_in_parent: null,
    error_message: null,
    status: 'failed',
    created_at: '2026-08-26T11:00:00Z',
    updated_at: '2026-08-26T11:00:00Z',
  },
  {
    id: 'cccccccc-0000-4000-8000-000000000005',
    owner_id: OWNER_ID,
    recording_id: null,
    storage_path: `${OWNER_ID}/script-30s-ad.mp4`,
    thumbnail_path: null,
    thumbnail_url: 'https://picsum.photos/seed/v5/400/700',
    title: 'How I script a 30-second ad in 10 minutes',
    tags: ['scriptwriting', 'ads', 'process'],
    duration_seconds: 47,
    position_in_parent: null,
    error_message: null,
    status: 'ready',
    created_at: '2026-08-24T16:45:00Z',
    updated_at: '2026-08-24T16:45:00Z',
  },
];

// ---------- analyses ----------
// One row per clip that finished analysis. The two clips that are still
// processing or failed have no analysis row at all, which is exactly what the
// real table will look like -- screens must handle "no analysis yet".

export const mockAnalyses: TypedAnalysis[] = [
  {
    id: 'dddddddd-0000-4000-8000-000000000001',
    owner_id: OWNER_ID,
    clip_id: 'cccccccc-0000-4000-8000-000000000001',
    model_version: 'gemini-2.5-flash',
    prompt_version: 'v1',
    created_at: '2026-08-20T08:04:00Z',
    payload: {
      hook: "I used to hit snooze 5 times. Here's what fixed it.",
      transcript:
        'So I used to be the person who hit snooze five times every morning...',
      onScreenText: ['5 SNOOZES → 0'],
      shotBeats: [
        'Close up: alarm clock',
        'Cut to: making bed',
        'Cut to: stretching by window',
      ],
      pacing: 'Fast cuts, under 2s per shot for first 5 seconds',
      cta: 'Follow for more morning tips',
      format: 'talking_head',
      funnelStage: 'TOFU',
    },
  },
  {
    id: 'dddddddd-0000-4000-8000-000000000002',
    owner_id: OWNER_ID,
    clip_id: 'cccccccc-0000-4000-8000-000000000002',
    model_version: 'gemini-2.5-flash',
    prompt_version: 'v1',
    created_at: '2026-08-22T14:36:00Z',
    payload: {
      hook: 'Your welcome email has a 3-second window. Most brands waste it.',
      transcript:
        "Let's talk about the one email almost every SaaS company gets wrong...",
      onScreenText: ["3 SECONDS. THAT'S IT."],
      shotBeats: [
        'Screen recording: inbox',
        'Text overlay: stat callout',
        'Talking head: explanation',
      ],
      pacing: 'Steady, one beat every 3-4s',
      cta: 'Comment "EMAIL" for my swipe file',
      format: 'voiceover',
      funnelStage: 'MOFU',
    },
  },
  {
    id: 'dddddddd-0000-4000-8000-000000000003',
    owner_id: OWNER_ID,
    clip_id: 'cccccccc-0000-4000-8000-000000000005',
    model_version: 'gemini-2.5-flash',
    prompt_version: 'v1',
    created_at: '2026-08-24T16:52:00Z',
    payload: {
      hook: "10 minutes. That's all it takes if you use this structure.",
      transcript:
        'Every ad script I write follows the same five-part structure...',
      onScreenText: ['HOOK → PROBLEM → AGITATE → SOLUTION → CTA'],
      shotBeats: [
        'Talking head intro',
        'Screen recording: notes app',
        'Talking head: walkthrough',
      ],
      pacing: 'Medium, 4-5s per beat',
      cta: 'Save this for your next shoot',
      format: 'talking_head',
      funnelStage: 'BOFU',
    },
  },
];

// ---------- briefs ----------

export const mockBriefs: Brief[] = [
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    owner_id: OWNER_ID,
    clip_id: 'cccccccc-0000-4000-8000-000000000001',
    brand_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    analysis_id: 'dddddddd-0000-4000-8000-000000000001',
    hook: "I used to hit snooze 5 times. Here's what fixed it.",
    script:
      'Open on alarm clock close-up. Cut to making the bed while narrating the one rule that changed my mornings...',
    shot_list: [
      'Alarm clock close-up',
      'Making bed',
      'Stretching by window',
      'Pouring coffee',
    ],
    caption: 'The one rule that fixed my mornings 🌅 #morningroutine',
    cta: 'Follow for more morning tips',
    hashtags: ['morningroutine'],
    status: 'scheduled',
    payload: null,
    prompt_version: null,
    model_version: null,
    created_at: '2026-08-21T10:00:00Z',
    updated_at: '2026-08-21T10:00:00Z',
  },
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    owner_id: OWNER_ID,
    clip_id: 'cccccccc-0000-4000-8000-000000000002',
    brand_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    analysis_id: 'dddddddd-0000-4000-8000-000000000002',
    hook: 'Your welcome email has a 3-second window. Most brands waste it.',
    script:
      'Screen recording of a cluttered inbox. Overlay text with the 3-second stat. Cut to camera for the fix...',
    shot_list: [
      'Inbox screen recording',
      'Stat text overlay',
      'Talking head explanation',
    ],
    caption: 'Fix your welcome email in one afternoon 📧',
    cta: 'Comment "EMAIL" for my swipe file',
    hashtags: [],
    status: 'draft',
    payload: null,
    prompt_version: null,
    model_version: null,
    created_at: '2026-08-23T09:30:00Z',
    updated_at: '2026-08-23T09:30:00Z',
  },
  // The three below exist so the content calendar has a realistic mix to show.
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000003',
    owner_id: OWNER_ID,
    clip_id: 'cccccccc-0000-4000-8000-000000000005',
    brand_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    analysis_id: 'dddddddd-0000-4000-8000-000000000003',
    hook: 'Last chance before the price goes up',
    script: 'Open on the pricing page. Circle the old price. Cut to camera: one reason to act today...',
    shot_list: ['Pricing page close-up', 'Circle the old price', 'Talking head with deadline'],
    caption: null,
    cta: 'Link in bio, ends Friday',
    hashtags: [],
    status: 'scheduled',
    payload: null,
    prompt_version: null,
    model_version: null,
    created_at: '2026-08-27T09:00:00Z',
    updated_at: '2026-08-27T09:00:00Z',
  },
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000004',
    owner_id: OWNER_ID,
    clip_id: 'cccccccc-0000-4000-8000-000000000002',
    brand_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    analysis_id: 'dddddddd-0000-4000-8000-000000000002',
    hook: 'Three things I check before I hit send',
    script: null,
    shot_list: null,
    caption: null,
    cta: null,
    hashtags: [],
    status: 'draft',
    payload: null,
    prompt_version: null,
    model_version: null,
    created_at: '2026-08-28T15:00:00Z',
    updated_at: '2026-08-28T15:00:00Z',
  },
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000005',
    owner_id: OWNER_ID,
    clip_id: 'cccccccc-0000-4000-8000-000000000001',
    brand_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    analysis_id: 'dddddddd-0000-4000-8000-000000000001',
    hook: 'I bought 11 planners. Nine are in a drawer.',
    script: 'Stack of planners on the desk. Push nine off the edge, one at a time...',
    shot_list: ['Planner stack', 'Push them off one by one', 'The one that stayed', 'Spoken CTA'],
    caption: 'The only planner that survived January 📓',
    cta: 'Comment PLANNER for the template',
    hashtags: ['planning'],
    status: 'published',
    payload: null,
    prompt_version: null,
    model_version: null,
    created_at: '2026-08-15T08:00:00Z',
    updated_at: '2026-08-15T08:00:00Z',
  },
];

// ---------- calendar entries ----------
// Only the first brief was scheduled in the original mocks; the second is
// still a draft and so has no entry.

export const mockCalendarEntries: CalendarEntry[] = [
  {
    id: 'eeeeeeee-0000-4000-8000-000000000001',
    owner_id: OWNER_ID,
    brief_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    scheduled_for: '2026-09-02',
    platform: 'tiktok',
    notes: null,
    created_at: '2026-08-21T10:05:00Z',
    updated_at: '2026-08-21T10:05:00Z',
  },
];

// ---------- transitional aliases ----------

/** @deprecated Renamed to `mockClips`. Analysis fields now live in `mockAnalyses`. */
export const mockVideos = mockClips;

/** @deprecated Renamed to `mockBrands` (now a list). Use `mockBrands[0]`. */
export const mockBrandProfile = mockBrands[0];

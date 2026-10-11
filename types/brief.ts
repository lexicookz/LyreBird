// types/brief.ts
// The Adapt contract on the app side: what goes into brief generation and the
// structured brief that comes back (stored in briefs.payload).
//
// Source of truth is worker/app/brief_schema.py. This file mirrors the JSON
// Schema exported from it (worker/schemas/*.schema.json) by hand, and
// __tests__/briefSchema.test.ts fails if a field, enum or nesting drifts.
// Mock briefs should be typed as BriefDraft so tsc checks them too.

import type { CalendarPlatform, FunnelStage } from './index';

/** Top-level keys of an analysis payload that a brief element can trace back to. */
export type AnalysisField =
  | 'hook'
  | 'transcript'
  | 'onScreenText'
  | 'shotBeats'
  | 'pacing'
  | 'cta'
  | 'format'
  | 'funnelStage';

// ---------- input ----------

export type BrandProfile = {
  name: string;
  /** The niche, person or brand the content is about. */
  niche: string;
  target_audience: string;
  tone: string;
  /** What the content should get viewers to do. */
  goal: string;
  /** Words and claims the brief must avoid. */
  constraints: string[];
  style_profile: { [key: string]: unknown } | null;
};

// ---------- output ----------

export type BriefHook = {
  line: string;
  on_screen_text: string;
  visual: string;
};

export type BriefBeat = {
  start_seconds: number;
  end_seconds: number;
  shot: string;
  action: string;
  voiceover: string;
  on_screen_text: string;
};

export type WhyItWorks = {
  /** Which part of this brief, e.g. 'hook' or 'beat 3'. */
  brief_element: string;
  source_field: AnalysisField;
  source_detail: string;
  rationale: string;
};

/** Relative, not a date: compute the date from day_offset in code. */
export type PostingSlot = {
  /** Days after the brief is created, 0-13. */
  day_offset: number;
  /** Local time, 24h. */
  start_hour: number;
  /** Local time, 24h, exclusive. */
  end_hour: number;
  platform: CalendarPlatform;
  rationale: string;
};

export type BriefDraft = {
  title: string;
  funnel_stage: FunnelStage;
  target_duration_seconds: number;
  hook: BriefHook;
  beats: BriefBeat[];
  cta: string;
  caption: string;
  hashtags: string[];
  why_it_works: WhyItWorks[];
  production_notes: string[];
  posting_slots: PostingSlot[];
};

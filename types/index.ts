// types/index.ts
// Thin aliases over the generated Supabase types. The schema is now the single
// source of truth: regenerate with
//
//   supabase gen types typescript --linked > supabase/database.types.ts
//
// and anything wrong here becomes a compile error rather than a runtime one.

import type { Database } from '../supabase/database.types';
import type { Tag } from './tag';

// ---------- table rows ----------

/**
 * A clip, as the app sees one.
 *
 * Two columns are omitted on purpose, both because they are the server's
 * working state rather than anything a screen renders:
 *
 * - `search_tsv` is the full-text index Postgres maintains. The app queries
 *   against it and never reads it, and it can run to kilobytes per row.
 * - `video_hash` is the analysis cache key, set by the worker so a second
 *   upload of the same file can reuse its analysis. Nothing in the app
 *   writes it or shows it.
 */
export type Clip = Omit<
  Database['public']['Tables']['clips']['Row'],
  'search_tsv' | 'video_hash'
>;
export type Analysis = Database['public']['Tables']['analyses']['Row'];
export type Brief = Database['public']['Tables']['briefs']['Row'];
export type Brand = Database['public']['Tables']['brands']['Row'];
export type CalendarEntry = Database['public']['Tables']['calendar_entries']['Row'];
export type Recording = Database['public']['Tables']['recordings']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];

// Insert shapes omit server-defaulted columns (id, created_at, updated_at).
export type ClipInsert = Database['public']['Tables']['clips']['Insert'];
export type BriefInsert = Database['public']['Tables']['briefs']['Insert'];
export type BrandInsert = Database['public']['Tables']['brands']['Insert'];

// ---------- check-constraint vocabularies ----------
// The schema enforces these with `check (x in (...))` rather than Postgres
// enums, and `supabase gen types` only derives unions from real enum types --
// so these columns arrive as plain `string`. Narrowing them by hand is what
// gets autocomplete back. If a constraint changes in a migration, change it
// here in the same commit.

export type ClipStatus = 'processing' | 'ready' | 'failed';
export type BriefStatus = 'draft' | 'edited' | 'scheduled' | 'published' | 'archived';
export type RecordingSource = 'screen_recording' | 'camera_roll' | 'link';
export type RecordingStatus = 'uploaded' | 'processing' | 'split' | 'failed' | 'purged';
export type CalendarPlatform = 'tiktok' | 'instagram' | 'youtube' | 'other';

// ---------- analyses.payload ----------
// payload is jsonb, so the database does not constrain it. This mirrors
// VideoAnalysis in pipeline/schema.py, which is what the Gemini call returns.
//
// NOTE: funnelStage uses the pipeline's vocabulary (TOFU/MOFU/BOFU), not the
// top/middle/bottom the mocks originally used. The two disagreed; the pipeline
// wins here because it is what actually writes the column. Worth a team
// decision before either side ships.

export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';
export type FormatTag = 'ugc_testimonial' | 'founder_pov' | 'problem_agitate_solve';
export type VideoFormat = 'talking_head' | 'voiceover' | 'text_overlay' | 'skit' | 'other';
export type ContentTag = Tag [];

// Declared as a type alias rather than an interface on purpose: interfaces have
// no implicit index signature, so an interface here would not be assignable to
// the generated `Json` type and TypedAnalysis would stop matching Analysis.
/**
 * Mirrors VideoAnalysis in pipeline/schema.py, which is the agreed contract
 * (BE-12) and what the Gemini call returns. Change one and change the other in
 * the same commit.
 *
 * Nullable fields come back as null rather than an invented string when the
 * model genuinely cannot tell, so render them defensively.
 */
export type AudioStyle = {
  backgroundMusic: string | null;
  voiceover: string | null;
};

export type AnalysisPayload = {
  hook: string;
  transcript: string | null;
  onScreenText: string[];
  /** Each entry is prefixed with its timestamp: 'MM:SS - what happens'. */
  shotBeats: string[];
  pacing: string | null;
  cta: string | null;
  /**
   * Added in BE-12, so rows written by an earlier analysis run do not carry
   * them. Optional here for that reason, not because a new run may omit them.
   */
  audioStyle?: AudioStyle;
  whyItWorks?: string[];
  format: VideoFormat;
  funnelStage: FunnelStage;
  formatTag?: FormatTag | null;
  tags: ContentTag[] ;
  description?: string;
};

/** An analysis row with its payload narrowed from `Json` to AnalysisPayload. */
export type TypedAnalysis = Omit<Analysis, 'payload'> & { payload: AnalysisPayload };

// ---------- transitional aliases ----------

/**
 * @deprecated `Video` was the pre-schema name for a clip. Analysis fields
 * (hook, transcript, shotBeats, ...) are no longer on this object -- they live
 * on the matching Analysis row. Use `Clip` directly.
 */
export type Video = Clip;

/** @deprecated Renamed to `Brand` to match the table. */
export type BrandProfile = Brand;

/** @deprecated Renamed to `ClipStatus`. */
export type VideoStatus = ClipStatus;

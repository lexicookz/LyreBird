// lib/briefs.ts
//
// Briefs, in Supabase. Reading and editing go straight to the `briefs` table
// under RLS; writing one with the AI goes through the worker, because that's
// where the Gemini key lives.
//
// Regenerate never overwrites: the worker inserts a new brief and leaves the
// old one (and any hand edits) alone. So a clip can have several briefs; the
// newest is the current one (see latestPerClip in data/briefs.ts).

import { supabase } from './supabase';
import { postToWorker } from './worker';
import type { Brief } from '../types';

/** The editable fields. Status is not here: the database marks drafts "edited" itself. */
export type BriefPatch = Partial<
  Pick<Brief, 'hook' | 'script' | 'shot_list' | 'caption' | 'cta' | 'hashtags'>
>;

/** Every brief the signed-in user has, newest first. */
export async function fetchBriefs(): Promise<Brief[]> {
  const { data, error } = await supabase
    .from('briefs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load your briefs: ${error.message}`);
  return data ?? [];
}

export async function updateBrief(briefId: string, patch: BriefPatch): Promise<Brief> {
  const { data, error } = await supabase
    .from('briefs')
    .update(patch)
    .eq('id', briefId)
    .select()
    .single();
  if (error) throw new Error(`Could not save your brief: ${error.message}`);
  return data;
}

type BriefResponse = { brief_id: string };

/** Ask the AI to write a brief for this clip, in this brand's voice. Returns the new brief's id. */
export async function requestBrief(clipId: string, brandId: string): Promise<string> {
  const res = await postToWorker<BriefResponse>(
    '/briefs',
    { clip_id: clipId, brand_id: brandId },
    'write your brief'
  );
  return res.brief_id;
}

/** Ask the AI for a fresh version of a brief. Returns the new brief's id; the old one is kept. */
export async function requestRegenerate(briefId: string): Promise<string> {
  const res = await postToWorker<BriefResponse>(
    `/briefs/${briefId}/regenerate`,
    undefined,
    'rewrite your brief'
  );
  return res.brief_id;
}

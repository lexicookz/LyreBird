// lib/brands.ts
//
// The user's brand, in Supabase (`brands`). The brief writer on the worker
// reads this row, so a brand that only exists on the phone can't be adapted
// for. The app keeps one brand per user.
//
// Mapping from what onboarding collects (BrandSetup) to the columns:
//   name             -> name
//   product_summary  -> product_summary   (the worker uses it as `niche` too)
//   target_audience  -> target_audience
//   tones            -> tone_of_voice     (joined with ", ")
//   avoid            -> constraints
//   focus            -> goal              (as a sentence the model can use)
// focusShare and color have no column; they stay on the device.

import { supabase } from './supabase';
import type { BrandSetup } from '../data/brandSetup';
import type { Brand, FunnelStage } from '../types';

const GOAL_FOR_FOCUS: Record<FunnelStage, string> = {
  TOFU: 'Get discovered by people who have never heard of us.',
  MOFU: 'Win over people who are comparing us with alternatives.',
  BOFU: 'Get people who are ready to buy to buy now.',
};

export function brandColumns(setup: BrandSetup) {
  return {
    name: setup.name.trim(),
    product_summary: setup.product_summary.trim() || null,
    target_audience: setup.target_audience.trim() || null,
    tone_of_voice: setup.tones.length ? setup.tones.join(', ') : null,
    constraints: setup.avoid,
    goal: GOAL_FOR_FOCUS[setup.focus],
  };
}

/** Rebuilds what the screens show from a brands row, e.g. on a new phone. */
export function setupFromBrand(row: Brand, base: BrandSetup): BrandSetup {
  const focus =
    (Object.keys(GOAL_FOR_FOCUS) as FunnelStage[]).find((s) => GOAL_FOR_FOCUS[s] === row.goal) ??
    base.focus;
  return {
    ...base,
    name: row.name,
    product_summary: row.product_summary ?? '',
    target_audience: row.target_audience ?? '',
    tones: row.tone_of_voice ? row.tone_of_voice.split(',').map((t) => t.trim()).filter(Boolean) : [],
    avoid: row.constraints ?? [],
    focus,
  };
}

/** The signed-in user's brand, or null if they haven't saved one yet. */
export async function fetchMyBrand(): Promise<Brand | null> {
  // No owner_id filter: RLS only returns this user's rows.
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load your brand: ${error.message}`);
  return data;
}

/** Creates the user's brand, or updates it if `brandId` is given. Returns the row. */
export async function saveBrand(userId: string, setup: BrandSetup, brandId?: string | null): Promise<Brand> {
  const columns = brandColumns(setup);
  const query = brandId
    ? supabase.from('brands').update(columns).eq('id', brandId)
    : supabase.from('brands').insert({ ...columns, owner_id: userId });
  const { data, error } = await query.select().single();
  if (error) throw new Error(`Could not save your brand: ${error.message}`);
  return data;
}

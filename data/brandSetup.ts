// data/brandSetup.ts
// What the first-run onboarding collects, and where it is kept for now.
//
// This lives on the device (AsyncStorage) until the app talks to Supabase.
// Only name / product_summary / target_audience / tone_of_voice have columns in
// `brands` today; `avoid` and the funnel focus have nowhere to go in the schema
// yet and need a migration before they can be saved server-side.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Brand, FunnelStage } from '../types';

export type BrandSetup = {
  name: string;
  product_summary: string;
  target_audience: string;
  tones: string[];
  /** Words and claims every brief must avoid. */
  avoid: string[];
  /** The funnel stage the user wants more of, and its target share (0-100). */
  focus: FunnelStage;
  focusShare: number;
};

/** Voice options offered in setup and on the Branding screen. */
export const TONES = ['Plain-spoken', 'Warm', 'Dry humour', 'Expert', 'No hype', 'Playful', 'Clinical', 'Blunt'];

export const emptyBrandSetup: BrandSetup = {
  name: '',
  product_summary: '',
  target_audience: '',
  tones: [],
  avoid: [],
  focus: 'TOFU',
  focusShare: 60,
};

const ONBOARDED_KEY = 'lyrebird.onboarded';
const BRAND_KEY = 'lyrebird.brandSetup';

export async function loadOnboarding(): Promise<{
  onboarded: boolean;
  brand: BrandSetup | null;
}> {
  try {
    const [onboarded, brand] = await Promise.all([
      AsyncStorage.getItem(ONBOARDED_KEY),
      AsyncStorage.getItem(BRAND_KEY),
    ]);
    return {
      onboarded: onboarded === 'true',
      brand: brand ? { ...emptyBrandSetup, ...JSON.parse(brand) } : null,
    };
  } catch {
    // Unreadable storage shouldn't trap the user in onboarding.
    return { onboarded: false, brand: null };
  }
}

/** Marks onboarding finished, saving the brand answers if there are any. */
export async function completeOnboarding(brand: BrandSetup | null) {
  const writes: [string, string][] = [[ONBOARDED_KEY, 'true']];
  if (brand) writes.push([BRAND_KEY, JSON.stringify(brand)]);
  await AsyncStorage.multiSet(writes);
}

/** Overlays the onboarding answers onto a `brands` row for screens that take one. */
export function applyBrandSetup(base: Brand, setup: BrandSetup): Brand {
  return {
    ...base,
    name: setup.name,
    product_summary: setup.product_summary || null,
    target_audience: setup.target_audience || null,
    tone_of_voice: setup.tones.length ? setup.tones.join(', ') : null,
  };
}

/** Saves edits made on the Branding screen after onboarding. */
export async function saveBrandSetup(brand: BrandSetup) {
  await AsyncStorage.setItem(BRAND_KEY, JSON.stringify(brand));
}

/** Clears onboarding + brand data, as if this were a fresh install (our "sign out"). */
export async function resetOnboarding() {
  await AsyncStorage.multiRemove([ONBOARDED_KEY, BRAND_KEY]);
}
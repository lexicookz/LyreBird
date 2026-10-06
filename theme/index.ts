// theme/index.ts
// Design tokens from the Lyrebird Figma file (3ZIEyMxL090hDkhfIhzWiH). The file
// has no Figma variables, so these values were read off the frames directly.
// Use these instead of hardcoding hex values in screens.

import type { FunnelStage } from '../types';

export const colors = {
  // Brand
  ink: '#33241c', // primary text, dark buttons, tab bar
  cream: '#fbf7f4', // text on ink
  white: '#ffffff',

  // Pastels (funnel stages and accents)
  green: '#dfeec8',
  lilac: '#dcd4f5',
  pink: '#f7d9e3',
  sky: '#d6e6f5',
  peach: '#fbdcc4',

  // Text
  textStrong: '#43332b',
  textBody: '#5a463a',
  textLabel: '#6b5548', // uppercase field labels, "Skip for now"
  textMuted: '#7a7270',
  textFaint: '#8a8280',
  textPlaceholder: '#a09896',
  textEyebrow: '#98908e', // "LYREBIRD" wordmark
  icon: '#54423a',

  // Surfaces
  field: '#f7f6f5', // inputs, round back button
  track: '#efedea', // inactive progress segments, avatar placeholder
  hairline: 'rgba(51,36,28,0.16)',
  scrim: 'rgba(51,36,28,0.72)', // duration badge on thumbnails
  frost: 'rgba(255,255,255,0.72)', // pill on a pastel card
} as const;

// Sora carries headings and buttons; Inter carries everything else. With custom
// fonts, pick the weight through the family name, not fontWeight -- Android
// ignores fontWeight on a custom family and falls back to the system font.
export const fonts = {
  display: 'Sora_800ExtraBold', // screen headings
  heading: 'Sora_700Bold', // card titles, button labels
  body: 'Inter_400Regular',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const radius = {
  card: 6,
  field: 8,
  pill: 999,
} as const;

/** Horizontal page margin used on every screen in the designs. */
export const pagePadding = 22;

// ---------- funnel stages ----------
// The pipeline writes TOFU/MOFU/BOFU (see types/index.ts); the designs show
// Awareness/Consider/Convert, each with its own pastel. Map here, once.

export const funnelStages: Record<
  FunnelStage,
  { label: string; color: string }
> = {
  TOFU: { label: 'Awareness', color: colors.green },
  MOFU: { label: 'Consider', color: colors.lilac },
  BOFU: { label: 'Convert', color: colors.pink },
};

export const FUNNEL_ORDER: FunnelStage[] = ['TOFU', 'MOFU', 'BOFU'];

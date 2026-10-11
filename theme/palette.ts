// theme/palette.ts
// The two colour palettes (same keys) and the funnel-stage mapping. Kept apart
// from index.ts so ThemeContext can import them without a circular import.

import type { FunnelStage } from '../types';

export const lightColors = {
  // Brand
  ink: '#33241c', // primary text; fill of dark buttons, active chips, tab bar
  cream: '#fbf7f4', // text and icons on an `ink` fill
  creamMuted: 'rgba(251,247,244,0.45)', // inactive tab icons, secondary text on `ink`
  creamSoft: 'rgba(251,247,244,0.6)', // subtitles on `ink`
  creamFaint: 'rgba(251,247,244,0.12)', // badges and dividers on `ink`

  // Backgrounds
  bg: '#ffffff', // page background
  surface: '#ffffff', // raised cards, search box, sheets

  // Pastels (funnel stages and accents)
  green: '#dfeec8',
  lilac: '#dcd4f5',
  pink: '#f7d9e3',
  sky: '#d6e6f5',
  peach: '#fbdcc4',
  /** Text on a pastel. Pastels stay light in both themes, so this stays dark. */
  onPastel: '#33241c',
  onPastelBody: '#5a463a',
  onPastelInverse: '#fbf7f4', // text on an onPastel pill ("Brief ready")

  // Text
  textStrong: '#43332b',
  textBody: '#5a463a',
  textLabel: '#6b5548', // uppercase field labels, "Skip for now"
  textMuted: '#7a7270',
  textFaint: '#8a8280',
  textPlaceholder: '#a09896',
  textEyebrow: '#98908e', // "LYREBIRD" wordmark
  icon: '#54423a',
  danger: '#8a4b3c', // "Delete video", "Sign out"

  // Surfaces
  field: '#f7f6f5', // inputs, round back button
  fieldAlt: '#f4f3f1', // transcript card
  thumb: '#e9e9e8', // empty thumbnail
  track: '#efedea', // inactive progress segments, avatar placeholder
  hairline: 'rgba(51,36,28,0.16)',
  hairlineStrong: 'rgba(51,36,28,0.24)', // empty radio, dashed add field
  divider: 'rgba(51,36,28,0.07)',
  scrim: 'rgba(51,36,28,0.72)', // duration badge on thumbnails
  overlay: 'rgba(51,36,28,0.3)', // behind sheets and the add menu
  frost: 'rgba(255,255,255,0.72)', // pill on a pastel card
  onScrim: '#ffffff', // text on a scrim badge (video length)
  shadow: '#33241c',
};

export type Colors = typeof lightColors;

export const darkColors: Colors = {
  ink: '#f6efe9',
  cream: '#33241c',
  creamMuted: 'rgba(51,36,28,0.45)',
  creamSoft: 'rgba(51,36,28,0.6)',
  creamFaint: 'rgba(51,36,28,0.1)',

  bg: '#2a201b',
  surface: '#3a2e27',

  green: '#bdd49b',
  lilac: '#b8abe4',
  pink: '#e0aec1',
  sky: '#adc6e1',
  peach: '#e6b592',
  onPastel: '#33241c',
  onPastelBody: '#4a382e',
  onPastelInverse: '#fbf7f4',

  textStrong: '#ede3db',
  textBody: '#d8cabf',
  textLabel: '#c9bbb0',
  textMuted: '#bcaea3',
  textFaint: '#ae9f94',
  textPlaceholder: '#8e8076',
  textEyebrow: '#a99b90',
  icon: '#c9bbb0',
  danger: '#e59a86',

  field: '#46382f',
  fieldAlt: '#3a2e27',
  thumb: '#4f4036',
  track: '#4f4036',
  hairline: 'rgba(246,239,233,0.14)',
  hairlineStrong: 'rgba(246,239,233,0.24)',
  divider: 'rgba(246,239,233,0.06)',
  scrim: 'rgba(42,32,27,0.72)',
  overlay: 'rgba(0,0,0,0.45)',
  frost: 'rgba(255,255,255,0.5)',
  onScrim: '#ffffff',
  shadow: '#000000',
};

// ---------- funnel stages ----------
// The pipeline writes TOFU/MOFU/BOFU (see types/index.ts); the designs show
// Awareness/Consider/Convert, each with its own pastel. Labels are fixed; the
// colour depends on the theme, so get it from useTheme().stages.

export const funnelStages: Record<FunnelStage, { label: string }> = {
  TOFU: { label: 'Awareness' },
  MOFU: { label: 'Consider' },
  BOFU: { label: 'Convert' },
};

const STAGE_COLOR: Record<FunnelStage, 'green' | 'lilac' | 'pink'> = {
  TOFU: 'green',
  MOFU: 'lilac',
  BOFU: 'pink',
};

export function stagesFor(colors: Colors): Record<FunnelStage, { label: string; color: string }> {
  return {
    TOFU: { label: funnelStages.TOFU.label, color: colors[STAGE_COLOR.TOFU] },
    MOFU: { label: funnelStages.MOFU.label, color: colors[STAGE_COLOR.MOFU] },
    BOFU: { label: funnelStages.BOFU.label, color: colors[STAGE_COLOR.BOFU] },
  };
}

export const FUNNEL_ORDER: FunnelStage[] = ['TOFU', 'MOFU', 'BOFU'];

// theme/index.ts
// Design tokens from the Lyrebird Figma file (3ZIEyMxL090hDkhfIhzWiH) and the
// dark-theme exports. The files have no Figma variables, so these values were
// read off the frames directly. Use these instead of hardcoding hex values.
//
// Colours come in two palettes with the same keys. Screens never import a
// palette directly: they read the current one from useTheme() (theme/ThemeContext),
// which follows the phone's light/dark setting or the choice in Settings.

export * from './palette';

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

export { ThemeProvider, useTheme, useStyles } from './ThemeContext';
export type { Appearance } from './ThemeContext';

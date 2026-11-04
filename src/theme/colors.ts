// Palette extracted from docs/design/reference.png.
// The app is dark-first (the design's main screens are near-black with a lime accent); the light grey
// "surfaceLight" is used for the single light card on landing/onboarding-style screens.
export const colors = {
  bg: '#0D0D0F',
  surface: '#18181B',
  surfaceRaised: '#222226',
  surfaceLight: '#E9E9EB',
  border: '#2A2A2F',

  text: '#FFFFFF',
  textMuted: '#9B9BA3',
  textOnLight: '#111113',
  textMutedOnLight: '#6B6B73',

  accent: '#DDF247',
  accentPressed: '#C6DB3A',
  // The design sets lime text on light grey, which is unreadable; this darker olive keeps the same hue.
  accentOnLight: '#6B7A00',
  accentSoft: 'rgba(221, 242, 71, 0.14)',
  onAccent: '#0D0D0F',

  danger: '#FF5C5C',
  success: '#5CE08A',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

export type ColorToken = keyof typeof colors;

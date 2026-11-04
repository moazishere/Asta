import type { TextStyle } from 'react-native';

// System font on purpose (San Francisco on iOS, Roboto on Android): no network font loading, and the
// design's tight, bold geometric look is carried by weight + negative tracking rather than a custom face.
export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'title'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'numeral'
  | 'numeralLg';

export const typography: Record<TextVariant, TextStyle> = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -1 },
  h1: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.6 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '500', letterSpacing: 0.2 },
  // Stat numerals ("01:15:42", "32.8", "568"): tabular so digits don't jitter while a run ticks.
  numeral: { fontSize: 22, lineHeight: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  numeralLg: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
};

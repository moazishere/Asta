// 4pt spacing rhythm; the design uses generous 20pt screen gutters and 16-24pt gaps between cards.
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

// Everything in the design is heavily rounded: cards ~24, pills fully round.
export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const sizes = {
  gutter: spacing.xl,
  controlHeight: 56,
  inputHeight: 56,
  iconSm: 16,
  iconMd: 22,
  iconLg: 28,
  tabBarHeight: 68,
  avatarSm: 32,
  avatarMd: 44,
  avatarLg: 72,
  roundButton: 48,
} as const;

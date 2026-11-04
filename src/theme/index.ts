import { colors } from './colors';
import { radii, sizes, spacing } from './layout';
import { typography } from './typography';

export const theme = { colors, spacing, radii, sizes, typography } as const;

export { colors } from './colors';
export type { ColorToken } from './colors';
export { radii, sizes, spacing } from './layout';
export { typography } from './typography';
export type { TextVariant } from './typography';

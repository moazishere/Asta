import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors, sizes, type ColorToken } from '@/theme';

// One icon family (Ionicons, outline style) so the app matches the design's thin, rounded line icons
// and renders identically on iOS and Android (SF Symbols would be iOS-only).
export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  name: IconName;
  size?: keyof Pick<typeof sizes, 'iconSm' | 'iconMd' | 'iconLg'>;
  color?: ColorToken;
};

export function Icon({ name, size = 'iconMd', color = 'text' }: Props) {
  return <Ionicons name={name} size={sizes[size]} color={colors[color]} />;
}

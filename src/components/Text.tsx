import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, typography, type ColorToken, type TextVariant } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: ColorToken;
};

export function Text({ variant = 'body', color = 'text', style, ...rest }: TextProps) {
  return <RNText {...rest} style={[typography[variant], { color: colors[color] }, style]} />;
}

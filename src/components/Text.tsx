import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, typography, type ColorToken, type TextVariant } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: ColorToken;
};

export function Text({ variant = 'body', color = 'text', style, ...rest }: TextProps) {
  // Large system font sizes are honoured up to 1.3x; beyond that stat rows and tab labels would overflow.
  return (
    <RNText
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[typography[variant], { color: colors[color] }, style]}
    />
  );
}

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { t } from '@/lib/i18n';
import { colors, radii, sizes, spacing, typography } from '@/theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  icon?: IconName;
  /** Trailing unit such as "cm" or "kg". */
  suffix?: string;
};

export function Input({ label, error, icon, suffix, secureTextEntry, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isSecret = !!secureTextEntry;

  return (
    <View style={styles.wrap}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <View
        style={[
          styles.field,
          focused && { borderColor: colors.accent },
          !!error && { borderColor: colors.danger },
        ]}
      >
        {icon ? <Icon name={icon} color="textMuted" /> : null}
        <TextInput
          {...rest}
          accessibilityLabel={label}
          secureTextEntry={isSecret && hidden}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={styles.input}
        />
        {suffix ? (
          <Text variant="body" color="textMuted">
            {suffix}
          </Text>
        ) : null}
        {isSecret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('auth.showPassword') : t('auth.hidePassword')}
            onPress={() => setHidden((h) => !h)}
            hitSlop={spacing.md}
          >
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} color="textMuted" />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: sizes.inputHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { ...typography.body, flex: 1, color: colors.text, height: '100%' },
});

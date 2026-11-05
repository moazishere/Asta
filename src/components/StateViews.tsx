import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { t } from '@/lib/i18n';
import { colors, spacing } from '@/theme';

// The three states every data screen needs besides "has data": loading, failed, and nothing yet.

export function LoadingView() {
  return (
    <View style={styles.center} accessible accessibilityLabel={t('common.loading')}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <Icon name="cloud-offline-outline" size="iconLg" color="textMuted" />
      <Text color="textMuted" style={styles.text} accessibilityLiveRegion="polite">
        {message}
      </Text>
      <Button label={t('common.retry')} variant="ghost" onPress={onRetry} />
    </View>
  );
}

export function EmptyView({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View style={styles.center}>
      <Icon name={icon} size="iconLg" color="textMuted" />
      <Text variant="title">{title}</Text>
      {body ? (
        <Text color="textMuted" style={styles.text}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  text: { textAlign: 'center' },
});

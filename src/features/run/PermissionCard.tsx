import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

type Props =
  | { kind: 'foreground'; onAllow: () => void }
  | { kind: 'foregroundDenied'; onOpenSettings: () => void }
  | { kind: 'background'; onContinue: () => void; onSkip: () => void };

// Location is asked in two steps, each with its own explanation: first "while using the app", and
// only when the user is about to run, "always" so tracking survives a locked screen.
export function PermissionCard(props: Props) {
  const copy = {
    foreground: {
      title: t('run.permissionTitle'),
      body: t('run.permissionBody'),
      icon: 'location-outline' as const,
    },
    foregroundDenied: {
      title: t('run.permissionTitle'),
      body: t('run.permissionDeniedBody'),
      icon: 'location-outline' as const,
    },
    background: {
      title: t('run.backgroundTitle'),
      body: t('run.backgroundBody'),
      icon: 'lock-closed-outline' as const,
    },
  }[props.kind];

  return (
    <Card style={styles.card}>
      <Icon name={copy.icon} size="iconLg" color="accent" />
      <Text variant="h2">{copy.title}</Text>
      <Text color="textMuted">{copy.body}</Text>
      <View style={styles.actions}>
        {props.kind === 'foreground' ? (
          <Button label={t('run.permissionAllow')} onPress={props.onAllow} />
        ) : null}
        {props.kind === 'foregroundDenied' ? (
          <Button label={t('run.permissionOpenSettings')} onPress={props.onOpenSettings} />
        ) : null}
        {props.kind === 'background' ? (
          <>
            <Button label={t('run.backgroundContinue')} onPress={props.onContinue} />
            <Button label={t('run.backgroundSkip')} variant="ghost" onPress={props.onSkip} />
          </>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  actions: { gap: spacing.md, paddingTop: spacing.sm },
});

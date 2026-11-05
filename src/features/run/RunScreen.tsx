import * as Location from 'expo-location';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, View } from 'react-native';

import {
  estimateKcal,
  formatDuration,
  formatKm,
  formatPace,
  paceSecPerKm,
  type LatLng,
} from './geo';
import { gpsTone, useElapsedSeconds, useRunTicker } from './hooks';
import { PermissionCard } from './PermissionCard';
import {
  getLocationAccess,
  isExpoGo,
  requestBackgroundAccess,
  requestForegroundAccess,
  type LocationAccess,
} from './permissions';
import { finish, pause, resume, startRun } from './runController';
import { useRunStore } from './runStore';
import { summaryHref } from './routes';
import { RunMap } from './RunMap';
import {
  Button,
  Card,
  RoundButton,
  Screen,
  StartBar,
  StatRow,
  StatusPill,
  Text,
} from '@/components';
import { useProfile } from '@/features/auth/useProfile';
import { t } from '@/lib/i18n';
import { radii, sizes, spacing } from '@/theme';

// Ask about background access at most once per app session; the user can always say "Not now".
let backgroundExplained = false;

export function RunScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { data: profile } = useProfile();

  const phase = useRunStore((s) => s.phase);
  const active = phase !== 'idle';

  const [access, setAccess] = useState<LocationAccess | null>(null);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [askBackground, setAskBackground] = useState(false);
  const [starting, setStarting] = useState(false);

  const refreshAccess = useCallback(async () => {
    const next = await getLocationAccess();
    setAccess(next);
    return next;
  }, []);

  // Re-check when the screen loads and when the user comes back from the system Settings app.
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      void getLocationAccess().then((next) => {
        if (!cancelled) setAccess(next);
      });
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // Centre the idle map on where the user is.
  const foregroundGranted = access?.foreground === 'granted';
  useEffect(() => {
    if (!foregroundGranted) return;
    let cancelled = false;
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(
        (p) =>
          !cancelled && setCenter({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [foregroundGranted]);

  // The floating tab bar would cover the run controls, so hide it for the duration of a run.
  useLayoutEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: active ? 'none' : 'flex' } });
  }, [navigation, active]);

  async function begin() {
    setStarting(true);
    try {
      await startRun(profile?.weight_kg ?? 70);
    } catch {
      Alert.alert(t('common.genericError'));
    } finally {
      setStarting(false);
    }
  }

  async function onStartPressed() {
    if (!isExpoGo && access?.background !== 'granted' && !backgroundExplained) {
      setAskBackground(true);
      return;
    }
    await begin();
  }

  async function onBackground(allow: boolean) {
    backgroundExplained = true;
    setAskBackground(false);
    if (allow) {
      await requestBackgroundAccess();
      await refreshAccess();
    }
    await begin(); // a run works either way; "always" only makes it survive a locked screen
  }

  async function onEndPressed() {
    Alert.alert(t('run.endConfirmTitle'), t('run.endConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('run.endConfirmYes'),
        onPress: async () => {
          const id = await finish();
          if (id) router.push(summaryHref(id));
          else Alert.alert(t('run.tooShort'));
        },
      },
    ]);
  }

  if (!access) return <Screen scroll={false}>{null}</Screen>;

  if (active) {
    return (
      <Screen scroll={false}>
        <ActiveRun
          onTogglePause={() => (phase === 'paused' ? resume() : pause())}
          onEnd={onEndPressed}
        />
      </Screen>
    );
  }

  // ---- idle -----------------------------------------------------------------------------------
  if (access.foreground !== 'granted') {
    return (
      <Screen withTabBar>
        <Text variant="display" style={styles.title}>
          {t('run.title')}
        </Text>
        {access.foreground === 'denied' && !access.canAskAgain ? (
          <PermissionCard
            kind="foregroundDenied"
            onOpenSettings={() => void Linking.openSettings()}
          />
        ) : (
          <PermissionCard
            kind="foreground"
            onAllow={async () => {
              await requestForegroundAccess();
              await refreshAccess();
            }}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen scroll={false} withTabBar>
      <View style={styles.stack}>
        <Text variant="display">{t('run.title')}</Text>
        {isExpoGo ? (
          <Text variant="caption" color="textMuted">
            {t('run.previewNotice')}
          </Text>
        ) : null}

        {askBackground ? (
          <PermissionCard
            kind="background"
            onContinue={() => void onBackground(true)}
            onSkip={() => void onBackground(false)}
          />
        ) : (
          <>
            <View style={styles.map}>
              <RunMap route={[]} center={center} />
            </View>
            <StatRow
              stats={[
                { label: t('run.duration'), value: '00:00' },
                { label: t('run.avgPace'), value: '--:--', unit: t('units.paceShort') },
                { label: t('run.calories'), value: '0', unit: t('units.kcal') },
              ]}
            />
            <StartBar
              label={t('run.start')}
              onPress={() => void onStartPressed()}
              disabled={starting}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

function ActiveRun({ onTogglePause, onEnd }: { onTogglePause: () => void; onEnd: () => void }) {
  const now = useRunTicker();
  const elapsedS = useElapsedSeconds(now);

  const phase = useRunStore((s) => s.phase);
  const route = useRunStore((s) => s.route);
  const distanceM = useRunStore((s) => s.distanceM);
  const movingMs = useRunStore((s) => s.movingMs);
  const weightKg = useRunStore((s) => s.weightKg);
  const fixAt = useRunStore((s) => s.fixAt);
  const fixAcc = useRunStore((s) => s.fixAcc);
  const mode = useRunStore((s) => s.mode);

  const paused = phase === 'paused';
  const tone = gpsTone(now, fixAt, fixAcc);
  const pace = paceSecPerKm(distanceM, movingMs);

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        {paused ? (
          <StatusPill label={t('run.paused')} tone="searching" />
        ) : (
          <StatusPill
            label={
              tone === 'good'
                ? t('run.gpsGood')
                : tone === 'weak'
                  ? t('run.gpsWeak')
                  : t('run.gpsSearching')
            }
            tone={tone}
          />
        )}
        {mode === 'foreground' ? (
          <Text variant="caption" color="textMuted">
            {t('run.foregroundOnly')}
          </Text>
        ) : null}
      </View>

      <View style={styles.map}>
        <RunMap route={route} follow={!paused} />
      </View>

      <Card style={styles.distanceCard}>
        <Text variant="label" color="textMuted">
          {t('run.distance')}
        </Text>
        <View style={styles.distanceRow}>
          <Text variant="numeralLg">{formatKm(distanceM)}</Text>
          <Text variant="title" color="textMuted">
            {t('units.km')}
          </Text>
        </View>
      </Card>

      <StatRow
        stats={[
          { label: t('run.time'), value: formatDuration(elapsedS) },
          { label: t('run.pace'), value: formatPace(pace), unit: t('units.paceShort') },
          {
            label: t('run.calories'),
            value: String(estimateKcal(weightKg, distanceM)),
            unit: t('units.kcal'),
          },
        ]}
      />
      <Text variant="caption" color="textMuted" style={styles.estimate}>
        {t('summary.estimateNote')}
      </Text>

      <View style={styles.controls}>
        <RoundButton
          icon={paused ? 'play' : 'pause'}
          variant="accent"
          accessibilityLabel={paused ? t('run.resume') : t('run.pause')}
          onPress={onTogglePause}
        />
        <View style={styles.end}>
          <Button label={t('run.end')} variant="dark" onPress={onEnd} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flex: 1, gap: spacing.lg },
  title: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  map: {
    flex: 1,
    minHeight: sizes.mapMinHeight,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  distanceCard: { gap: spacing.xs, alignItems: 'center' },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  estimate: { textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  end: { flex: 1 },
});

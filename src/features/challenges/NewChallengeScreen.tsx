import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FriendPicker, typeLabel } from './components';
import { useCreateChallenge } from './hooks';
import { toTargetValue, windowFor, type StartOption } from './logic';
import { challengeHref } from './routes';
import type { ChallengeType } from './types';
import { Button, Chip, Input, Screen, ScreenHeader, SegmentedControl, Text } from '@/components';
import { parseNumber } from '@/features/food/nutrition';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

const DURATIONS = [7, 14, 30];

export function NewChallengeScreen() {
  const router = useRouter();
  const create = useCreateChallenge();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<ChallengeType>('distance');
  const [target, setTarget] = useState('');
  const [start, setStart] = useState<StartOption>('now');
  const [days, setDays] = useState('7');
  const [invited, setInvited] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const targetNumber = parseNumber(target);
  const daysNumber = parseNumber(days);
  const errors = {
    title: title.trim() === '' ? t('challenges.errorTitle') : undefined,
    target:
      Number.isFinite(targetNumber) && targetNumber > 0 ? undefined : t('challenges.errorTarget'),
    days:
      Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= 90
        ? undefined
        : t('challenges.errorDays'),
  };

  const hint = {
    distance: t('challenges.typeDistanceHint'),
    run_count: t('challenges.typeRunsHint'),
    kcal_streak: t('challenges.typeCaloriesHint'),
  }[type];
  const targetLabel = {
    distance: t('challenges.targetKm'),
    run_count: t('challenges.targetRuns'),
    kcal_streak: t('challenges.targetDays'),
  }[type];
  const suffix =
    type === 'distance'
      ? t('units.km')
      : type === 'run_count'
        ? t('challenges.unitRuns')
        : t('challenges.unitDays');

  const toggle = (id: string) =>
    setInvited((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function onCreate() {
    setSubmitted(true);
    if (errors.title || errors.target || errors.days) return;
    const window = windowFor(start, daysNumber);
    const result = await create.mutateAsync({
      title: title.trim(),
      type,
      target_value: toTargetValue(type, targetNumber),
      ...window,
      invite_user_ids: invited,
    });
    router.replace(challengeHref(result.id));
  }

  return (
    <Screen>
      <View style={styles.stack}>
        <ScreenHeader title={t('challenges.new')} onBack={() => router.back()} />

        <Input
          label={t('challenges.titleLabel')}
          value={title}
          onChangeText={setTitle}
          error={submitted ? errors.title : undefined}
          maxLength={80}
        />

        <View style={styles.group}>
          <Text variant="caption" color="textMuted">
            {t('challenges.typeLabel')}
          </Text>
          <SegmentedControl
            value={type}
            onChange={setType}
            options={[
              { value: 'distance', label: typeLabel('distance') },
              { value: 'run_count', label: typeLabel('run_count') },
              { value: 'kcal_streak', label: typeLabel('kcal_streak') },
            ]}
          />
          <Text variant="caption" color="textMuted">
            {hint}
          </Text>
        </View>

        <Input
          label={targetLabel}
          suffix={suffix}
          value={target}
          onChangeText={setTarget}
          error={submitted ? errors.target : undefined}
          keyboardType="decimal-pad"
        />

        <View style={styles.group}>
          <Text variant="caption" color="textMuted">
            {t('challenges.start')}
          </Text>
          <SegmentedControl
            value={start}
            onChange={setStart}
            options={[
              { value: 'now', label: t('challenges.startNow') },
              { value: 'tomorrow', label: t('challenges.startTomorrow') },
              { value: 'monday', label: t('challenges.startMonday') },
            ]}
          />
        </View>

        <View style={styles.group}>
          <Text variant="caption" color="textMuted">
            {t('challenges.duration')}
          </Text>
          <View style={styles.chips}>
            {DURATIONS.map((d) => (
              <Chip
                key={d}
                label={t('challenges.durationDays', { days: d })}
                selected={daysNumber === d}
                onPress={() => setDays(String(d))}
              />
            ))}
          </View>
          <Input
            label={t('challenges.daysLabel')}
            value={days}
            onChangeText={setDays}
            error={submitted ? errors.days : undefined}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>

        <View style={styles.group}>
          <Text variant="h2">{t('challenges.inviteFriends')}</Text>
          <FriendPicker selected={invited} onToggle={toggle} />
        </View>

        <Button label={t('challenges.create')} onPress={onCreate} loading={create.isPending} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xl },
  group: { gap: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.md },
});

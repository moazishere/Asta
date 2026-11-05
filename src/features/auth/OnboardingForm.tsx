import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from './AuthProvider';
import { suggestDailyKcal } from './calories';
import type { Sex } from './types';
import { profileKey } from './useProfile';
import { Button, Card, Input, Screen, SegmentedControl, Text } from '@/components';
import { ApiError, apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';
import { spacing } from '@/theme';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const toNumber = (text: string) => Number(text.trim().replace(',', '.'));

function rangeError(value: number, min: number, max: number) {
  return Number.isFinite(value) && value >= min && value <= max
    ? undefined
    : t('onboarding.errorRange', { min, max });
}

export function OnboardingForm() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [goalText, setGoalText] = useState('');
  // Until the user types their own goal, the field follows the suggestion.
  const [goalTouched, setGoalTouched] = useState(false);

  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const h = toNumber(height);
  const w = toNumber(weight);
  const by = toNumber(birthYear);
  const bodyValid =
    !rangeError(h, 100, 250) && !rangeError(w, 30, 300) && !rangeError(by, 1920, currentYear - 10);

  const suggestion = useMemo(
    () => (bodyValid ? suggestDailyKcal({ sex, weightKg: w, heightCm: h, birthYear: by }) : null),
    [bodyValid, sex, w, h, by],
  );
  const goal = goalTouched ? toNumber(goalText) : (suggestion ?? NaN);

  const errors = {
    username: !USERNAME_RE.test(username)
      ? t('onboarding.usernameInvalid')
      : usernameTaken
        ? t('onboarding.usernameTaken')
        : undefined,
    height: rangeError(h, 100, 250),
    weight: rangeError(w, 30, 300),
    birthYear: rangeError(by, 1920, currentYear - 10),
    goal: rangeError(goal, 800, 10000),
  };
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : undefined);

  async function onSubmit() {
    setSubmitted(true);
    setError(null);
    if (Object.values(errors).some(Boolean) || !session) return;

    setBusy(true);
    try {
      await apiFetch('/me/profile', {
        method: 'PATCH',
        body: {
          username,
          display_name: displayName.trim() || username,
          height_cm: h,
          weight_kg: w,
          birth_year: by,
          sex,
          daily_kcal_goal: Math.round(goal),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          complete_onboarding: true,
        },
      });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.code === 'username_taken') setUsernameTaken(true);
      else
        setError(
          t(
            err instanceof ApiError && err.code === 'network_error'
              ? 'auth.errorNetwork'
              : 'common.genericError',
          ),
        );
      return;
    }
    setBusy(false);

    // The root layout re-routes to the tabs once the refreshed profile says onboarded_at is set.
    await queryClient.invalidateQueries({ queryKey: profileKey(session.user.id) });
  }

  return (
    <Screen>
      <View style={styles.form}>
        <View style={styles.head}>
          <Text variant="h1">{t('onboarding.title')}</Text>
          <Text color="textMuted">{t('onboarding.subtitle')}</Text>
        </View>

        <Input
          label={t('onboarding.username')}
          value={username}
          onChangeText={(v) => {
            setUsername(v.toLowerCase());
            setUsernameTaken(false);
          }}
          error={show('username')}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        <Input
          label={t('onboarding.displayName')}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
        />

        <View style={styles.pair}>
          <View style={styles.half}>
            <Input
              label={t('onboarding.height')}
              suffix="cm"
              value={height}
              onChangeText={setHeight}
              error={show('height')}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.half}>
            <Input
              label={t('onboarding.weight')}
              suffix="kg"
              value={weight}
              onChangeText={setWeight}
              error={show('weight')}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <Input
          label={t('onboarding.birthYear')}
          value={birthYear}
          onChangeText={setBirthYear}
          error={show('birthYear')}
          keyboardType="number-pad"
          maxLength={4}
        />

        <View style={styles.group}>
          <Text variant="caption" color="textMuted">
            {t('onboarding.sex')}
          </Text>
          <SegmentedControl
            value={sex}
            onChange={setSex}
            options={[
              { value: 'male', label: t('onboarding.sexMale') },
              { value: 'female', label: t('onboarding.sexFemale') },
            ]}
          />
        </View>

        <Card style={styles.goalCard}>
          <Text variant="title">{t('onboarding.goalTitle')}</Text>
          {suggestion ? (
            <Text variant="caption" color="textMuted">
              {t('onboarding.goalSuggested', { kcal: suggestion })}
            </Text>
          ) : null}
          <Input
            label={t('onboarding.goalLabel')}
            suffix="kcal"
            value={goalTouched ? goalText : suggestion ? String(suggestion) : ''}
            onChangeText={(v) => {
              setGoalTouched(true);
              setGoalText(v);
            }}
            error={show('goal')}
            keyboardType="number-pad"
          />
        </Card>

        {error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button label={t('onboarding.finish')} onPress={onSubmit} loading={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  head: { gap: spacing.sm, paddingTop: spacing.lg },
  pair: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  group: { gap: spacing.sm },
  goalCard: { gap: spacing.md },
});

import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Button,
  Card,
  Icon,
  Input,
  ListRow,
  ProgressBar,
  ProgressRing,
  RoundButton,
  Screen,
  SectionHeader,
  SegmentedControl,
  StartBar,
  StatRow,
  StatusPill,
  Text,
} from '@/components';
import { colors, spacing, typography, type TextVariant } from '@/theme';

// Dev-only (guarded by __DEV__ in the root layout). Dev tooling, so strings are not translated.
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" color="textMuted">
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

export default function Gallery() {
  const [seg, setSeg] = useState('active');
  const [text, setText] = useState('');
  return (
    <Screen>
      <View style={styles.stack}>
        <Text variant="display">Gallery</Text>

        <Section title="Colours">
          <View style={styles.swatches}>
            {Object.entries(colors).map(([name, value]) => (
              <View key={name} style={styles.swatch}>
                <View style={[styles.chip, { backgroundColor: value }]} />
                <Text variant="label" color="textMuted">
                  {name}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Typography">
          {(Object.keys(typography) as TextVariant[]).map((v) => (
            <Text key={v} variant={v}>
              {v} 24.6 km
            </Text>
          ))}
        </Section>

        <Section title="Buttons">
          <Button label="Primary" icon="walk" />
          <Button label="Dark" variant="dark" />
          <Button label="Light" variant="light" />
          <Button label="Ghost" variant="ghost" />
          <Button label="Loading" loading />
          <Button label="Disabled" disabled />
          <View style={styles.row}>
            <RoundButton icon="menu" accessibilityLabel="Menu" />
            <RoundButton icon="locate-outline" accessibilityLabel="Locate" variant="light" />
            <RoundButton icon="pause" accessibilityLabel="Pause" variant="accent" />
          </View>
          <StartBar label="Start My Run" onPress={() => undefined} />
        </Section>

        <Section title="Inputs">
          <Input label="Email" icon="mail-outline" value={text} onChangeText={setText} />
          <Input label="Password" icon="lock-closed-outline" secureTextEntry value="secret" />
          <Input label="Height" suffix="cm" error="Enter a value between 100 and 250." />
        </Section>

        <Section title="Stats">
          <StatRow
            stats={[
              { label: 'Duration', value: '01:15:42' },
              { label: 'Avg Pace', value: '5:42', unit: '/km' },
              { label: 'Calories', value: '568', unit: 'kcal' },
            ]}
          />
        </Section>

        <Section title="Progress">
          <View style={styles.row}>
            <ProgressRing progress={0.68} size={110}>
              <Icon name="walk" color="accent" size="iconLg" />
            </ProgressRing>
            <View style={styles.grow}>
              <ProgressBar progress={0.4} />
            </View>
          </View>
        </Section>

        <Section title="Lists, avatars, pills">
          <ListRow
            leading={<Avatar name="Sara" ring />}
            title="Sara"
            subtitle="12.4 km this week"
            value="1st"
            highlight
          />
          <ListRow
            leading={<Avatar name="Omar" />}
            title="Omar"
            subtitle="9.8 km"
            onPress={() => undefined}
          />
          <View style={styles.row}>
            <StatusPill label="GPS signal good" tone="good" />
            <StatusPill label="Weak signal" tone="weak" />
          </View>
          <SegmentedControl
            value={seg}
            onChange={setSeg}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'finished', label: 'Finished' },
            ]}
          />
          <SectionHeader title="Section" actionLabel="See all" onAction={() => undefined} />
          <Card tone="light">
            <Text color="textOnLight">Light card</Text>
          </Card>
        </Section>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.xxxl, paddingBottom: spacing.huge },
  section: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatch: { width: 84, gap: spacing.xs },
  chip: { height: 40, borderRadius: spacing.md, borderWidth: 1, borderColor: colors.border },
});

import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';

import { TabBar } from '@/components';
import { useRunStore } from '@/features/run/runStore';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

// Platform split: on iOS the tabs are the system's own tab bar (UITabBarController), so on iOS 26+ it
// is real Liquid Glass with the native selection lens and scroll-to-minimize, and on older iOS it is the
// standard translucent bar. Android has no equivalent, so it keeps the custom floating bar.
export default function TabsLayout() {
  return Platform.OS === 'ios' ? <IosTabs /> : <AndroidTabs />;
}

function IosTabs() {
  // The run controls need the bottom of the screen, so the bar slides away during a run.
  const running = useRunStore((s) => s.phase !== 'idle');
  return (
    <NativeTabs
      hidden={running}
      tintColor={colors.accent}
      iconColor={{ default: colors.textMuted, selected: colors.accent }}
      labelStyle={{ default: { color: colors.textMuted }, selected: { color: colors.accent } }}
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label>{t('tabs.home')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="run">
        <NativeTabs.Trigger.Icon sf={{ default: 'figure.run', selected: 'figure.run' }} />
        <NativeTabs.Trigger.Label>{t('tabs.run')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="food">
        <NativeTabs.Trigger.Icon sf={{ default: 'fork.knife', selected: 'fork.knife' }} />
        <NativeTabs.Trigger.Label>{t('tabs.food')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="challenges">
        <NativeTabs.Trigger.Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} />
        <NativeTabs.Trigger.Label>{t('tabs.challenges')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function AndroidTabs() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="run" options={{ title: t('tabs.run') }} />
      <Tabs.Screen name="food" options={{ title: t('tabs.food') }} />
      <Tabs.Screen name="challenges" options={{ title: t('tabs.challenges') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}

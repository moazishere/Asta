import { Tabs } from 'expo-router';

import { TabBar } from '@/components';
import { t } from '@/lib/i18n';

export default function TabsLayout() {
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

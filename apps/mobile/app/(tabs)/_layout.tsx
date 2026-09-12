import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeIcon, SavingsIcon, UserIcon } from '../../src/components/Icons';
import { C, TABBAR_H } from '../../src/theme';

/** Bottom tab bar: Home · Savings · Account (mirrors `.tabbar` in the web app). */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accentInk,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: {
          backgroundColor: C.card,
          borderTopWidth: 1,
          borderTopColor: C.line,
          height: TABBAR_H + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarItemStyle: { gap: 3 },
        sceneStyle: { backgroundColor: C.page },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeIcon size={22} stroke={color} /> }}
      />
      <Tabs.Screen
        name="savings"
        options={{ title: 'Savings', tabBarIcon: ({ color }) => <SavingsIcon size={22} stroke={color} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: ({ color }) => <UserIcon size={22} stroke={color} /> }}
      />
    </Tabs>
  );
}

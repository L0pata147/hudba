import { View } from 'react-native';
import { Tabs } from 'expo-router';
// expo-router vendors react-navigation; the default tab bar lives here.
import { BottomTabBar } from 'expo-router/build/react-navigation/bottom-tabs';
import { Heart, House, Library, Search } from 'lucide-react-native';
import { useCurrentItem } from '@sonora/core';
import { useTheme } from '../../src/theme';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { ToastHost } from '../../src/components/hosts';

export default function TabsLayout() {
  const t = useTheme();
  const hasItem = Boolean(useCurrentItem());
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: t.textPrimary,
          tabBarInactiveTintColor: t.textMuted,
          tabBarStyle: { backgroundColor: t.bgElevated, borderTopColor: t.border },
          tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
          sceneStyle: { backgroundColor: t.bg },
        }}
        tabBar={(props) => (
          <View>
            <MiniPlayer />
            <BottomTabBar {...props} />
          </View>
        )}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <House color={color} size={24} /> }} />
        <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color }) => <Search color={color} size={24} /> }} />
        <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ color }) => <Library color={color} size={24} /> }} />
        <Tabs.Screen name="favorites" options={{ title: 'Favorites', tabBarIcon: ({ color }) => <Heart color={color} size={24} /> }} />
      </Tabs>
      <ToastHost bottom={hasItem ? 150 : 96} />
    </View>
  );
}

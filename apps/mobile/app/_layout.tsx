import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createQueryClient, restoreQueueFromServer, useSession } from '@sonora/core';
import { initPlatform } from '../src/platform';
import { useTheme } from '../src/theme';
import { ActionSheetHost, AddToPlaylistHost, PromptHost } from '../src/components/hosts';
import LoginScreen from '../src/screens/Login';
import { UpdateBanner, useAutoUpdateCheck } from '../src/components/UpdateBanner';

const queryClient = createQueryClient();
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'sonora.query-cache', throttleTime: 2000 });
const PERSISTED = new Set(['albums', 'album', 'artists', 'artist', 'playlists', 'playlist', 'starred', 'genres']);

function Root() {
  const t = useTheme();
  const session = useSession((s) => s.session);
  useAutoUpdateCheck();
  useEffect(() => {
    if (session) void restoreQueueFromServer();
    else queryClient.clear();
  }, [session]);
  if (!session)
    return (
      <>
        <LoginScreen />
        <UpdateBanner />
      </>
    );
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: true, gestureDirection: 'vertical' }} />
        <Stack.Screen name="queue" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
      <ActionSheetHost />
      <AddToPlaylistHost />
      <PromptHost />
      <UpdateBanner />
    </>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const t = useTheme();
  useEffect(() => {
    void initPlatform().finally(() => setReady(true));
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <SafeAreaProvider>
        <StatusBar style={t.light ? 'dark' : 'light'} />
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 7 * 24 * 3600_000, dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])) } }}
        >
          {ready ? (
            <Root />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={t.accent} />
            </View>
          )}
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

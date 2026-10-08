import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from '@sonora/core';
import { useUpdater } from '../platform/updater';
import { useTheme } from '../theme';
import { T } from './ui';

/** Looks for a new build a few seconds after start-up (Settings → About → Updates). */
export function useAutoUpdateCheck() {
  const auto = usePreferences((s) => s.autoUpdate);
  useEffect(() => {
    if (!auto) return;
    const id = setTimeout(() => void useUpdater.getState().check({ quiet: true }), 6000);
    return () => clearTimeout(id);
  }, [auto]);
}

/** "New version" bar at the top of the app. */
export function UpdateBanner() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { status, version, progress, dismissed, install, dismiss } = useUpdater();
  const busy = status === 'downloading' || status === 'installing';
  if (dismissed || !(status === 'available' || busy)) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 8, zIndex: 50, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: t.surfaceActive, elevation: 8 }}
    >
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '700' }}>New version {version}</T>
        <T variant="caption" dim={1}>
          {status === 'downloading' ? `Downloading… ${Math.round(progress * 100)} %` : status === 'installing' ? 'Opening the installer…' : 'Downloads and installs over this one.'}
        </T>
      </View>
      {!busy && (
        <>
          <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Later" style={{ paddingHorizontal: 10, height: 36, justifyContent: 'center' }}>
            <T variant="caption" dim={1}>Later</T>
          </Pressable>
          <Pressable onPress={() => void install()} accessibilityRole="button" accessibilityLabel="Update" style={{ paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: t.accent }}>
            <T variant="caption" style={{ fontWeight: '700', color: t.onAccent }}>Update</T>
          </Pressable>
        </>
      )}
    </View>
  );
}

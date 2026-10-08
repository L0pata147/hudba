import type { ReactNode } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccentColor, Preferences, StreamQuality, ThemeMode } from '@sonora/types';
import { SKINS, accents } from '@sonora/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { downloadsStore, preferencesStore, resetForLogout, toast, useDownloads, usePreferences, useSession } from '@sonora/core';
import { formatBytes, pluralize } from '@sonora/utils';
import { BackButton, TopInset } from '../src/components/Screen';
import { Button, T } from '../src/components/ui';
import { useTheme } from '../src/theme';
import { useUpdater } from '../src/platform/updater';

const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => preferencesStore.getState().set(k, v);

function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: 14, padding: 16, gap: 14 }}>
      <T variant="title" accessibilityRole="header">{title}</T>
      {children}
    </View>
  );
}

function Row({ label, detail, children }: { label: string; detail?: string; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {detail ? <T variant="caption" dim={1}>{detail}</T> : null}
      </View>
      {children}
    </View>
  );
}

function Choice<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ checked: value === o.value }} style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: value === o.value ? t.textPrimary : t.surfaceHover }}>
          <T variant="caption" style={{ fontWeight: '600', color: value === o.value ? t.bg : t.textPrimary }}>{o.label}</T>
        </Pressable>
      ))}
    </View>
  );
}

export default function Settings() {
  const t = useTheme();
  const prefs = usePreferences((s) => s);
  const session = useSession((s) => s.session);
  const records = useDownloads((s) => s.records);
  const qc = useQueryClient();
  const updater = useUpdater();
  const updateDetail = {
    idle: 'New builds come from GitHub (Latest build).',
    checking: 'Checking…',
    none: 'You have the latest version.',
    available: `Version ${updater.version} is available.`,
    downloading: `Downloading… ${Math.round(updater.progress * 100)} %`,
    installing: 'Opening the installer…',
    error: `Update failed: ${updater.error ?? ''}`,
  }[updater.status];
  const done = Object.values(records).filter((r) => r.status === 'done');
  const sw = (v: boolean, k: 'gapless' | 'scrobble' | 'syncQueue' | 'compactMode') => (
    <Switch value={v} onValueChange={(x) => set(k, x)} trackColor={{ true: t.accent, false: t.surfaceActive }} thumbColor="#fff" />
  );
  return (
    <View style={{ flex: 1 }}>
      <BackButton />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 16, paddingBottom: 48 }}>
        <TopInset>
          <T variant="h1">Settings</T>
        </TopInset>
        <Section title="Account">
          <Row label={session?.credentials.username ?? ''} detail={session?.server.url} />
          <Row label="Server" detail={session?.serverInfo.serverVersion ? `Navidrome ${session.serverInfo.serverVersion}` : undefined} />
          <Button title="Log out" variant="danger" onPress={() => { resetForLogout(); qc.clear(); }} />
        </Section>
        <Section title="Playback">
          <T dim={1}>Streaming quality</T>
          <Choice<StreamQuality>
            value={prefs.streamQuality}
            onChange={(v) => set('streamQuality', v)}
            options={[{ value: 'original', label: 'Original' }, { value: '320', label: '320' }, { value: '192', label: '192' }, { value: '128', label: '128' }, { value: '96', label: '96' }]}
          />
          <Row label="Gapless (preload next track)">{sw(prefs.gapless, 'gapless')}</Row>
          <Row label="Crossfade" detail="Not supported by the mobile audio engine yet." />
          <Row label="Equalizer" detail="Available in the desktop and web app. The mobile audio engine (expo-audio) has no equalizer API yet." />
          <Row label="Scrobble plays">{sw(prefs.scrobble, 'scrobble')}</Row>
          <Row label="Sync queue with server">{sw(prefs.syncQueue, 'syncQueue')}</Row>
        </Section>
        <Section title="Appearance">
          <T dim={1} style={{ fontSize: 13 }}>Skin — a complete look for the whole app. Theme and accent apply to the Sonora skin only.</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel="Skin">
            {SKINS.map((skin) => {
              const on = (prefs.skin ?? 'sonora') === skin.id;
              return (
                <Pressable
                  key={skin.id}
                  onPress={() => set('skin', skin.id)}
                  accessibilityRole="radio"
                  accessibilityLabel={skin.name}
                  accessibilityState={{ checked: on }}
                  style={{ width: 116, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: on ? t.accent : 'transparent', backgroundColor: t.surfaceHover }}
                >
                  <LinearGradient colors={skin.background as [string, string]} style={{ height: 64, padding: 8, gap: 6 }}>
                    <View style={{ height: 8, width: 52, borderRadius: 3 * skin.radius, backgroundColor: skin.colors.textPrimary, opacity: 0.85 }} />
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 5 * skin.radius, backgroundColor: skin.colors.surfaceHover }} />
                      <View style={{ width: 22, height: 22, borderRadius: 5 * skin.radius, backgroundColor: skin.accent.soft }} />
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: skin.accent.base }} />
                    </View>
                  </LinearGradient>
                  <T numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 6 }}>{skin.name}</T>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ gap: 12, opacity: (prefs.skin ?? 'sonora') === 'sonora' ? 1 : 0.4 }} pointerEvents={(prefs.skin ?? 'sonora') === 'sonora' ? 'auto' : 'none'}>
          <Choice<ThemeMode> value={prefs.theme} onChange={(v) => set('theme', v)} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
          <View style={{ flexDirection: 'row', gap: 12 }} accessibilityRole="radiogroup" accessibilityLabel="Accent color">
            {(Object.keys(accents) as AccentColor[]).map((a) => (
              <Pressable key={a} onPress={() => set('accent', a)} accessibilityRole="radio" accessibilityLabel={accents[a].name} accessibilityState={{ checked: prefs.accent === a }} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: accents[a].base, borderWidth: prefs.accent === a ? 3 : 0, borderColor: t.textPrimary }} />
            ))}
          </View>
          </View>
          <Row label="Compact mode">{sw(prefs.compactMode, 'compactMode')}</Row>
        </Section>
        <Section title="Storage">
          <Row label="Downloads" detail={`${pluralize(done.length, 'song')} · ${formatBytes(done.reduce((s, r) => s + (r.bytes ?? 0), 0))}`} />
          <Button title="Remove all downloads" variant="secondary" onPress={() => void downloadsStore.getState().clearAll()} />
          <Button
            title="Clear cache"
            variant="secondary"
            onPress={() => {
              qc.clear();
              void AsyncStorage.removeItem('sonora.query-cache').then(() => toast.success('Cache cleared'));
            }}
          />
        </Section>
        <Section title="About">
          <Row label="Sonora" detail={`v${updater.current}`} />
          <Row label="Check for updates at start-up">
            <Switch value={prefs.autoUpdate} onValueChange={(x) => set('autoUpdate', x)} trackColor={{ true: t.accent, false: t.surfaceActive }} thumbColor="#fff" />
          </Row>
          <Row label="Updates" detail={updateDetail}>
            {updater.status === 'available' ? (
              <Button title="Update" onPress={() => void updater.install()} />
            ) : (
              <Button title="Check now" variant="secondary" loading={updater.status === 'checking'} onPress={() => void updater.check()} />
            )}
          </Row>
          <Row label="Navidrome compatibility" detail={session ? `Subsonic ${session.serverInfo.apiVersion}${session.serverInfo.openSubsonic ? ' + OpenSubsonic' : ''}` : undefined} />
          <Row label="Licenses" detail="React Native, Expo, TanStack Query, Zustand, Lucide (ISC), FlashList (MIT)" />
        </Section>
      </ScrollView>
    </View>
  );
}

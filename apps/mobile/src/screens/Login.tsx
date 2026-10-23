import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect } from 'react-native-svg';
import { AlertCircle, Check, ShieldAlert } from 'lucide-react-native';
import { describeError, NavidromeError } from '@sonora/api';
import { sessionStore, useRecentServers } from '@sonora/core';
import { validateServerUrl } from '@sonora/utils';
import { useTheme } from '../theme';
import { Button, T } from '../components/ui';

/** The bars of the Overtone mark: a spectrum visualizer mid-song, each bar in its own colour. */
const BARS = [
  { x: 12, h: 16, color: '#5CFFC8' },
  { x: 22, h: 30, color: '#5CE1FF' },
  { x: 32, h: 42, color: '#5C9BFF' },
  { x: 42, h: 24, color: '#8B6BFF' },
  { x: 52, h: 34, color: '#C25CFF' },
];

export function LogoMark({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden>
      {BARS.map((b) => (
        <Rect key={b.x} x={b.x - 3.2} y={53 - b.h} width={6.4} height={b.h} rx={3.2} fill={b.color} />
      ))}
    </Svg>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string; error?: string }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  const { label, error, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <T variant="caption" dim={1} style={{ fontWeight: '700' }}>{label}</T>
      <TextInput
        {...rest}
        accessibilityLabel={label}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholderTextColor={t.textMuted}
        style={{ height: 52, borderRadius: 10, paddingHorizontal: 16, fontSize: 16, color: t.textPrimary, backgroundColor: t.surfaceHover, borderWidth: 2, borderColor: error ? t.danger : focus ? t.accent : 'transparent' }}
      />
      {error ? <T variant="caption" style={{ color: t.danger }}>{error}</T> : null}
    </View>
  );
}

export default function LoginScreen() {
  const t = useTheme();
  const recent = useRecentServers();
  const [serverUrl, setServerUrl] = useState(recent[0]?.url ?? process.env.EXPO_PUBLIC_DEFAULT_SERVER_URL ?? '');
  const [username, setUsername] = useState(recent[0]?.username ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = serverUrl ? validateServerUrl(serverUrl) : null;

  const submit = async () => {
    setError(null);
    if (!v?.ok) return setError(v?.error ?? 'Enter your server address.');
    if (!username.trim() || !password) return setError('Enter your username and password.');
    setLoading(true);
    try {
      await sessionStore.getState().login({ serverUrl, username, password, rememberServer: remember });
    } catch (err) {
      setError(err instanceof NavidromeError && err.kind === 'network' ? 'Unable to reach the server. Check the address and your connection.' : describeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={['rgba(92,155,255,0.24)', 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 360 }} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48, gap: 18 }} keyboardShouldPersistTaps="handled">
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <LogoMark />
              <T variant="display" style={{ marginTop: 14 }}>overtone</T>
              <T dim={1} style={{ marginTop: 6, textAlign: 'center' }}>Your music, your server. Sign in to your Navidrome.</T>
            </View>
            <Field label="Server URL" placeholder="https://music.example.com" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={serverUrl} onChangeText={setServerUrl} textContentType="URL" />
            {v?.ok && v.insecure ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <ShieldAlert color={t.warning} size={14} />
                <T variant="caption" style={{ color: t.warning }}>Not encrypted — prefer https:// for servers on the internet.</T>
              </View>
            ) : null}
            <Field label="Username" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} textContentType="username" autoComplete="username" />
            <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} textContentType="password" autoComplete="current-password" onSubmitEditing={submit} returnKeyType="go" />
            <Pressable onPress={() => setRemember((r) => !r)} accessibilityRole="checkbox" accessibilityState={{ checked: remember }} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: remember ? t.accent : t.surfaceActive, alignItems: 'center', justifyContent: 'center' }}>
                {remember ? <Check color={t.onAccent} size={15} strokeWidth={3} /> : null}
              </View>
              <T dim={1}>Remember this server</T>
            </Pressable>
            {error ? (
              <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8, backgroundColor: 'rgba(255,92,108,0.12)', padding: 12, borderRadius: 10 }}>
                <AlertCircle color={t.danger} size={18} />
                <T style={{ color: t.danger, flex: 1 }}>{error}</T>
              </View>
            ) : null}
            <Button title={loading ? 'Connecting…' : 'Log in'} onPress={() => void submit()} loading={loading} />
            <T variant="caption" dim={2} style={{ textAlign: 'center' }}>Your password is never stored. The session token is kept in the device keychain.</T>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

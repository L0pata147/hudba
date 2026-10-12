import { Component, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { describeCrash, useCrashReport } from '../platform/crash-log';
import { useTheme } from '../theme';
import { T } from './ui';

function Report({ title, text, actions }: { title: string; text: string; actions: { label: string; primary?: boolean; onPress(): void }[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <T style={{ fontWeight: '700' }}>{title}</T>
      <T variant="caption" dim={1}>Share this report with whoever maintains the app — it says where it went wrong.</T>
      <ScrollView style={{ maxHeight: 220, borderRadius: 10, backgroundColor: t.bg, padding: 10 }}>
        <T variant="caption" dim={1} selectable style={{ fontFamily: 'monospace', fontSize: 11 }}>
          {text}
        </T>
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            accessibilityRole="button"
            style={{ paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: a.primary ? t.accent : 'transparent' }}
          >
            <T variant="caption" style={{ fontWeight: '700', color: a.primary ? t.onAccent : t.textSecondary }}>
              {a.label}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const share = (text: string) => void Share.share({ message: `Sonora crash report\n\n${text}` }).catch(() => undefined);

/** "The app crashed last time" card, with the report to share. */
export function CrashNotice() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { text, dismiss } = useCrashReport();
  if (!text) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 8, zIndex: 60, padding: 14, borderRadius: 14, backgroundColor: t.surfaceActive, elevation: 10 }}
    >
      <Report
        title="Sonora closed unexpectedly last time"
        text={text}
        actions={[
          { label: 'Dismiss', onPress: dismiss },
          { label: 'Share report', primary: true, onPress: () => share(text) },
        ]}
      />
    </View>
  );
}

function Fallback({ error, stack, onRetry }: { error: unknown; stack?: string | null; onRetry(): void }) {
  const t = useTheme();
  const text = describeCrash(error, stack ?? undefined);
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: t.bg }}>
      <Report
        title="Something went wrong"
        text={text}
        actions={[
          { label: 'Share report', onPress: () => share(text) },
          { label: 'Try again', primary: true, onPress: onRetry },
        ]}
      />
    </View>
  );
}

/** Shows a render error with its report instead of letting it close the app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown; stack: string | null }> {
  override state = { error: null as unknown, stack: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.warn('Render error', error);
    this.setState({ stack: info.componentStack ?? null });
  }

  override render() {
    if (this.state.error) return <Fallback error={this.state.error} stack={this.state.stack} onRetry={() => this.setState({ error: null, stack: null })} />;
    return this.props.children;
  }
}

import { memo, useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Disc3, ListMusic, Music2, Pause, Play, UserRound, CloudOff } from 'lucide-react-native';
import { describeError, isNavidromeError } from '@sonora/api';
import { tryGetNavidrome } from '@sonora/core';
import { useTheme } from '../theme';

export function T({ variant = 'body', dim, style, ...rest }: TextProps & { variant?: 'display' | 'h1' | 'h2' | 'title' | 'body' | 'caption' | 'label'; dim?: 1 | 2 }) {
  const t = useTheme();
  const v = {
    display: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
    h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
    h2: { fontSize: 21, fontWeight: '700', letterSpacing: -0.3 },
    title: { fontSize: 16, fontWeight: '600' },
    body: { fontSize: 15 },
    caption: { fontSize: 13 },
    label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  }[variant] as object;
  const color = dim === 1 ? t.textSecondary : dim === 2 ? t.textMuted : t.textPrimary;
  const heading = variant === 'display' || variant === 'h1' || variant === 'h2';
  const family = heading ? t.displayFont : t.font;
  const skinStyle = [family ? { fontFamily: family } : null, heading && t.uppercase ? { textTransform: 'uppercase' as const, letterSpacing: 0.6 } : null];
  return <Text {...rest} style={[{ color }, v, ...skinStyle, style]} />;
}

/** Pressable with a subtle press-scale micro animation. */
export function Tap({ style, children, scale = 0.97, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scale?: number; children?: ReactNode }) {
  const anim = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(anim, { toValue: v, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  return (
    <Pressable onPressIn={() => to(scale)} onPressOut={() => to(1)} {...rest}>
      <Animated.View style={[style, { transform: [{ scale: anim }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

const fallbacks = { album: Disc3, artist: UserRound, playlist: ListMusic, song: Music2 };

/** Artwork with memory+disk caching (expo-image), placeholder and fade-in. */
export const Artwork = memo(function Artwork({
  coverArtId,
  uri,
  size = 300,
  kind = 'album',
  style,
  round,
}: {
  coverArtId?: string;
  uri?: string;
  size?: number;
  kind?: keyof typeof fallbacks;
  style?: StyleProp<ViewStyle>;
  round?: boolean;
}) {
  const t = useTheme();
  const src = tryGetNavidrome()?.media.coverArtUrl(coverArtId, size) ?? uri;
  const Icon = fallbacks[kind];
  return (
    <View style={[{ backgroundColor: t.surfaceHover, borderRadius: round ? 999 : 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon color={t.textMuted} size={28} strokeWidth={1.5} style={StyleSheet.absoluteFill as never} />
      {src ? <Image source={{ uri: src }} style={StyleSheet.absoluteFill} cachePolicy="memory-disk" transition={200} recyclingKey={src} contentFit="cover" /> : null}
    </View>
  );
});

export function PlayButton({ playing, loading, onPress, size = 52, label }: { playing: boolean; loading?: boolean; onPress: () => void; size?: number; label?: string }) {
  const t = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? (playing ? 'Pause' : 'Play')}
      scale={0.92}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}
    >
      {loading ? (
        <ActivityIndicator color={t.onAccent} />
      ) : playing ? (
        <Pause color={t.onAccent} fill={t.onAccent} size={size * 0.42} />
      ) : (
        <Play color={t.onAccent} fill={t.onAccent} size={size * 0.42} style={{ marginLeft: 3 }} />
      )}
    </Tap>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: ReactNode; loading?: boolean; disabled?: boolean }) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent : variant === 'secondary' ? t.surfaceHover : variant === 'danger' ? 'rgba(255,92,108,0.15)' : 'transparent';
  const fg = variant === 'primary' ? t.onAccent : variant === 'danger' ? t.danger : t.textPrimary;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{ height: 48, paddingHorizontal: 22, borderRadius: 999, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={{ color: fg, fontSize: 15, fontWeight: '700' }}>{title}</Text>
    </Tap>
  );
}

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const anim = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View accessibilityElementsHidden style={[{ backgroundColor: t.surfaceHover, borderRadius: 8, opacity: anim }, style]} />;
}

export function RowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={{ paddingHorizontal: 16, gap: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Skeleton style={{ width: 48, height: 48 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ height: 12, width: '60%' }} />
            <Skeleton style={{ height: 10, width: '35%' }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      {icon}
      <T variant="h2" style={{ textAlign: 'center', marginTop: 8 }}>{title}</T>
      {message ? <T dim={1} style={{ textAlign: 'center' }}>{message}</T> : null}
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTheme();
  const network = isNavidromeError(error) && (error.kind === 'network' || error.kind === 'timeout');
  return (
    <EmptyState
      icon={<CloudOff color={t.danger} size={36} />}
      title={network ? 'Unable to connect to your music server.' : 'Something went wrong'}
      message={network ? 'Check your connection and try again.' : describeError(error)}
      action={onRetry ? <Button title="Retry" variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

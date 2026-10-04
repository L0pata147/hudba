import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Image } from 'expo-image';
import type { Song } from '@sonora/types';
import { BG_COLOR, sampleLevel, tryGetNavidrome, useLyrics, usePlayer, type ScenePaint, type SceneSlot } from '@sonora/core';
import { rgbToCss, type RGB } from '@sonora/ui';
import { useCoverMosaic } from '../../visualizer/palette';

/** What the UI-thread frame callback publishes every frame. */
export interface VisOut {
  paths: string[];
  alphas: number[];
  levels: number[];
  bass: number;
  kick: number;
  pulse: number;
  shakeX: number;
  shakeY: number;
  t: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const lighten = (c: RGB, d = 70): RGB => ({ r: Math.min(255, c.r + d), g: Math.min(255, c.g + d), b: Math.min(255, c.b + d) });
const mix = (a: RGB, b: RGB): RGB => ({ r: (a.r + b.r) >> 1, g: (a.g + b.g) >> 1, b: (a.b + b.b) >> 1 });

/* ------------------------------------------------------------------ */
/* Path scenes (ring, bars, mirror, scope, terrain, tunnel, galaxy)    */
/* ------------------------------------------------------------------ */

function SlotPath({ out, slot, paint }: { out: SharedValue<VisOut>; slot: SceneSlot; paint: string }) {
  const { path, mode, alpha } = slot;
  const boost = slot.boost ?? 0;
  const props = useAnimatedProps(() => {
    const o = out.value;
    const a = Math.min(1, alpha * (o.alphas[path] ?? 1) * (1 + o.kick * boost));
    return { d: o.paths[path] || 'M0 0', strokeOpacity: a, fillOpacity: mode === 'both' ? Math.min(1, a * 0.94) : a };
  });
  if (mode === 'fill') return <AnimatedPath animatedProps={props} fill={paint} />;
  return (
    <AnimatedPath
      animatedProps={props}
      fill={mode === 'both' ? BG_COLOR : 'none'}
      stroke={paint}
      strokeWidth={slot.width ?? 1}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

export function SlotLayer({ slots, out, c1, c2, w, h }: { slots: SceneSlot[]; out: SharedValue<VisOut>; c1: RGB; c2: RGB; w: number; h: number }) {
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: out.value.shakeX }, { translateY: out.value.shakeY }] }));
  const paint = (p: ScenePaint) => (p === 'c1' ? rgbToCss(c1) : p === 'c2' ? rgbToCss(c2) : p === 'white' ? '#fff' : `url(#${p})`);
  const grad = (id: string, x2: number, y1: number, a: RGB, b: RGB, y2 = 0) => (
    <LinearGradient id={id} x1="0" y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
      <Stop offset="0" stopColor={rgbToCss(a)} />
      <Stop offset="1" stopColor={rgbToCss(b)} />
    </LinearGradient>
  );
  return (
    <Animated.View style={[StyleSheet.absoluteFill, shake]} pointerEvents="none">
      <Svg width={w} height={h}>
        <Defs>
          {grad('gradV', 0, h, c1, c2)}
          {grad('gradH', w, 0, c1, c2)}
          {grad('gradD', w, 0, c1, c2, h)}
          {grad('core', w, 0, lighten(c1), lighten(c2), h)}
        </Defs>
        {slots.map((slot, i) => (
          <SlotPath key={i} out={out} slot={slot} paint={paint(slot.paint)} />
        ))}
      </Svg>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Liquid cover: rippling strips + pixel mosaic on beats               */
/* ------------------------------------------------------------------ */

const STRIPS = 28;

function Strip({ k, uri, S, pad, out, reduced }: { k: number; uri: string; S: number; pad: number; out: SharedValue<VisOut>; reduced: boolean }) {
  const sh = S / STRIPS;
  const style = useAnimatedStyle(() => {
    const o = out.value;
    const yn = k / STRIPS;
    const motion = reduced ? 0.2 : 1;
    const amp = S * 0.02 * (0.3 + o.bass * 1.6) * motion;
    const high = sampleLevel(o.levels, 0.75);
    const dx = (Math.sin(yn * 6 + o.t * 2.2) * amp + Math.sin(yn * 17 - o.t * 3.1) * S * 0.006 * high * (1 + o.kick)) * motion;
    return { transform: [{ translateX: dx }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', top: k * sh, left: -pad, width: S + 2 * pad, height: sh + 1, overflow: 'hidden' }, style]}>
      <Image source={{ uri }} style={{ position: 'absolute', top: -k * sh, left: 0, width: S + 2 * pad, height: S }} contentFit="fill" cachePolicy="memory-disk" />
    </Animated.View>
  );
}

export function LiquidCover({ song, out, w, h, reduced }: { song: Song; out: SharedValue<VisOut>; w: number; h: number; reduced: boolean }) {
  const S = Math.min(w, h) * 0.62;
  const pad = S * 0.06;
  const uri = tryGetNavidrome()?.media.coverArtUrl(song.coverArtId, 600);
  const mosaic = useCoverMosaic(song.coverArtId);
  const box = useAnimatedStyle(() => {
    const o = out.value;
    const s = reduced ? 1 : 1 + o.bass * 0.05 + o.kick * 0.06;
    return { transform: [{ translateX: o.shakeX }, { translateY: o.shakeY }, { scale: s }] };
  });
  const pixels = useAnimatedStyle(() => ({ opacity: !reduced && out.value.kick > 0.15 ? Math.min(1, out.value.kick * 1.1) : 0 }));
  const cell = S / 16;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: (w - S) / 2, top: (h - S) / 2, width: S, height: S, borderRadius: S * 0.04, overflow: 'hidden' }, box]}
    >
      {uri ? Array.from({ length: STRIPS }, (_, k) => <Strip key={k} k={k} uri={uri} S={S} pad={pad} out={out} reduced={reduced} />) : null}
      {mosaic && (
        <Animated.View style={[StyleSheet.absoluteFill, pixels]}>
          <Svg width={S} height={S}>
            {mosaic.map((c, i) => (
              <Rect key={i} x={(i % 16) * cell} y={Math.floor(i / 16) * cell} width={cell + 0.5} height={cell + 0.5} fill={c} />
            ))}
          </Svg>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Ambient colour fields                                               */
/* ------------------------------------------------------------------ */

function Blob({ k, color, R, w, h, out, dim, reduced }: { k: number; color: string; R: number; w: number; h: number; out: SharedValue<VisOut>; dim: number; reduced: boolean }) {
  const style = useAnimatedStyle(() => {
    const o = out.value;
    const t = reduced ? 0 : o.t;
    const x = (0.5 + 0.33 * Math.sin(t * 0.07 * (k + 1) + k * 1.3)) * w - R;
    const y = (0.5 + 0.3 * Math.cos(t * 0.053 * (k + 2) + k * 2.1)) * h - R;
    const s = (0.85 + 0.2 * Math.sin(t * 0.11 + k)) * (1 + o.bass * 0.18 + o.kick * 0.06);
    return { opacity: Math.min(1, (0.55 + o.bass * 0.3) * dim), transform: [{ translateX: x }, { translateY: y }, { scale: s }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: R * 2, height: R * 2 }, style]}>
      <Svg width={R * 2} height={R * 2}>
        <Defs>
          <RadialGradient id={`blob${k}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.8} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={R} cy={R} r={R} fill={`url(#blob${k})`} />
      </Svg>
    </Animated.View>
  );
}

export function AmbientBlobs({ out, c1, c2, w, h, dim = 1, reduced }: { out: SharedValue<VisOut>; c1: RGB; c2: RGB; w: number; h: number; dim?: number; reduced: boolean }) {
  const colors = [c1, c2, mix(c1, c2), c2, c1];
  const R = Math.max(w, h) * 0.42;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#05050a' }]} pointerEvents="none">
      {colors.map((c, k) => (
        <Blob key={k} k={k} color={rgbToCss(c)} R={R} w={w} h={h} out={out} dim={dim} reduced={reduced} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Lyric pulse                                                         */
/* ------------------------------------------------------------------ */

function Word({ text, x, out, size, glow, reduced }: { text: string; x: number; out: SharedValue<VisOut>; size: number; glow: string; reduced: boolean }) {
  const style = useAnimatedStyle(() => {
    const v = reduced ? 0 : sampleLevel(out.value.levels, x);
    const k = out.value.kick;
    return { opacity: 0.82 + v * 0.18, transform: [{ translateY: -v * 14 - k * 3 }, { scale: 1 + v * 0.08 + k * 0.04 }] };
  });
  return (
    <Animated.Text style={[{ color: '#fff', fontSize: size, fontWeight: '800', textShadowColor: glow, textShadowRadius: 16, marginHorizontal: size * 0.16 }, style]}>
      {text}
    </Animated.Text>
  );
}

export function LyricWords({ song, out, c1, immersive, reduced }: { song: Song; out: SharedValue<VisOut>; c1: RGB; immersive: boolean; reduced: boolean }) {
  const { data } = useLyrics(song);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration) || song.duration || 1;
  const lines = (data?.lines ?? []).filter((l) => l.value.trim());
  let idx = -1;
  if (data?.synced) lines.forEach((l, i) => l.start !== undefined && l.start <= position * 1000 + 250 && (idx = i));
  else if (lines.length) idx = Math.min(lines.length - 1, Math.floor((position / duration) * lines.length));
  const current = idx >= 0 ? lines[idx]!.value : lines.length && data?.synced ? '♪' : song.title;
  const before = idx > 0 ? lines[idx - 1]!.value : '';
  const after = idx >= 0 ? (lines[idx + 1]?.value ?? '') : lines.length ? (lines[0]?.value ?? '') : song.artist;
  const words = current.split(/\s+/).filter(Boolean);
  const size = immersive ? 34 : 26;
  const dimText = { color: 'rgba(255,255,255,0.45)', fontSize: immersive ? 17 : 14, fontWeight: '600' as const, textAlign: 'center' as const };
  return (
    <View pointerEvents="none" testID="lyric-pulse" style={{ position: 'absolute', left: 20, right: 20, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
      <Animated.Text numberOfLines={1} style={dimText}>{before}</Animated.Text>
      <Animated.View key={`${idx}:${current}`} entering={reduced ? undefined : FadeInDown.duration(400)} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {words.map((w, i) => (
          <Word key={i} text={w} x={0.05 + (0.85 * (i + 0.5)) / Math.max(1, words.length)} out={out} size={size} glow={rgbToCss(c1, 0.8)} reduced={reduced} />
        ))}
      </Animated.View>
      <Animated.Text numberOfLines={1} style={dimText}>{after}</Animated.Text>
    </View>
  );
}

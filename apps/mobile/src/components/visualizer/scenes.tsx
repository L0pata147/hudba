import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Image as SvgImage, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Image } from 'expo-image';
import type { Song } from '@sonora/types';
import {
  BG_COLOR,
  SCENE_COLORS,
  sampleLevel,
  sceneColor,
  sceneGradients,
  tryGetNavidrome,
  useLyrics,
  usePlayer,
  type PathSceneId,
  type SceneColor,
  type SceneGradient,
  type SceneSlot,
} from '@sonora/core';
import { rgbToCss, type RGB } from '@sonora/ui';
import { dropPath, dropRadius, droplet } from '../../visualizer/drop';

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

function SlotPath({ out, slot, paint, fill }: { out: SharedValue<VisOut>; slot: SceneSlot; paint: string; fill: string }) {
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
      fill={mode === 'both' ? fill : 'none'}
      stroke={paint}
      strokeWidth={slot.width ?? 1}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

/** Ring and the shared path scenes: every slot is one animated SVG path; gradients come from the scene. */
export function SlotLayer({
  scene,
  slots,
  out,
  c1,
  c2,
  w,
  h,
}: {
  scene: PathSceneId | null;
  slots: SceneSlot[];
  out: SharedValue<VisOut>;
  c1: RGB;
  c2: RGB;
  w: number;
  h: number;
}) {
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: out.value.shakeX }, { translateY: out.value.shakeY }] }));
  const grads = useMemo(
    () =>
      scene
        ? sceneGradients(scene, w, h, 0)
        : ({
            gradD: { kind: 'linear', x1: 0, y1: 0, x2: w, y2: h, stops: [[0, 'c1', 1], [1, 'c2', 1]] },
            core: { kind: 'linear', x1: 0, y1: 0, x2: w, y2: h, stops: [[0, 'c1light', 1], [1, 'c2light', 1]] },
          } satisfies Record<string, SceneGradient>),
    [scene, w, h],
  );
  const color = (c: SceneColor) => rgbToCss(sceneColor(c, c1, c2));
  const paint = (p: string | undefined, fallback: string) =>
    !p ? fallback : (SCENE_COLORS as string[]).includes(p) ? color(p as SceneColor) : grads[p] ? `url(#${p})` : fallback;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, shake]} pointerEvents="none">
      <Svg width={w} height={h}>
        <Defs>
          {Object.entries(grads).map(([id, g]) => {
            const stops = g.stops.map(([o, c, a], i) => <Stop key={i} offset={o} stopColor={color(c)} stopOpacity={a} />);
            return g.kind === 'linear' ? (
              <LinearGradient key={id} id={id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} gradientUnits="userSpaceOnUse">
                {stops}
              </LinearGradient>
            ) : (
              <RadialGradient key={id} id={id} cx={g.cx} cy={g.cy} r={g.r} fx={g.cx} fy={g.cy} gradientUnits="userSpaceOnUse">
                {stops}
              </RadialGradient>
            );
          })}
        </Defs>
        {slots.map((slot, i) => (
          <SlotPath key={i} out={out} slot={slot} paint={paint(slot.paint, '#fff')} fill={paint(slot.fill, BG_COLOR)} />
        ))}
      </Svg>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Liquid: a ferrofluid drop holding the cover                          */
/* ------------------------------------------------------------------ */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Droplet({ i, out, cx, cy, unit, reduced }: { i: number; out: SharedValue<VisOut>; cx: number; cy: number; unit: number; reduced: boolean }) {
  const props = useAnimatedProps(() => {
    const o = out.value;
    const d = droplet(i, o.levels, reduced ? i * 3 : o.t, o.bass, o.kick, cx, cy, unit);
    return { cx: d.x, cy: d.y, r: d.r };
  });
  return <AnimatedCircle animatedProps={props} fill="url(#liqDrop)" />;
}

/**
 * Liquid: the cover inside a ferrofluid drop whose spikes stand up with the
 * music, with a shaded rim, a highlight and droplets drifting around it, over
 * the cover flowing in the background (same look as the desktop shader).
 */
export function LiquidCover({ song, out, c1, c2, w, h, reduced }: { song: Song; out: SharedValue<VisOut>; c1: RGB; c2: RGB; w: number; h: number; reduced: boolean }) {
  const unit = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const R = dropRadius(0, 0) * unit;
  // big enough to fill the spikes too
  const C = R * 2.8;
  const uri = tryGetNavidrome()?.media.coverArtUrl(song.coverArtId, 600);
  const drop = useAnimatedProps(() => {
    const o = out.value;
    return { d: dropPath(o.levels, reduced ? 0 : o.t, reduced ? 0 : o.bass, reduced ? 0 : o.kick, cx, cy, unit) };
  });
  const glow = useAnimatedProps(() => {
    const o = out.value;
    return {
      d: dropPath(o.levels, reduced ? 0 : o.t, reduced ? 0 : o.bass, reduced ? 0 : o.kick, cx, cy, unit),
      strokeOpacity: 0.12 + (reduced ? 0 : o.bass * 0.2 + o.kick * 0.15),
    };
  });
  const ripple = useAnimatedProps(() => {
    const k = reduced ? 0 : out.value.kick;
    return { r: R * (1.05 + (1 - k) * 1.4), strokeOpacity: k * 0.6 };
  });
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: out.value.shakeX }, { translateY: out.value.shakeY }] }));
  const light = rgbToCss(lighten(c2, 90));
  return (
    <>
      <AmbientBlobs song={song} out={out} c1={c1} c2={c2} w={w} h={h} dim={0.5} reduced={reduced} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shake]}>
        <Svg width={w} height={h}>
          <Defs>
            {uri ? (
              <Pattern id="liqCover" patternUnits="userSpaceOnUse" x={cx - C / 2} y={cy - C / 2} width={C} height={C}>
                <SvgImage href={{ uri }} width={C} height={C} preserveAspectRatio="xMidYMid slice" />
              </Pattern>
            ) : null}
            <RadialGradient id="liqShade" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R * 1.8}>
              <Stop offset="0" stopColor="#000" stopOpacity={0} />
              <Stop offset="0.48" stopColor="#000" stopOpacity={0} />
              <Stop offset="0.6" stopColor="#000" stopOpacity={0.25} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.45} />
            </RadialGradient>
            <LinearGradient id="liqRim" gradientUnits="userSpaceOnUse" x1={cx - R} y1={cy - R} x2={cx + R} y2={cy + R}>
              <Stop offset="0" stopColor={light} />
              <Stop offset="0.5" stopColor={rgbToCss(c2)} />
              <Stop offset="1" stopColor={rgbToCss(c1)} />
            </LinearGradient>
            <RadialGradient id="liqSpec" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#fff" stopOpacity={0.85} />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="liqDrop" cx="38%" cy="32%" r="70%">
              <Stop offset="0" stopColor="#fff" stopOpacity={0.95} />
              <Stop offset="0.25" stopColor={light} />
              <Stop offset="0.7" stopColor={rgbToCss(c2)} />
              <Stop offset="1" stopColor={rgbToCss(c1)} stopOpacity={0.9} />
            </RadialGradient>
          </Defs>
          <AnimatedCircle animatedProps={ripple} cx={cx} cy={cy} fill="none" stroke="#fff" strokeWidth={3} />
          <AnimatedPath animatedProps={glow} fill="none" stroke={rgbToCss(c2)} strokeWidth={22} strokeLinejoin="round" />
          <AnimatedPath animatedProps={drop} fill={uri ? 'url(#liqCover)' : rgbToCss(c2)} />
          <AnimatedPath animatedProps={drop} fill="url(#liqShade)" />
          <AnimatedPath animatedProps={drop} fill="none" stroke="url(#liqRim)" strokeWidth={2.5} strokeOpacity={0.9} />
          <Ellipse cx={cx - R * 0.38} cy={cy - R * 0.5} rx={R * 0.3} ry={R * 0.13} fill="url(#liqSpec)" transform={`rotate(-32 ${cx - R * 0.38} ${cy - R * 0.5})`} />
          <Ellipse cx={cx + R * 0.45} cy={cy + R * 0.55} rx={R * 0.12} ry={R * 0.05} fill="url(#liqSpec)" opacity={0.5} transform={`rotate(-32 ${cx + R * 0.45} ${cy + R * 0.55})`} />
          {[0, 1, 2, 3].map((i) => (
            <Droplet key={i} i={i} out={out} cx={cx} cy={cy} unit={unit} reduced={reduced} />
          ))}
        </Svg>
      </Animated.View>
    </>
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

function CoverLayer({ k, uri, size, w, h, out, reduced }: { k: number; uri: string; size: number; w: number; h: number; out: SharedValue<VisOut>; reduced: boolean }) {
  const style = useAnimatedStyle(() => {
    const o = out.value;
    const t = reduced ? 0 : o.t;
    const dir = k % 2 ? 1 : -1;
    const x = (0.5 + 0.28 * Math.sin(t * 0.045 * (k + 1) + k * 2.1)) * w - size / 2;
    const y = (0.5 + 0.25 * Math.cos(t * 0.037 * (k + 2) + k * 1.3)) * h - size / 2;
    const s = (1 + k * 0.22) * (1 + o.bass * 0.08 + o.kick * 0.03);
    return { transform: [{ translateX: x }, { translateY: y }, { rotate: `${t * (0.05 + k * 0.025) * dir + k * 1.7}rad` }, { scale: s }] };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, opacity: k === 0 ? 1 : 0.6 }, style]}>
      <Image source={{ uri }} style={{ width: size, height: size }} blurRadius={24} contentFit="cover" cachePolicy="memory-disk" />
    </Animated.View>
  );
}

/**
 * Flowing cover background (like Apple Music's): the cover four times, huge,
 * blurred, slowly turning and drifting; it breathes with the bass. Without a
 * cover, soft colour fields from the palette stand in.
 */
export function AmbientBlobs({ song, out, c1, c2, w, h, dim = 1, reduced }: { song: Song; out: SharedValue<VisOut>; c1: RGB; c2: RGB; w: number; h: number; dim?: number; reduced: boolean }) {
  const uri = tryGetNavidrome()?.media.coverArtUrl(song.coverArtId, 200);
  const colors = [c1, c2, mix(c1, c2), c2, c1];
  const R = Math.max(w, h) * 0.42;
  const size = Math.max(w, h) * 1.25;
  const glow = useAnimatedStyle(() => ({ opacity: Math.min(0.45, (out.value.bass * 0.25 + out.value.kick * 0.08) * dim) }));
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#05050a', overflow: 'hidden' }]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { opacity: 0.9 * dim }]}>
        {uri
          ? [0, 1, 2, 3].map((k) => <CoverLayer key={k} k={k} uri={uri} size={size} w={w} h={h} out={out} reduced={reduced} />)
          : colors.map((c, k) => <Blob key={k} k={k} color={rgbToCss(c)} R={R} w={w} h={h} out={out} dim={dim} reduced={reduced} />)}
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: rgbToCss(mix(c1, c2)) }, glow]} />
      <Svg style={StyleSheet.absoluteFill} width={w} height={h}>
        <Defs>
          <RadialGradient id="ambVignette" cx="50%" cy="50%" r="70%">
            <Stop offset="0.35" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.6 + (1 - dim) * 0.3} />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={h} fill="url(#ambVignette)" />
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Lyric pulse                                                         */
/* ------------------------------------------------------------------ */

function Word({ text, x, out, size, glow, reduced, sung }: { text: string; x: number; out: SharedValue<VisOut>; size: number; glow: string; reduced: boolean; sung: number }) {
  // 0 = still to come, 1 = being sung now, 2 = already sung
  const lit = useSharedValue(sung);
  useEffect(() => {
    lit.value = withTiming(sung, { duration: 220 });
  }, [sung, lit]);
  const style = useAnimatedStyle(() => {
    const v = reduced ? 0 : sampleLevel(out.value.levels, x);
    const k = out.value.kick;
    const active = Math.max(0, 1 - Math.abs(lit.value - 1));
    return {
      opacity: 0.38 + Math.min(1, lit.value) * 0.62,
      transform: [{ translateY: -v * 14 - k * 3 - active * (6 + out.value.bass * 6) }, { scale: 1 + v * 0.06 + k * 0.04 + active * 0.06 }],
    };
  });
  return (
    <Animated.Text
      style={[{ color: '#fff', fontSize: size, fontWeight: '800', textShadowColor: sung ? glow : 'transparent', textShadowRadius: 16, marginHorizontal: size * 0.16 }, style]}
    >
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
  // Karaoke: the line runs from its start to the next line's start, split by word length.
  const karaoke = !!data?.synced && idx >= 0;
  const start = karaoke ? (lines[idx]!.start ?? 0) : 0;
  const end = karaoke ? (lines[idx + 1]?.start ?? start + 4000) : 1;
  const progress = karaoke ? Math.min(1, Math.max(0, (position * 1000 - start) / Math.max(1, end - start))) : 1;
  const total = words.reduce((sum, w) => sum + w.length + 1, 0) || 1;
  let acc = 0;
  const state = words.map((w) => {
    const w0 = acc / total;
    acc += w.length + 1;
    const w1 = acc / total;
    return progress >= w1 ? 2 : progress > w0 ? 1 : 0;
  });
  const size = immersive ? 34 : 26;
  const dimText = { color: 'rgba(255,255,255,0.45)', fontSize: immersive ? 17 : 14, fontWeight: '600' as const, textAlign: 'center' as const };
  return (
    <View pointerEvents="none" testID="lyric-pulse" style={{ position: 'absolute', left: 20, right: 20, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
      <Animated.Text numberOfLines={1} style={dimText}>{before}</Animated.Text>
      <Animated.View key={`${idx}:${current}`} entering={reduced ? undefined : FadeInDown.duration(400)} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {words.map((w, i) => (
          <Word key={i} text={w} x={0.05 + (0.85 * (i + 0.5)) / Math.max(1, words.length)} out={out} size={size} glow={rgbToCss(c1, 0.9)} reduced={reduced} sung={karaoke ? state[i]! : 2} />
        ))}
      </Animated.View>
      <Animated.Text numberOfLines={1} style={dimText}>{after}</Animated.Text>
    </View>
  );
}

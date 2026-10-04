import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { Minimize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import type { Song } from '@sonora/types';
import { getAudioEngine, playerStore, tryGetNavidrome, usePlayer } from '@sonora/core';
import { rgbToCss, type RGB } from '@sonora/ui';
import { Artwork, T } from './ui';
import { useTheme } from '../theme';
import type { ExpoAudioEngine } from '../platform/audio-engine';
import { createAnalyser } from '../visualizer/analyser';
import { usePalette } from '../visualizer/palette';
import { BANDS, ECHOES, LAYERS, createRingState, stepRing, type RingFrame, type RingState } from '../visualizer/ring';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const HIDE_CONTROLS_MS = 2500;
const EMPTY: RingFrame = { layers: [], echoes: [], particles: ['', ''], pulse: 1, kick: 0, bass: 0, shakeX: 0, shakeY: 0 };

type Permission = 'checking' | 'granted' | 'ask' | 'blocked';

const lighten = (c: RGB, d = 70): RGB => ({ r: Math.min(255, c.r + d), g: Math.min(255, c.g + d), b: Math.min(255, c.b + d) });

/** Android only hands out the playback signal (Visualizer API) with the RECORD_AUDIO permission. */
function useSamplingPermission(): [Permission, () => void] {
  const [state, setState] = useState<Permission>(Platform.OS === 'android' ? 'checking' : 'granted');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void getRecordingPermissionsAsync().then((p) => setState(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked'));
  }, []);
  const request = useCallback(() => {
    if (state === 'blocked') {
      void Linking.openSettings();
      return;
    }
    void requestRecordingPermissionsAsync().then((p) => setState(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked'));
  }, [state]);
  return [state, request];
}

function Stroke({
  out,
  kind,
  index,
  width,
  opacity,
  boost = 0,
  stroke,
}: {
  out: SharedValue<RingFrame>;
  kind: 'layer' | 'echo';
  index: number;
  width: number;
  opacity: number;
  boost?: number;
  stroke: string;
}) {
  const props = useAnimatedProps(() => {
    const f = out.value;
    const d = kind === 'layer' ? f.layers[index] : f.echoes[index];
    return { d: d || 'M0 0', strokeOpacity: Math.min(1, opacity * (1 + f.kick * boost)) };
  });
  return <AnimatedPath animatedProps={props} stroke={stroke} strokeWidth={width} fill="none" strokeLinejoin="round" />;
}

function Dust({ out, index, color }: { out: SharedValue<RingFrame>; index: 0 | 1; color: string }) {
  const props = useAnimatedProps(() => ({ d: out.value.particles[index] || 'M0 0' }));
  return <AnimatedPath animatedProps={props} fill={color} />;
}

/**
 * Circular spectrum visualizer (mobile): the same mirrored neon ring as the
 * desktop app, drawn with react-native-svg and animated on the UI thread.
 * Audio comes from expo-audio's sample stream, analysed in JS.
 */
export function Visualizer({ song, immersive, onImmersive }: { song: Song; immersive: boolean; onImmersive: (on: boolean) => void }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const [c1, c2] = usePalette(song.coverArtId, t.accent);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [permission, requestPermission] = useSamplingPermission();
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering' || s.status === 'loading');
  const [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Analyser (JS) → shared values → frame callback (UI thread).
  const target = useSharedValue<number[]>(new Array<number>(BANDS).fill(0));
  const targetBass = useSharedValue(0);
  const fresh = useSharedValue(0);
  const beat = useSharedValue(0);
  const dims = useSharedValue({ w: 0, h: 0 });
  const state = useSharedValue<RingState | null>(null);
  const out = useSharedValue<RingFrame>(EMPTY);

  const engine = getAudioEngine() as ExpoAudioEngine | null;
  const supported = !!engine?.setSampleListener && engine.samplingSupported !== false;
  const canSample = supported && permission === 'granted';

  useEffect(() => {
    if (!canSample || !engine) return;
    const analyse = createAnalyser();
    engine.setSampleListener((frames) => {
      const a = analyse(frames);
      target.value = a.levels;
      targetBass.value = a.bass;
      fresh.value = 0.4;
      if (a.beat) beat.value = beat.value + 1;
    });
    return () => engine.setSampleListener(null);
  }, [canSample, engine, target, targetBass, fresh, beat]);

  useFrameCallback((info) => {
    if (!state.value) state.value = createRingState();
    const dt = (info.timeSincePreviousFrame ?? 16) / 1000;
    fresh.value = fresh.value - dt;
    const d = dims.value;
    if (!d.w || !d.h) return;
    out.value = stepRing(
      state.value,
      { target: target.value, targetBass: targetBass.value, fresh: fresh.value, beat: beat.value, reduced },
      dt,
      d.w,
      d.h,
    );
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
    dims.value = { w: width, h: height };
  };

  // Auto-hiding controls in immersive mode.
  const poke = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), HIDE_CONTROLS_MS);
  }, []);
  useEffect(() => {
    if (!immersive) {
      setControls(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      return;
    }
    poke();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onImmersive(false);
      return true;
    });
    return () => sub.remove();
  }, [immersive, onImmersive, poke]);
  useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), []);

  // Ken Burns drift of the blurred backdrop.
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    drift.value = withRepeat(withTiming(1, { duration: 32000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [drift, reduced]);
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1.15 + drift.value * 0.17 }, { translateX: -drift.value * size.w * 0.03 }, { translateY: -drift.value * size.h * 0.02 }],
  }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: out.value.shakeX }, { translateY: out.value.shakeY }] }));
  const coverStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: out.value.shakeX }, { translateY: out.value.shakeY }, { scale: out.value.pulse }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + out.value.bass * 0.6 + out.value.kick * 0.4 }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: out.value.kick * 0.16 }));

  const base = Math.min(size.w, size.h) * 0.27;
  const cover = base * 2 * 0.92;
  const backdrop = tryGetNavidrome()?.media.coverArtUrl(song.coverArtId, 300);
  const core1 = rgbToCss(lighten(c1));
  const core2 = rgbToCss(lighten(c2));

  return (
    <View
      testID="visualizer"
      onLayout={onLayout}
      style={[styles.root, immersive ? StyleSheet.absoluteFill : { borderRadius: 16 }]}
    >
      {immersive && <StatusBar hidden animated />}
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        {backdrop ? <Image source={{ uri: backdrop }} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} blurRadius={30} contentFit="cover" cachePolicy="memory-disk" /> : null}
      </Animated.View>
      {size.w > 0 && (
        <>
          <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
            <Defs>
              <RadialGradient id="vignette" cx="50%" cy="50%" r="75%">
                <Stop offset="0.35" stopColor="#000" stopOpacity={0.15} />
                <Stop offset="1" stopColor="#000" stopOpacity={0.85} />
              </RadialGradient>
            </Defs>
            <Rect width={size.w} height={size.h} fill="url(#vignette)" />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, glowStyle]} pointerEvents="none">
            <Svg width={size.w} height={size.h}>
              <Defs>
                <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0.3" stopColor={rgbToCss(c1)} stopOpacity={0.45} />
                  <Stop offset="0.6" stopColor={rgbToCss(c2)} stopOpacity={0.18} />
                  <Stop offset="1" stopColor={rgbToCss(c2)} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect width={size.w} height={size.h} fill="url(#glow)" />
            </Svg>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]} pointerEvents="none">
            <Svg width={size.w} height={size.h}>
              <Defs>
                <LinearGradient id="ring" x1="0" y1="0" x2={size.w} y2={size.h} gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor={rgbToCss(c1)} />
                  <Stop offset="1" stopColor={rgbToCss(c2)} />
                </LinearGradient>
                <LinearGradient id="core" x1="0" y1="0" x2={size.w} y2={size.h} gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor={core1} />
                  <Stop offset="1" stopColor={core2} />
                </LinearGradient>
              </Defs>
              <Dust out={out} index={0} color={rgbToCss(c1, 0.7)} />
              <Dust out={out} index={1} color={rgbToCss(c2, 0.7)} />
              {Array.from({ length: ECHOES }, (_, e) => (
                <Stroke key={`e${e}`} out={out} kind="echo" index={e} width={1.6} opacity={0.32 - e * 0.09} stroke="url(#ring)" />
              ))}
              {Array.from({ length: LAYERS - 1 }, (_, i) => LAYERS - 1 - i).map((l) => (
                <Stroke key={`l${l}`} out={out} kind="layer" index={l} width={1.1} opacity={0.5 - (l / LAYERS) * 0.35} stroke="url(#ring)" />
              ))}
              {/* Neon glow: wide faint strokes under a bright core. */}
              <Stroke out={out} kind="layer" index={0} width={18} opacity={0.07} boost={0.8} stroke="url(#ring)" />
              <Stroke out={out} kind="layer" index={0} width={10} opacity={0.12} boost={0.8} stroke="url(#ring)" />
              <Stroke out={out} kind="layer" index={0} width={5} opacity={0.3} boost={0.8} stroke="url(#ring)" />
              <Stroke out={out} kind="layer" index={0} width={2.2} opacity={0.95} stroke="url(#core)" />
            </Svg>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', left: (size.w - cover) / 2, top: (size.h - cover) / 2, width: cover, height: cover }, coverStyle]}
          >
            <Artwork coverArtId={song.coverArtId} size={600} kind="song" round style={{ width: cover, height: cover }} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashStyle]} />
        </>
      )}

      {/* Tap: enter fullscreen, or show the controls again while in it. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => (immersive ? poke() : onImmersive(true))}
        accessibilityRole="button"
        accessibilityLabel={immersive ? 'Show controls' : 'Visualizer fullscreen'}
      />

      {immersive && (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, bottom: 132, alignItems: 'center' }}>
            <T numberOfLines={1} style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>{song.title}</T>
            <T numberOfLines={1} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {song.artist}
            </T>
          </View>
          <View pointerEvents={controls ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, { opacity: controls ? 1 : 0 }]}>
            <Pressable
              onPress={() => onImmersive(false)}
              accessibilityRole="button"
              accessibilityLabel="Exit fullscreen"
              hitSlop={10}
              style={[styles.round, { position: 'absolute', top: 24, right: 20 }]}
            >
              <Minimize2 color="#fff" size={22} />
            </Pressable>
            <View style={styles.bar}>
              <Pressable onPress={() => (poke(), playerStore.getState().previous())} accessibilityRole="button" accessibilityLabel="Previous" hitSlop={10}>
                <SkipBack color="#fff" fill="#fff" size={26} />
              </Pressable>
              <Pressable
                onPress={() => (poke(), playerStore.getState().togglePlay())}
                accessibilityRole="button"
                accessibilityLabel={playing ? 'Pause' : 'Play'}
                style={styles.play}
              >
                {playing ? <Pause color="#000" fill="#000" size={26} /> : <Play color="#000" fill="#000" size={26} style={{ marginLeft: 3 }} />}
              </Pressable>
              <Pressable onPress={() => (poke(), playerStore.getState().next())} accessibilityRole="button" accessibilityLabel="Next" hitSlop={10}>
                <SkipForward color="#fff" fill="#fff" size={26} />
              </Pressable>
            </View>
          </View>
        </>
      )}

      {supported && (permission === 'ask' || permission === 'blocked') && (
        <View style={styles.note}>
          <T style={{ color: '#fff', fontSize: 13, textAlign: 'center' }}>
            Android only lets apps see the playing sound with the microphone permission. Sonora never records anything.
          </T>
          <Pressable onPress={requestPermission} accessibilityRole="button" style={[styles.allow, { backgroundColor: t.accent }]}>
            <T style={{ color: t.onAccent, fontWeight: '700' }}>{permission === 'blocked' ? 'Open settings' : 'Allow'}</T>
          </Pressable>
        </View>
      )}
      {!supported && (
        <View style={styles.note} pointerEvents="none">
          <T style={{ color: '#fff', fontSize: 13, textAlign: 'center' }}>This device can't share the audio signal, so the ring only idles.</T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: '#000', alignSelf: 'stretch', flex: 1 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  bar: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  note: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 10, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)' },
  allow: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999 },
});

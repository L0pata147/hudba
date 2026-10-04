import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { ChevronLeft, ChevronRight, Minimize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import type { Song, VisualizerStyle } from '@sonora/types';
import {
  PATH_SCENES,
  cycleVisualizerStyle,
  getAudioEngine,
  initPathScene,
  isPathScene,
  normalizeVisualizerStyle,
  playerStore,
  preferencesStore,
  stepPathScene,
  tryGetNavidrome,
  usePlayer,
  usePreferences,
  visualizerStyleInfo,
  type PathSceneId,
  type PathSceneState,
} from '@sonora/core';
import { rgbToCss } from '@sonora/ui';
import { Artwork, T } from './ui';
import { useTheme } from '../theme';
import type { ExpoAudioEngine } from '../platform/audio-engine';
import { createAnalyser } from '../visualizer/analyser';
import { usePalette } from '../visualizer/palette';
import { BANDS, RING_SLOTS, WAVE_POINTS, createRingState, rand, ringPaths, stepCommon, stepRing, type RingState } from '../visualizer/ring';
import { AmbientBlobs, LiquidCover, LyricWords, SlotLayer, type VisOut } from './visualizer/scenes';

const HIDE_CONTROLS_MS = 2500;
const EMPTY: VisOut = { paths: [], alphas: [], levels: [], bass: 0, kick: 0, pulse: 1, shakeX: 0, shakeY: 0, t: 0 };

type Permission = 'checking' | 'granted' | 'ask' | 'blocked';

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

const setStyle = (s: VisualizerStyle) => preferencesStore.getState().set('visualizerStyle', s);

/**
 * Full-screen-player visualizer (mobile) with switchable styles. Audio comes
 * from expo-audio's sample stream and is analysed in JS; the active style is
 * computed on the UI thread every frame (Reanimated) and drawn with
 * react-native-svg / animated views. Geometry is shared with the desktop app.
 */
export function Visualizer({ song, immersive, onImmersive }: { song: Song; immersive: boolean; onImmersive: (on: boolean) => void }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const [c1, c2] = usePalette(song.coverArtId, t.accent);
  const style = normalizeVisualizerStyle(usePreferences((s) => s.visualizerStyle), 'mobile');
  const info = visualizerStyleInfo(style);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [permission, requestPermission] = useSamplingPermission();
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering' || s.status === 'loading');
  const [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Analyser (JS) → shared values → frame callback (UI thread).
  const target = useSharedValue<number[]>(new Array<number>(BANDS).fill(0));
  const targetWave = useSharedValue<number[]>(new Array<number>(WAVE_POINTS).fill(0));
  const targetBass = useSharedValue(0);
  const fresh = useSharedValue(0);
  const beat = useSharedValue(0);
  const dims = useSharedValue({ w: 0, h: 0 });
  const styleSv = useSharedValue<string>(style);
  const shakeOn = useSharedValue(info.shake);
  const state = useSharedValue<RingState | null>(null);
  const scene = useSharedValue<PathSceneState | null>(null);
  const sceneId = useSharedValue('');
  const out = useSharedValue<VisOut>(EMPTY);

  useEffect(() => {
    styleSv.value = style;
    shakeOn.value = info.shake;
  }, [style, info.shake, styleSv, shakeOn]);

  const engine = getAudioEngine() as ExpoAudioEngine | null;
  const supported = !!engine?.setSampleListener && engine.samplingSupported !== false;
  const canSample = supported && permission === 'granted';

  useEffect(() => {
    if (!canSample || !engine) return;
    const analyse = createAnalyser();
    engine.setSampleListener((frames) => {
      const a = analyse(frames);
      target.value = a.levels;
      targetWave.value = a.wave;
      targetBass.value = a.bass;
      fresh.value = 0.4;
      if (a.beat) beat.value = beat.value + 1;
    });
    return () => engine.setSampleListener(null);
  }, [canSample, engine, target, targetWave, targetBass, fresh, beat]);

  useFrameCallback((frameInfo) => {
    if (!state.value) state.value = createRingState();
    const s = state.value;
    const dt = (frameInfo.timeSincePreviousFrame ?? 16) / 1000;
    fresh.value = fresh.value - dt;
    const d = dims.value;
    if (!d.w || !d.h) return;
    const input = { target: target.value, targetBass: targetBass.value, fresh: fresh.value, beat: beat.value, reduced, targetWave: targetWave.value };
    const id = styleSv.value;
    if (id === 'ring') {
      const f = stepRing(s, input, dt, d.w, d.h);
      out.value = { paths: ringPaths(f), alphas: [], levels: s.levels, bass: s.bass, kick: s.kick, pulse: f.pulse, shakeX: f.shakeX, shakeY: f.shakeY, t: s.t };
      return;
    }
    const step = stepCommon(s, input, dt);
    const shake = shakeOn.value && !reduced;
    let paths: string[] = [];
    let alphas: number[] = [];
    if (id === 'bars' || id === 'mirror' || id === 'scope' || id === 'terrain' || id === 'tunnel' || id === 'galaxy') {
      if (sceneId.value !== id || !scene.value) {
        scene.value = initPathScene(id as PathSceneId, 0);
        sceneId.value = id;
      }
      const o = stepPathScene(id as PathSceneId, scene.value, {
        t: s.t,
        dt: step,
        w: d.w,
        h: d.h,
        levels: s.levels,
        bass: s.bass,
        kick: s.kick,
        wave: s.wave,
        reduced,
        quality: 0,
      });
      paths = o.paths;
      alphas = o.alphas;
    }
    out.value = {
      paths,
      alphas,
      levels: s.levels,
      bass: s.bass,
      kick: s.kick,
      pulse: reduced ? 1 : 1 + s.bass * 0.06 + s.kick * 0.07,
      shakeX: shake ? (rand(s) - 0.5) * s.kick * 8 : 0,
      shakeY: shake ? (rand(s) - 0.5) * s.kick * 8 : 0,
      t: s.t,
    };
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

  const cycle = useCallback(
    (dir: 1 | -1) => {
      setStyle(cycleVisualizerStyle(normalizeVisualizerStyle(preferencesStore.getState().visualizerStyle, 'mobile'), dir, 'mobile'));
      if (immersive) poke();
    },
    [immersive, poke],
  );
  // Fullscreen: swipe left/right switches the style (outside it, swipes skip songs).
  const swipe = Gesture.Pan()
    .enabled(immersive)
    .activeOffsetX([-30, 30])
    .failOffsetY([-30, 30])
    .onEnd((e) => {
      if (e.translationX < -60) runOnJS(cycle)(1);
      else if (e.translationX > 60) runOnJS(cycle)(-1);
    });

  // Ken Burns drift of the blurred backdrop.
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    drift.value = withRepeat(withTiming(1, { duration: 32000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [drift, reduced]);
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1.15 + drift.value * 0.17 }, { translateX: -drift.value * size.w * 0.03 }, { translateY: -drift.value * size.h * 0.02 }],
  }));
  const coverStyle = useAnimatedStyle(() => {
    const o = out.value;
    const scale = info.cover === 'square' ? (reduced ? 1 : 1 + o.bass * 0.03 + o.kick * 0.05) : o.pulse;
    return { transform: [{ translateX: o.shakeX }, { translateY: o.shakeY }, { scale }] };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + out.value.bass * 0.6 + out.value.kick * 0.4 }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: out.value.kick * 0.16 }));

  const min = Math.min(size.w, size.h);
  const cover = info.cover === 'ring' ? min * 0.27 * 2 * 0.92 : info.cover === 'square' ? min * 0.3 : min * 0.16;
  const backdrop = tryGetNavidrome()?.media.coverArtUrl(song.coverArtId, 300);
  const slots = useMemo(() => (style === 'ring' ? RING_SLOTS : isPathScene(style) ? PATH_SCENES[style].slots(0) : null), [style]);

  return (
    <GestureDetector gesture={swipe}>
      <View testID="visualizer" onLayout={onLayout} style={[styles.root, immersive ? StyleSheet.absoluteFill : { borderRadius: 16 }]}>
        {immersive && <StatusBar hidden animated />}
        {info.backdrop && (
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            {backdrop ? <Image source={{ uri: backdrop }} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} blurRadius={30} contentFit="cover" cachePolicy="memory-disk" /> : null}
          </Animated.View>
        )}
        {size.w > 0 && (
          <>
            {info.backdrop && (
              <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
                <Defs>
                  <RadialGradient id="vignette" cx="50%" cy="50%" r="75%">
                    <Stop offset="0.35" stopColor="#000" stopOpacity={0.15} />
                    <Stop offset="1" stopColor="#000" stopOpacity={0.85} />
                  </RadialGradient>
                </Defs>
                <Rect width={size.w} height={size.h} fill="url(#vignette)" />
              </Svg>
            )}
            {info.glow && (
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
            )}
            {(style === 'ambient' || style === 'lyrics') && (
              <AmbientBlobs out={out} c1={c1} c2={c2} w={size.w} h={size.h} dim={style === 'lyrics' ? 0.55 : 1} reduced={reduced} />
            )}
            {slots && <SlotLayer key={style} slots={slots} out={out} c1={c1} c2={c2} w={size.w} h={size.h} />}
            {style === 'liquid' && <LiquidCover song={song} out={out} w={size.w} h={size.h} reduced={reduced} />}
            {info.cover !== 'none' && (
              <Animated.View
                pointerEvents="none"
                style={[{ position: 'absolute', left: (size.w - cover) / 2, top: (size.h - cover) / 2, width: cover, height: cover }, coverStyle]}
              >
                <Artwork
                  coverArtId={song.coverArtId}
                  size={600}
                  kind="song"
                  round={info.cover !== 'square'}
                  style={{ width: cover, height: cover, borderRadius: info.cover === 'square' ? 12 : cover / 2 }}
                />
              </Animated.View>
            )}
            {style === 'lyrics' && <LyricWords song={song} out={out} c1={c1} immersive={immersive} reduced={reduced} />}
            {info.flash && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flashStyle]} />}
          </>
        )}

        {/* Tap: enter fullscreen, or show the controls again while in it. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => (immersive ? poke() : onImmersive(true))}
          accessibilityRole="button"
          accessibilityLabel={immersive ? 'Show controls' : 'Visualizer fullscreen'}
        />

        {/* Style switcher */}
        <View
          pointerEvents={immersive && !controls ? 'none' : 'box-none'}
          style={[styles.pill, immersive ? { top: 24, left: 20 } : { top: 10, left: 10 }, { opacity: immersive && !controls ? 0 : 1 }]}
        >
          <Pressable onPress={() => cycle(-1)} accessibilityRole="button" accessibilityLabel="Previous visualizer style" hitSlop={8} style={styles.pillBtn}>
            <ChevronLeft color="#fff" size={18} />
          </Pressable>
          <T style={{ color: '#fff', fontSize: 13, fontWeight: '700', minWidth: 104, textAlign: 'center' }}>{info.name}</T>
          <Pressable onPress={() => cycle(1)} accessibilityRole="button" accessibilityLabel="Next visualizer style" hitSlop={8} style={styles.pillBtn}>
            <ChevronRight color="#fff" size={18} />
          </Pressable>
        </View>

        {immersive && (
          <>
            {style !== 'lyrics' && (
              <View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, bottom: 132, alignItems: 'center' }}>
                <T numberOfLines={1} style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>{song.title}</T>
                <T numberOfLines={1} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  {song.artist}
                </T>
              </View>
            )}
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
            <T style={{ color: '#fff', fontSize: 13, textAlign: 'center' }}>This device can&apos;t share the audio signal, so the visualizer only idles.</T>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: '#000', alignSelf: 'stretch', flex: 1 },
  pill: { position: 'absolute', flexDirection: 'row', alignItems: 'center', borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)', padding: 2 },
  pillBtn: { padding: 6, borderRadius: 999 },
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

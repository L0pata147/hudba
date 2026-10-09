import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AudioLines, Check, ChevronLeft, ChevronRight, Maximize, Minimize, SkipBack, SkipForward } from 'lucide-react';
import type { Song, VisualizerStyle } from '@sonora/types';
import {
  cycleVisualizerStyle,
  getAudioEngine,
  isPathScene,
  normalizeVisualizerStyle,
  playerStore,
  preferencesStore,
  sampleLevel,
  usePlayer,
  usePreferences,
  visualizerStyleInfo,
  visualizerStyles,
} from '@sonora/core';
import { rgbToCss } from '@sonora/ui';
import { artworkUrl } from '../../lib/artwork';
import { BeatDetector, bandLevels, bassLevel, logBands, smoothInto } from '../../lib/visualizer-math';
import { usePalette } from '../../hooks/usePalette';
import { isTauri } from '../../platform';
import type { HtmlAudioEngine } from '../../platform/audio-engine';
import { PauseGlyph, PlayGlyph } from '../ui/PlayButton';
import type { Renderer, VisFrame } from './visualizer/types';
import { createRingRenderer } from './visualizer/ring';
import { createPathRenderer } from './visualizer/paths';
import { createMilkdropRenderer } from './visualizer/milkdrop';
import { createLiquidRenderer } from './visualizer/liquid';
import { createLiquidGlRenderer } from './visualizer/liquid-gl';
import { createAmbientRenderer } from './visualizer/ambient';
import { createAmbientGlRenderer } from './visualizer/ambient-gl';
import { createTunnelGlRenderer } from './visualizer/tunnel-gl';
import { LyricPulse } from './visualizer/LyricPulse';
import { createDancerRenderer } from './visualizer/dancer';
import { DancerPanel } from './visualizer/DancerPanel';
import { useCharacters } from '../../lib/characters';

const BANDS = 72;
const WAVE = 512;
const HIDE_CONTROLS_MS = 2500;
const STYLES = visualizerStyles('desktop');

function getAnalyser(): AnalyserNode | null {
  const engine = getAudioEngine() as HtmlAudioEngine | null;
  return engine?.getVisualizerAnalyser?.() ?? null;
}

async function setNativeFullscreen(on: boolean, el: HTMLElement | null) {
  try {
    if (isTauri) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(on);
    } else if (on) {
      await el?.requestFullscreen?.();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // Fullscreen refused (e.g. no user gesture): the in-app immersive view still works.
  }
}

interface RendererOptions {
  /** cover for the liquid style */
  coverUrl: () => string | undefined;
  /** smaller cover for the blurred ambient background */
  backgroundUrl: () => string | undefined;
  /** the WebGL liquid cover could not use the image (no CORS) */
  liquid2d: boolean;
  onLiquidFallback: () => void;
  /** effect intensity 0…1 (preference) */
  intensity: () => number;
}

function createRenderer(style: VisualizerStyle, canvas: HTMLCanvasElement, o: RendererOptions): Renderer | null {
  switch (style) {
    case 'ring':
      return createRingRenderer(canvas);
    case 'milkdrop':
      return createMilkdropRenderer(canvas);
    case 'liquid':
      return (o.liquid2d ? null : createLiquidGlRenderer(canvas, o.coverUrl, o.onLiquidFallback)) ?? createLiquidRenderer(canvas, o.coverUrl);
    case 'lyrics':
      return createAmbientGlRenderer(canvas, o.backgroundUrl, 0.7) ?? createAmbientRenderer(canvas, o.backgroundUrl, 0.7);
    case 'ambient':
      return createAmbientGlRenderer(canvas, o.backgroundUrl) ?? createAmbientRenderer(canvas, o.backgroundUrl);
    case 'tunnel':
      return createTunnelGlRenderer(canvas) ?? createPathRenderer(canvas, 'tunnel');
    case 'dancer':
      return createDancerRenderer(
        canvas,
        () => {
          const c = useCharacters.getState();
          return { image: c.image, dance: c.dance };
        },
        o.intensity,
      );
    default:
      return isPathScene(style) ? createPathRenderer(canvas, style) : null;
  }
}

const setStyle = (s: VisualizerStyle) => preferencesStore.getState().set('visualizerStyle', s);

/**
 * Full-screen-player visualizer with switchable styles. The host analyses the
 * audio once per frame (spectrum, bass, beats, waveform) and hands it to the
 * renderer of the selected style; the backdrop, cover, glow and beat flash
 * around it follow the style's settings without React re-renders.
 */
export function Visualizer({ song }: { song: Song }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const palette = usePalette(song.coverArtId);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const songRef = useRef(song);
  songRef.current = song;
  const style = normalizeVisualizerStyle(usePreferences((s) => s.visualizerStyle), 'desktop');
  const info = visualizerStyleInfo(style);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const [unavailable, setUnavailable] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toggleImmersive = useCallback((on?: boolean) => {
    setImmersive((cur) => {
      const next = on ?? !cur;
      void setNativeFullscreen(next, rootRef.current);
      return next;
    });
  }, []);

  const poke = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setControls(false);
      setMenu(false);
    }, HIDE_CONTROLS_MS);
  }, []);

  const cycle = useCallback(
    (dir: 1 | -1) => {
      setStyle(cycleVisualizerStyle(normalizeVisualizerStyle(preferencesStore.getState().visualizerStyle, 'desktop'), dir, 'desktop'));
      if (immersive) poke();
    },
    [immersive, poke],
  );

  /* ---------- keys: F fullscreen, Esc leaves it, ←/→ switch styles in fullscreen ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      if ((e.key === 'f' || e.key === 'F') && plain) {
        e.preventDefault();
        toggleImmersive();
      } else if (e.key === 'Escape' && (immersive || menu)) {
        // Close the menu / leave fullscreen first instead of closing the whole player.
        e.stopImmediatePropagation();
        if (menu) setMenu(false);
        else toggleImmersive(false);
      } else if (immersive && plain && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        cycle(e.key === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [immersive, menu, toggleImmersive, cycle]);

  useEffect(() => {
    if (isTauri) return;
    const onChange = () => !document.fullscreenElement && setImmersive(false);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Leaving the player while immersive must also leave native fullscreen.
  useEffect(() => () => void setNativeFullscreen(false, null), []);

  useEffect(() => {
    if (immersive) poke();
    else {
      clearTimeout(hideTimer.current);
      setControls(true);
    }
    return () => clearTimeout(hideTimer.current);
  }, [immersive, poke]);

  const [liquid2d, setLiquid2d] = useState(false);
  useEffect(() => setGlFailed(false), [style]);

  /* ---------- render loop ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(style, canvas, {
      coverUrl: () => artworkUrl(songRef.current.coverArtId, 'hero'),
      backgroundUrl: () => artworkUrl(songRef.current.coverArtId, 'card'),
      liquid2d,
      onLiquidFallback: () => setLiquid2d(true),
      intensity: () => preferencesStore.getState().visualizerIntensity,
    });
    if (!renderer) {
      if (style === 'milkdrop' || style === 'dancer') setGlFailed(true);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const styleInfo = visualizerStyleInfo(style);
    let raf = 0;
    let last = 0;
    let bands: [number, number][] = [];
    let freq = new Uint8Array(0);
    let rawWave = new Float32Array(0);
    let lowBins: [number, number] = [1, 8];
    const levels = new Float32Array(BANDS);
    const smooth = new Float32Array(BANDS);
    const wave = new Float32Array(WAVE);
    const beats = new BeatDetector();
    let bass = 0;
    let kick = 0;
    let t = 0;
    let lastPos = -1;
    let lastPosAt = 0;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      // Cap the canvas at ~2.3 MP so fullscreen on big/HiDPI screens stays smooth.
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2_300_000 / Math.max(1, width * height)));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const frame: VisFrame = {
      t: 0,
      dt: 1 / 60,
      w: 1,
      h: 1,
      dpr: 1,
      levels: smooth,
      bass: 0,
      kick: 0,
      freq,
      wave,
      palette: paletteRef.current,
      reduced,
      shakeX: 0,
      shakeY: 0,
      pulse: 1,
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(0.05, Math.max(0.001, (now - last) / 1000)) : 1 / 60;
      last = now;
      t += dt;
      const analyser = getAnalyser();
      setUnavailable((u) => (u === !analyser ? u : !analyser));
      let beat = false;
      if (analyser) {
        if (freq.length !== analyser.frequencyBinCount) {
          freq = new Uint8Array(analyser.frequencyBinCount);
          rawWave = new Float32Array(analyser.fftSize);
          bands = logBands(analyser.fftSize, analyser.context.sampleRate, BANDS);
          const binHz = analyser.context.sampleRate / analyser.fftSize;
          lowBins = [Math.max(1, Math.floor(30 / binHz)), Math.ceil(180 / binHz)];
        }
        analyser.getByteFrequencyData(freq);
        analyser.getFloatTimeDomainData(rawWave);
        const step = rawWave.length / WAVE;
        for (let i = 0; i < WAVE; i++) wave[i] = rawWave[Math.floor(i * step)] ?? 0;
        bandLevels(freq, bands, levels);
        const b = bassLevel(freq, analyser.fftSize, analyser.context.sampleRate);
        bass += (b - bass) * (b > bass ? 0.5 : 0.08);
        beat = beats.update(freq, lowBins[0], lowBins[1], t);
      } else {
        levels.fill(0);
        wave.fill(0);
        bass *= 0.9;
      }
      smoothInto(smooth, levels);
      if (beat && !reduced) kick = 1;
      kick *= Math.pow(0.88, dt * 60);

      const cw = canvas.clientWidth || 1;
      const dpr = canvas.width / cw;
      frame.t = t;
      frame.dt = dt;
      frame.dpr = dpr;
      frame.w = canvas.width / dpr;
      frame.h = canvas.height / dpr;
      frame.bass = bass;
      frame.kick = kick;
      frame.freq = freq;
      frame.palette = paletteRef.current;
      frame.pulse = reduced ? 1 : 1 + bass * 0.06 + kick * 0.07;
      frame.shakeX = styleInfo.shake && !reduced ? (Math.random() - 0.5) * kick * 10 * dpr : 0;
      frame.shakeY = styleInfo.shake && !reduced ? (Math.random() - 0.5) * kick * 10 * dpr : 0;
      renderer.draw(frame);

      // Cover, glow, flash and lyric words follow without React re-renders.
      const cover = coverRef.current;
      if (cover) {
        const min = Math.min(frame.w, frame.h);
        const mode = styleInfo.cover;
        cover.style.display = mode === 'none' ? 'none' : '';
        if (mode !== 'none') {
          const size = mode === 'ring' ? min * 0.27 * 2 * 0.92 : mode === 'square' ? min * 0.3 : min * 0.16;
          const scale = mode === 'square' ? (reduced ? 1 : 1 + bass * 0.03 + kick * 0.05) : frame.pulse;
          cover.style.width = `${size}px`;
          cover.style.height = `${size}px`;
          cover.style.borderRadius = mode === 'square' ? '14px' : '50%';
          cover.style.transform = `translate(calc(-50% + ${frame.shakeX / dpr}px), calc(-50% + ${frame.shakeY / dpr}px)) scale(${scale})`;
        }
      }
      if (glowRef.current) glowRef.current.style.opacity = styleInfo.glow ? String(0.25 + bass * 0.6 + kick * 0.4) : '0';
      if (flashRef.current) {
        // Only composite the flash layer while it is visible.
        const flash = styleInfo.flash ? kick * 0.16 : 0;
        flashRef.current.style.opacity = String(flash);
        flashRef.current.style.visibility = flash > 0.003 ? 'visible' : 'hidden';
      }
      if (style === 'lyrics' && rootRef.current) {
        // Karaoke: estimate the playback position between the player's (≈4 Hz) updates.
        const player = playerStore.getState();
        if (player.position !== lastPos) {
          lastPos = player.position;
          lastPosAt = now;
        }
        const posMs = (lastPos + (player.status === 'playing' ? Math.min(0.6, (now - lastPosAt) / 1000) : 0)) * 1000;
        const line = rootRef.current.querySelector<HTMLElement>('[data-line-start]');
        const lineStart = line ? Number(line.dataset.lineStart) : 0;
        const lineEnd = line ? Number(line.dataset.lineEnd) : 0;
        const progress = line ? Math.min(1, Math.max(0, (posMs - lineStart) / Math.max(1, lineEnd - lineStart))) : 1;
        const words = rootRef.current.querySelectorAll<HTMLElement>('[data-word]');
        const n = words.length;
        words.forEach((el, i) => {
          const v = reduced ? 0 : sampleLevel(smooth, 0.05 + (0.85 * (i + 0.5)) / Math.max(1, n));
          const w0 = Number(el.dataset.w0);
          const w1 = Number(el.dataset.w1);
          const fill = line ? Math.min(1, Math.max(0, (progress - w0) / Math.max(0.001, w1 - w0))) : 1;
          const singing = fill > 0 && fill < 1;
          // Mostly a lift; the scale stays small so a word never grows into its neighbours.
          const lift = v * 18 + kick * 4 + (singing ? 6 + bass * 6 : 0);
          el.style.transform = `translateY(${-lift}px) scale(${1 + v * 0.06 + kick * 0.04 + (singing ? 0.05 : 0)})`;
          el.style.setProperty('--fill', fill.toFixed(3));
          if (fill > 0) el.dataset.sung = '';
          else delete el.dataset.sung;
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose?.();
    };
  }, [style, liquid2d]);

  const art = artworkUrl(song.coverArtId, 'full');
  const [c1, c2] = palette;
  const hidden = immersive && !controls;
  return (
    <div
      ref={rootRef}
      data-testid="visualizer"
      data-style={style}
      data-immersive={immersive || undefined}
      onPointerMove={immersive ? poke : undefined}
      onDoubleClick={() => toggleImmersive()}
      className={clsx(
        'overflow-hidden bg-black select-none',
        // only one position class at a time: with both, `relative` wins and the immersive view collapses to 0 px
        immersive ? 'fixed inset-0 z-[95]' : 'relative size-full min-h-[320px] rounded-xl',
        hidden && 'cursor-none',
      )}
    >
      {/* Backdrop: slow Ken Burns drift over the blurred cover, vignette and grain */}
      {/* Small image + one-off blur; only `transform` animates, which the compositor handles cheaply. */}
      {art && info.backdrop && (
        <div className="animate-kenburns absolute inset-0 will-change-transform" aria-hidden>
          <img src={artworkUrl(song.coverArtId, 'thumb') ?? art} alt="" className="size-full object-cover opacity-55 blur-2xl" />
        </div>
      )}
      {info.backdrop && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.75)_100%)]" aria-hidden />}
      <div className="film-grain absolute inset-0 opacity-[0.045]" aria-hidden />
      <div
        ref={glowRef}
        aria-hidden
        className="absolute inset-0 opacity-0"
        style={{ background: `radial-gradient(circle at 50% 50%, ${rgbToCss(c1, 0.32)} 0%, ${rgbToCss(c2, 0.12)} 35%, transparent 60%)` }}
      />
      <canvas key={`${style}${liquid2d ? '-2d' : ''}`} ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
      {style === 'scope' && (
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.22)_0px,rgba(0,0,0,0.22)_1px,transparent_1px,transparent_3px)]" aria-hidden />
      )}
      <div ref={coverRef} className="absolute top-1/2 left-1/2 overflow-hidden rounded-full shadow-[0_0_40px_rgba(0,0,0,0.6)]" style={{ display: 'none' }} aria-hidden>
        {art ? <img src={art} alt="" className="size-full object-cover" draggable={false} /> : <div className="size-full bg-surface-active" />}
      </div>
      {style === 'lyrics' && <LyricPulse song={song} color={c1} immersive={immersive} />}
      {style === 'dancer' && <DancerPanel hidden={hidden} />}
      <div ref={flashRef} className="pointer-events-none invisible absolute inset-0 bg-white opacity-0" aria-hidden />

      <div className={clsx('absolute bottom-5 left-6 max-w-[70%] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-opacity duration-500', immersive && 'bottom-10 left-10')}>
        <p className={clsx('truncate font-display leading-tight font-extrabold text-white', immersive ? 'text-[2.4rem]' : 'text-[1.5rem]')}>{song.title}</p>
        <p className={clsx('truncate font-semibold tracking-wide text-white/75 uppercase', immersive ? 'text-[18px]' : 'text-[14px]')}>{song.artist}</p>
      </div>

      {/* Style switcher: always visible in the player, auto-hiding in fullscreen */}
      <div
        onDoubleClick={(e) => e.stopPropagation()}
        className={clsx('absolute top-3 left-3 transition-opacity duration-300', hidden && 'pointer-events-none opacity-0')}
      >
        <div className="flex items-center rounded-full bg-black/45 p-1 text-white backdrop-blur-md">
          <button type="button" aria-label="Previous visualizer style" title="Previous style (← in fullscreen)" onClick={() => cycle(-1)} className="rounded-full p-1.5 hover:bg-white/10">
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Visualizer style"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            className="min-w-[8.5rem] rounded-full px-2 py-1 text-[13px] font-semibold hover:bg-white/10"
          >
            {info.name}
          </button>
          <button type="button" aria-label="Next visualizer style" title="Next style (→ in fullscreen)" onClick={() => cycle(1)} className="rounded-full p-1.5 hover:bg-white/10">
            <ChevronRight className="size-4" />
          </button>
        </div>
        {menu && (
          <div role="menu" aria-label="Visualizer styles" className="mt-2 w-52 rounded-xl bg-black/75 p-1 text-white shadow-xl backdrop-blur-md">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={s.id === style}
                onClick={() => {
                  setStyle(s.id);
                  setMenu(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[13px] hover:bg-white/10"
              >
                {s.name}
                {s.id === style && <Check className="size-4" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Controls: always visible in the player, auto-hiding in fullscreen */}
      <div className={clsx('absolute top-3 right-3 flex gap-2 transition-opacity duration-300', hidden && 'pointer-events-none opacity-0')}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleImmersive();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={immersive ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          title={immersive ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/70"
        >
          {immersive ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
        </button>
      </div>
      {immersive && (
        <div
          onDoubleClick={(e) => e.stopPropagation()}
          className={clsx(
            'absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full bg-black/45 px-5 py-2.5 text-white backdrop-blur-md transition-opacity duration-300',
            !controls && 'pointer-events-none opacity-0',
          )}
        >
          <button type="button" aria-label="Previous" onClick={() => playerStore.getState().previous()} className="rounded-full p-2 hover:bg-white/10">
            <SkipBack className="size-5" fill="currentColor" />
          </button>
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => playerStore.getState().togglePlay()}
            className="flex size-12 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
          >
            {playing ? <PauseGlyph className="size-6" /> : <PlayGlyph className="size-6 translate-x-px" />}
          </button>
          <button type="button" aria-label="Next" onClick={() => playerStore.getState().next()} className="rounded-full p-2 hover:bg-white/10">
            <SkipForward className="size-5" fill="currentColor" />
          </button>
        </div>
      )}
      {(unavailable || glFailed) && (
        <p className="absolute top-16 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[12.5px] text-white/80">
          <AudioLines className="size-4" />
          {glFailed ? `${info.name} needs WebGL 2, which this device does not offer` : 'Visualizer needs cross-origin audio from your server'}
        </p>
      )}
    </div>
  );
}

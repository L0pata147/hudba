import type { AudioEngine, AudioEngineListener, LoadOptions } from '@sonora/core';
import type { EqualizerSettings } from '@sonora/types';
import { createEqualizerChain, type EqualizerChain } from './equalizer';

export type EqualizerStatus = 'off' | 'active' | 'unavailable';

interface AudioGraph {
  ctx: AudioContext;
  chain: EqualizerChain;
  analyser: AnalyserNode;
  /** Taps the music before volume/EQ, so the visualizer looks the same at any volume. */
  visAnalyser: AnalyserNode;
  /** Per-element gain: volume/mute/crossfade are applied here once an element feeds Web Audio. */
  gains: Map<HTMLAudioElement, GainNode>;
}

const NOOP_LISTENER: AudioEngineListener = { onStatus: () => undefined, onTime: () => undefined };
const MAX_STREAM_RETRIES = 2;

/**
 * HTMLAudioElement engine with two alternating elements:
 * - the idle element preloads the next track (near-gapless transitions),
 * - crossfades ramp the outgoing element down while the new one ramps up.
 * Only the active element reports events to the player store.
 *
 * Equalizer: on first use the elements are routed through Web Audio
 * (element → gain → EQ chain → speakers). Until then playback is the plain
 * media element path. If the server does not send CORS headers, Web Audio
 * would only receive silence, so the engine falls back to plain playback
 * and reports the EQ as unavailable.
 */
export class HtmlAudioEngine implements AudioEngine {
  private elements: [HTMLAudioElement, HTMLAudioElement];
  private activeIdx = 0;
  private listener: AudioEngineListener = NOOP_LISTENER;
  private volume = 1;
  private muted = false;
  private preloadedSrc: string | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private retries = 0;
  private pendingSeek: number | null = null;
  private lastTimeEmit = 0;
  private graph: AudioGraph | null = null;
  private eq: EqualizerSettings | null = null;
  /** Server refused CORS: Web Audio (EQ) cannot be used for remote streams. */
  private corsBlocked = false;
  private corsRetrySrc: string | null = null;
  onEqualizerStatus: (status: EqualizerStatus) => void = () => undefined;

  constructor() {
    this.elements = [this.createElement(), this.createElement()];
  }

  /* ---------------- volume routing ---------------- */

  private setElementVolume(el: HTMLAudioElement, v: number) {
    const gain = this.graph?.gains.get(el);
    if (gain) {
      el.volume = 1;
      el.muted = false;
      gain.gain.value = this.muted ? 0 : v;
    } else {
      el.volume = v;
      el.muted = this.muted;
    }
  }

  private getElementVolume(el: HTMLAudioElement): number {
    const gain = this.graph?.gains.get(el);
    return gain ? (this.muted ? this.volume : gain.gain.value) : el.volume;
  }

  /* ---------------- equalizer ---------------- */

  setEqualizer(settings: EqualizerSettings): void {
    this.eq = settings;
    if (settings.enabled && !this.graph && !this.corsBlocked) this.buildGraph();
    this.graph?.chain.apply(settings);
    this.onEqualizerStatus(this.corsBlocked ? 'unavailable' : settings.enabled && this.graph ? 'active' : 'off');
  }

  private buildGraph() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'playback' });
    const chain = createEqualizerChain(ctx);
    chain.output.connect(ctx.destination);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    chain.output.connect(analyser);
    const visAnalyser = ctx.createAnalyser();
    visAnalyser.fftSize = 2048;
    visAnalyser.smoothingTimeConstant = 0.55;
    visAnalyser.minDecibels = -85;
    visAnalyser.maxDecibels = -22;
    this.graph = { ctx, chain, analyser, visAnalyser, gains: new Map() };
    if (this.eq) chain.apply(this.eq);
    for (const el of this.elements) this.attach(el);
    if (!this.active.paused) void ctx.resume();
  }

  private attach(el: HTMLAudioElement) {
    const g = this.graph;
    if (!g || g.gains.has(el)) return;
    const source = g.ctx.createMediaElementSource(el);
    const gain = g.ctx.createGain();
    source.connect(gain).connect(g.chain.input);
    source.connect(g.visAnalyser);
    g.gains.set(el, gain);
    this.setElementVolume(el, el === this.active ? this.volume : 0);
  }

  /**
   * Analyser for the visualizer. Routes playback through Web Audio on first
   * use (like the EQ). Returns null when the server does not allow CORS.
   */
  getVisualizerAnalyser(): AnalyserNode | null {
    if (!this.graph && !this.corsBlocked) {
      this.buildGraph();
      if (this.eq) this.setEqualizer(this.eq);
    }
    if (this.graph && this.graph.ctx.state !== 'running' && !this.active.paused) void this.graph.ctx.resume();
    return this.graph?.visAnalyser ?? null;
  }

  /** RMS level (0…1) of what the EQ outputs right now; null without Web Audio. Used by diagnostics/tests. */
  getOutputLevel(): number | null {
    const a = this.graph?.analyser;
    if (!a) return null;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  }

  /** The server does not allow CORS: continue without Web Audio. */
  private handleCorsBlocked(failed: HTMLAudioElement) {
    this.corsBlocked = true;
    this.onEqualizerStatus('unavailable');
    if (this.graph) {
      this.fallbackWithoutCors(failed);
      return;
    }
    // Not routed through Web Audio yet: dropping crossOrigin and reloading is enough.
    for (const el of this.elements) el.removeAttribute('crossorigin');
    const src = failed.src;
    const at = failed.currentTime;
    failed.src = src;
    this.pendingSeek = failed === this.active && at > 0 ? at : null;
    if (failed === this.active) void failed.play().catch(() => this.listener.onStatus('paused'));
    else failed.load();
  }

  /**
   * Elements that feed Web Audio cannot be "un-routed", so they are replaced
   * by fresh plain elements and the current song resumes where it was.
   */
  private fallbackWithoutCors(failed: HTMLAudioElement) {
    const src = failed.src;
    const at = failed.currentTime;
    const wasActive = failed === this.active;
    for (const el of this.elements) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    void this.graph?.ctx.close();
    this.graph = null;
    this.elements = [this.createElement(), this.createElement()];
    this.preloadedSrc = null;
    if (!wasActive) return;
    const el = this.active;
    this.pendingSeek = at > 0 ? at : null;
    el.src = src;
    this.setElementVolume(el, this.volume);
    void el.play().catch(() => this.listener.onStatus('paused'));
  }

  private get active(): HTMLAudioElement {
    return this.elements[this.activeIdx]!;
  }

  private get idle(): HTMLAudioElement {
    return this.elements[1 - this.activeIdx]!;
  }

  private createElement(): HTMLAudioElement {
    const el = new Audio();
    el.preload = 'auto';
    // Required for Web Audio (EQ). Navidrome sends Access-Control-Allow-Origin for /rest/*.
    if (!this.corsBlocked) el.crossOrigin = 'anonymous';
    const isActive = () => el === this.active;
    el.addEventListener('playing', () => {
      if (!isActive()) return;
      this.retries = 0;
      this.listener.onStatus('playing');
    });
    el.addEventListener('pause', () => {
      if (isActive() && !el.ended && el.src) this.listener.onStatus('paused');
    });
    el.addEventListener('waiting', () => {
      if (isActive() && !el.paused) this.listener.onStatus('buffering');
    });
    el.addEventListener('ended', () => {
      if (isActive()) this.listener.onStatus('ended');
    });
    el.addEventListener('loadedmetadata', () => {
      if (!isActive()) return;
      if (this.pendingSeek != null) {
        try {
          el.currentTime = this.pendingSeek;
        } catch {
          /* not seekable yet */
        }
        this.pendingSeek = null;
      }
      this.emitTime(true);
    });
    el.addEventListener('timeupdate', () => isActive() && this.emitTime(false));
    el.addEventListener('durationchange', () => isActive() && this.emitTime(true));
    el.addEventListener('progress', () => isActive() && this.emitTime(false));
    el.addEventListener('error', () => {
      if (!el.src) return;
      const err = el.error;
      // A CORS-mode request that the server rejects looks like "unsupported source".
      // Probe once to tell a CORS problem from a genuinely unplayable file.
      if (err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && el.crossOrigin && /^https?:/.test(el.src) && this.corsRetrySrc !== el.src) {
        const src = el.src;
        this.corsRetrySrc = src;
        void probeCors(src).then((ok) => {
          if (ok) {
            if (el === this.active && el.src === src) this.listener.onStatus('error', 'This format is not supported, or the file is unavailable.');
          } else if (navigator.onLine === false) {
            // Offline, not a CORS problem — let the normal error path report it.
            this.corsRetrySrc = null;
            if (el === this.active) this.listener.onStatus('error', 'The stream was interrupted.');
          } else {
            this.handleCorsBlocked(el);
          }
        });
        return;
      }
      if (!isActive()) return;
      // Interrupted stream (network hiccup, server restart): resume where we were.
      if (err && (err.code === MediaError.MEDIA_ERR_NETWORK || err.code === MediaError.MEDIA_ERR_DECODE) && this.retries < MAX_STREAM_RETRIES) {
        this.retries++;
        const at = el.currentTime;
        const src = el.src;
        this.listener.onStatus('buffering');
        setTimeout(() => {
          if (el !== this.active || el.src !== src) return;
          this.pendingSeek = at;
          el.load();
          void el.play().catch(() => undefined);
        }, 1200 * this.retries);
        return;
      }
      const message =
        err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? 'This format is not supported, or the file is unavailable.'
          : err?.code === MediaError.MEDIA_ERR_NETWORK
            ? 'The stream was interrupted.'
            : 'Playback failed.';
      this.listener.onStatus('error', message);
    });
    return el;
  }

  private emitTime(force: boolean) {
    const el = this.active;
    // A released element (no source) reports 0/NaN; that must not overwrite the player position.
    if (!el.getAttribute('src')) return;
    const now = performance.now();
    if (!force && now - this.lastTimeEmit < 200) return;
    this.lastTimeEmit = now;
    let buffered = 0;
    try {
      for (let i = 0; i < el.buffered.length; i++) {
        if (el.buffered.start(i) <= el.currentTime + 0.5) buffered = Math.max(buffered, el.buffered.end(i));
      }
    } catch {
      buffered = 0;
    }
    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    this.listener.onTime(el.currentTime, duration, buffered);
  }

  setListener(listener: AudioEngineListener): void {
    this.listener = listener;
  }

  load(src: string, opts: LoadOptions): void {
    const outgoing = this.active;
    const incoming = this.idle;
    const crossfade = opts.crossfade ?? 0;
    const fade = crossfade > 0 && !outgoing.paused && Boolean(outgoing.src);

    this.stopFade();
    if (this.preloadedSrc !== src || incoming.src !== src) {
      incoming.src = src;
    }
    this.preloadedSrc = null;
    this.activeIdx = 1 - this.activeIdx;
    this.retries = 0;
    this.setElementVolume(incoming, fade ? 0 : this.volume);

    if (opts.startAt && opts.startAt > 0) {
      if (incoming.readyState >= HTMLMediaElement.HAVE_METADATA) incoming.currentTime = opts.startAt;
      else this.pendingSeek = opts.startAt;
    } else {
      this.pendingSeek = null;
      if (incoming.currentTime !== 0) {
        try {
          incoming.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    }

    if (fade) this.crossfade(outgoing, incoming, crossfade);
    else this.release(outgoing);

    if (opts.autoplay) {
      void this.graph?.ctx.resume();
      incoming.play().catch((err: unknown) => {
        if (incoming !== this.active) return;
        // Autoplay policy: the user has to press play once.
        if (err instanceof DOMException && err.name === 'NotAllowedError') this.listener.onStatus('paused');
        else if (!(err instanceof DOMException && err.name === 'AbortError')) this.listener.onStatus('error', 'Playback failed.');
      });
    } else {
      this.listener.onStatus('paused');
    }
  }

  private release(el: HTMLAudioElement) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }

  private crossfade(outgoing: HTMLAudioElement, incoming: HTMLAudioElement, seconds: number) {
    const start = performance.now();
    const startVol = this.getElementVolume(outgoing);
    this.fadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
      // Equal-power curve keeps perceived loudness steady.
      this.setElementVolume(outgoing, startVol * Math.cos((t * Math.PI) / 2));
      this.setElementVolume(incoming, this.volume * Math.sin((t * Math.PI) / 2));
      if (t >= 1) {
        this.stopFade();
        this.release(outgoing);
        this.setElementVolume(incoming, this.volume);
      }
    }, 50);
  }

  private stopFade() {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    const idle = this.idle;
    if (idle.src && !idle.paused) this.release(idle);
    this.setElementVolume(this.active, this.volume);
  }

  play(): void {
    const el = this.active;
    if (!el.src) return;
    void this.graph?.ctx.resume();
    el.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      this.listener.onStatus('paused');
    });
  }

  pause(): void {
    this.active.pause();
  }

  seek(seconds: number): void {
    const el = this.active;
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      el.currentTime = seconds;
      this.emitTime(true);
    } else {
      this.pendingSeek = seconds;
    }
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (!this.fadeTimer) this.setElementVolume(this.active, volume);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.fadeTimer) this.setElementVolume(this.active, this.volume);
    this.setElementVolume(this.idle, this.fadeTimer ? this.getElementVolume(this.idle) : 0);
  }

  preload(src: string): void {
    if (this.fadeTimer) return;
    const el = this.idle;
    if (el.src === src) return;
    this.preloadedSrc = src;
    el.src = src;
    this.setElementVolume(el, 0);
    el.load();
  }

  stop(): void {
    this.stopFade();
    for (const el of this.elements) this.release(el);
    this.preloadedSrc = null;
  }
}

/** true when the server answers a CORS request for `src` (headers only, body is not downloaded). */
async function probeCors(src: string): Promise<boolean> {
  const controller = new AbortController();
  try {
    const res = await fetch(src, { mode: 'cors', signal: controller.signal });
    controller.abort();
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

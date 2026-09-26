import type { AudioEngine, AudioEngineListener, LoadOptions } from '@sonora/core';

const NOOP_LISTENER: AudioEngineListener = { onStatus: () => undefined, onTime: () => undefined };
const MAX_STREAM_RETRIES = 2;

/**
 * HTMLAudioElement engine with two alternating elements:
 * - the idle element preloads the next track (near-gapless transitions),
 * - crossfades ramp the outgoing element down while the new one ramps up.
 * Only the active element reports events to the player store.
 */
export class HtmlAudioEngine implements AudioEngine {
  private readonly elements: [HTMLAudioElement, HTMLAudioElement];
  private activeIdx = 0;
  private listener: AudioEngineListener = NOOP_LISTENER;
  private volume = 1;
  private muted = false;
  private preloadedSrc: string | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private retries = 0;
  private pendingSeek: number | null = null;
  private lastTimeEmit = 0;

  constructor() {
    this.elements = [this.createElement(), this.createElement()];
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
      if (!isActive() || !el.src) return;
      const err = el.error;
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
    incoming.muted = this.muted;
    incoming.volume = fade ? 0 : this.volume;

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
    const startVol = outgoing.volume;
    this.fadeTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
      // Equal-power curve keeps perceived loudness steady.
      outgoing.volume = startVol * Math.cos((t * Math.PI) / 2);
      incoming.volume = this.volume * Math.sin((t * Math.PI) / 2);
      if (t >= 1) {
        this.stopFade();
        this.release(outgoing);
        incoming.volume = this.volume;
      }
    }, 50);
  }

  private stopFade() {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    const idle = this.idle;
    if (idle.src && !idle.paused) this.release(idle);
    this.active.volume = this.volume;
  }

  play(): void {
    const el = this.active;
    if (!el.src) return;
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
    if (!this.fadeTimer) this.active.volume = volume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const el of this.elements) el.muted = muted;
  }

  preload(src: string): void {
    if (this.fadeTimer) return;
    const el = this.idle;
    if (el.src === src) return;
    this.preloadedSrc = src;
    el.src = src;
    el.volume = this.volume;
    el.load();
  }

  stop(): void {
    this.stopFade();
    for (const el of this.elements) this.release(el);
    this.preloadedSrc = null;
  }
}

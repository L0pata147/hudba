import { PermissionsAndroid, Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioMetadata, type AudioPlayer, type AudioStatus } from 'expo-audio';
import type { AudioEngine, AudioEngineListener, LoadOptions } from '@sonora/core';
import { tryGetNavidrome } from '@sonora/core';

/** Runs a call into the native player; a failure is logged instead of taking the app down. */
function safely(what: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.warn(`expo-audio ${what} failed`, err);
  }
}

/**
 * expo-audio engine (AVPlayer on iOS, ExoPlayer/Media3 on Android).
 * Supports background playback and lock-screen / notification controls.
 * Crossfade is not supported by this engine; transitions are hard cuts.
 *
 * The lock-screen / notification controls are registered once, when playback
 * first starts, and later songs only update their metadata: registering again
 * for every song makes expo-audio rebuild its media session each time.
 */
export class ExpoAudioEngine implements AudioEngine {
  private player: AudioPlayer;
  private listener: AudioEngineListener = { onStatus: () => undefined, onTime: () => undefined };
  private pendingSeek: number | null = null;
  private wantPlay = false;
  private lastPlaying = false;
  private loaded = false;
  private endedFor: string | null = null;
  private src: string | null = null;
  private sampleSub: { remove(): void } | null = null;
  private metadata: AudioMetadata | null = null;
  private lockScreen = false;

  constructor() {
    this.player = createAudioPlayer(null, { updateInterval: 250 });
    this.player.addListener('playbackStatusUpdate', (s) => this.onStatus(s));
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
  }

  private onStatus(s: AudioStatus) {
    if (!this.src) return;
    if (s.isLoaded && !this.loaded) {
      this.loaded = true;
      if (this.pendingSeek != null) {
        const at = this.pendingSeek;
        safely('seekTo', () => void this.player.seekTo(at).catch(() => undefined));
        this.pendingSeek = null;
      }
      if (this.wantPlay) safely('play', () => this.player.play());
    }
    if (s.playing && !this.lockScreen && this.metadata) this.activateLockScreen();
    if (s.didJustFinish) {
      if (this.endedFor !== this.src) {
        this.endedFor = this.src;
        this.listener.onStatus('ended');
      }
      return;
    }
    if (s.playing !== this.lastPlaying) {
      this.lastPlaying = s.playing;
      this.listener.onStatus(s.playing ? 'playing' : 'paused');
    } else if (s.isBuffering && this.wantPlay) {
      this.listener.onStatus('buffering');
    }
    this.listener.onTime(s.currentTime, s.duration || 0, s.currentTime);
  }

  setListener(listener: AudioEngineListener): void {
    this.listener = listener;
  }

  load(src: string, opts: LoadOptions): void {
    this.src = src;
    this.loaded = false;
    this.endedFor = null;
    this.lastPlaying = false;
    this.wantPlay = opts.autoplay;
    this.pendingSeek = opts.startAt && opts.startAt > 0 ? opts.startAt : null;
    safely('replace', () => this.player.replace({ uri: src }));
    const art = tryGetNavidrome()?.media.coverArtUrl(opts.song.coverArtId, 600);
    this.metadata = { title: opts.song.title, artist: opts.song.artist, albumTitle: opts.song.album, artworkUrl: art };
    if (this.lockScreen) safely('updateLockScreenMetadata', () => this.player.updateLockScreenMetadata(this.metadata!));
    if (opts.autoplay) safely('play', () => this.player.play());
    else this.listener.onStatus('paused');
  }

  private activateLockScreen() {
    this.lockScreen = true;
    safely('setActiveForLockScreen', () => this.player.setActiveForLockScreen(true, this.metadata!, { showSeekBackward: true, showSeekForward: true }));
    // Android 13+ only shows the playback notification with this permission
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
    }
  }

  play(): void {
    this.wantPlay = true;
    safely('play', () => this.player.play());
  }

  pause(): void {
    this.wantPlay = false;
    safely('pause', () => this.player.pause());
  }

  seek(seconds: number): void {
    if (this.loaded) safely('seekTo', () => void this.player.seekTo(seconds).catch(() => undefined));
    else this.pendingSeek = seconds;
  }

  setVolume(volume: number): void {
    safely('volume', () => (this.player.volume = volume));
  }

  setMuted(muted: boolean): void {
    safely('muted', () => (this.player.muted = muted));
  }

  /** Whether the native player can deliver PCM samples (Android Visualizer / iOS audio tap). */
  get samplingSupported(): boolean {
    return this.player.isAudioSamplingSupported;
  }

  /**
   * Streams PCM frames (−1…1, first channel) to `listener` for the visualizer; `null` stops it.
   * On Android this needs the RECORD_AUDIO permission (the system Visualizer API), otherwise
   * expo-audio silently ignores the request.
   */
  setSampleListener(listener: ((frames: number[]) => void) | null): void {
    this.sampleSub?.remove();
    this.sampleSub = null;
    if (listener) this.sampleSub = this.player.addListener('audioSampleUpdate', (s) => listener(s.channels[0]?.frames ?? []));
    try {
      this.player.setAudioSamplingEnabled(!!listener);
    } catch {
      // not supported on this platform
    }
  }

  stop(): void {
    this.wantPlay = false;
    this.src = null;
    safely('pause', () => this.player.pause());
    if (this.lockScreen) safely('clearLockScreenControls', () => this.player.clearLockScreenControls());
    this.lockScreen = false;
  }
}

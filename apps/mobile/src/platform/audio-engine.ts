import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import type { AudioEngine, AudioEngineListener, LoadOptions } from '@sonora/core';
import { tryGetNavidrome } from '@sonora/core';

/**
 * expo-audio engine (AVPlayer on iOS, ExoPlayer/Media3 on Android).
 * Supports background playback and lock-screen / notification controls.
 * Crossfade is not supported by this engine; transitions are hard cuts.
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
        void this.player.seekTo(this.pendingSeek);
        this.pendingSeek = null;
      }
      if (this.wantPlay) this.player.play();
    }
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
    this.player.replace({ uri: src });
    const art = tryGetNavidrome()?.media.coverArtUrl(opts.song.coverArtId, 600);
    this.player.setActiveForLockScreen(
      true,
      { title: opts.song.title, artist: opts.song.artist, albumTitle: opts.song.album, artworkUrl: art },
      { showSeekBackward: true, showSeekForward: true },
    );
    if (opts.autoplay) this.player.play();
    else this.listener.onStatus('paused');
  }

  play(): void {
    this.wantPlay = true;
    this.player.play();
  }

  pause(): void {
    this.wantPlay = false;
    this.player.pause();
  }

  seek(seconds: number): void {
    if (this.loaded) void this.player.seekTo(seconds);
    else this.pendingSeek = seconds;
  }

  setVolume(volume: number): void {
    this.player.volume = volume;
  }

  setMuted(muted: boolean): void {
    this.player.muted = muted;
  }

  stop(): void {
    this.wantPlay = false;
    this.src = null;
    this.player.pause();
    this.player.clearLockScreenControls();
  }
}

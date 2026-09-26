/**
 * Sonora domain types.
 *
 * These are the app's own normalized models. The Navidrome/Subsonic wire format
 * lives in `@sonora/api` and is mapped into these types, so UI and business logic
 * never depend on the raw API shape.
 */

export type ID = string;

/* ------------------------------------------------------------------ */
/* Server / auth                                                       */
/* ------------------------------------------------------------------ */

export interface ServerConfig {
  /** Normalized base URL without trailing slash, e.g. https://music.example.com */
  url: string;
  /** Friendly label shown in settings. Defaults to the host name. */
  name?: string;
}

/**
 * Credentials used for Subsonic token authentication.
 *
 * The plaintext password is never persisted. We store `token = md5(password + salt)`
 * together with the salt, which is what the Subsonic API expects on every request.
 */
export interface StoredCredentials {
  username: string;
  token: string;
  salt: string;
}

export interface Session {
  server: ServerConfig;
  credentials: StoredCredentials;
  user: User;
  serverInfo: ServerInfo;
  /** ISO timestamp of the successful login. */
  createdAt: string;
}

export interface ServerInfo {
  /** Subsonic API version reported by the server. */
  apiVersion: string;
  /** e.g. "navidrome" */
  type?: string;
  /** e.g. "0.64.2 (10114574)" */
  serverVersion?: string;
  openSubsonic: boolean;
  extensions: string[];
}

export interface User {
  username: string;
  email?: string;
  isAdmin: boolean;
  canStream: boolean;
  canDownload: boolean;
  canShare: boolean;
  scrobblingEnabled: boolean;
}

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

export interface ArtistRef {
  id: ID;
  name: string;
}

export interface Artist {
  id: ID;
  name: string;
  albumCount: number;
  coverArtId?: string;
  /** External image URL provided by the server (may be a Navidrome share URL). */
  imageUrl?: string;
  starred: boolean;
  starredAt?: string;
  sortName?: string;
}

export interface ArtistInfo {
  biography?: string;
  lastFmUrl?: string;
  smallImageUrl?: string;
  mediumImageUrl?: string;
  largeImageUrl?: string;
  similarArtists: Artist[];
}

export interface Album {
  id: ID;
  name: string;
  artist: string;
  artistId?: ID;
  artists: ArtistRef[];
  coverArtId?: string;
  songCount: number;
  /** seconds */
  duration: number;
  year?: number;
  genre?: string;
  genres: string[];
  created?: string;
  playCount?: number;
  lastPlayed?: string;
  starred: boolean;
  starredAt?: string;
  isCompilation?: boolean;
}

export interface AlbumWithSongs extends Album {
  songs: Song[];
}

export interface ArtistWithAlbums extends Artist {
  albums: Album[];
}

export interface Song {
  id: ID;
  title: string;
  album?: string;
  albumId?: ID;
  artist: string;
  artistId?: ID;
  artists: ArtistRef[];
  albumArtist?: string;
  coverArtId?: string;
  track?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  /** seconds */
  duration: number;
  bitRate?: number;
  size?: number;
  suffix?: string;
  contentType?: string;
  playCount?: number;
  lastPlayed?: string;
  starred: boolean;
  starredAt?: string;
  replayGain?: {
    trackGain?: number;
    albumGain?: number;
    trackPeak?: number;
    albumPeak?: number;
  };
}

export interface Genre {
  name: string;
  songCount: number;
  albumCount: number;
}

export interface Playlist {
  id: ID;
  name: string;
  comment?: string;
  owner?: string;
  public: boolean;
  songCount: number;
  /** seconds */
  duration: number;
  created?: string;
  changed?: string;
  coverArtId?: string;
}

export interface PlaylistWithSongs extends Playlist {
  songs: Song[];
}

export interface SearchResult {
  artists: Artist[];
  albums: Album[];
  songs: Song[];
  playlists: Playlist[];
}

export type TopResult =
  | { kind: 'artist'; item: Artist }
  | { kind: 'album'; item: Album }
  | { kind: 'song'; item: Song }
  | { kind: 'playlist'; item: Playlist };

export interface Starred {
  artists: Artist[];
  albums: Album[];
  songs: Song[];
}

export interface LyricLine {
  /** milliseconds, undefined for unsynced lyrics */
  start?: number;
  value: string;
}

export interface Lyrics {
  synced: boolean;
  lines: LyricLine[];
  lang?: string;
}

/** Album list types supported by `getAlbumList2`. */
export type AlbumListType =
  | 'newest'
  | 'recent'
  | 'frequent'
  | 'random'
  | 'highest'
  | 'alphabeticalByName'
  | 'alphabeticalByArtist'
  | 'starred'
  | 'byYear'
  | 'byGenre';

/** Play queue as stored on the server (`savePlayQueue` / `getPlayQueue`). */
export interface RemotePlayQueue {
  songs: Song[];
  currentId?: ID;
  /** milliseconds */
  position: number;
  changed?: string;
  changedBy?: string;
}

/* ------------------------------------------------------------------ */
/* Playback                                                            */
/* ------------------------------------------------------------------ */

export type RepeatMode = 'off' | 'all' | 'one';

/** Where a queue item came from — used for "Playing from …" labels. */
export interface PlaybackContext {
  type: 'album' | 'artist' | 'playlist' | 'favorites' | 'search' | 'songs' | 'genre' | 'queue';
  id?: ID;
  name?: string;
}

export interface QueueItem {
  /** Unique per queue entry so the same song can appear multiple times. */
  uid: string;
  song: Song;
  /** true if inserted via "Play next"/"Add to queue" rather than the original context */
  manual?: boolean;
}

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

export interface PlaybackState {
  status: PlaybackStatus;
  /** seconds */
  position: number;
  /** seconds; 0 when unknown */
  duration: number;
  /** seconds of media buffered ahead of 0 */
  buffered: number;
  /** 0..1 */
  volume: number;
  muted: boolean;
  error?: string;
}

export type StreamQuality = 'original' | '320' | '256' | '192' | '128' | '96';

export interface HistoryEntry {
  song: Song;
  /** ISO timestamp */
  playedAt: string;
  context?: PlaybackContext;
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

export type ViewMode = 'grid' | 'list' | 'compact';
export type ThemeMode = 'dark' | 'light' | 'system';
export type AccentColor = 'ember' | 'aqua' | 'violet' | 'lime' | 'rose' | 'gold';

export interface Preferences {
  theme: ThemeMode;
  accent: AccentColor;
  compactMode: boolean;
  sidebarCollapsed: boolean;
  libraryView: ViewMode;
  streamQuality: StreamQuality;
  /** seconds, 0 disables crossfade */
  crossfade: number;
  gapless: boolean;
  defaultVolume: number;
  /** Sync the play queue to the server so other clients can resume it. */
  syncQueue: boolean;
  scrobble: boolean;
}

/* ------------------------------------------------------------------ */
/* Downloads / offline                                                 */
/* ------------------------------------------------------------------ */

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error';

export interface DownloadRecord {
  songId: ID;
  song: Song;
  status: DownloadStatus;
  /** 0..1 */
  progress: number;
  bytes?: number;
  error?: string;
  /** Platform-specific location (Cache Storage key, file URI, …). */
  location?: string;
  downloadedAt?: string;
}

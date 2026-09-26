/**
 * Raw Subsonic / OpenSubsonic response shapes as returned by Navidrome with
 * `f=json`. Only the fields Sonora uses are declared. Everything is optional
 * because servers differ in what they return.
 */

export interface WireArtistRef {
  id: string;
  name: string;
}

export interface WireArtist {
  id: string;
  name: string;
  coverArt?: string;
  albumCount?: number;
  artistImageUrl?: string;
  starred?: string;
  sortName?: string;
}

export interface WireArtistWithAlbums extends WireArtist {
  album?: WireAlbum[];
}

export interface WireArtistInfo {
  biography?: string;
  lastFmUrl?: string;
  smallImageUrl?: string;
  mediumImageUrl?: string;
  largeImageUrl?: string;
  similarArtist?: WireArtist[];
}

export interface WireAlbum {
  id: string;
  name?: string;
  /** Subsonic 1.x "album as directory" shape uses title */
  title?: string;
  album?: string;
  artist?: string;
  artistId?: string;
  artists?: WireArtistRef[];
  displayArtist?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  year?: number;
  genre?: string;
  genres?: { name: string }[];
  created?: string;
  playCount?: number;
  played?: string;
  starred?: string;
  isCompilation?: boolean;
}

export interface WireAlbumWithSongs extends WireAlbum {
  song?: WireSong[];
}

export interface WireSong {
  id: string;
  title?: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  artists?: WireArtistRef[];
  displayArtist?: string;
  displayAlbumArtist?: string;
  coverArt?: string;
  track?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  duration?: number;
  bitRate?: number;
  size?: number;
  suffix?: string;
  contentType?: string;
  playCount?: number;
  played?: string;
  starred?: string;
  isDir?: boolean;
  type?: string;
  replayGain?: {
    trackGain?: number;
    albumGain?: number;
    trackPeak?: number;
    albumPeak?: number;
  };
}

export interface WirePlaylist {
  id: string;
  name: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount?: number;
  duration?: number;
  created?: string;
  changed?: string;
  coverArt?: string;
}

export interface WirePlaylistWithSongs extends WirePlaylist {
  entry?: WireSong[];
}

export interface WireGenre {
  value: string;
  songCount?: number;
  albumCount?: number;
}

export interface WireUser {
  username: string;
  email?: string;
  adminRole?: boolean;
  streamRole?: boolean;
  downloadRole?: boolean;
  shareRole?: boolean;
  scrobblingEnabled?: boolean;
}

export interface WireLyricLine {
  start?: number;
  value: string;
}

export interface WireStructuredLyrics {
  lang?: string;
  synced?: boolean;
  line?: WireLyricLine[];
}

export interface WirePlayQueue {
  entry?: WireSong[];
  current?: string;
  position?: number;
  changed?: string;
  changedBy?: string;
}

export interface SubsonicEnvelope {
  status: 'ok' | 'failed';
  version: string;
  type?: string;
  serverVersion?: string;
  openSubsonic?: boolean;
  error?: { code: number; message?: string };
  [key: string]: unknown;
}

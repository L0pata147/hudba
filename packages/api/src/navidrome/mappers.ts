import type {
  Album,
  AlbumWithSongs,
  Artist,
  ArtistInfo,
  ArtistRef,
  ArtistWithAlbums,
  Genre,
  Lyrics,
  Playlist,
  PlaylistWithSongs,
  Song,
  User,
} from '@sonora/types';
import type {
  WireAlbum,
  WireAlbumWithSongs,
  WireArtist,
  WireArtistInfo,
  WireArtistRef,
  WireArtistWithAlbums,
  WireGenre,
  WirePlaylist,
  WirePlaylistWithSongs,
  WireSong,
  WireStructuredLyrics,
  WireUser,
} from './wire';

function nonEmpty(value: string | undefined | null): string | undefined {
  return value && value.trim() ? value : undefined;
}

function refs(list: WireArtistRef[] | undefined, fallbackName?: string, fallbackId?: string): ArtistRef[] {
  if (list && list.length) return list.map((a) => ({ id: a.id, name: a.name }));
  if (fallbackName && fallbackId) return [{ id: fallbackId, name: fallbackName }];
  return [];
}

export function mapArtist(a: WireArtist): Artist {
  return {
    id: a.id,
    name: a.name || 'Unknown Artist',
    albumCount: a.albumCount ?? 0,
    coverArtId: nonEmpty(a.coverArt),
    imageUrl: nonEmpty(a.artistImageUrl),
    starred: Boolean(a.starred),
    starredAt: nonEmpty(a.starred),
    sortName: nonEmpty(a.sortName),
  };
}

export function mapArtistWithAlbums(a: WireArtistWithAlbums): ArtistWithAlbums {
  return { ...mapArtist(a), albums: (a.album ?? []).map(mapAlbum) };
}

export function mapArtistInfo(i: WireArtistInfo): ArtistInfo {
  return {
    biography: nonEmpty(i.biography),
    lastFmUrl: nonEmpty(i.lastFmUrl),
    smallImageUrl: nonEmpty(i.smallImageUrl),
    mediumImageUrl: nonEmpty(i.mediumImageUrl),
    largeImageUrl: nonEmpty(i.largeImageUrl),
    similarArtists: (i.similarArtist ?? []).map(mapArtist),
  };
}

export function mapAlbum(a: WireAlbum): Album {
  const artist = a.displayArtist || a.artist || 'Unknown Artist';
  const genres = a.genres?.length ? a.genres.map((g) => g.name) : a.genre ? [a.genre] : [];
  return {
    id: a.id,
    name: a.name || a.title || a.album || 'Unknown Album',
    artist,
    artistId: nonEmpty(a.artistId),
    artists: refs(a.artists, a.artist, a.artistId),
    coverArtId: nonEmpty(a.coverArt),
    songCount: a.songCount ?? 0,
    duration: a.duration ?? 0,
    year: a.year || undefined,
    genre: nonEmpty(a.genre),
    genres,
    created: nonEmpty(a.created),
    playCount: a.playCount,
    lastPlayed: nonEmpty(a.played),
    starred: Boolean(a.starred),
    starredAt: nonEmpty(a.starred),
    isCompilation: a.isCompilation,
  };
}

export function mapAlbumWithSongs(a: WireAlbumWithSongs): AlbumWithSongs {
  return { ...mapAlbum(a), songs: (a.song ?? []).map(mapSong) };
}

export function mapSong(s: WireSong): Song {
  return {
    id: s.id,
    title: s.title || 'Untitled',
    album: nonEmpty(s.album),
    albumId: nonEmpty(s.albumId),
    artist: s.displayArtist || s.artist || 'Unknown Artist',
    artistId: nonEmpty(s.artistId),
    artists: refs(s.artists, s.artist, s.artistId),
    albumArtist: nonEmpty(s.displayAlbumArtist),
    coverArtId: nonEmpty(s.coverArt),
    track: s.track || undefined,
    discNumber: s.discNumber || undefined,
    year: s.year || undefined,
    genre: nonEmpty(s.genre),
    duration: s.duration ?? 0,
    bitRate: s.bitRate,
    size: s.size,
    suffix: nonEmpty(s.suffix),
    contentType: nonEmpty(s.contentType),
    playCount: s.playCount,
    lastPlayed: nonEmpty(s.played),
    starred: Boolean(s.starred),
    starredAt: nonEmpty(s.starred),
    replayGain: s.replayGain && Object.keys(s.replayGain).length ? s.replayGain : undefined,
  };
}

export function mapPlaylist(p: WirePlaylist): Playlist {
  return {
    id: p.id,
    name: p.name || 'Untitled playlist',
    comment: nonEmpty(p.comment),
    owner: nonEmpty(p.owner),
    public: Boolean(p.public),
    songCount: p.songCount ?? 0,
    duration: p.duration ?? 0,
    created: nonEmpty(p.created),
    changed: nonEmpty(p.changed),
    coverArtId: nonEmpty(p.coverArt),
  };
}

export function mapPlaylistWithSongs(p: WirePlaylistWithSongs): PlaylistWithSongs {
  return { ...mapPlaylist(p), songs: (p.entry ?? []).map(mapSong) };
}

export function mapGenre(g: WireGenre): Genre {
  return { name: g.value, songCount: g.songCount ?? 0, albumCount: g.albumCount ?? 0 };
}

export function mapUser(u: WireUser): User {
  return {
    username: u.username,
    email: nonEmpty(u.email),
    isAdmin: Boolean(u.adminRole),
    canStream: u.streamRole !== false,
    canDownload: Boolean(u.downloadRole),
    canShare: Boolean(u.shareRole),
    scrobblingEnabled: u.scrobblingEnabled !== false,
  };
}

export function mapLyrics(l: WireStructuredLyrics): Lyrics {
  return {
    synced: Boolean(l.synced),
    lang: nonEmpty(l.lang),
    lines: (l.line ?? []).map((line) => ({ start: l.synced ? line.start : undefined, value: line.value })),
  };
}

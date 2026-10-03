import type { Page, Route } from '@playwright/test';

/**
 * In-memory Subsonic/Navidrome server for E2E tests, installed with
 * `page.route`. It implements the subset of endpoints Sonora uses and keeps
 * state (playlists, stars, play queue) so flows can be verified end to end.
 * Set SONORA_E2E_SERVER to run the same tests against a real Navidrome.
 */
export const MOCK_SERVER = 'https://mock-navidrome.test';
export const MOCK_USER = 'demo';
export const MOCK_PASSWORD = 'demo-password';

interface Song { id: string; title: string; album: string; albumId: string; artist: string; artistId: string; track: number; duration: number; coverArt: string; starred?: string }

const artists = [
  { id: 'ar1', name: 'Aurora Fields', albums: ['Northern Lines', 'Glass Rivers'] },
  { id: 'ar2', name: 'Neon Harbor', albums: ['Midnight Signals'] },
];

function buildLibrary() {
  const albums: { id: string; name: string; artist: string; artistId: string; year: number; songs: Song[]; starred?: string }[] = [];
  let n = 0;
  for (const ar of artists) {
    ar.albums.forEach((name, ai) => {
      const id = `al${ar.id}${ai}`;
      const songs: Song[] = Array.from({ length: 4 }, (_, t) => ({
        id: `s${++n}`,
        title: `${name} ${['Intro', 'Echoes', 'Horizon', 'Afterglow'][t]}`,
        album: name,
        albumId: id,
        artist: ar.name,
        artistId: ar.id,
        track: t + 1,
        duration: 3,
        coverArt: `al-${id}`,
      }));
      albums.push({ id, name, artist: ar.name, artistId: ar.id, year: 2020 + ai, songs });
    });
  }
  return albums;
}

/** 3 seconds of quiet 440 Hz tone as 8 kHz mono WAV. */
export function wav(): Buffer {
  const rate = 8000, secs = 3, samples = rate * secs;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 1500), 44 + i * 2);
  return buf;
}

const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#7B5CFF"/><stop offset="1" stop-color="#FF7A45"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/></svg>`;

export async function installMockNavidrome(page: Page, opts: { audioUrl?: string } = {}) {
  const albums = buildLibrary();
  const songs = albums.flatMap((a) => a.songs);
  const playlists: { id: string; name: string; comment?: string; songIds: string[] }[] = [];
  let playQueue: { ids: string[]; current?: string; position: number } = { ids: [], position: 0 };
  const audio = wav();
  const now = () => new Date().toISOString();

  const albumJson = (a: (typeof albums)[number]) => ({ id: a.id, name: a.name, artist: a.artist, artistId: a.artistId, coverArt: `al-${a.id}`, songCount: a.songs.length, duration: a.songs.length * 3, year: a.year, starred: a.starred, genre: 'Ambient' });
  const plJson = (p: (typeof playlists)[number]) => ({ id: p.id, name: p.name, comment: p.comment, owner: MOCK_USER, public: false, songCount: p.songIds.length, duration: p.songIds.length * 3, coverArt: `pl-${p.id}`, changed: now() });
  const songById = (id: string) => songs.find((s) => s.id === id)!;

  const handle = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const endpoint = url.pathname.replace(/^.*\/rest\//, '');
    const p = req.method() === 'POST' ? new URLSearchParams(req.postData() ?? '') : url.searchParams;
    const ok = (body: object = {}) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', type: 'navidrome', serverVersion: '0.64.0 (mock)', openSubsonic: true, ...body } }) });
    const fail = (code: number, message: string) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ 'subsonic-response': { status: 'failed', version: '1.16.1', error: { code, message } } }) });

    if (endpoint === 'getCoverArt') return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: COVER });
    if (endpoint === 'stream' || endpoint === 'download') {
      // Optionally hand audio off to a real HTTP server (e.g. one without CORS headers).
      if (opts.audioUrl) return route.fulfill({ status: 302, headers: { location: opts.audioUrl, 'access-control-allow-origin': '*' } });
      return route.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*' }, body: audio });
    }

    // Token auth check: t = md5(password + s) is verified in unit tests; here only the user is checked.
    if (p.get('u') !== MOCK_USER || !p.get('t') || !p.get('s')) return fail(40, 'Wrong username or password');
    const { createHash } = await import('node:crypto');
    if (createHash('md5').update(MOCK_PASSWORD + p.get('s')).digest('hex') !== p.get('t')) return fail(40, 'Wrong username or password');

    switch (endpoint) {
      case 'ping': return ok();
      case 'getOpenSubsonicExtensions': return ok({ openSubsonicExtensions: [{ name: 'formPost', versions: [1] }, { name: 'songLyrics', versions: [1] }] });
      case 'getUser': return ok({ user: { username: MOCK_USER, streamRole: true, downloadRole: true, adminRole: false } });
      case 'getAlbumList2': {
        const type = p.get('type');
        let list = [...albums];
        if (type === 'starred') list = list.filter((a) => a.starred);
        if (type === 'recent' || type === 'frequent') list = [];
        const offset = Number(p.get('offset') ?? 0), size = Number(p.get('size') ?? 20);
        return ok({ albumList2: { album: list.slice(offset, offset + size).map(albumJson) } });
      }
      case 'getAlbum': {
        const a = albums.find((x) => x.id === p.get('id'));
        return a ? ok({ album: { ...albumJson(a), song: a.songs } }) : fail(70, 'Album not found');
      }
      case 'getArtists': return ok({ artists: { index: [{ name: 'A', artist: artists.map((a) => ({ id: a.id, name: a.name, albumCount: a.albums.length, coverArt: `ar-${a.id}` })) }] } });
      case 'getArtist': {
        const ar = artists.find((a) => a.id === p.get('id'));
        return ar ? ok({ artist: { id: ar.id, name: ar.name, albumCount: ar.albums.length, album: albums.filter((a) => a.artistId === ar.id).map(albumJson) } }) : fail(70, 'Artist not found');
      }
      case 'getArtistInfo2': return ok({ artistInfo2: { biography: 'A mock artist used for end-to-end tests.' } });
      case 'getTopSongs': return ok({ topSongs: {} });
      case 'getGenres': return ok({ genres: { genre: [{ value: 'Ambient', songCount: songs.length, albumCount: albums.length }] } });
      case 'getSimilarSongs': {
        const seed = songs.find((x) => x.id === p.get('id'));
        return ok({ similarSongs: { song: songs.filter((x) => seed && x.artistId === seed.artistId && x.id !== seed.id) } });
      }
      case 'getSimilarSongs2':
        return ok({ similarSongs2: { song: songs.filter((x) => x.artistId === p.get('id')) } });
      case 'getSongsByGenre': case 'getRandomSongs': return ok({ songsByGenre: { song: songs }, randomSongs: { song: songs } });
      case 'search3': {
        const q = (p.get('query') ?? '').toLowerCase();
        const m = (s: string) => s.toLowerCase().includes(q);
        return ok({
          searchResult3: {
            artist: artists.filter((a) => m(a.name)).map((a) => ({ id: a.id, name: a.name, albumCount: a.albums.length })),
            album: albums.filter((a) => m(a.name)).map(albumJson),
            song: songs.filter((s) => m(s.title)).slice(0, Number(p.get('songCount') ?? 20)),
          },
        });
      }
      case 'getPlaylists': return ok({ playlists: { playlist: playlists.map(plJson) } });
      case 'getPlaylist': {
        const pl = playlists.find((x) => x.id === p.get('id'));
        return pl ? ok({ playlist: { ...plJson(pl), entry: pl.songIds.map(songById) } }) : fail(70, 'Playlist not found');
      }
      case 'createPlaylist': {
        const existing = playlists.find((x) => x.id === p.get('playlistId'));
        if (existing) { existing.songIds = p.getAll('songId'); return ok(); }
        const pl = { id: `pl${playlists.length + 1}`, name: p.get('name') ?? 'Untitled', songIds: p.getAll('songId') };
        playlists.push(pl);
        return ok({ playlist: { ...plJson(pl), entry: pl.songIds.map(songById) } });
      }
      case 'updatePlaylist': {
        const pl = playlists.find((x) => x.id === p.get('playlistId'));
        if (!pl) return fail(70, 'Playlist not found');
        if (p.get('name')) pl.name = p.get('name')!;
        if (p.has('comment')) pl.comment = p.get('comment') ?? undefined;
        const drop = new Set(p.getAll('songIndexToRemove').map(Number));
        pl.songIds = pl.songIds.filter((_, i) => !drop.has(i)).concat(p.getAll('songIdToAdd'));
        return ok();
      }
      case 'deletePlaylist': { const i = playlists.findIndex((x) => x.id === p.get('id')); if (i >= 0) playlists.splice(i, 1); return ok(); }
      case 'star': case 'unstar': {
        const val = endpoint === 'star' ? now() : undefined;
        for (const id of p.getAll('id')) songById(id).starred = val;
        for (const id of p.getAll('albumId')) { const a = albums.find((x) => x.id === id); if (a) a.starred = val; }
        return ok();
      }
      case 'getStarred2': return ok({ starred2: { song: songs.filter((s) => s.starred), album: albums.filter((a) => a.starred).map(albumJson), artist: [] } });
      case 'scrobble': return ok();
      case 'getPlayQueue': return ok(playQueue.ids.length ? { playQueue: { entry: playQueue.ids.map(songById), current: playQueue.current, position: playQueue.position } } : {});
      case 'savePlayQueue': playQueue = { ids: p.getAll('id'), current: p.get('current') ?? undefined, position: Number(p.get('position') ?? 0) }; return ok();
      case 'getLyricsBySongId': return ok({ lyricsList: { structuredLyrics: [{ synced: true, line: [{ start: 0, value: 'First line of the song' }, { start: 1500, value: 'Second line' }] }] } });
      case 'getLyrics': return ok({ lyrics: {} });
      default: return fail(70, `Not implemented in mock: ${endpoint}`);
    }
  };

  await page.route(`${MOCK_SERVER}/rest/**`, handle);
  return { playlists, albums, songs, get playQueue() { return playQueue; } };
}

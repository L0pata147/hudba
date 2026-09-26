import { describe, expect, it } from 'vitest';
import { createCredentials, createNavidromeClient, filterPlaylists, type NavidromeClient } from '../src';
import { mockServer } from './mock-server';

const song = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Song ${id}`, artist: 'A', artistId: 'ar1', duration: 100, ...extra });

function client(handlers: Parameters<typeof mockServer>[0]['handlers']) {
  const server = mockServer({ handlers });
  const nd: NavidromeClient = createNavidromeClient({
    session: {
      server: { url: 'https://music.test/' },
      credentials: createCredentials('alice', 'secret'),
      serverInfo: { apiVersion: '1.16.1', openSubsonic: true, extensions: ['songLyrics', 'formPost'] },
    },
    fetch: server.fetch,
  });
  return { nd, server };
}

describe('Navidrome API client', () => {
  it('maps albums and tracklists into domain types', async () => {
    const { nd } = client({
      getAlbum: (p) => ({
        album: {
          id: p.get('id'),
          name: 'Blue',
          artist: 'Joni',
          artistId: 'ar1',
          coverArt: 'al-1',
          songCount: 2,
          duration: 300,
          year: 1971,
          starred: '2024-01-01T00:00:00Z',
          genres: [{ name: 'Folk' }],
          song: [song('s1', { track: 1 }), song('s2', { track: 2, starred: '2024-01-01' })],
        },
      }),
    });
    const album = await nd.albums.get('al1');
    expect(album).toMatchObject({ id: 'al1', name: 'Blue', artist: 'Joni', year: 1971, starred: true, genres: ['Folk'], coverArtId: 'al-1' });
    expect(album.songs.map((s) => [s.id, s.track, s.starred])).toEqual([
      ['s1', 1, false],
      ['s2', 2, true],
    ]);
  });

  it('passes album list parameters', async () => {
    const { nd, server } = client({ getAlbumList2: () => ({ albumList2: { album: [{ id: 'a' }] } }) });
    const list = await nd.albums.list({ type: 'newest', size: 9999, offset: 20 });
    expect(list[0]?.name).toBe('Unknown Album');
    const p = server.calls.at(-1)!.params;
    expect([p.get('type'), p.get('size'), p.get('offset')]).toEqual(['newest', '500', '20']);
    await expect(nd.albums.list({ type: 'byGenre' })).rejects.toThrow(/genre/);
  });

  it('flattens the artist index', async () => {
    const { nd } = client({
      getArtists: () => ({ artists: { index: [{ name: 'A', artist: [{ id: '1', name: 'ABBA', albumCount: 3 }] }, { name: 'B', artist: [{ id: '2', name: 'Bjork' }] }] } }),
    });
    expect((await nd.artists.list()).map((a) => [a.name, a.albumCount])).toEqual([
      ['ABBA', 3],
      ['Bjork', 0],
    ]);
  });

  it('builds authenticated media URLs', () => {
    const { nd } = client({});
    const stream = new URL(nd.media.streamUrl('s1', { quality: '192' }));
    expect(stream.origin + stream.pathname).toBe('https://music.test/rest/stream');
    expect(stream.searchParams.get('maxBitRate')).toBe('192');
    expect(stream.searchParams.get('u')).toBe('alice');
    expect(stream.searchParams.get('t')).toMatch(/^[0-9a-f]{32}$/);
    expect(new URL(nd.media.streamUrl('s1')).searchParams.get('format')).toBe('raw');
    expect(nd.media.coverArtUrl(undefined)).toBeUndefined();
    expect(new URL(nd.media.coverArtUrl('al-1', 300)!).searchParams.get('size')).toBe('300');
  });

  it('maps not-found errors', async () => {
    const { nd } = client({});
    const err = await nd.albums.get('missing').catch((e) => e);
    expect(err.kind).toBe('not-found');
  });

  it('stars and unstars songs, albums and artists', async () => {
    const { nd, server } = client({ star: () => ({}), unstar: () => ({}) });
    await nd.favorites.star({ songIds: ['s1', 's2'], albumIds: ['al1'] });
    let p = server.calls.at(-1)!;
    expect(p.endpoint).toBe('star');
    expect(p.params.getAll('id')).toEqual(['s1', 's2']);
    expect(p.params.getAll('albumId')).toEqual(['al1']);
    await nd.favorites.set({ artistIds: ['ar1'] }, false);
    p = server.calls.at(-1)!;
    expect(p.endpoint).toBe('unstar');
    expect(p.params.get('artistId')).toBe('ar1');
  });

  it('scrobbles now-playing and submissions', async () => {
    const { nd, server } = client({ scrobble: () => ({}) });
    await nd.scrobbling.nowPlaying('s1');
    expect(server.calls.at(-1)!.params.get('submission')).toBe('false');
    await nd.scrobbling.submit('s1', new Date(1000));
    expect(server.calls.at(-1)!.params.get('time')).toBe('1000');
  });

  it('saves and restores the play queue', async () => {
    let saved: URLSearchParams | undefined;
    const { nd, server } = client({
      savePlayQueue: (p) => {
        saved = p;
        return {};
      },
      getPlayQueue: () => ({ playQueue: { entry: [song('a'), song('b')], current: 'b', position: 42000 } }),
    });
    await nd.playQueue.save(['a', 'b'], 'b', 42_000.7);
    expect(server.calls.at(-1)!.method).toBe('POST');
    expect(saved?.getAll('id')).toEqual(['a', 'b']);
    expect(saved?.get('position')).toBe('42000');
    const q = await nd.playQueue.get();
    expect(q).toMatchObject({ currentId: 'b', position: 42000 });
    expect(q?.songs).toHaveLength(2);
  });

  it('prefers synced lyrics from the OpenSubsonic extension', async () => {
    const { nd } = client({
      getLyricsBySongId: () => ({
        lyricsList: { structuredLyrics: [{ synced: false, line: [{ value: 'plain' }] }, { synced: true, line: [{ start: 1000, value: 'Hello' }] }] },
      }),
    });
    expect(await nd.lyrics.forSong({ id: 's1', artist: 'A', title: 'T' })).toEqual({
      synced: true,
      lang: undefined,
      lines: [{ start: 1000, value: 'Hello' }],
    });
  });
});

describe('playlists', () => {
  it('creates playlists with songs via form POST', async () => {
    const { nd, server } = client({
      createPlaylist: (p) => ({ playlist: { id: 'pl1', name: p.get('name'), songCount: 2, entry: p.getAll('songId').map((id) => song(id)) } }),
    });
    const pl = await nd.playlists.create('Road trip', ['s1', 's2']);
    expect(pl).toMatchObject({ id: 'pl1', name: 'Road trip', songCount: 2 });
    expect(pl.songs.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(server.calls.at(-1)!.method).toBe('POST');
  });

  it('renames, adds and removes songs with updatePlaylist', async () => {
    const { nd, server } = client({ updatePlaylist: () => ({}) });
    await nd.playlists.update('pl1', { name: 'New', songIdsToAdd: ['s3'], songIndexesToRemove: [0, 2] });
    const p = server.calls.at(-1)!.params;
    expect(p.get('playlistId')).toBe('pl1');
    expect(p.get('name')).toBe('New');
    expect(p.getAll('songIdToAdd')).toEqual(['s3']);
    expect(p.getAll('songIndexToRemove')).toEqual(['0', '2']);
    expect(p.get('comment')).toBeNull();
  });

  it('reorders by replacing the tracklist', async () => {
    const { nd, server } = client({ createPlaylist: () => ({}) });
    await nd.playlists.replaceSongs('pl1', ['c', 'a', 'b']);
    const p = server.calls.at(-1)!.params;
    expect(p.get('playlistId')).toBe('pl1');
    expect(p.getAll('songId')).toEqual(['c', 'a', 'b']);
  });

  it('deletes playlists', async () => {
    const { nd, server } = client({ deletePlaylist: () => ({}) });
    await nd.playlists.remove('pl1');
    expect(server.calls.at(-1)).toMatchObject({ endpoint: 'deletePlaylist' });
  });
});

describe('search', () => {
  it('searches the library and matches playlists client-side', async () => {
    const { nd, server } = client({
      search3: () => ({
        searchResult3: {
          artist: [{ id: 'ar1', name: 'Nightwish' }],
          album: [{ id: 'al1', name: 'Night Songs', artist: 'X' }],
          song: [song('s1', { title: 'Night' })],
        },
      }),
      getPlaylists: () => ({
        playlists: { playlist: [{ id: 'p1', name: 'Late Night Drive' }, { id: 'p2', name: 'Workout' }, { id: 'p3', name: 'Noční jízda', comment: 'night' }] },
      }),
    });
    const r = await nd.search.all('night', { songCount: 5 });
    expect(r.artists[0]?.name).toBe('Nightwish');
    expect(r.albums[0]?.name).toBe('Night Songs');
    expect(r.songs[0]?.title).toBe('Night');
    expect(r.playlists.map((p) => p.id)).toEqual(['p1', 'p3']);
    const searchCall = server.calls.find((c) => c.endpoint === 'search3')!;
    expect(searchCall.params.get('query')).toBe('night');
    expect(searchCall.params.get('songCount')).toBe('5');
  });

  it('still returns library results when playlists fail', async () => {
    const { nd } = client({ search3: () => ({ searchResult3: { song: [song('s1')] } }) });
    const r = await nd.search.all('x');
    expect(r.songs).toHaveLength(1);
    expect(r.playlists).toEqual([]);
  });

  it('filters playlists ignoring case and diacritics', () => {
    const pls = [{ id: '1', name: 'Noční Jízda', public: false, songCount: 0, duration: 0 }];
    expect(filterPlaylists(pls, 'nocni jizda')).toHaveLength(1);
    expect(filterPlaylists(pls, 'jízda noční')).toHaveLength(1);
    expect(filterPlaylists(pls, '')).toHaveLength(0);
  });
});

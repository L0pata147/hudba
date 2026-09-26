/**
 * App-wide Radio instance wired to Navidrome, the player and history.
 */
import type { Song } from '@sonora/types';
import { createRadioStore, type RadioApi, type RadioSeed } from './radio/engine';
import { getNavidrome, tryGetNavidrome } from './session';
import { playerStore } from './playback';
import { historyStore } from './history';
import { lazyStorage } from './platform';
import { toast } from './toasts';
import { shuffleArray } from '@sonora/utils';

async function seedSongs(seed: RadioSeed): Promise<Song[]> {
  const nd = getNavidrome();
  switch (seed.kind) {
    case 'song':
      return [await nd.songs.get(seed.id)];
    case 'album':
      return (await nd.albums.get(seed.id)).songs;
    case 'playlist':
      return (await nd.playlists.get(seed.id)).songs.slice(0, 300);
    case 'genre':
      return nd.songs.random({ size: 40, genre: seed.id });
    case 'artist': {
      // A few albums are enough to learn the artist's sound without loading a whole discography.
      const artist = await nd.artists.get(seed.id);
      const albums = shuffleArray(artist.albums).slice(0, 4);
      const lists = await Promise.all(albums.map((a) => nd.albums.get(a.id).then((x) => x.songs).catch(() => [] as Song[])));
      return lists.flat();
    }
  }
}

const api: RadioApi = {
  similarSongs: (id, count) => getNavidrome().songs.similar(id, { count }),
  similarToArtist: (id, count) => getNavidrome().songs.similarToArtist(id, { count }),
  randomSongs: (opts) => getNavidrome().songs.random(opts),
  starredSongs: async () => (await getNavidrome().favorites.list()).songs,
  seedSongs,
};

export const radioStore = createRadioStore({
  api: () => (tryGetNavidrome() ? api : null),
  player: playerStore,
  history: () => historyStore.getState().entries,
  storage: lazyStorage,
  notify: (kind, message) => (kind === 'error' ? toast.error(message) : toast.info(message)),
});

export type { RadioSeed };

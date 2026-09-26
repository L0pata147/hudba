import type { Playlist, PlaylistWithSongs } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import { mapPlaylist, mapPlaylistWithSongs } from './mappers';
import type { SubsonicEnvelope, WirePlaylist, WirePlaylistWithSongs } from './wire';

export interface PlaylistUpdate {
  name?: string;
  comment?: string;
  public?: boolean;
  songIdsToAdd?: string[];
  /** zero-based indexes into the current playlist */
  songIndexesToRemove?: number[];
}

export function playlistsApi(http: SubsonicHttpClient) {
  return {
    async list(req?: RequestOptions): Promise<Playlist[]> {
      const res = await http.request<SubsonicEnvelope & { playlists?: { playlist?: WirePlaylist[] } }>(
        'getPlaylists',
        {},
        req,
      );
      return (res.playlists?.playlist ?? []).map(mapPlaylist);
    },

    async get(id: string, req?: RequestOptions): Promise<PlaylistWithSongs> {
      const res = await http.request<SubsonicEnvelope & { playlist: WirePlaylistWithSongs }>('getPlaylist', { id }, req);
      return mapPlaylistWithSongs(res.playlist);
    },

    /** `createPlaylist` — optionally seeded with songs. Uses form POST so long lists fit. */
    async create(name: string, songIds: string[] = [], req?: RequestOptions): Promise<PlaylistWithSongs> {
      const res = await http.request<SubsonicEnvelope & { playlist?: WirePlaylistWithSongs }>(
        'createPlaylist',
        { name, songId: songIds },
        { ...req, post: true },
      );
      if (res.playlist) return mapPlaylistWithSongs(res.playlist);
      // Subsonic < 1.14 returns an empty body; look the playlist up by name.
      const all = await this.list(req);
      const created = all.filter((p) => p.name === name).sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''))[0];
      if (!created) throw new Error('Playlist was created but could not be found');
      return this.get(created.id, req);
    },

    /** `updatePlaylist` — rename, change comment/visibility, add or remove songs. */
    async update(id: string, changes: PlaylistUpdate, req?: RequestOptions): Promise<void> {
      await http.request(
        'updatePlaylist',
        {
          playlistId: id,
          name: changes.name,
          comment: changes.comment,
          public: changes.public,
          songIdToAdd: changes.songIdsToAdd,
          songIndexToRemove: changes.songIndexesToRemove,
        },
        { ...req, post: true },
      );
    },

    /**
     * Replaces the full tracklist (used for reordering). Subsonic has no move
     * operation; `createPlaylist` with `playlistId` overwrites the songs.
     */
    async replaceSongs(id: string, songIds: string[], req?: RequestOptions): Promise<void> {
      await http.request('createPlaylist', { playlistId: id, songId: songIds }, { ...req, post: true });
    },

    async remove(id: string, req?: RequestOptions): Promise<void> {
      await http.request('deletePlaylist', { id }, req);
    },
  };
}

export type PlaylistsApi = ReturnType<typeof playlistsApi>;

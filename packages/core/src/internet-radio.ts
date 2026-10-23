import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';
import type { InternetRadioStation, Song } from '@sonora/types';
import { describeError, type RadioStationInput } from '@sonora/api';
import { getNavidrome, sessionStore } from './session';
import { playerStore } from './playback';
import { toast } from './toasts';

/**
 * Internet radio: stations saved on the Navidrome server (Subsonic
 * `getInternetRadioStations`). A station plays as a single live queue item.
 */
export const STATION_SONG_PREFIX = 'internet-radio:';

/** The queue item for a station: no duration, plays `liveStreamUrl` directly. */
export function stationSong(station: InternetRadioStation): Song {
  return {
    id: `${STATION_SONG_PREFIX}${station.id}`,
    title: station.name,
    artist: 'Internet radio',
    artists: [],
    duration: 0,
    starred: false,
    liveStreamUrl: station.streamUrl,
  };
}

export const isLiveSong = (song: Song | undefined | null): boolean => Boolean(song?.liveStreamUrl);

export function playStation(station: InternetRadioStation): void {
  playerStore.getState().playSongs([stationSong(station)], 0, { context: { type: 'internet-radio', id: station.id, name: station.name } });
}

const useScope = () => useStore(sessionStore, (s) => (s.session ? `${s.session.server.url}|${s.session.credentials.username}` : 'anon'));
const key = (scope: string) => ['internet-radios', scope] as const;

export function useRadioStations() {
  const scope = useScope();
  return useQuery({
    queryKey: key(scope),
    queryFn: ({ signal }) => getNavidrome().radios.list({ signal }),
    enabled: scope !== 'anon',
    staleTime: 5 * 60_000,
  });
}

/** Add, edit and delete stations (the server allows it for admins only). */
export function useRadioStationMutations() {
  const qc = useQueryClient();
  const scope = useScope();
  const done = () => void qc.invalidateQueries({ queryKey: key(scope) });
  const onError = (err: unknown) => toast.error(describeError(err));
  return {
    create: useMutation({ mutationFn: (input: RadioStationInput) => getNavidrome().radios.create(input), onSuccess: done, onError }),
    update: useMutation({ mutationFn: ({ id, input }: { id: string; input: RadioStationInput }) => getNavidrome().radios.update(id, input), onSuccess: done, onError }),
    remove: useMutation({ mutationFn: (id: string) => getNavidrome().radios.remove(id), onSuccess: done, onError }),
  };
}

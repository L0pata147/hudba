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
    addMany: useMutation({
      mutationFn: ({ existing, wanted }: { existing: readonly InternetRadioStation[]; wanted: readonly RadioStationInput[] }) => addMissingStations(existing, wanted),
      // some may have been added before a failure
      onSettled: done,
      onError,
    }),
  };
}

/** Popular Czech stations (streams checked by radio-browser.info), added with one click on the Radio page. */
export const CZECH_STATIONS: RadioStationInput[] = [
  { name: 'ČRo Radiožurnál', streamUrl: 'https://rozhlas.stream/radiozurnal_aac_128.aac', homePageUrl: 'https://radiozurnal.rozhlas.cz/' },
  { name: 'ČRo Radiožurnál Sport', streamUrl: 'https://rozhlas.stream/radiozurnal_sport_high.aac', homePageUrl: 'https://sport.rozhlas.cz/' },
  { name: 'ČRo Dvojka', streamUrl: 'http://icecast6.play.cz/cro2-128.mp3', homePageUrl: 'https://dvojka.rozhlas.cz/' },
  { name: 'ČRo Vltava', streamUrl: 'http://icecast5.play.cz/cro3-128.mp3', homePageUrl: 'https://vltava.rozhlas.cz/' },
  { name: 'ČRo Jazz (FLAC)', streamUrl: 'http://amp.cesnet.cz:8000/cro-jazz.flac', homePageUrl: 'https://jazz.rozhlas.cz/' },
  { name: 'ČRo D-dur (FLAC)', streamUrl: 'http://amp.cesnet.cz:8000/cro-d-dur.flac', homePageUrl: 'https://d-dur.rozhlas.cz/' },
  { name: 'Evropa 2', streamUrl: 'https://ice.actve.net/fm-evropa2-128', homePageUrl: 'https://www.evropa2.cz/' },
  { name: 'Evropa 2 Flashback', streamUrl: 'https://ice.actve.net/web-e2-flashback', homePageUrl: 'https://www.evropa2.cz/' },
  { name: 'Frekvence 1', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/FREKVENCE1.mp3', homePageUrl: 'https://www.frekvence1.cz/' },
  { name: 'Kiss', streamUrl: 'https://icecast1.play.cz/kissdelta128.mp3', homePageUrl: 'https://www.kiss.cz/' },
  { name: 'Rock Radio', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/ROCK_RADIO_128.mp3', homePageUrl: 'https://rockovyradio.cz/' },
  { name: 'Rádio Beat', streamUrl: 'https://icecast2.play.cz/beat128aac', homePageUrl: 'https://www.radiobeat.cz/' },
  { name: 'Rádio Blaník', streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIO_BLANIK.aac?gdpr=0', homePageUrl: 'https://radioblanik.cz/' },
  { name: 'Country Radio', streamUrl: 'http://icecast2.play.cz:8000/country128aac', homePageUrl: 'https://www.countryradio.cz/' },
  { name: 'Oldies Rádio', streamUrl: 'http://ice.abradio.cz/oldiesradio128.mp3', homePageUrl: 'https://www.oldiesradio.cz/' },
  { name: 'Hitrádio Osmdesátka', streamUrl: 'http://ice.abradio.cz/hit80128.mp3' },
  { name: 'Impuls', streamUrl: 'https://stream.sepia.sk:8000/impuls128.mp3', homePageUrl: 'https://www.impuls.cz/' },
  { name: 'Free Rádio Brno', streamUrl: 'http://icecast8.play.cz/freeradio128.mp3', homePageUrl: 'https://www.freeradio.cz/' },
];

/** Adds the stations the server doesn't have yet (same stream address); returns how many were added. */
export async function addMissingStations(existing: readonly InternetRadioStation[], wanted: readonly RadioStationInput[]): Promise<number> {
  const have = new Set(existing.map((s) => s.streamUrl.trim()));
  let added = 0;
  for (const s of wanted) {
    if (have.has(s.streamUrl)) continue;
    await getNavidrome().radios.create(s);
    have.add(s.streamUrl);
    added++;
  }
  return added;
}

import type { InternetRadioStation } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import type { SubsonicEnvelope } from './wire';

interface WireRadio {
  id: string;
  name?: string;
  streamUrl?: string;
  homePageUrl?: string;
  homepageUrl?: string;
}

export interface RadioStationInput {
  name: string;
  streamUrl: string;
  homePageUrl?: string;
}

const map = (r: WireRadio): InternetRadioStation => ({
  id: String(r.id),
  name: r.name?.trim() || 'Radio',
  streamUrl: r.streamUrl ?? '',
  homePageUrl: r.homePageUrl || r.homepageUrl || undefined,
});

/** Internet radio stations saved on the server (creating, editing and deleting needs an admin). */
export function radiosApi(http: SubsonicHttpClient) {
  return {
    async list(req?: RequestOptions): Promise<InternetRadioStation[]> {
      const res = await http.request<SubsonicEnvelope & { internetRadioStations?: { internetRadioStation?: WireRadio[] } }>('getInternetRadioStations', {}, req);
      return (res.internetRadioStations?.internetRadioStation ?? [])
        .map(map)
        .filter((r) => r.streamUrl)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async create(input: RadioStationInput): Promise<void> {
      await http.request('createInternetRadioStation', { name: input.name, streamUrl: input.streamUrl, homepageUrl: input.homePageUrl || undefined });
    },
    async update(id: string, input: RadioStationInput): Promise<void> {
      await http.request('updateInternetRadioStation', { id, name: input.name, streamUrl: input.streamUrl, homepageUrl: input.homePageUrl || undefined });
    },
    async remove(id: string): Promise<void> {
      await http.request('deleteInternetRadioStation', { id });
    },
  };
}

export type RadiosApi = ReturnType<typeof radiosApi>;

import { Linking, Pressable, View } from 'react-native';
import { Download, Globe, Plus, RadioTower, Trash2 } from 'lucide-react-native';
import type { InternetRadioStation } from '@sonora/types';
import { CZECH_STATIONS, playerStore, playStation, toast, usePlayerShallow, useRadioStationMutations, useRadioStations, useSession } from '@sonora/core';
import { Button, Skeleton, T } from './ui';
import { useSheet } from '../sheet-store';
import { useTheme } from '../theme';

/** A stable colour per station, from its name (same as on the desktop). */
const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const host = (url: string) => url.replace(/^https?:\/\//, '').split('/')[0] ?? url;

const isHttpUrl = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());

function StationRow({ station, admin }: { station: InternetRadioStation; admin: boolean }) {
  const t = useTheme();
  const { current, playing } = usePlayerShallow((s) => {
    const current = s.context?.type === 'internet-radio' && s.context.id === station.id;
    return { current, playing: current && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading') };
  });
  const open = useSheet((s) => s.open);
  const { remove } = useRadioStationMutations();
  const ic = t.textSecondary;
  const more = () =>
    open({
      title: station.name,
      subtitle: host(station.homePageUrl || station.streamUrl),
      actions: [
        ...(station.homePageUrl ? [{ label: 'Open website', icon: <Globe color={ic} size={22} />, onPress: () => void Linking.openURL(station.homePageUrl!) }] : []),
        ...(admin ? [{ label: 'Delete station', danger: true, icon: <Trash2 color={t.danger} size={22} />, onPress: () => remove.mutate(station.id) }] : []),
      ],
    });
  const h = hue(station.name);
  return (
    <Pressable
      onPress={() => (current ? playerStore.getState().togglePlay() : playStation(station))}
      onLongPress={admin || station.homePageUrl ? more : undefined}
      accessibilityRole="button"
      accessibilityLabel={playing ? `Pause ${station.name}` : `Play ${station.name}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 12, backgroundColor: current ? t.accentSoft : pressed ? t.surfaceHover : t.surface })}
    >
      <View style={{ width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `hsl(${h}, 70%, 52%)` }}>
        <RadioTower color="#fff" size={24} />
      </View>
      <View style={{ flex: 1 }}>
        <T numberOfLines={1} style={{ fontWeight: '700', color: current ? t.accent : t.textPrimary }}>{station.name}</T>
        <T variant="caption" dim={1} numberOfLines={1}>{playing ? 'Playing live' : host(station.homePageUrl || station.streamUrl)}</T>
      </View>
    </Pressable>
  );
}

/** Internet radio stations saved on the Navidrome server. */
export function InternetRadioSection() {
  const t = useTheme();
  const stations = useRadioStations();
  const admin = useSession((s) => s.session?.user.isAdmin ?? false);
  const { create, addMany } = useRadioStationMutations();
  const openPrompt = useSheet((s) => s.openPrompt);
  const have = new Set((stations.data ?? []).map((s) => s.streamUrl));
  const missingCzech = CZECH_STATIONS.filter((s) => !have.has(s.streamUrl)).length;

  // name first, then the stream address
  const addStation = () =>
    openPrompt({
      title: 'Station name',
      placeholder: 'Radio Paradise',
      confirm: 'Next',
      onSubmit: (name) => {
        if (!name.trim()) return;
        setTimeout(
          () =>
            openPrompt({
              title: 'Stream address',
              placeholder: 'https://…',
              url: true,
              confirm: 'Add station',
              onSubmit: (url) => {
                if (!isHttpUrl(url)) return toast.error('Enter the stream address, starting with http:// or https://.');
                create.mutate({ name: name.trim(), streamUrl: url.trim() }, { onSuccess: () => toast.success(`Added “${name.trim()}”`) });
              },
            }),
          // after the first sheet has slid away
          400,
        );
      },
    });

  return (
    <View style={{ gap: 10 }}>
      <T variant="h2">Internet radio</T>
      {stations.isPending ? (
        <View style={{ gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 64, borderRadius: 12 }} />
          ))}
        </View>
      ) : stations.isError ? (
        <T dim={1}>Couldn’t load the stations from your server.</T>
      ) : stations.data?.length ? (
        <View style={{ gap: 8 }}>
          {stations.data.map((s) => (
            <StationRow key={s.id} station={s} admin={admin} />
          ))}
        </View>
      ) : (
        <T dim={1}>{admin ? 'No stations yet.' : 'Your server has no radio stations yet. An admin can add them.'}</T>
      )}
      {admin ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {stations.isSuccess && missingCzech > 0 ? (
            <Button
              title={addMany.isPending ? 'Adding…' : `Add Czech radios (${missingCzech})`}
              variant="secondary"
              loading={addMany.isPending}
              icon={<Download color={t.textPrimary} size={16} />}
              onPress={() => addMany.mutate({ existing: stations.data ?? [], wanted: CZECH_STATIONS }, { onSuccess: (n) => toast.success(`Added ${n} Czech station${n === 1 ? '' : 's'}`) })}
            />
          ) : null}
          <Button title="Add station" variant="ghost" icon={<Plus color={t.textPrimary} size={16} />} onPress={addStation} />
        </View>
      ) : null}
      {stations.data?.length ? <T variant="caption" dim={1}>Long-press a station for more.</T> : null}
    </View>
  );
}

import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Compass, Crosshair, Hand, Power, Radio as RadioIcon, RefreshCw, Sparkles, Target } from 'lucide-react-native';
import { currentItem, playerStore, radioStore, recentSongs, useGenres, useHistory, usePlayerShallow, useRadio, type RadioVariety } from '@sonora/core';
import { Artwork, Button, PlayButton, T } from '../../src/components/ui';
import { TopInset } from '../../src/components/Screen';
import { startRadio } from '../../src/actions';
import { useTheme } from '../../src/theme';

const VARIETY: { value: RadioVariety; label: string; hint: string; Icon: typeof Target }[] = [
  { value: 'close', label: 'Familiar', hint: 'Stays close to the seed', Icon: Target },
  { value: 'balanced', label: 'Balanced', hint: 'Similar, with surprises', Icon: Crosshair },
  { value: 'explore', label: 'Adventurous', hint: 'Wanders further', Icon: Compass },
];

function StartRadio() {
  const t = useTheme();
  const history = useHistory((s) => s.entries);
  const recent = useMemo(() => recentSongs(history, 6), [history]);
  const genres = useGenres();
  const cur = usePlayerShallow((s) => ({ item: currentItem(s.queue) })).item;
  return (
    <View style={{ paddingHorizontal: 16, gap: 20 }}>
      <View style={{ backgroundColor: t.surface, borderRadius: 16, padding: 18, gap: 10 }}>
        <RadioIcon color={t.accent} size={32} />
        <T variant="h1">Radio</T>
        <T dim={1}>Pick a starting point and Sonora keeps playing similar music from your library — endlessly and without repeats.</T>
        {cur ? (
          <Button
            title={`Start from “${cur.song.title}”`}
            onPress={() => void startRadio({ kind: 'song', id: cur.song.id, name: cur.song.title, subtitle: cur.song.artist, coverArtId: cur.song.coverArtId }, cur.song)}
          />
        ) : null}
      </View>
      {recent.length ? (
        <View style={{ gap: 8 }}>
          <T variant="h2">From recently played</T>
          {recent.map((s) => (
            <Pressable key={s.id} onPress={() => void startRadio({ kind: 'song', id: s.id, name: s.title, subtitle: s.artist, coverArtId: s.coverArtId }, s)} accessibilityRole="button" accessibilityLabel={`Start radio from ${s.title}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Artwork coverArtId={s.coverArtId} size={96} style={{ width: 48, height: 48, borderRadius: 6 }} />
              <View style={{ flex: 1 }}>
                <T numberOfLines={1} style={{ fontWeight: '600' }}>{s.title}</T>
                <T variant="caption" dim={1} numberOfLines={1}>{s.artist}</T>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {genres.data?.length ? (
        <View style={{ gap: 8 }}>
          <T variant="h2">Genre radio</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {genres.data.slice(0, 20).map((g) => (
              <Pressable key={g.name} onPress={() => void startRadio({ kind: 'genre', id: g.name, name: g.name })} accessibilityRole="button" style={{ paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: t.surfaceHover }}>
                <T style={{ fontWeight: '600' }}>{g.name}</T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function RadioTab() {
  const t = useTheme();
  const session = useRadio((s) => s.session);
  const status = useRadio((s) => s.status);
  const { queue, context, playing } = usePlayerShallow((s) => ({ queue: s.queue, context: s.context, playing: s.status === 'playing' || s.status === 'buffering' }));
  const active = Boolean(session && context?.type === 'radio' && context.id === session.id);
  const now = currentItem(queue);
  const upNext = queue.items.slice(queue.index + 1, queue.index + 30);
  const r = radioStore.getState();

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <TopInset>
        {!session || !active ? (
          <StartRadio />
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 16 }}>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <Artwork coverArtId={session.seed.coverArtId} size={300} round={session.seed.kind === 'artist'} style={{ width: 96, height: 96, borderRadius: session.seed.kind === 'artist' ? 48 : 10 }} />
              <View style={{ flex: 1 }}>
                <T variant="label" dim={1}>Radio · {session.seed.kind}</T>
                <T variant="h1" numberOfLines={2}>{session.seed.name}</T>
                <T variant="caption" dim={1}>
                  {status === 'loading' ? 'Finding similar music…' : status === 'error' ? 'Server unreachable — retrying' : `${session.seen.length} songs picked`}
                </T>
              </View>
              <PlayButton playing={playing} onPress={() => playerStore.getState().togglePlay()} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button title="Steer here" variant="secondary" icon={<Target color={t.textPrimary} size={16} />} onPress={() => r.steerFromCurrent()} />
              <Button title="New" variant="ghost" icon={<RefreshCw color={t.textPrimary} size={16} />} onPress={() => r.refresh()} />
              <Button title="Stop" variant="danger" icon={<Power color={t.danger} size={16} />} onPress={() => r.stop()} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Radio variety">
              {VARIETY.map(({ value, label, hint, Icon }) => {
                const on = session.variety === value;
                return (
                  <Pressable key={value} onPress={() => r.setVariety(value)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: on ? t.accentSoft : t.surface, borderWidth: 1, borderColor: on ? t.accent : 'transparent', gap: 4 }}>
                    <Icon color={on ? t.accent : t.textSecondary} size={18} />
                    <T style={{ fontWeight: '700', fontSize: 13 }}>{label}</T>
                    <T variant="caption" dim={1} style={{ fontSize: 11 }}>{hint}</T>
                  </Pressable>
                );
              })}
            </View>
            {now ? (
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: t.accentSoft, borderRadius: 12, padding: 10 }}>
                <Artwork coverArtId={now.song.coverArtId} size={96} style={{ width: 52, height: 52, borderRadius: 6 }} />
                <View style={{ flex: 1 }}>
                  <T variant="label" style={{ color: t.accent }}>Now playing</T>
                  <T numberOfLines={1} style={{ fontWeight: '700' }}>{now.song.title}</T>
                  <T variant="caption" dim={1} numberOfLines={1}>{now.song.artist}</T>
                </View>
              </View>
            ) : null}
            <T variant="h2">Up next</T>
            {upNext.map((item) => (
              <Pressable key={item.uid} onPress={() => playerStore.getState().playItem(item.uid)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Artwork coverArtId={item.song.coverArtId} size={96} style={{ width: 44, height: 44, borderRadius: 6 }} />
                <View style={{ flex: 1 }}>
                  <T numberOfLines={1} style={{ fontWeight: '500' }}>{item.song.title}</T>
                  <T variant="caption" dim={1} numberOfLines={1}>{item.song.artist}{item.song.genre ? ` · ${item.song.genre}` : ''}</T>
                </View>
                {item.manual ? <Hand color={t.textSecondary} size={16} accessibilityLabel="Added by you" /> : <Sparkles color={t.accent} size={16} accessibilityLabel="Chosen by Radio" />}
              </Pressable>
            ))}
          </View>
        )}
      </TopInset>
    </ScrollView>
  );
}

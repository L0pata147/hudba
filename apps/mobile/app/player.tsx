import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { AudioWaveform, ChevronDown, ListMusic, MicVocal, MoreVertical, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react-native';
import { playerStore, preferencesStore, useCurrentItem, useLyrics, usePlayer, usePlayerShallow, usePreferences } from '@sonora/core';
import { Artwork, PlayButton, T } from '../src/components/ui';
import { Seekbar } from '../src/components/Seekbar';
import { FavoriteToggle } from '../src/components/FavoriteToggle';
import { useSongSheet } from '../src/actions';
import { useTheme } from '../src/theme';
import { Visualizer } from '../src/components/Visualizer';

function LyricsPanel() {
  const item = useCurrentItem();
  const { data, isPending } = useLyrics(item?.song);
  const positionMs = usePlayer((s) => s.position * 1000);
  if (isPending) return <T dim={1}>Loading lyrics…</T>;
  if (!data?.lines.length) return <T dim={1}>No lyrics for this song.</T>;
  let active = -1;
  if (data.synced) data.lines.forEach((l, i) => l.start !== undefined && l.start <= positionMs + 250 && (active = i));
  return (
    <View style={{ gap: 10 }}>
      {data.lines.map((l, i) => (
        <T key={i} style={{ fontSize: 22, fontWeight: '700', opacity: !data.synced || i === active ? 1 : 0.4 }}>{l.value || '♪'}</T>
      ))}
    </View>
  );
}

export default function Player() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const item = useCurrentItem();
  const context = usePlayer((s) => s.context);
  const { status, shuffled, repeat } = usePlayerShallow((s) => ({ status: s.status, shuffled: s.queue.shuffled, repeat: s.repeat }));
  const [lyrics, setLyrics] = useState(false);
  const visualizer = usePreferences((s) => s.visualizer);
  const [immersive, setImmersive] = useState(false);
  const openSong = useSongSheet();
  const close = () => router.back();
  const skip = (dir: 1 | -1) => (dir > 0 ? playerStore.getState().next() : playerStore.getState().previous());
  const swipe = Gesture.Pan().onEnd((e) => {
    if (e.translationY > 100 && Math.abs(e.translationX) < 80) runOnJS(close)();
    else if (e.translationX < -70) runOnJS(skip)(1);
    else if (e.translationX > 70) runOnJS(skip)(-1);
  });
  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <T dim={1}>Nothing is playing</T>
      </View>
    );
  }
  const { song } = item;
  const playing = status === 'playing' || status === 'buffering' || status === 'loading';
  const art = Math.min(width - 48, 420);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <LinearGradient colors={[t.accentSoft, t.bg]} style={{ position: 'absolute', inset: 0 } as never} />
      <View style={{ flex: 1, paddingTop: insets.top + 4, paddingBottom: insets.bottom + 12, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 48 }}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close player" hitSlop={10}>
            <ChevronDown color={t.textPrimary} size={30} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <T variant="label" dim={1}>Playing from {context?.type ?? 'queue'}</T>
            <T numberOfLines={1} style={{ fontWeight: '700', fontSize: 14 }}>{context?.name ?? 'Your queue'}</T>
          </View>
          <Pressable onPress={() => openSong(song)} accessibilityRole="button" accessibilityLabel="More options" hitSlop={10}>
            <MoreVertical color={t.textPrimary} size={24} />
          </Pressable>
        </View>

        <GestureDetector gesture={swipe}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {lyrics ? (
              <ScrollView style={{ alignSelf: 'stretch' }} contentContainerStyle={{ paddingVertical: 24 }}>
                <LyricsPanel />
              </ScrollView>
            ) : visualizer ? (
              immersive ? null : <Visualizer song={song} immersive={false} onImmersive={setImmersive} />
            ) : (
              <Artwork coverArtId={song.coverArtId} size={1000} kind="song" style={{ width: art, height: art, borderRadius: 12 }} />
            )}
          </View>
        </GestureDetector>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <T variant="h2" numberOfLines={1}>{song.title}</T>
            <T dim={1} numberOfLines={1}>{song.artist}</T>
          </View>
          <FavoriteToggle kind="song" item={song} size={28} />
        </View>
        <Seekbar />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Pressable onPress={() => playerStore.getState().toggleShuffle()} accessibilityRole="button" accessibilityLabel="Shuffle" accessibilityState={{ selected: shuffled }} hitSlop={10}>
            <Shuffle color={shuffled ? t.accent : t.textPrimary} size={24} />
          </Pressable>
          <Pressable onPress={() => playerStore.getState().previous()} accessibilityRole="button" accessibilityLabel="Previous" hitSlop={10}>
            <SkipBack color={t.textPrimary} fill={t.textPrimary} size={34} />
          </Pressable>
          <PlayButton playing={playing} loading={status === 'loading' || status === 'buffering'} onPress={() => playerStore.getState().togglePlay()} size={72} />
          <Pressable onPress={() => playerStore.getState().next()} accessibilityRole="button" accessibilityLabel="Next" hitSlop={10}>
            <SkipForward color={t.textPrimary} fill={t.textPrimary} size={34} />
          </Pressable>
          <Pressable onPress={() => playerStore.getState().cycleRepeat()} accessibilityRole="button" accessibilityLabel={`Repeat ${repeat}`} hitSlop={10}>
            {repeat === 'one' ? <Repeat1 color={t.accent} size={24} /> : <Repeat color={repeat === 'all' ? t.accent : t.textPrimary} size={24} />}
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
          <Pressable onPress={() => setLyrics((l) => !l)} accessibilityRole="button" accessibilityLabel="Lyrics" accessibilityState={{ selected: lyrics }} hitSlop={10}>
            <MicVocal color={lyrics ? t.accent : t.textSecondary} size={22} />
          </Pressable>
          <Pressable
            onPress={() => {
              setLyrics(false);
              preferencesStore.getState().set('visualizer', !visualizer);
            }}
            accessibilityRole="button"
            accessibilityLabel="Visualizer"
            accessibilityState={{ selected: visualizer }}
            hitSlop={10}
          >
            <AudioWaveform color={visualizer && !lyrics ? t.accent : t.textSecondary} size={22} />
          </Pressable>
          <Pressable onPress={() => router.push('/queue')} accessibilityRole="button" accessibilityLabel="Queue" hitSlop={10}>
            <ListMusic color={t.textSecondary} size={22} />
          </Pressable>
        </View>
      </View>
      {visualizer && immersive && !lyrics && <Visualizer song={song} immersive onImmersive={setImmersive} />}
    </View>
  );
}

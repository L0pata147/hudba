import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Pause, Play } from 'lucide-react-native';
import { playerStore, useCurrentItem, usePlayer } from '@sonora/core';
import { useTheme } from '../theme';
import { Artwork, T } from './ui';

/** Mini player above the tab bar: tap/swipe up opens the full player, swipe sideways skips. */
export function MiniPlayer() {
  const t = useTheme();
  const router = useRouter();
  const item = useCurrentItem();
  const status = usePlayer((s) => s.status);
  const progress = usePlayer((s) => (s.duration > 0 ? s.position / s.duration : 0));
  const x = useSharedValue(0);
  const openPlayer = () => router.push('/player');
  const skip = (dir: 1 | -1) => (dir > 0 ? playerStore.getState().next() : playerStore.getState().previous());
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = e.translationX * 0.6;
    })
    .onEnd((e) => {
      if (e.translationY < -40) runOnJS(openPlayer)();
      else if (e.translationX < -70) runOnJS(skip)(1);
      else if (e.translationX > 70) runOnJS(skip)(-1);
      x.value = withSpring(0);
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (!item) return null;
  const playing = status === 'playing' || status === 'buffering' || status === 'loading';
  return (
    <GestureDetector gesture={pan}>
      <Pressable
        onPress={openPlayer}
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${item.song.title} by ${item.song.artist}. Open player`}
        style={{ marginHorizontal: 8, marginBottom: 6, borderRadius: 10, backgroundColor: t.surfaceActive, overflow: 'hidden' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 }}>
          <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }, style]}>
            <Artwork coverArtId={item.song.coverArtId} size={96} style={{ width: 42, height: 42, borderRadius: 6 }} />
            <View style={{ flex: 1 }}>
              <T numberOfLines={1} style={{ fontWeight: '700', fontSize: 14 }}>{item.song.title}</T>
              <T numberOfLines={1} variant="caption" dim={1}>{item.song.artist}</T>
            </View>
          </Animated.View>
          <Pressable onPress={() => playerStore.getState().togglePlay()} hitSlop={10} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={{ padding: 8 }}>
            {playing ? <Pause color={t.textPrimary} fill={t.textPrimary} size={24} /> : <Play color={t.textPrimary} fill={t.textPrimary} size={24} />}
          </Pressable>
        </View>
        <View style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 8 }}>
          <View style={{ height: 2, width: `${progress * 100}%`, backgroundColor: t.textPrimary }} />
        </View>
      </Pressable>
    </GestureDetector>
  );
}

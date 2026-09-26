import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDown, ArrowUp, X } from 'lucide-react-native';
import type { QueueItem } from '@sonora/types';
import { playerStore, usePlayerShallow } from '@sonora/core';
import { Artwork, Button, EmptyState, T } from '../src/components/ui';
import { useTheme } from '../src/theme';

export default function Queue() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { queue, context } = usePlayerShallow((s) => ({ queue: s.queue, context: s.context }));
  const items = queue.items.slice(Math.max(0, queue.index));
  const renderRow = ({ item, index }: { item: QueueItem; index: number }) => {
    const abs = queue.index + index;
    const current = index === 0;
    return (
      <Pressable
        onPress={() => (current ? playerStore.getState().togglePlay() : playerStore.getState().playItem(item.uid))}
        accessibilityRole="button"
        accessibilityLabel={`${item.song.title}${current ? ', now playing' : ''}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}
      >
        <Artwork coverArtId={item.song.coverArtId} size={96} style={{ width: 44, height: 44, borderRadius: 6 }} />
        <View style={{ flex: 1 }}>
          <T numberOfLines={1} style={{ fontWeight: '600', color: current ? t.accent : t.textPrimary }}>{item.song.title}</T>
          <T variant="caption" dim={1} numberOfLines={1}>{item.song.artist}</T>
        </View>
        {!current ? (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {index > 1 ? (
              <Pressable onPress={() => playerStore.getState().moveInQueue(abs, abs - 1)} accessibilityLabel={`Move ${item.song.title} up`} hitSlop={8}>
                <ArrowUp color={t.textSecondary} size={20} />
              </Pressable>
            ) : null}
            {abs < queue.items.length - 1 ? (
              <Pressable onPress={() => playerStore.getState().moveInQueue(abs, abs + 1)} accessibilityLabel={`Move ${item.song.title} down`} hitSlop={8}>
                <ArrowDown color={t.textSecondary} size={20} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => playerStore.getState().removeFromQueue(item.uid)} accessibilityLabel={`Remove ${item.song.title} from queue`} hitSlop={8}>
              <X color={t.textSecondary} size={20} />
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    );
  };
  return (
    <View style={{ flex: 1, backgroundColor: t.bgElevated, paddingTop: 12, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 }}>
        <View>
          <T variant="h2">Queue</T>
          {context?.name ? <T variant="caption" dim={1}>Playing from {context.name}</T> : null}
        </View>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close queue" hitSlop={10}>
          <X color={t.textPrimary} size={26} />
        </Pressable>
      </View>
      <FlashList data={items} keyExtractor={(i) => i.uid} renderItem={renderRow} ListEmptyComponent={<EmptyState title="Your queue is empty" />} />
      {items.length > 1 ? (
        <View style={{ padding: 16 }}>
          <Button title="Clear upcoming" variant="secondary" onPress={() => playerStore.getState().clearQueue()} />
        </View>
      ) : null}
    </View>
  );
}

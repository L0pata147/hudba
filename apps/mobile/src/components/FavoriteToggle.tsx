import { Pressable } from 'react-native';
import { Heart } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { Album, Artist, Song } from '@sonora/types';
import { useIsStarred, useToggleFavorite } from '@sonora/core';
import { useTheme } from '../theme';

export function FavoriteToggle({ kind, item, size = 26 }: { kind: 'song' | 'album' | 'artist'; item: Song | Album | Artist; size?: number }) {
  const t = useTheme();
  const starred = useIsStarred(kind, item);
  const toggle = useToggleFavorite();
  return (
    <Pressable
      hitSlop={10}
      accessibilityRole="button"
      accessibilityState={{ selected: starred }}
      accessibilityLabel={starred ? 'Remove from Favorites' : 'Add to Favorites'}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggle.mutate({ kind, item, starred: !starred });
      }}
    >
      <Heart color={starred ? t.accent : t.textSecondary} fill={starred ? t.accent : 'transparent'} size={size} />
    </Pressable>
  );
}

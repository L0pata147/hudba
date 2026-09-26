import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Shuffle, MoreVertical } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Artwork, PlayButton, T } from './ui';
import { useTheme } from '../theme';

/** Header for album / artist / playlist screens. */
export function CollectionHeader({
  title,
  subtitle,
  meta,
  coverArtId,
  uri,
  round,
  playing,
  onPlay,
  onShuffle,
  onMore,
  extra,
  kind = 'album',
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  coverArtId?: string;
  uri?: string;
  round?: boolean;
  playing: boolean;
  onPlay: () => void;
  onShuffle: () => void;
  onMore?: () => void;
  extra?: ReactNode;
  kind?: 'album' | 'artist' | 'playlist';
}) {
  const t = useTheme();
  return (
    <View>
      <LinearGradient colors={[t.accentSoft, 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 380 }} />
      <View style={{ alignItems: 'center', paddingTop: 72, paddingHorizontal: 24 }}>
        <Artwork coverArtId={coverArtId} uri={uri} kind={kind} round={round} size={600} style={{ width: 230, height: 230, borderRadius: round ? 115 : 10 }} />
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 4 }}>
        <T variant="h1" numberOfLines={2} accessibilityRole="header">{title}</T>
        {subtitle ? <T style={{ fontWeight: '700' }}>{subtitle}</T> : null}
        {meta ? <T variant="caption" dim={1}>{meta}</T> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14 }}>
        {extra}
        {onMore ? (
          <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel="More options" hitSlop={10}>
            <MoreVertical color={t.textSecondary} size={24} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onShuffle} accessibilityRole="button" accessibilityLabel="Shuffle" hitSlop={10}>
          <Shuffle color={t.textSecondary} size={26} />
        </Pressable>
        <PlayButton playing={playing} onPress={onPlay} size={56} />
      </View>
    </View>
  );
}

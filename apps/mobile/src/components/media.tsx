import { memo, type ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Heart, MoreVertical, DownloadCloud } from 'lucide-react-native';
import type { Album, Artist, Playlist, Song } from '@sonora/types';
import { useDownloads, useIsStarred, useSongPlayState } from '@sonora/core';
import { formatDuration, pluralize } from '@sonora/utils';
import { Artwork, T, Tap } from './ui';
import { useTheme } from '../theme';

export const TrackRow = memo(function TrackRow({
  song,
  number,
  showArt = true,
  onPress,
  onMore,
}: {
  song: Song;
  number?: number;
  showArt?: boolean;
  onPress: () => void;
  onMore: () => void;
}) {
  const t = useTheme();
  const { isCurrent } = useSongPlayState(song.id);
  const starred = useIsStarred('song', song);
  const offline = useDownloads((s) => s.records[song.id]?.status === 'done');
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      accessibilityRole="button"
      accessibilityLabel={`${song.title} by ${song.artist}${isCurrent ? ', now playing' : ''}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? t.surfaceHover : 'transparent' })}
    >
      {number != null && !showArt ? (
        <T dim={1} style={{ width: 22, textAlign: 'right', color: isCurrent ? t.accent : t.textSecondary }}>{number}</T>
      ) : null}
      {showArt ? <Artwork coverArtId={song.coverArtId} size={96} kind="song" style={{ width: 48, height: 48, borderRadius: 6 }} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '500', color: isCurrent ? t.accent : t.textPrimary }}>{song.title}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {starred ? <Heart size={12} color={t.accent} fill={t.accent} /> : null}
          {offline ? <DownloadCloud size={13} color={t.accent} /> : null}
          <T variant="caption" dim={1} numberOfLines={1} style={{ flexShrink: 1 }}>
            {song.artist} · {formatDuration(song.duration)}
          </T>
        </View>
      </View>
      <Pressable onPress={onMore} hitSlop={12} accessibilityRole="button" accessibilityLabel={`More options for ${song.title}`}>
        <MoreVertical color={t.textSecondary} size={20} />
      </Pressable>
    </Pressable>
  );
});

export function Card({ title, subtitle, coverArtId, uri, round, kind, onPress, onLongPress, width = 150 }: { title: string; subtitle?: string; coverArtId?: string; uri?: string; round?: boolean; kind: 'album' | 'artist' | 'playlist'; onPress: () => void; onLongPress?: () => void; width?: number }) {
  return (
    <Tap onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}`} style={{ width }}>
      <Artwork coverArtId={coverArtId} uri={uri} kind={kind} round={round} size={300} style={{ width, height: width, borderRadius: round ? width / 2 : 8 }} />
      <T numberOfLines={1} style={{ fontWeight: '600', marginTop: 8, textAlign: round ? 'center' : 'left' }}>{title}</T>
      {subtitle ? <T variant="caption" dim={1} numberOfLines={1} style={{ textAlign: round ? 'center' : 'left' }}>{subtitle}</T> : null}
    </Tap>
  );
}

export function AlbumCard({ album, width }: { album: Album; width?: number }) {
  const router = useRouter();
  return <Card kind="album" title={album.name} subtitle={album.artist} coverArtId={album.coverArtId} width={width} onPress={() => router.push(`/album/${album.id}`)} />;
}

export function ArtistCard({ artist, width }: { artist: Artist; width?: number }) {
  const router = useRouter();
  return <Card kind="artist" round title={artist.name} subtitle={pluralize(artist.albumCount, 'album')} coverArtId={artist.coverArtId} uri={artist.imageUrl} width={width} onPress={() => router.push(`/artist/${artist.id}`)} />;
}

export function PlaylistCard({ playlist, width }: { playlist: Playlist; width?: number }) {
  const router = useRouter();
  return <Card kind="playlist" title={playlist.name} subtitle={pluralize(playlist.songCount, 'song')} coverArtId={playlist.coverArtId} width={width} onPress={() => router.push(`/playlist/${playlist.id}`)} />;
}

export function Shelf<T>({ title, items, keyOf, render, action }: { title: string; items: T[]; keyOf: (i: T) => string; render: (i: T) => ReactNode; action?: ReactNode }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 12 }} accessibilityRole="summary" accessibilityLabel={title}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 }}>
        <T variant="h2">{title}</T>
        {action}
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={keyOf}
        renderItem={({ item }) => <>{render(item)}</>}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
        initialNumToRender={4}
        windowSize={5}
      />
    </View>
  );
}

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { PlaybackContext, Song } from '@sonora/types';
import { playerStore, useContextPlayState } from '@sonora/core';
import { TrackRow } from './media';
import { CollectionHeader } from './Collection';
import { BackButton, TopInset } from './Screen';
import { EmptyState, ErrorState, RowsSkeleton } from './ui';
import { useSongSheet } from '../actions';

/**
 * A pushed screen listing songs under a header with play / shuffle: genres,
 * daily mixes, smart playlists, history, downloads.
 */
export function SongListScreen({
  title,
  subtitle,
  meta,
  art,
  songs,
  context,
  loading,
  error,
  onRetry,
  onEndReached,
  onMore,
  extra,
  empty,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  art?: ReactNode;
  songs: Song[];
  context: PlaybackContext;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onEndReached?: () => void;
  onMore?: () => void;
  extra?: ReactNode;
  empty?: { title: string; message?: string };
}) {
  const { isCurrent, isPlaying } = useContextPlayState(context.type, context.id);
  const openSong = useSongSheet();
  if (error) return <TopInset><BackButton /><View style={{ marginTop: 48 }}><ErrorState error={error} onRetry={onRetry} /></View></TopInset>;
  if (loading) return <TopInset><BackButton /><View style={{ marginTop: 64 }}><RowsSkeleton /></View></TopInset>;
  const play = (shuffle = false) => {
    if (!songs.length) return;
    if (isCurrent && !shuffle) return playerStore.getState().togglePlay();
    playerStore.getState().playSongs(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0, { context, shuffle: shuffle || undefined });
  };
  return (
    <View style={{ flex: 1 }}>
      <BackButton />
      <FlashList
        data={songs}
        keyExtractor={(s, i) => `${s.id}-${i}`}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={<CollectionHeader title={title} subtitle={subtitle} meta={meta} art={art} playing={isPlaying} onPlay={() => play()} onShuffle={() => play(true)} onMore={onMore} extra={extra} />}
        ListEmptyComponent={empty ? <EmptyState title={empty.title} message={empty.message} /> : null}
        renderItem={({ item, index }) => <TrackRow song={item} onPress={() => playerStore.getState().playSongs(songs, index, { context })} onMore={() => openSong(item)} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}

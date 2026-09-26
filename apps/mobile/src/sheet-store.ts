import type { ReactNode } from 'react';
import { create } from 'zustand';
import type { Song } from '@sonora/types';

export interface SheetAction {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  danger?: boolean;
}

interface SheetState {
  sheet: { title: string; subtitle?: string; coverArtId?: string; actions: SheetAction[] } | null;
  addToPlaylist: Song[] | null;
  prompt: { title: string; initial?: string; confirm: string; onSubmit: (value: string) => void } | null;
  open(sheet: NonNullable<SheetState['sheet']>): void;
  close(): void;
  openAddToPlaylist(songs: Song[]): void;
  openPrompt(p: NonNullable<SheetState['prompt']>): void;
}

export const useSheet = create<SheetState>()((set) => ({
  sheet: null,
  addToPlaylist: null,
  prompt: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null, addToPlaylist: null, prompt: null }),
  openAddToPlaylist: (songs) => set({ addToPlaylist: songs, sheet: null }),
  openPrompt: (prompt) => set({ prompt, sheet: null, addToPlaylist: null }),
}));

import type { ReactNode } from 'react';
import { create } from 'zustand';
import type { Playlist, Song } from '@sonora/types';

export interface MenuItemDef {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export interface MenuHeader {
  title: string;
  subtitle?: string;
  coverArtId?: string;
  round?: boolean;
}

interface MenuRequest {
  items: MenuItemDef[];
  header?: MenuHeader;
  /** viewport position for desktop popovers */
  x: number;
  y: number;
  /** element that opened the menu, focus returns here */
  returnFocus?: HTMLElement | null;
}

export type DialogRequest =
  | { type: 'add-to-playlist'; songs: Song[] }
  | { type: 'create-playlist'; songs?: Song[] }
  | { type: 'edit-playlist'; playlist: Playlist }
  | { type: 'equalizer' }
  | { type: 'confirm'; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void };

interface UiState {
  queueOpen: boolean;
  nowPlayingOpen: boolean;
  lyricsOpen: boolean;
  menu: MenuRequest | null;
  dialog: DialogRequest | null;
  /** increments to ask the search field to focus */
  searchFocusSignal: number;
  setQueueOpen(open: boolean): void;
  toggleQueue(): void;
  setNowPlayingOpen(open: boolean): void;
  setLyricsOpen(open: boolean): void;
  openMenu(req: MenuRequest): void;
  closeMenu(): void;
  openDialog(d: DialogRequest): void;
  closeDialog(): void;
  focusSearch(): void;
}

export const useUi = create<UiState>()((set) => ({
  queueOpen: false,
  nowPlayingOpen: false,
  lyricsOpen: false,
  menu: null,
  dialog: null,
  searchFocusSignal: 0,
  setQueueOpen: (queueOpen) => set({ queueOpen }),
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  setNowPlayingOpen: (nowPlayingOpen) => set({ nowPlayingOpen }),
  setLyricsOpen: (lyricsOpen) => set({ lyricsOpen }),
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
  openDialog: (dialog) => set({ dialog, menu: null }),
  closeDialog: () => set({ dialog: null }),
  focusSearch: () => set((s) => ({ searchFocusSignal: s.searchFocusSignal + 1 })),
}));

/** Opens a menu anchored to a button (or at the pointer for right-clicks). */
export function openMenuFrom(e: React.MouseEvent | React.KeyboardEvent, items: MenuItemDef[], header?: MenuHeader): void {
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement;
  let x: number;
  let y: number;
  if ('clientX' in e && e.type === 'contextmenu') {
    x = e.clientX;
    y = e.clientY;
  } else {
    const r = target.getBoundingClientRect();
    x = r.right;
    y = r.bottom + 4;
  }
  useUi.getState().openMenu({ items, header, x, y, returnFocus: target });
}

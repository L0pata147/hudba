import { create } from 'zustand';
import { isTauri } from '../platform';

/** Size of the mini player window (logical px). */
export const MINI_SIZE = { w: 380, h: 112 };
const NORMAL_MIN = { w: 900, h: 620 };

interface Saved {
  w: number;
  h: number;
  x: number;
  y: number;
  maximized: boolean;
}
let saved: Saved | null = null;

/**
 * Mini player (desktop app): the main window shrinks into a small frameless
 * strip that stays on top of other windows, and grows back to where it was.
 * Playback never moves, so nothing has to be kept in sync.
 */
export const useMiniMode = create<{ on: boolean; enter(): Promise<void>; exit(): Promise<void> }>((set, get) => ({
  on: false,
  async enter() {
    if (!isTauri || get().on) return;
    const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
    const w = getCurrentWindow();
    const [size, pos, maximized] = await Promise.all([w.outerSize(), w.outerPosition(), w.isMaximized()]);
    saved = { w: size.width, h: size.height, x: pos.x, y: pos.y, maximized };
    set({ on: true });
    if (maximized) await w.unmaximize();
    await w.setDecorations(false);
    await w.setMinSize(new LogicalSize(MINI_SIZE.w, MINI_SIZE.h));
    await w.setSize(new LogicalSize(MINI_SIZE.w, MINI_SIZE.h));
    await w.setResizable(false);
    await w.setAlwaysOnTop(true);
  },
  async exit() {
    if (!isTauri || !get().on) return;
    const { getCurrentWindow, LogicalSize, PhysicalPosition, PhysicalSize } = await import('@tauri-apps/api/window');
    const w = getCurrentWindow();
    await w.setAlwaysOnTop(false);
    await w.setResizable(true);
    await w.setDecorations(true);
    await w.setMinSize(new LogicalSize(NORMAL_MIN.w, NORMAL_MIN.h));
    if (saved) {
      await w.setSize(new PhysicalSize(saved.w, saved.h));
      await w.setPosition(new PhysicalPosition(saved.x, saved.y));
      if (saved.maximized) await w.maximize();
    }
    set({ on: false });
  },
}));

// Dev/test diagnostics only: lets the browser preview show the mini player.
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __sonoraMini?: typeof useMiniMode }).__sonoraMini = useMiniMode;

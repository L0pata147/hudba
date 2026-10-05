import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';
import { isTauri } from '../platform';
import pkg from '../../package.json';

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'error';

interface UpdaterState {
  status: UpdateStatus;
  /** version of the running app */
  current: string;
  /** version offered by GitHub */
  version: string | null;
  notes: string | null;
  /** 0…1 while downloading */
  progress: number;
  error: string | null;
  dismissed: boolean;
  check(opts?: { quiet?: boolean }): Promise<void>;
  install(): Promise<void>;
  dismiss(): void;
}

let pending: Update | null = null;

/**
 * Desktop self-update from the GitHub "Latest build" release (Tauri updater:
 * latest.json + minisign-signed installer). In the browser it does nothing.
 */
export const useUpdater = create<UpdaterState>()((set, get) => ({
  status: 'idle',
  current: pkg.version,
  version: null,
  notes: null,
  progress: 0,
  error: null,
  dismissed: false,
  async check({ quiet = false } = {}) {
    if (!isTauri || get().status === 'checking' || get().status === 'downloading') return;
    set({ status: 'checking', error: null });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      pending = update;
      if (update) set({ status: 'available', version: update.version, notes: update.body ?? null, dismissed: false });
      else set({ status: 'none' });
    } catch (e) {
      // A quiet start-up check stays silent (offline, no release with update files yet…).
      set({ status: quiet ? 'idle' : 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
  async install() {
    const update = pending;
    if (!update) return;
    set({ status: 'downloading', progress: 0, error: null });
    try {
      let total = 0;
      let got = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        else if (event.event === 'Progress') {
          got += event.data.chunkLength;
          set({ progress: total ? Math.min(1, got / total) : 0 });
        } else if (event.event === 'Finished') set({ status: 'installing', progress: 1 });
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
  dismiss: () => set({ dismissed: true }),
}));

/** The real app version (set by the build) instead of package.json's. */
export async function loadAppVersion(): Promise<void> {
  if (!isTauri) return;
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    useUpdater.setState({ current: await getVersion() });
  } catch {
    // keep package.json's version
  }
}

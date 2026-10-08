import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';

/** Written next to the APK by the release build. */
const MANIFEST = 'https://github.com/L0pata147/hudba/releases/download/latest-build/android-version.json';

interface Manifest {
  version: string;
  versionCode: number;
  url: string;
}

export type UpdateStatus = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'error';

interface UpdaterState {
  status: UpdateStatus;
  /** version of the running app */
  current: string;
  /** version offered by GitHub */
  version: string | null;
  /** 0…1 while downloading */
  progress: number;
  error: string | null;
  dismissed: boolean;
  check(opts?: { quiet?: boolean }): Promise<void>;
  install(): Promise<void>;
  dismiss(): void;
}

/** Build number of the running APK; 0 for dev builds (which never update themselves). */
const currentCode = (): number => Number(Constants.expoConfig?.android?.versionCode ?? 0);

let offer: Manifest | null = null;

/**
 * Android self-update from the GitHub "Latest build" release: compares the
 * build number, downloads the new APK and opens the system installer. The APK
 * is always signed with the same key, so it installs over the current app.
 */
export const useUpdater = create<UpdaterState>()((set, get) => ({
  status: 'idle',
  current: Constants.expoConfig?.version ?? '0.0.0',
  version: null,
  progress: 0,
  error: null,
  dismissed: false,
  async check({ quiet = false } = {}) {
    if (Platform.OS !== 'android' || get().status === 'checking' || get().status === 'downloading') return;
    if (!currentCode()) {
      if (!quiet) set({ status: 'error', error: 'Development build: updates come with release builds only.' });
      return;
    }
    set({ status: 'checking', error: null });
    try {
      const res = await fetch(`${MANIFEST}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = (await res.json()) as Manifest;
      if (m.versionCode > currentCode()) {
        offer = m;
        set({ status: 'available', version: m.version, dismissed: false });
      } else set({ status: 'none' });
    } catch (e) {
      // A quiet start-up check stays silent (offline, no manifest published yet…).
      set({ status: quiet ? 'idle' : 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
  async install() {
    const m = offer;
    if (!m) return;
    set({ status: 'downloading', progress: 0, error: null });
    try {
      const dir = new Directory(Paths.cache, 'update');
      if (dir.exists) dir.delete();
      dir.create({ intermediates: true });
      const apk = await File.downloadFileAsync(m.url, new File(dir, `Sonora-${m.versionCode}.apk`), {
        onProgress: ({ bytesWritten, totalBytes }) => totalBytes > 0 && set({ progress: Math.min(1, bytesWritten / totalBytes) }),
      });
      set({ status: 'installing', progress: 1 });
      const { startActivityAsync } = await import('expo-intent-launcher');
      // contentUri is a native property of File (content:// through expo-file-system's FileProvider).
      const uri = (apk as File & { contentUri: string }).contentUri;
      await startActivityAsync('android.intent.action.VIEW', {
        data: uri,
        type: 'application/vnd.android.package-archive',
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
      // Back here if the installer was cancelled.
      set({ status: 'available' });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
  dismiss: () => set({ dismissed: true }),
}));

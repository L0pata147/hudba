/**
 * Platform adapters. Each app (desktop/web, mobile) calls `configurePlatform`
 * once at startup, before hydrating the stores.
 */
import type { StateStorage } from 'zustand/middleware';
import type { Song } from '@sonora/types';

/** Sync or async key/value storage (localStorage, AsyncStorage, …). */
export type KeyValueStorage = StateStorage;

export interface OfflineStorageAdapter {
  /** Downloads the file and returns a platform-specific location handle. */
  download(song: Song, url: string, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<{ location: string; bytes: number }>;
  /** Returns a URL the audio engine can play, or null when the file is gone. */
  resolve(location: string): Promise<string | null>;
  remove(location: string): Promise<void>;
  /** Releases a URL previously returned by `resolve` (e.g. object URLs). */
  release?(url: string): void;
  clear(): Promise<void>;
}

export interface PlatformConfig {
  /** General app storage (preferences, queue, history, cache index). */
  storage: KeyValueStorage;
  /**
   * Storage for the session token. Keychain/Keystore on mobile; on web/desktop
   * this falls back to app-private storage (see README "Security").
   */
  secureStorage: KeyValueStorage;
  offline?: OfflineStorageAdapter;
  clientName: string;
  platform: 'web' | 'desktop' | 'ios' | 'android';
}

export function createMemoryStorage(): KeyValueStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    dump: () => Object.fromEntries(map),
  };
}

let config: PlatformConfig = {
  storage: createMemoryStorage(),
  secureStorage: createMemoryStorage(),
  clientName: 'Sonora',
  platform: 'web',
};

export function configurePlatform(next: Partial<PlatformConfig>): void {
  config = { ...config, ...next };
}

export function platform(): PlatformConfig {
  return config;
}

/**
 * Storage proxies resolved lazily at call time, so stores can be created at
 * import time and still use whatever the app configures later.
 */
export const lazyStorage: KeyValueStorage = {
  getItem: (k) => config.storage.getItem(k),
  setItem: (k, v) => config.storage.setItem(k, v),
  removeItem: (k) => config.storage.removeItem(k),
};

export const lazySecureStorage: KeyValueStorage = {
  getItem: (k) => config.secureStorage.getItem(k),
  setItem: (k, v) => config.secureStorage.setItem(k, v),
  removeItem: (k) => config.secureStorage.removeItem(k),
};

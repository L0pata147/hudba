import type { KeyValueStorage } from '@sonora/core';

/**
 * localStorage-backed storage that never throws (private mode, quota, disabled
 * storage). In Tauri this lives in the app's private WebView data directory.
 */
export function createWebStorage(prefix = ''): KeyValueStorage {
  const mem = new Map<string, string>();
  const ls = (() => {
    try {
      const probe = '__sonora_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  return {
    getItem(key) {
      try {
        return ls ? ls.getItem(prefix + key) : (mem.get(key) ?? null);
      } catch {
        return mem.get(key) ?? null;
      }
    },
    setItem(key, value) {
      try {
        if (ls) ls.setItem(prefix + key, value);
        else mem.set(key, value);
      } catch {
        mem.set(key, value);
      }
    },
    removeItem(key) {
      try {
        ls?.removeItem(prefix + key);
      } catch {
        /* ignore */
      }
      mem.delete(key);
    },
  };
}

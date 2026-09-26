import type { OfflineStorageAdapter } from '@sonora/core';

const CACHE_NAME = 'sonora-audio-v1';
const keyFor = (songId: string) => `https://sonora.offline/audio/${encodeURIComponent(songId)}`;

export function isOfflineStorageSupported(): boolean {
  return typeof caches !== 'undefined' && typeof ReadableStream !== 'undefined';
}

/**
 * Offline audio stored in Cache Storage (persists across restarts in browsers
 * and in the Tauri WebView). Files are played back through object URLs, so
 * playback works without any network connection.
 */
export function createCacheStorageOfflineAdapter(): OfflineStorageAdapter {
  return {
    async download(song, url, onProgress, signal) {
      const res = await fetch(url, { signal });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
      const type = res.headers.get('content-type') ?? song.contentType ?? 'audio/mpeg';
      if (type.includes('json') || type.includes('xml')) throw new Error('The server refused the download');
      const total = Number(res.headers.get('content-length')) || song.size || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (total) onProgress(Math.min(0.99, received / total));
      }
      const blob = new Blob(chunks as BlobPart[], { type });
      const cache = await caches.open(CACHE_NAME);
      const key = keyFor(song.id);
      await cache.put(key, new Response(blob, { headers: { 'content-type': type, 'content-length': String(blob.size) } }));
      if (navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);
      return { location: key, bytes: blob.size };
    },
    async resolve(location) {
      const cache = await caches.open(CACHE_NAME);
      const res = await cache.match(location);
      if (!res) return null;
      return URL.createObjectURL(await res.blob());
    },
    release(url) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    },
    async remove(location) {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(location);
    },
    async clear() {
      await caches.delete(CACHE_NAME);
    },
  };
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

import { Directory, File, Paths } from 'expo-file-system';
import type { OfflineStorageAdapter } from '@sonora/core';

const dir = () => new Directory(Paths.document, 'sonora-offline');

/** Offline audio in the app's private document directory (excluded from nothing, survives restarts). */
export function createFileSystemOfflineAdapter(): OfflineStorageAdapter {
  return {
    async download(song, url, onProgress, signal) {
      const d = dir();
      d.create({ idempotent: true, intermediates: true });
      const ext = song.suffix && /^[a-z0-9]{1,5}$/i.test(song.suffix) ? song.suffix : 'audio';
      const target = new File(d, `${song.id.replace(/[^A-Za-z0-9_-]/g, '_')}.${ext}`);
      if (target.exists) target.delete();
      const file = await File.downloadFileAsync(url, target, {
        idempotent: true,
        signal,
        onProgress: ({ bytesWritten, totalBytes }) => totalBytes > 0 && onProgress(Math.min(0.99, bytesWritten / totalBytes)),
      });
      return { location: file.uri, bytes: file.size ?? 0 };
    },
    async resolve(location) {
      const f = new File(location);
      return f.exists ? f.uri : null;
    },
    async remove(location) {
      const f = new File(location);
      if (f.exists) f.delete();
    },
    async clear() {
      const d = dir();
      if (d.exists) d.delete();
    },
  };
}

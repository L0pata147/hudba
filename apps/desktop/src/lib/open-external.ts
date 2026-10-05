import { isTauri } from '../platform';

/** Opens a web page in the system browser (desktop app) or a new tab (web). */
export async function openExternal(url: string): Promise<void> {
  if (isTauri) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

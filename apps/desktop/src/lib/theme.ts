import { accents } from '@sonora/ui';
import type { AccentColor, ThemeMode } from '@sonora/types';

export function applyTheme(theme: ThemeMode, accent: AccentColor, compact: boolean): void {
  const root = document.documentElement;
  const resolved =
    theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  root.dataset.theme = resolved;
  root.dataset.compact = String(compact);
  const a = accents[accent] ?? accents.ember;
  root.style.setProperty('--accent', a.base);
  root.style.setProperty('--accent-strong', a.strong);
  root.style.setProperty('--accent-on', a.on);
  root.style.setProperty('--accent-soft', a.soft);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#F4F4F7' : '#08080B');
}

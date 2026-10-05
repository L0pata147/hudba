import { accents, getSkin, type SkinFont } from '@sonora/ui';
import type { AccentColor, ThemeMode } from '@sonora/types';

const FONTS: Record<SkinFont, string> = {
  sans: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', 'Noto Serif', serif",
  mono: "'Cascadia Mono', Consolas, 'DejaVu Sans Mono', 'Courier New', monospace",
  condensed: "'Bahnschrift Condensed', 'Arial Narrow', 'Roboto Condensed', 'Liberation Sans Narrow', Impact, sans-serif",
  rounded: "'Trebuchet MS', Tahoma, 'Segoe UI', 'DejaVu Sans', sans-serif",
  pixel: "'Silkscreen', Tahoma, monospace",
};
const DISPLAY_FONTS: Partial<Record<SkinFont, string>> = {
  sans: "'Plus Jakarta Sans Variable', 'Inter Variable', system-ui, sans-serif",
  mono: "'VT323', 'Cascadia Mono', Consolas, monospace",
};

/** CSS variables a skin overrides (removed again when going back to the plain theme). */
const SKIN_VARS: Record<string, string> = {
  bg: '--bg',
  bgElevated: '--bg-elevated',
  surface: '--surface',
  surfaceHover: '--surface-hover',
  surfaceActive: '--surface-active',
  border: '--border',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  overlay: '--overlay',
  danger: '--danger',
  success: '--success',
  warning: '--warning',
};
const EXTRA_VARS = ['--skin-background', '--app-font-sans', '--app-font-display', '--radius-scale'];

export function applyTheme(theme: ThemeMode, accent: AccentColor, compact: boolean, skinId = 'sonora'): void {
  const root = document.documentElement;
  const skin = getSkin(skinId);
  root.dataset.compact = String(compact);
  root.dataset.skin = skin.id;
  if (skin.id === 'sonora') {
    for (const v of [...Object.values(SKIN_VARS), ...EXTRA_VARS]) root.style.removeProperty(v);
    delete root.dataset.pattern;
    delete root.dataset.uppercase;
    const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
    root.dataset.theme = resolved;
    const a = accents[accent] ?? accents.ember;
    root.style.setProperty('--accent', a.base);
    root.style.setProperty('--accent-strong', a.strong);
    root.style.setProperty('--accent-on', a.on);
    root.style.setProperty('--accent-soft', a.soft);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#F4F4F7' : '#08080B');
    return;
  }
  root.dataset.theme = skin.mode;
  for (const [key, cssVar] of Object.entries(SKIN_VARS)) root.style.setProperty(cssVar, skin.colors[key as keyof typeof skin.colors]);
  root.style.setProperty('--accent', skin.accent.base);
  root.style.setProperty('--accent-strong', skin.accent.strong);
  root.style.setProperty('--accent-on', skin.accent.on);
  root.style.setProperty('--accent-soft', skin.accent.soft);
  root.style.setProperty('--skin-background', `linear-gradient(180deg, ${skin.background.join(', ')})`);
  root.style.setProperty('--app-font-sans', FONTS[skin.font]);
  root.style.setProperty('--app-font-display', DISPLAY_FONTS[skin.displayFont] ?? FONTS[skin.displayFont]);
  root.style.setProperty('--radius-scale', String(skin.radius));
  if (skin.pattern) root.dataset.pattern = skin.pattern;
  else delete root.dataset.pattern;
  if (skin.uppercase) root.dataset.uppercase = '';
  else delete root.dataset.uppercase;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', skin.background[0] ?? skin.colors.bg);
}

/**
 * Sonora design tokens.
 *
 * Single source of truth for colors, spacing, radii, typography and motion.
 * The desktop app turns these into CSS custom properties (see
 * `apps/desktop/src/styles/tokens.css`), the mobile app consumes them directly
 * from JS in StyleSheets.
 */
import type { AccentColor } from '@sonora/types';

export const palette = {
  ink950: '#08080B',
  ink900: '#0E0E13',
  ink850: '#131319',
  ink800: '#18181F',
  ink750: '#1E1E27',
  ink700: '#26262F',
  ink600: '#34343F',
  ink500: '#4A4A57',
  ink400: '#6E6E7C',
  ink300: '#9A9AA8',
  ink200: '#C4C4CF',
  ink100: '#E6E6EE',
  ink50: '#F6F6FA',
  white: '#FFFFFF',
  black: '#000000',
  danger: '#FF5C6C',
  warning: '#FFB547',
  success: '#3DDC97',
} as const;

export interface AccentSwatch {
  name: string;
  /** main accent */
  base: string;
  /** hover / pressed */
  strong: string;
  /** text/icons on top of the accent */
  on: string;
  /** subtle tinted background */
  soft: string;
}

export const accents: Record<AccentColor, AccentSwatch> = {
  ember: { name: 'Ember', base: '#FF7A45', strong: '#FF905F', on: '#1A0B04', soft: 'rgba(255,122,69,0.16)' },
  aqua: { name: 'Aqua', base: '#2BD9C4', strong: '#52E6D4', on: '#03201C', soft: 'rgba(43,217,196,0.16)' },
  violet: { name: 'Violet', base: '#9D7BFF', strong: '#B39AFF', on: '#140A33', soft: 'rgba(157,123,255,0.18)' },
  lime: { name: 'Lime', base: '#B8F04A', strong: '#C9F776', on: '#172504', soft: 'rgba(184,240,74,0.16)' },
  rose: { name: 'Rose', base: '#FF5FA2', strong: '#FF82B7', on: '#2A0616', soft: 'rgba(255,95,162,0.16)' },
  gold: { name: 'Gold', base: '#FFC940', strong: '#FFD76E', on: '#2A1E00', soft: 'rgba(255,201,64,0.16)' },
};

export const DEFAULT_ACCENT: AccentColor = 'ember';

export interface ThemeColors {
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceHover: string;
  surfaceActive: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  overlay: string;
  danger: string;
  success: string;
  warning: string;
}

export const darkTheme: ThemeColors = {
  bg: palette.ink950,
  bgElevated: palette.ink900,
  surface: palette.ink850,
  surfaceHover: palette.ink750,
  surfaceActive: palette.ink700,
  border: 'rgba(255,255,255,0.07)',
  textPrimary: palette.ink50,
  textSecondary: palette.ink300,
  textMuted: palette.ink400,
  overlay: 'rgba(4,4,6,0.72)',
  danger: palette.danger,
  success: palette.success,
  warning: palette.warning,
};

export const lightTheme: ThemeColors = {
  bg: '#F4F4F7',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceHover: '#ECECF1',
  surfaceActive: '#E2E2E9',
  border: 'rgba(10,10,20,0.08)',
  textPrimary: '#121218',
  textSecondary: '#555563',
  textMuted: '#7C7C8A',
  overlay: 'rgba(20,20,28,0.45)',
  danger: '#E23A4C',
  success: '#159D66',
  warning: '#C98100',
};

/** 4px based spacing scale. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const fontFamily = {
  display: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
  body: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 44,
  hero: 64,
} as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

/** Layout constants shared by web and mobile. */
export const layout = {
  sidebarWidth: 264,
  sidebarCollapsedWidth: 76,
  playerBarHeight: 88,
  miniPlayerHeight: 60,
  bottomNavHeight: 64,
  contentMaxWidth: 1680,
} as const;

/* ------------------------------------------------------------------ */
/* Color helpers (used for artwork-driven gradients)                   */
/* ------------------------------------------------------------------ */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, l };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const conv = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: Math.round(conv(hue + 1 / 3) * 255),
    g: Math.round(conv(hue) * 255),
    b: Math.round(conv(hue - 1 / 3) * 255),
  };
}

export function rgbToCss({ r, g, b }: RGB, alpha = 1): string {
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Normalizes an extracted artwork color into something usable as a dark UI
 * backdrop: keeps the hue, caps saturation and pins lightness to a dark range
 * so white text on top always keeps enough contrast.
 */
export function toBackdropColor(color: RGB): RGB {
  const { h, s, l } = rgbToHsl(color);
  const sat = Math.min(0.65, Math.max(0.18, s));
  const light = Math.min(0.34, Math.max(0.2, l * 0.55));
  return hslToRgb(h, sat, light);
}

export const FALLBACK_BACKDROP: RGB = { r: 58, g: 44, b: 70 };

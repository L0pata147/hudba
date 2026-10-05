import type { AccentSwatch, ThemeColors } from './index';

/**
 * App skins: complete looks (colours, accent, fonts, corner radius and a
 * background) inspired by classic players, anime and old desktops. `sonora`
 * means "no skin" — the normal theme + accent preferences apply.
 */
export type SkinId = 'sonora' | 'classic-amp' | 'space-cowboy' | 'unit-01' | 'luna' | 'vaporwave' | 'terminal';

/** Font families by kind; each platform maps them to fonts it has. */
export type SkinFont = 'sans' | 'serif' | 'mono' | 'condensed' | 'rounded' | 'pixel';

export interface Skin {
  id: SkinId;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  colors: ThemeColors;
  accent: AccentSwatch;
  /** body text / headings */
  font: SkinFont;
  displayFont: SkinFont;
  /** multiplies all corner radii (0 = square, 1 = default) */
  radius: number;
  /** page background: gradient stops top → bottom (drawn behind everything; panels are slightly see-through) */
  background: string[];
  /** optional decorative overlay drawn over the page background */
  pattern?: 'scanlines' | 'grid' | 'dots' | 'bevel' | 'stars';
  /** display headings in upper case */
  uppercase?: boolean;
}

const dark = (c: Partial<ThemeColors> & Pick<ThemeColors, 'bg' | 'bgElevated' | 'surface' | 'surfaceHover' | 'surfaceActive' | 'textPrimary' | 'textSecondary' | 'textMuted'>): ThemeColors => ({
  border: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(4,4,6,0.72)',
  danger: '#FF5C6C',
  success: '#3DDC97',
  warning: '#FFB547',
  ...c,
});

export const SKINS: Skin[] = [
  {
    id: 'sonora',
    name: 'Sonora',
    description: 'The default look — uses your theme and accent colour.',
    mode: 'dark',
    colors: dark({ bg: '#08080B', bgElevated: '#0E0E13', surface: '#131319', surfaceHover: '#1E1E27', surfaceActive: '#26262F', textPrimary: '#F6F6FA', textSecondary: '#9A9AA8', textMuted: '#6E6E7C' }),
    accent: { name: 'Ember', base: '#FF7A45', strong: '#FF905F', on: '#1A0B04', soft: 'rgba(255,122,69,0.16)' },
    font: 'sans',
    displayFont: 'sans',
    radius: 1,
    background: ['#08080B', '#08080B'],
  },
  {
    id: 'classic-amp',
    name: 'Classic Amp',
    description: 'Charcoal bevels and a green LCD, straight from a 1999 media player.',
    mode: 'dark',
    colors: dark({
      bg: '#16171D',
      bgElevated: '#22232B',
      surface: '#2A2B35',
      surfaceHover: '#363844',
      surfaceActive: '#41434F',
      border: 'rgba(160,165,190,0.22)',
      textPrimary: '#E3E6EE',
      textSecondary: '#A6ABBD',
      textMuted: '#7C8194',
    }),
    accent: { name: 'LCD green', base: '#28E028', strong: '#5CFF5C', on: '#021A02', soft: 'rgba(40,224,40,0.14)' },
    font: 'sans',
    displayFont: 'pixel',
    radius: 0.2,
    background: ['#1E1F27', '#0C0D11'],
    pattern: 'bevel',
    uppercase: true,
  },
  {
    id: 'space-cowboy',
    name: 'Space Cowboy',
    description: 'Late-night jazz: midnight blue, cream, mustard and a touch of red.',
    mode: 'dark',
    colors: dark({
      bg: '#0B1220',
      bgElevated: 'rgba(17,26,44,0.86)',
      surface: '#16213A',
      surfaceHover: '#1E2C4A',
      surfaceActive: '#263759',
      border: 'rgba(242,193,78,0.14)',
      textPrimary: '#F4EBD9',
      textSecondary: '#BFB39B',
      textMuted: '#8C836F',
      danger: '#E2483D',
    }),
    accent: { name: 'Mustard', base: '#F2C14E', strong: '#F7D27A', on: '#231802', soft: 'rgba(242,193,78,0.16)' },
    font: 'sans',
    displayFont: 'serif',
    radius: 0.6,
    background: ['#131E36', '#0A0F1A'],
    pattern: 'stars',
  },
  {
    id: 'unit-01',
    name: 'Unit-01',
    description: 'Purple armour, acid green and warning orange. Get in the robot.',
    mode: 'dark',
    colors: dark({
      bg: '#120A1F',
      bgElevated: 'rgba(26,15,45,0.84)',
      surface: '#221438',
      surfaceHover: '#2E1C4A',
      surfaceActive: '#3A2459',
      border: 'rgba(158,255,58,0.14)',
      textPrimary: '#F1ECFA',
      textSecondary: '#B7A8D1',
      textMuted: '#8673A6',
      warning: '#FF7A1A',
    }),
    accent: { name: 'Acid green', base: '#9EFF3A', strong: '#BCFF73', on: '#122200', soft: 'rgba(158,255,58,0.15)' },
    font: 'sans',
    displayFont: 'condensed',
    radius: 0,
    background: ['#1C0F31', '#0B0614'],
    pattern: 'grid',
    uppercase: true,
  },
  {
    id: 'luna',
    name: 'Luna',
    description: 'Bright blue bars, a green start button and lots of rounded plastic.',
    mode: 'light',
    colors: {
      bg: '#E8EEF8',
      bgElevated: 'rgba(255,255,255,0.88)',
      surface: '#FFFFFF',
      surfaceHover: '#DCE6F7',
      surfaceActive: '#C9D8F2',
      border: 'rgba(36,94,220,0.18)',
      textPrimary: '#0E1B3A',
      textSecondary: '#3D4E78',
      textMuted: '#6A7AA3',
      overlay: 'rgba(14,27,58,0.45)',
      danger: '#D63B2F',
      success: '#2F9D2F',
      warning: '#C98100',
    },
    accent: { name: 'Start green', base: '#3A9D23', strong: '#4DB82F', on: '#FFFFFF', soft: 'rgba(58,157,35,0.16)' },
    font: 'rounded',
    displayFont: 'rounded',
    radius: 1.5,
    background: ['#3A6FD8', '#E8EEF8'],
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    description: 'Hot pink and cyan over a purple sunset grid.',
    mode: 'dark',
    colors: dark({
      bg: '#1A0B2E',
      bgElevated: 'rgba(36,16,64,0.8)',
      surface: '#2C1450',
      surfaceHover: '#3A1C66',
      surfaceActive: '#47247A',
      border: 'rgba(1,205,254,0.16)',
      textPrimary: '#FFF1FB',
      textSecondary: '#D8A9E6',
      textMuted: '#A47DB8',
    }),
    accent: { name: 'Hot pink', base: '#FF71CE', strong: '#FF9BDD', on: '#2A0420', soft: 'rgba(255,113,206,0.18)' },
    font: 'sans',
    displayFont: 'serif',
    radius: 1.2,
    background: ['#3B1260', '#1A0B2E'],
    pattern: 'grid',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Green phosphor on black. Everything is monospace.',
    mode: 'dark',
    colors: dark({
      bg: '#020602',
      bgElevated: 'rgba(6,16,6,0.9)',
      surface: '#0A160A',
      surfaceHover: '#102310',
      surfaceActive: '#163016',
      border: 'rgba(51,255,102,0.18)',
      textPrimary: '#B8FFC8',
      textSecondary: '#5FD27A',
      textMuted: '#3A8F4F',
    }),
    accent: { name: 'Phosphor', base: '#33FF66', strong: '#7DFF9C', on: '#021006', soft: 'rgba(51,255,102,0.14)' },
    font: 'mono',
    displayFont: 'mono',
    radius: 0,
    background: ['#031003', '#010301'],
    pattern: 'scanlines',
  },
];

export function getSkin(id: string | undefined): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export function isSkinId(id: unknown): id is SkinId {
  return SKINS.some((s) => s.id === id);
}

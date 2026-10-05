import { accents, darkTheme, getSkin, lightTheme, radius, space, type SkinFont } from '@sonora/ui';
import { usePreferences } from '@sonora/core';
import { Platform, useColorScheme } from 'react-native';

export { radius, space };

/** Skin font kinds mapped to fonts the phone has. */
const FONTS: Record<SkinFont, string | undefined> = Platform.select({
  ios: { sans: undefined, serif: 'Georgia', mono: 'Menlo', condensed: 'AvenirNextCondensed-Bold', rounded: 'Avenir Next', pixel: 'Courier' },
  default: { sans: undefined, serif: 'serif', mono: 'monospace', condensed: 'sans-serif-condensed', rounded: undefined, pixel: 'monospace' },
});

export function useTheme() {
  const mode = usePreferences((s) => s.theme);
  const accentName = usePreferences((s) => s.accent);
  const skinId = usePreferences((s) => s.skin);
  const system = useColorScheme();
  const skin = getSkin(skinId);
  if (skin.id !== 'sonora') {
    return {
      ...skin.colors,
      accent: skin.accent.base,
      accentStrong: skin.accent.strong,
      onAccent: skin.accent.on,
      accentSoft: skin.accent.soft,
      light: skin.mode === 'light',
      font: FONTS[skin.font],
      displayFont: FONTS[skin.displayFont],
      uppercase: !!skin.uppercase,
      radiusScale: skin.radius,
      skin: skin.id,
    };
  }
  const light = mode === 'light' || (mode === 'system' && system === 'light');
  const c = light ? lightTheme : darkTheme;
  const a = accents[accentName] ?? accents.ember;
  return {
    ...c,
    accent: a.base,
    accentStrong: a.strong,
    onAccent: a.on,
    accentSoft: a.soft,
    light,
    font: undefined as string | undefined,
    displayFont: undefined as string | undefined,
    uppercase: false,
    radiusScale: 1,
    skin: 'sonora' as string,
  };
}

export type Theme = ReturnType<typeof useTheme>;

export const font = {
  display: { fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15 },
  caption: { fontSize: 13 },
};

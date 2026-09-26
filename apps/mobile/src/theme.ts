import { accents, darkTheme, lightTheme, radius, space } from '@sonora/ui';
import { usePreferences } from '@sonora/core';
import { useColorScheme } from 'react-native';

export { radius, space };

export function useTheme() {
  const mode = usePreferences((s) => s.theme);
  const accentName = usePreferences((s) => s.accent);
  const system = useColorScheme();
  const light = mode === 'light' || (mode === 'system' && system === 'light');
  const c = light ? lightTheme : darkTheme;
  const a = accents[accentName] ?? accents.ember;
  return { ...c, accent: a.base, accentStrong: a.strong, onAccent: a.on, accentSoft: a.soft, light };
}

export type Theme = ReturnType<typeof useTheme>;

export const font = {
  display: { fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15 },
  caption: { fontSize: 13 },
};

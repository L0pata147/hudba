import type { VisualizerStyle } from '@sonora/types';

export type CoverMode = 'ring' | 'square' | 'small' | 'none';

export interface VisualizerStyleInfo {
  id: VisualizerStyle;
  name: string;
  /** Needs WebGL shaders → desktop/web app only. */
  desktopOnly?: boolean;
  /** How the cover is shown in the middle (`none`: the scene has no cover or draws it itself). */
  cover: CoverMode;
  /** soft radial glow behind the scene, pulsing with the bass */
  glow: boolean;
  /** white flash on beats */
  flash: boolean;
  /** blurred artwork behind the scene */
  backdrop: boolean;
  /** the picture shakes a little on beats */
  shake: boolean;
}

const base = { cover: 'none', glow: false, flash: false, backdrop: true, shake: false } as const;

/** Order of the style switcher. */
export const VISUALIZER_STYLES: VisualizerStyleInfo[] = [
  { ...base, id: 'ring', name: 'Neon ring', cover: 'ring', glow: true, flash: true, shake: true },
  { ...base, id: 'bars', name: 'Spectrum bars', flash: true },
  { ...base, id: 'mirror', name: 'Mirror horizon', cover: 'square', flash: true },
  { ...base, id: 'scope', name: 'Oscilloscope' },
  { ...base, id: 'terrain', name: 'Pulsar terrain' },
  { ...base, id: 'tunnel', name: 'Warp tunnel', cover: 'small', glow: true, flash: true, shake: true },
  { ...base, id: 'galaxy', name: 'Galaxy', glow: true, flash: true },
  { ...base, id: 'milkdrop', name: 'Milkdrop', desktopOnly: true, backdrop: false },
  { ...base, id: 'liquid', name: 'Liquid cover', glow: true, shake: true },
  { ...base, id: 'lyrics', name: 'Lyric pulse' },
  { ...base, id: 'ambient', name: 'Ambient', backdrop: false },
];

export type VisualizerPlatform = 'desktop' | 'mobile';

export function visualizerStyles(platform: VisualizerPlatform): VisualizerStyleInfo[] {
  return platform === 'desktop' ? VISUALIZER_STYLES : VISUALIZER_STYLES.filter((s) => !s.desktopOnly);
}

/** Known style for this platform; anything else (old/unknown value, desktop-only on mobile) → ring. */
export function normalizeVisualizerStyle(value: unknown, platform: VisualizerPlatform = 'desktop'): VisualizerStyle {
  return visualizerStyles(platform).some((s) => s.id === value) ? (value as VisualizerStyle) : 'ring';
}

export function cycleVisualizerStyle(current: VisualizerStyle, dir: 1 | -1, platform: VisualizerPlatform): VisualizerStyle {
  const list = visualizerStyles(platform);
  const i = Math.max(0, list.findIndex((s) => s.id === current));
  return list[(i + dir + list.length) % list.length]!.id;
}

export function visualizerStyleName(id: VisualizerStyle): string {
  return VISUALIZER_STYLES.find((s) => s.id === id)?.name ?? id;
}

export function visualizerStyleInfo(id: VisualizerStyle): VisualizerStyleInfo {
  return VISUALIZER_STYLES.find((s) => s.id === id) ?? VISUALIZER_STYLES[0]!;
}

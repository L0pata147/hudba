/**
 * Equalizer model shared by all platforms: band layout, presets and
 * validation. The DSP itself lives in the platform audio engine.
 */
import type { EqualizerSettings } from '@sonora/types';
import { clamp } from '@sonora/utils';

/** Band centre frequencies in Hz — the classic Winamp layout. */
export const EQ_FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000] as const;
export const EQ_MAX_DB = 12;

export const EQ_FLAT: number[] = EQ_FREQUENCIES.map(() => 0);

export const DEFAULT_EQUALIZER: EqualizerSettings = { enabled: false, preamp: 0, bands: EQ_FLAT, preset: 'Flat' };

/** Preset curves in dB (inspired by the classic Winamp presets). */
export const EQ_PRESETS: Record<string, number[]> = {
  Flat: EQ_FLAT,
  'Bass boost': [7, 6, 4.5, 2, 0, 0, 0, 0, 0, 0],
  'Bass & treble': [6, 5, 1, -4, -3, 1, 5, 7, 8, 8],
  'Treble boost': [0, 0, 0, 0, 1, 3, 5, 7, 8, 8.5],
  Rock: [6, 4, -3.5, -5, -2, 2.5, 5.5, 7, 7, 7],
  Pop: [-1, 3, 4.5, 5, 3.5, 0, -1.5, -1.5, -1, -1],
  Dance: [7, 5.5, 2, 0, 0, -3.5, -4.5, -4.5, 0, 0],
  Club: [0, 0, 5, 3.5, 3.5, 3.5, 2, 0, 0, 0],
  Techno: [5, 3.5, 0, -3.5, -3, 0, 5, 6, 6, 5.5],
  Reggae: [0, 0, 0, -3.5, 0, 4, 4, 0, 0, 0],
  Ska: [-1.5, -3, -2.5, 0, 2.5, 3.5, 5.5, 6, 7, 6],
  Classical: [0, 0, 0, 0, 0, 0, -4.5, -4.5, -4.5, -6],
  'Large hall': [6.5, 6.5, 3.5, 3.5, 0, -3, -3, -3, 0, 0],
  Live: [-3, 0, 2.5, 3.5, 3.5, 3.5, 2.5, 1.5, 1.5, 1.5],
  Party: [4.5, 4.5, 0, 0, 0, 0, 0, 0, 4.5, 4.5],
  Soft: [3, 1, 0, -1.5, 0, 2.5, 5, 6, 7, 7.5],
  'Soft rock': [2.5, 2.5, 1.5, 0, -2.5, -3.5, -2, 0, 1.5, 5.5],
  Vocal: [-2, -3, -3, 1.5, 4, 4, 3, 1.5, 0, -2],
  Headphones: [3, 7, 3.5, -2, -1.5, 1, 3, 6, 8, 9],
};

/** Coerces stored / user input into a valid settings object. */
export function normalizeEqualizer(input: Partial<EqualizerSettings> | null | undefined): EqualizerSettings {
  if (!input) return DEFAULT_EQUALIZER;
  // `|| 0` also turns -0 into 0.
  const half = (v: number) => clamp(Math.round(v * 2) / 2, -EQ_MAX_DB, EQ_MAX_DB) || 0;
  const bands = EQ_FREQUENCIES.map((_, i) => {
    const v = Number(input?.bands?.[i]);
    return Number.isFinite(v) ? half(v) : 0;
  });
  const preamp = Number(input?.preamp);
  return {
    enabled: Boolean(input?.enabled),
    preamp: Number.isFinite(preamp) ? half(preamp) : 0,
    bands,
    preset: typeof input?.preset === 'string' && input.preset in EQ_PRESETS ? input.preset : null,
  };
}

/** Settings for a preset. Preamp is lowered so a boosted curve does not clip. */
export function equalizerFromPreset(name: string, enabled = true): EqualizerSettings {
  const bands = EQ_PRESETS[name] ?? EQ_FLAT;
  const peak = Math.max(0, ...bands);
  return normalizeEqualizer({ enabled, bands, preamp: -peak / 2, preset: name in EQ_PRESETS ? name : null });
}

export function formatFrequency(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}K` : String(hz);
}

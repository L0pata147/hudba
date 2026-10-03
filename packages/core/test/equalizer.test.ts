import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUALIZER, EQ_FREQUENCIES, EQ_MAX_DB, EQ_PRESETS, equalizerFromPreset, normalizeEqualizer } from '../src/equalizer';
import { configurePlatform, createMemoryStorage } from '../src/platform';
import { preferencesStore } from '../src/preferences';

describe('equalizer model', () => {
  it('has 10 Winamp-style bands and sane presets', () => {
    expect(EQ_FREQUENCIES).toHaveLength(10);
    for (const [name, bands] of Object.entries(EQ_PRESETS)) {
      expect(bands, name).toHaveLength(10);
      for (const db of bands) expect(Math.abs(db)).toBeLessThanOrEqual(EQ_MAX_DB);
    }
  });

  it('normalizes broken or partial input', () => {
    const n = normalizeEqualizer({ enabled: true, preamp: 99, bands: [3.26, 'x' as unknown as number, -40], preset: 'Nope' });
    expect(n.bands).toEqual([3.5, 0, -12, 0, 0, 0, 0, 0, 0, 0]);
    expect(n.preamp).toBe(12);
    expect(n.preset).toBeNull();
    expect(normalizeEqualizer(undefined)).toEqual(DEFAULT_EQUALIZER);
  });

  it('lowers the preamp for boosted presets to avoid clipping', () => {
    const rock = equalizerFromPreset('Rock');
    expect(rock).toMatchObject({ enabled: true, preset: 'Rock' });
    expect(rock.preamp).toBeLessThan(0);
    expect(equalizerFromPreset('Classical').preamp).toBe(0);
  });

  it('adds the equalizer to preferences saved by older versions', async () => {
    const storage = createMemoryStorage();
    storage.setItem('sonora.preferences', JSON.stringify({ state: { theme: 'light', crossfade: 4 }, version: 1 }));
    configurePlatform({ storage });
    await preferencesStore.persist.rehydrate();
    const p = preferencesStore.getState();
    expect(p.theme).toBe('light');
    expect(p.equalizer).toMatchObject({ enabled: false, bands: EQ_PRESETS.Flat });
  });
});

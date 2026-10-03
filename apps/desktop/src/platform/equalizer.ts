import type { EqualizerSettings } from '@sonora/types';
import { EQ_FREQUENCIES } from '@sonora/core';

/**
 * Web Audio equalizer chain:
 *   input → preamp → 10 band filters → limiter → output
 *
 * Every band is a peaking filter centred on its frequency, so a band set to
 * +6 dB really adds 6 dB at that frequency (shelves would only reach half
 * of it at the corner). A soft clipper (linear below −1 dBFS, rounded above)
 * catches boosts that would otherwise clip harshly; unlike a compressor node
 * it adds no make-up gain, so levels below the knee are untouched.
 * When disabled every stage is set to unity, so the chain is transparent.
 */
export interface EqualizerChain {
  input: GainNode;
  output: AudioNode;
  filters: BiquadFilterNode[];
  apply(settings: EqualizerSettings): void;
}

const Q = 1.41; // ~1 octave per band

const dbToGain = (db: number) => 10 ** (db / 20);

/** Transfer curve: identity up to the knee (−1 dBFS), then a tanh roll-off towards ±1. */
const SOFT_CLIP = (() => {
  const n = 4096;
  const knee = 10 ** (-1 / 20);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
})();

export function createEqualizerChain(ctx: BaseAudioContext): EqualizerChain {
  const input = ctx.createGain();
  const filters = EQ_FREQUENCIES.map((frequency) => {
    const f = ctx.createBiquadFilter();
    f.type = 'peaking';
    f.frequency.value = frequency;
    f.Q.value = Q;
    f.gain.value = 0;
    return f;
  });
  const limiter = ctx.createWaveShaper();
  limiter.oversample = '2x';

  let node: AudioNode = input;
  for (const f of filters) {
    node.connect(f);
    node = f;
  }
  node.connect(limiter);

  const set = (param: AudioParam, value: number) => {
    // Short ramps avoid clicks while dragging sliders.
    param.setTargetAtTime(value, ctx.currentTime, 0.015);
  };

  return {
    input,
    output: limiter,
    filters,
    apply(settings) {
      const on = settings.enabled;
      set(input.gain, on ? dbToGain(settings.preamp) : 1);
      filters.forEach((f, i) => set(f.gain, on ? (settings.bands[i] ?? 0) : 0));
      // Clipper only while the EQ is active; null curve = bypass.
      limiter.curve = on ? SOFT_CLIP : null;
    },
  };
}

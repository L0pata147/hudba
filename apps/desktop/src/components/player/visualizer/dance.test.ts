import { describe, expect, it } from 'vitest';
import { createDance } from './dance';

/** Runs the dance for `secs` at 60 fps with a beat every `beat` s (0 = silence); returns the poses. */
function run(dance: ReturnType<typeof createDance>, secs: number, beat: number, opts: { style?: 'groove' | 'bounce' | 'headbang' | 'sway'; intensity?: number; t0?: number } = {}) {
  const poses = [];
  let kick = 0;
  let next = opts.t0 ?? 0;
  for (let i = 0; i < secs * 60; i++) {
    const t = (opts.t0 ?? 0) + i / 60;
    if (beat && t >= next) {
      kick = 1;
      next += beat;
    } else kick *= 0.88;
    poses.push({ t, ...dance.step(t, 1 / 60, kick, beat ? 0.6 : 0, opts.style ?? 'groove', opts.intensity ?? 0.7, false) });
  }
  return poses;
}

describe('dance', () => {
  it('locks onto the tempo of the beats', () => {
    const d = createDance();
    run(d, 8, 0.4); // 150 BPM
    expect(Math.round(60 / d.clock().interval)).toBeGreaterThanOrEqual(146);
    expect(Math.round(60 / d.clock().interval)).toBeLessThanOrEqual(154);
  });

  it('keeps the tempo when the detector only catches every other beat', () => {
    const d = createDance();
    run(d, 4, 0.5);
    run(d, 6, 1.0, { t0: 4 });
    expect(d.clock().interval).toBeCloseTo(0.5, 1);
  });

  it('sways to a different side on each beat, landing on the beat', () => {
    const d = createDance();
    const poses = run(d, 10, 0.5);
    // halfway between beats the body is out to one side, alternating
    const mid = (k: number) => poses.find((p) => p.t >= 8 + k * 0.5 + 0.25)!.lean;
    expect(Math.sign(mid(0))).toBe(-Math.sign(mid(1)));
    expect(Math.abs(mid(0))).toBeGreaterThan(0.2);
    // squash peaks right at the beat
    const at = poses.find((p) => p.t >= 9)!;
    const between = poses.find((p) => p.t >= 9.25)!;
    expect(at.squash).toBeGreaterThan(between.squash);
  });

  it('calms down to breathing without beats, and intensity scales the moves', () => {
    const d = createDance();
    run(d, 6, 0.5);
    const quiet = run(d, 6, 0, { t0: 6 });
    expect(Math.max(...quiet.slice(-60).map((p) => Math.abs(p.lean)))).toBeLessThan(0.12);
    const big = Math.max(...run(createDance(), 6, 0.5, { intensity: 1 }).slice(-60).map((p) => Math.abs(p.lean)));
    const small = Math.max(...run(createDance(), 6, 0.5, { intensity: 0 }).slice(-60).map((p) => Math.abs(p.lean)));
    expect(big).toBeGreaterThan(small * 2.5);
  });

  it('jumps in Bounce and nods hard in Headbang', () => {
    const bounce = run(createDance(), 6, 0.5, { style: 'bounce' }).slice(-60);
    const groove = run(createDance(), 6, 0.5).slice(-60);
    const bang = run(createDance(), 6, 0.5, { style: 'headbang' }).slice(-60);
    const max = (ps: typeof groove, k: 'jump' | 'nod') => Math.max(...ps.map((p) => Math.abs(p[k])));
    expect(max(bounce, 'jump')).toBeGreaterThan(max(groove, 'jump') * 1.8);
    expect(max(bang, 'nod')).toBeGreaterThan(max(groove, 'nod') * 1.2);
  });
});

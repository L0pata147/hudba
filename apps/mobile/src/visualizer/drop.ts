/**
 * Geometry of the "Liquid" drop on mobile — the same shape as the desktop
 * shader: a wobbling ball whose spikes stand up with the music (one per band,
 * mirrored left/right, bass at the bottom) and droplets drifting around it.
 * Units: fractions of the shorter screen side.
 */

export const DROP_SPIKES = 18;

export function dropRadius(bass: number, kick: number): number {
  'worklet';
  return 0.26 * (1 + bass * 0.07 + kick * 0.05);
}

function level(levels: ArrayLike<number>, x: number): number {
  'worklet';
  const n = levels.length;
  if (!n) return 0;
  const p = Math.max(0, Math.min(1, x)) * (n - 1);
  const i = Math.floor(p);
  const a = levels[i] ?? 0;
  const b = levels[Math.min(n - 1, i + 1)] ?? 0;
  return a + (b - a) * (p - i);
}

/** Closed outline of the drop around (cx, cy) in px. */
export function dropPath(levels: ArrayLike<number>, t: number, bass: number, kick: number, cx: number, cy: number, unit: number): string {
  'worklet';
  const R0 = dropRadius(bass, kick);
  const spin = t * 0.06;
  const N = 144;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let j = 0; j < N; j++) {
    const a = (j / N) * Math.PI * 2;
    const s = ((a + spin) * DROP_SPIKES) / (2 * Math.PI);
    const k = Math.floor(s + 0.5);
    const f = s - k;
    const m = (((k % DROP_SPIKES) + DROP_SPIKES) % DROP_SPIKES);
    const band = Math.abs(m > DROP_SPIKES / 2 ? m - DROP_SPIKES : m) / (DROP_SPIKES / 2);
    const lvl = level(levels, band);
    const spike = Math.pow(Math.max(Math.cos(f * Math.PI), 0), 3) * Math.pow(lvl, 1.5) * (0.11 + kick * 0.04);
    const wob = 0.008 * Math.sin(a * 3 + t * 1.3) + 0.006 * Math.sin(a * 5 - t * 1.9) + 0.004 * Math.sin(a * 9 + t * 2.7);
    const r = (R0 + wob + spike) * unit;
    // angle 0 at the bottom, like the shader
    xs.push(cx + Math.sin(a) * r);
    ys.push(cy + Math.cos(a) * r);
  }
  const mx = (i: number) => (xs[i % N]! + xs[(i + 1) % N]!) / 2;
  const my = (i: number) => (ys[i % N]! + ys[(i + 1) % N]!) / 2;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  let d = `M${r1(mx(0))} ${r1(my(0))}`;
  for (let i = 1; i <= N; i++) d += `Q${r1(xs[i % N]!)} ${r1(ys[i % N]!)} ${r1(mx(i))} ${r1(my(i))}`;
  return `${d}Z`;
}

/** Droplet i: centre and radius in px. */
export function droplet(i: number, levels: ArrayLike<number>, t: number, bass: number, kick: number, cx: number, cy: number, unit: number): { x: number; y: number; r: number } {
  'worklet';
  const ang = t * (0.35 + i * 0.11) * (i % 2 ? -1 : 1) + i * 1.7;
  const orbit = dropRadius(bass, kick) * (1.45 + 0.35 * Math.sin(t * (0.6 + i * 0.23) + i));
  const r = 0.022 + 0.008 * i + level(levels, 0.3 + i * 0.15) * 0.025;
  return { x: cx + Math.sin(ang) * orbit * unit, y: cy - Math.cos(ang) * orbit * unit, r: r * unit };
}

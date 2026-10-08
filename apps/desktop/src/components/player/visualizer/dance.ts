import type { DanceStyle } from '../../../lib/characters';

/** Where the body is at this moment (all roughly −1…1, scaled by how much the music moves). */
export interface Pose {
  /** sideways bend of the body, feet stay put */
  lean: number;
  /** the same bend arriving late (hair, ears, loose parts) */
  lag: number;
  /** height of a hop above the floor, 0…1 */
  jump: number;
  /** squash on landing (> 0) / stretch in the air (< 0) */
  squash: number;
  /** head nod, positive = down */
  nod: number;
  /** head tilt sideways */
  tilt: number;
  /** 0…1: how much there is to dance to */
  energy: number;
}

/**
 * Beat clock + dance moves. The clock locks onto the beats the analyser finds
 * (tempo from the gaps between them, phase pulled towards each beat), so the
 * moves land on the beat instead of reacting after it. Without beats the
 * character calms down to breathing.
 */
export function createDance() {
  let phase = 0;
  let beats = 0;
  let interval = 0.5;
  let lastBeat = -10;
  let prevKick = 0;
  let energy = 0;
  // springs for the late-arriving parts
  let lag = 0;
  let lagV = 0;
  let nodS = 0;
  let nodV = 0;

  const spring = (x: number, v: number, target: number, dt: number, k: number, d: number): [number, number] => {
    const a = (target - x) * k - v * d;
    v += a * dt;
    return [x + v * dt, v];
  };

  return {
    /** Advances by `dt`; `kick` is 1 on a beat and decays (the host's beat signal). */
    step(t: number, dt: number, kick: number, bass: number, dance: DanceStyle, intensity: number, reduced: boolean): Pose {
      if (kick > 0.9 && prevKick < kick - 0.05) {
        const gap = t - lastBeat;
        if (gap > 0.25 && gap < 1.6) {
          // Beats found only every other time still mean the same tempo.
          const g = gap > interval * 1.6 ? gap / 2 : gap;
          interval += (Math.min(1.2, Math.max(0.3, g)) - interval) * 0.3;
        }
        lastBeat = t;
        // Pull the phase towards the beat (0 / 1).
        const err = phase > 0.5 ? phase - 1 : phase;
        phase -= err * 0.6;
        if (phase < 0) {
          phase += 1;
          beats -= 1;
        }
      }
      prevKick = kick;
      phase += dt / interval;
      while (phase >= 1) {
        phase -= 1;
        beats += 1;
      }
      const dancing = t - lastBeat < interval * 2.5 + 0.4 ? 1 : 0;
      energy += (Math.max(dancing, bass * 0.6) - energy) * Math.min(1, dt * (dancing ? 3 : 0.8));

      const amp = (0.12 + 0.88 * energy) * (0.25 + 0.75 * intensity) * (reduced ? 0.15 : 1);
      const p = phase;
      const sway = Math.sin(Math.PI * (beats + p)); // one side per beat
      const rise = Math.sin(Math.PI * p);
      const land = Math.exp(-p * 9);
      const breathe = Math.sin(t * 1.7) * 0.05;
      let lean = 0;
      let jump = 0;
      let squash = 0;
      let nod = 0;
      let tilt = 0;
      switch (dance) {
        case 'bounce':
          lean = 0.3 * sway;
          jump = Math.max(0, rise) * 0.9;
          squash = land * 0.9 - rise * 0.35;
          nod = 0.35 * Math.sin(2 * Math.PI * p);
          tilt = 0.2 * sway;
          break;
        case 'headbang':
          lean = 0.15 * sway;
          jump = rise * rise * 0.12;
          squash = land * 0.45;
          nod = Math.cos(2 * Math.PI * p) * 1.1;
          tilt = 0.15 * sway;
          break;
        case 'sway':
          lean = 0.85 * Math.sin((Math.PI * (beats + p)) / 2);
          jump = 0.08 * (0.5 + 0.5 * Math.sin(t * 1.3));
          squash = 0.1 * land;
          nod = 0.2 * sway;
          tilt = 0.45 * Math.sin((Math.PI * (beats + p)) / 2 + 0.5);
          break;
        default: // groove
          lean = 0.75 * sway;
          jump = rise * rise * 0.3;
          squash = land * 0.75 - rise * 0.15;
          nod = 0.7 * Math.sin(2 * Math.PI * p + 0.5);
          tilt = 0.35 * Math.sin(Math.PI * (beats + p) + 0.6);
      }
      lean *= amp;
      jump *= amp;
      squash = squash * amp - breathe * (1 - energy * 0.7);
      nod *= amp;
      tilt *= amp;
      [lag, lagV] = spring(lag, lagV, lean, dt, 60, 7);
      [nodS, nodV] = spring(nodS, nodV, nod, dt, 120, 11);
      return { lean, lag, jump, squash, nod: nodS, tilt, energy };
    },
    /** For tests and the UI: the current beat clock. */
    clock: () => ({ phase, beats, interval, energy }),
  };
}

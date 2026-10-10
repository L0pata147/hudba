import { sampleLevel } from '@sonora/core';
import type { RGB } from '@sonora/ui';
import { lighten, type Renderer, type VisFrame } from './types';

interface Rocket {
  x: number;
  y: number;
  vy: number;
  apex: number;
  color: RGB;
  size: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: RGB;
  glitter: boolean;
}

const css = (c: RGB, a: number) => `rgba(${c.r},${c.g},${c.b},${a})`;

/**
 * Fireworks (2D canvas): beats launch rockets in the cover's colours over a
 * dark skyline — more and bigger with more bass — that burst into sparks with
 * trails; the treble makes the glitter twinkle. A quiet song still gets an
 * occasional rocket.
 */
export function createFireworksRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rockets: Rocket[] = [];
  const sparks: Spark[] = [];
  let prevKick = 0;
  let sinceLaunch = 0;
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let skyline: number[] = [];
  let skyW = 0;

  const launch = (W: number, H: number, power: number, palette: [RGB, RGB]) => {
    const vivid = (c: RGB): RGB => {
      const m = Math.max(c.r, c.g, c.b, 1) / 255;
      return { r: Math.round(c.r / m), g: Math.round(c.g / m), b: Math.round(c.b / m) };
    };
    const colors = [vivid(palette[0]), vivid(palette[1]), lighten(vivid(palette[0]), 70), lighten(vivid(palette[1]), 70), { r: 255, g: 236, b: 200 }];
    rockets.push({
      x: W * (0.15 + rnd() * 0.7),
      y: H,
      vy: -H * (0.95 + rnd() * 0.35 + power * 0.25),
      apex: H * (0.18 + rnd() * 0.3),
      color: colors[Math.floor(rnd() * colors.length)]!,
      size: 0.7 + power * 0.8 + rnd() * 0.3,
    });
  };

  const burst = (r: Rocket, H: number) => {
    const n = Math.round(110 + r.size * 140);
    const speed = H * 0.32 * r.size;
    const ring = rnd() < 0.3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.1;
      const v = ring ? speed * (0.95 + rnd() * 0.1) : speed * Math.sqrt(rnd());
      sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 1.2 + rnd() * 1.1, color: r.color, glitter: rnd() < 0.35 });
    }
  };

  return {
    draw(f: VisFrame) {
      const W = canvas.width;
      const H = canvas.height;
      const dt = Math.min(0.05, f.dt) * (f.reduced ? 0.5 : 1);
      if (skyW !== W) {
        skyW = W;
        skyline = [];
        let x = 0;
        while (x < W) {
          const w = W * (0.025 + rnd() * 0.05);
          skyline.push(x, w, H * (0.05 + rnd() * 0.13));
          x += w;
        }
      }
      const kick = f.reduced ? 0 : f.kick;
      const started = kick > 0.9 && prevKick < kick - 0.05;
      prevKick = kick;
      sinceLaunch += dt;
      if (started) {
        const count = 1 + (f.bass > 0.55 ? 1 : 0) + (f.bass > 0.8 ? 1 : 0);
        for (let i = 0; i < count; i++) launch(W, H, f.bass, f.palette);
        sinceLaunch = 0;
      } else if (sinceLaunch > 0.9) {
        launch(W, H, 0.3, f.palette);
        sinceLaunch = 0;
      }

      // trails: fade the last frame instead of clearing it
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // the same trail length at any frame rate
      ctx.fillStyle = `rgba(4,3,10,${(1 - Math.pow(0.8, dt * 60)).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, 'rgba(0,0,0,0)');
      sky.addColorStop(1, css(f.palette[0], 0.025 + f.bass * 0.03));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'lighter';
      const g = H * 0.55;
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]!;
        const py = r.y;
        r.vy += g * 0.35 * dt;
        r.y += r.vy * dt;
        ctx.strokeStyle = css(lighten(r.color, 60), 0.9);
        ctx.lineWidth = Math.max(1.5, H * 0.003);
        ctx.beginPath();
        ctx.moveTo(r.x, py);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
        if (r.y <= r.apex || r.vy >= 0) {
          burst(r, H);
          rockets.splice(i, 1);
        }
      }
      const high = sampleLevel(f.levels, 0.75);
      const dot = Math.max(1.2, H * 0.0028);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.life += dt;
        if (s.life > s.max) {
          sparks.splice(i, 1);
          continue;
        }
        const px = s.x;
        const py = s.y;
        const drag = Math.pow(0.25, dt);
        s.vx *= drag;
        s.vy = s.vy * drag + g * 0.5 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const k = 1 - s.life / s.max;
        let a = Math.sqrt(k);
        if (s.glitter) a *= 0.4 + 0.6 * (Math.sin(s.life * 40 + i) > 0 ? 1 : 0.2) * (0.6 + high);
        ctx.strokeStyle = css(k > 0.6 ? lighten(s.color, 110) : lighten(s.color, 40), Math.min(1, a));
        ctx.lineWidth = dot * (0.9 + k * 1.2);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      if (sparks.length > 4000) sparks.splice(0, sparks.length - 4000);

      // the city in silhouette, lit from above by the bursts
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#05040a';
      for (let i = 0; i < skyline.length; i += 3) ctx.fillRect(skyline[i]!, H - skyline[i + 2]!, skyline[i + 1]! + 1, skyline[i + 2]!);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = css(f.palette[1], 0.05 + sparks.length / 20000);
      for (let i = 0; i < skyline.length; i += 3) ctx.fillRect(skyline[i]!, H - skyline[i + 2]!, skyline[i + 1]!, Math.max(1, H * 0.002));
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

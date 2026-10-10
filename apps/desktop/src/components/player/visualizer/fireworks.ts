import { sampleLevel } from '@sonora/core';
import type { RGB } from '@sonora/ui';
import { imageLoader } from './ambient';
import type { Renderer, VisFrame } from './types';

type Kind = 'peony' | 'chrysanthemum' | 'ring' | 'double' | 'willow' | 'crossette' | 'palm' | 'glitter' | 'picture';

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  apex: number;
  kind: Kind;
  a: RGB;
  b: RGB;
  size: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
  hot: string;
  /** velocity kept per second */
  drag: number;
  grav: number;
  w: number;
  /** embers left behind per second, and how long they glow */
  trail: number;
  trailLife: number;
  acc: number;
  /** a crossette comet: splits in four when it burns out */
  split: boolean;
  strobe: boolean;
  seed: number;
}
interface Ember {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  col: string;
}
interface Jet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
}
interface Puff {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  c: RGB;
}
interface Window {
  x: number;
  y: number;
  w: number;
  h: number;
  band: number;
  c: string;
}

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const GOLD: RGB = { r: 255, g: 184, b: 88 };
const rgb = (c: RGB) => `rgb(${c.r},${c.g},${c.b})`;
const rgba = (c: RGB, a: number) => `rgba(${c.r},${c.g},${c.b},${a.toFixed(3)})`;
const mixc = (a: RGB, b: RGB, k: number): RGB => ({
  r: Math.round(a.r + (b.r - a.r) * k),
  g: Math.round(a.g + (b.g - a.g) * k),
  b: Math.round(a.b + (b.b - a.b) * k),
});
const vivid = (c: RGB): RGB => {
  const m = Math.max(c.r, c.g, c.b, 1) / 255;
  return { r: Math.round(c.r / m), g: Math.round(c.g / m), b: Math.round(c.b / m) };
};

function layer(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return { c, x: c.getContext('2d')! };
}

/** The city on the waterfront: a hazy far row and a near row with lit windows, pre-drawn once per size. */
function buildCity(W: number, H: number, HZ: number, rnd: () => number) {
  const ch = Math.round(H * 0.3);
  const L = layer(W, ch);
  const g = L.x;
  const roofs: number[] = [];
  const windows: Window[] = [];
  const lights: number[] = [];
  g.fillStyle = 'rgb(17,15,32)';
  for (let x = -10; x < W; ) {
    const w = W * (0.02 + rnd() * 0.04);
    const h = H * (0.05 + rnd() * 0.1);
    g.fillRect(x, ch - h, w + 1, h);
    x += w;
  }
  const ww = Math.max(1, H * 0.0065);
  const wh = Math.max(1, H * 0.009);
  const gx = H * 0.006;
  const gy = H * 0.008;
  for (let x = -5; x < W; ) {
    const w = W * (0.03 + rnd() * 0.06);
    const tall = rnd() < 0.14;
    const h = H * (tall ? 0.17 + rnd() * 0.08 : 0.04 + rnd() * 0.11);
    g.fillStyle = 'rgb(7,6,13)';
    g.fillRect(x, ch - h, w + 1, h);
    roofs.push(x, w, HZ - h);
    // roofs: a stepped top, a pointed one or an antenna
    const roof = rnd();
    let top = h;
    if (roof < 0.3) {
      const sw = w * (0.4 + rnd() * 0.3);
      const sh = H * (0.015 + rnd() * 0.03);
      g.fillRect(x + (w - sw) / 2, ch - h - sh, sw, sh);
      roofs.push(x + (w - sw) / 2, sw, HZ - h - sh);
      top = h + sh;
    } else if (roof < 0.42) {
      const sh = H * (0.02 + rnd() * 0.03);
      g.beginPath();
      g.moveTo(x, ch - h);
      g.lineTo(x + w / 2, ch - h - sh);
      g.lineTo(x + w, ch - h);
      g.fill();
      top = h + sh;
    }
    if (tall || roof > 0.9) {
      const aw = Math.max(1, H * 0.002);
      const ah = H * (0.02 + rnd() * 0.02);
      g.fillRect(x + w * 0.5 - aw / 2, ch - top - ah, aw, ah);
      lights.push(x + w * 0.5, HZ - top - ah);
    }
    for (let wy = ch - h + gy; wy < ch - wh - gy; wy += wh + gy) {
      for (let wx = x + gx; wx < x + w - ww - gx * 0.5; wx += ww + gx) {
        const r = rnd();
        if (r > 0.3) continue;
        const c = rnd() < 0.7 ? '255,196,120' : '170,210,255';
        // some windows light up with the music (bass on the left, treble on the right)
        if (r < 0.05) windows.push({ x: wx, y: HZ - ch + wy, w: ww, h: wh, band: Math.min(1, Math.max(0, wx / W)), c });
        else {
          g.fillStyle = `rgba(${c},${(0.2 + rnd() * 0.5).toFixed(2)})`;
          g.fillRect(wx, wy, ww, wh);
        }
      }
    }
    x += w + (rnd() < 0.3 ? W * 0.012 : 0);
  }
  return { canvas: L.c, h: ch, roofs, windows, lights };
}

/**
 * Fireworks over a city by the water (2D canvas). Beats launch rockets in the
 * cover's colours — more with more bass — that burst as peonies, chrysanthemums
 * with glittering tails, tilted rings, two-colour doubles, drooping golden
 * willows, palms, crossettes that split and strobing glitter for the treble;
 * every 32 beats a finale, and now and then a burst whose sparks hang in the
 * sky as the cover itself. Fountains along the waterfront spray as high as
 * their band of the spectrum. The bursts light the sky, the drifting smoke and
 * the rooftops, glow (a small bloom) and are mirrored in the rippling water,
 * where a few windows of the city flicker with the spectrum.
 */
export function createFireworksRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined = () => undefined): Renderer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rockets: Rocket[] = [];
  let sparks: Spark[] = [];
  let embers: Ember[] = [];
  let puffs: Puff[] = [];
  const queue: { at: number; power: number; kind?: Kind }[] = [];
  let prevKick = 0;
  let sinceLaunch = 0;
  let beats = 0;
  let clock = 0;
  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const flash = { x: 0, y: 0, s: 0, c: WHITE };

  let cw = 0;
  let ch = 0;
  let HZ = 0;
  let trail = layer(1, 1);
  let scene = layer(1, 1);
  let bloom: ReturnType<typeof layer>[] = [];
  let city = buildCity(1, 1, 1, rnd);
  let stars: number[] = [];
  const fountains = new Float32Array(12);
  let jets: Jet[] = [];
  let front = layer(1, 1);
  let frontGlow = layer(1, 1);

  // the cover as a grid of coloured sparks for the picture burst (only when the image is readable)
  const PIC = 40;
  let picture: { x: number; y: number; c: RGB }[] | null = null;
  const loadCover = imageLoader((img) => {
    try {
      const c = layer(PIC, PIC);
      c.x.drawImage(img, 0, 0, PIC, PIC);
      const d = c.x.getImageData(0, 0, PIC, PIC).data;
      const px: { x: number; y: number; c: RGB }[] = [];
      for (let j = 0; j < PIC; j++) {
        for (let i = 0; i < PIC; i++) {
          const k = (j * PIC + i) * 4;
          const col = { r: d[k]!, g: d[k + 1]!, b: d[k + 2]! };
          const x = i / (PIC - 1) - 0.5;
          const y = j / (PIC - 1) - 0.5;
          // a round medallion of the cover; very dark pixels stay out
          if (col.r + col.g + col.b < 40 || x * x + y * y > 0.25) continue;
          px.push({ x, y, c: col });
        }
      }
      picture = px.length > 80 ? px : null;
    } catch {
      picture = null;
    }
  });

  const resize = (W: number, H: number) => {
    cw = W;
    ch = H;
    HZ = Math.round(H * 0.8);
    trail = layer(W, HZ);
    scene = layer(W, HZ);
    bloom = [2, 4, 8, 16].map((d) => layer(W / d, HZ / d));
    city = buildCity(W, H, HZ, rnd);
    front = layer(W, HZ);
    frontGlow = layer(W / 6, HZ / 6);
    jets = [];
    stars = [];
    const n = Math.round((W * H) / 9000);
    for (let i = 0; i < n; i++) stars.push(rnd() * W, Math.pow(rnd(), 1.4) * HZ * 0.8, 0.5 + rnd() * 1.2, rnd() * 6.3);
    sparks = [];
    embers = [];
    puffs = [];
    rockets.length = 0;
  };

  const pick = (bass: number, high: number): Kind => {
    if (beats % 16 === 8) return rnd() < 0.5 ? 'willow' : 'palm';
    if (beats % 8 === 4) return 'crossette';
    if (bass > 0.75 && rnd() < 0.6) return rnd() < 0.5 ? 'double' : 'chrysanthemum';
    if (high > 0.4 && rnd() < 0.45) return 'glitter';
    const r = rnd();
    return r < 0.22 ? 'ring' : r < 0.55 ? 'chrysanthemum' : 'peony';
  };

  const launch = (W: number, H: number, power: number, palette: [RGB, RGB], kind: Kind) => {
    const swap = rnd() < 0.5;
    const a = vivid(palette[swap ? 1 : 0]);
    const b = vivid(palette[swap ? 0 : 1]);
    const pic = kind === 'picture';
    const apex = pic ? H * (0.26 + rnd() * 0.05) : H * (0.08 + rnd() * 0.32);
    rockets.push({
      x: pic ? W * (0.35 + rnd() * 0.3) : W * (0.1 + rnd() * 0.8),
      y: HZ,
      vx: (rnd() - 0.5) * H * 0.06,
      vy: -Math.sqrt(2 * H * 0.175 * (HZ - apex)) * 1.03,
      apex,
      kind,
      a: rnd() < 0.2 ? mixc(a, WHITE, 0.35) : a,
      b,
      size: 0.75 + power * 0.6 + rnd() * 0.3,
    });
  };

  const spark = (x: number, y: number, vx: number, vy: number, c: RGB, max: number, o: Partial<Spark> = {}) => {
    sparks.push({
      x,
      y,
      vx,
      vy,
      life: 0,
      max,
      col: o.col ?? rgb(c),
      hot: o.hot ?? rgb(mixc(c, WHITE, 0.65)),
      drag: o.drag ?? 0.25,
      grav: o.grav ?? ch * 0.17,
      w: o.w ?? 1,
      trail: o.trail ?? 0,
      trailLife: o.trailLife ?? 0.4,
      acc: 0,
      split: o.split ?? false,
      strobe: o.strobe ?? false,
      seed: rnd() * 10,
    });
  };
  /** a direction on the unit sphere, seen from the side (so a burst is a ball with a bright rim) */
  const sphere = (): [number, number] => {
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    return [Math.cos(a) * s, Math.sin(a) * s];
  };

  const burst = (r: Rocket) => {
    const H = ch;
    const S = H * 0.3 * r.size;
    const ca = rgb(r.a);
    const ha = rgb(mixc(r.a, WHITE, 0.65));
    const ball = (n: number, v: number, c: RGB, life: number, o: Partial<Spark> = {}) => {
      const col = rgb(c);
      const hot = rgb(mixc(c, WHITE, 0.65));
      for (let i = 0; i < n; i++) {
        const [dx, dy] = sphere();
        const s = v * (0.92 + rnd() * 0.12);
        spark(r.x, r.y, dx * s, dy * s, c, life * (0.75 + rnd() * 0.5), { col, hot, ...o });
      }
    };
    switch (r.kind) {
      case 'peony':
        ball(Math.round(140 + r.size * 80), S, r.a, 1.7);
        break;
      case 'chrysanthemum':
        ball(110, S, r.a, 1.8, { trail: 26, trailLife: 0.45, w: 0.9 });
        break;
      case 'ring': {
        const tilt = 0.3 + rnd() * 1.0;
        const roll = rnd() * Math.PI;
        const n = 90;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = Math.cos(a);
          const y = Math.sin(a) * Math.cos(tilt);
          const s = S * (0.97 + rnd() * 0.06);
          spark(r.x, r.y, (x * Math.cos(roll) - y * Math.sin(roll)) * s, (x * Math.sin(roll) + y * Math.cos(roll)) * s, r.a, 1.5 + rnd() * 0.5, { col: ca, hot: ha });
        }
        ball(40, S * 0.35, r.b, 1.3);
        break;
      }
      case 'double':
        ball(90, S * 0.5, r.a, 1.6);
        ball(130, S, r.b, 1.9);
        break;
      case 'willow':
        ball(90, S * 0.75, mixc(GOLD, r.a, 0.15), 3.3, { drag: 0.45, grav: H * 0.19, trail: 30, trailLife: 1.3, w: 0.8 });
        break;
      case 'crossette':
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + rnd() * 0.2;
          spark(r.x, r.y, Math.cos(a) * S * 0.75, Math.sin(a) * S * 0.75, r.a, 0.6, { col: ca, hot: ha, split: true, trail: 40, trailLife: 0.35, w: 1.3 });
        }
        break;
      case 'palm': {
        const c = mixc(GOLD, r.a, 0.4);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + rnd() * 0.2;
          spark(r.x, r.y, Math.cos(a) * S * 0.9, (Math.sin(a) - 0.25) * S * 0.9, c, 1.7, { drag: 0.35, grav: H * 0.24, trail: 70, trailLife: 0.8, w: 2.2 });
        }
        break;
      }
      case 'picture': {
        // each spark flies to its pixel of the cover and hangs there, then sinks and fades
        if (!picture) {
          ball(130, S, r.b, 1.9);
          break;
        }
        const size = H * 0.42;
        const k = -Math.log(0.04);
        for (const px of picture) {
          const j = (rnd() - 0.5) * 0.004 * size;
          spark(r.x, r.y, (px.x * size + j) * k, (px.y * size + j) * k, px.c, 3.4 + rnd() * 0.5, { drag: 0.04, grav: H * 0.01, w: 1.4, hot: rgb(mixc(px.c, WHITE, 0.5)) });
        }
        break;
      }
      case 'glitter':
        ball(170, S * 0.85, mixc(WHITE, r.a, 0.25), 2.0, { strobe: true, w: 0.8 });
        break;
    }
    flash.x = r.x;
    flash.y = r.y;
    flash.c = r.a;
    flash.s = Math.min(1.4, flash.s + 0.6 + r.size * 0.3);
    for (let i = 0; i < 2; i++) puffs.push({ x: r.x + (rnd() - 0.5) * S * 0.4, y: r.y + (rnd() - 0.5) * S * 0.4, r: S * 0.35, life: 0, max: 7 + rnd() * 3, c: r.a });
    if (puffs.length > 36) puffs.splice(0, puffs.length - 36);
  };

  return {
    draw(f: VisFrame) {
      const W = canvas.width;
      const H = canvas.height;
      if (W !== cw || H !== ch) resize(W, H);
      loadCover(getUrl());
      const dt = Math.min(0.05, f.dt) * (f.reduced ? 0.5 : 1);
      clock += dt;
      const kick = f.reduced ? 0 : f.kick;
      const high = sampleLevel(f.levels, 0.75);
      const started = kick > 0.9 && prevKick < kick - 0.05;
      prevKick = kick;
      sinceLaunch += dt;
      if (started) {
        beats++;
        const count = 1 + (f.bass > 0.55 ? 1 : 0) + (f.bass > 0.8 ? 1 : 0);
        for (let i = 0; i < count; i++) launch(W, H, f.bass, f.palette, pick(f.bass, high));
        // the finale: a volley every 32 beats when the music is loud
        if (beats % 32 === 0 && f.bass > 0.6) for (let i = 0; i < 6; i++) queue.push({ at: clock + 0.12 + i * 0.13, power: 1, kind: i === 5 ? 'double' : undefined });
        // the cover in the sky, halfway between finales
        if (beats % 32 === 16 && picture) queue.push({ at: clock + 0.05, power: 1, kind: 'picture' });
        sinceLaunch = 0;
      } else if (sinceLaunch > 0.9) {
        launch(W, H, 0.3, f.palette, rnd() < 0.3 ? 'willow' : 'peony');
        sinceLaunch = 0;
      }
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]!.at > clock) continue;
        launch(W, H, queue[i]!.power, f.palette, queue[i]!.kind ?? pick(1, high));
        queue.splice(i, 1);
      }

      const dot = Math.max(1, H * 0.0024);
      const G = H * 0.35;

      // --- the bursts, on a layer that fades instead of clearing (trails) ---
      const tx = trail.x;
      tx.globalCompositeOperation = 'destination-out';
      tx.globalAlpha = 1;
      tx.fillStyle = `rgba(0,0,0,${(1 - Math.pow(0.78, dt * 60)).toFixed(3)})`;
      tx.fillRect(0, 0, W, HZ);
      tx.globalCompositeOperation = 'lighter';
      tx.lineCap = 'round';

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]!;
        const px = r.x;
        const py = r.y;
        r.vy += G * 0.5 * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        tx.globalAlpha = 1;
        tx.strokeStyle = 'rgb(255,222,175)';
        tx.lineWidth = dot * 1.3;
        tx.beginPath();
        tx.moveTo(px, py);
        tx.lineTo(r.x, r.y);
        tx.stroke();
        for (let k = 0; k < 3; k++) embers.push({ x: r.x + (rnd() - 0.5) * dot * 2, y: r.y, vy: H * 0.03, life: 0, max: 0.3 + rnd() * 0.4, col: 'rgb(255,160,80)' });
        if (r.y <= r.apex || r.vy >= 0) {
          burst(r);
          rockets.splice(i, 1);
        }
      }

      // fountains along the waterfront, each spraying as high as its band of the spectrum
      const fx = front.x;
      fx.globalCompositeOperation = 'destination-out';
      fx.globalAlpha = 1;
      fx.fillStyle = `rgba(0,0,0,${(1 - Math.pow(0.7, dt * 60)).toFixed(3)})`;
      fx.fillRect(0, 0, W, HZ);
      fx.globalCompositeOperation = 'lighter';
      fx.lineCap = 'round';
      for (let i = 0; i < fountains.length; i++) {
        const u = i / (fountains.length - 1);
        const v = sampleLevel(f.levels, 0.05 + u * 0.85) * (f.reduced ? 0.5 : 1);
        fountains[i]! += Math.max(0, v - 0.12) ** 2 * 260 * dt;
        const x0 = W * (0.06 + u * 0.88);
        const col = rgb(mixc(mixc(GOLD, WHITE, 0.3), vivid(f.palette[i % 2]!), 0.35));
        while (fountains[i]! >= 1) {
          fountains[i]! -= 1;
          jets.push({ x: x0 + (rnd() - 0.5) * dot * 3, y: HZ - 1, vx: (rnd() - 0.5) * H * 0.07, vy: -H * (0.2 + v * 0.32) * (0.85 + rnd() * 0.3), life: 0, max: 0.9 + rnd() * 0.5, col });
        }
      }
      let lastJet = '';
      let nj = 0;
      for (const j of jets) {
        j.life += dt;
        if (j.life > j.max) continue;
        jets[nj++] = j;
        const px = j.x;
        const py = j.y;
        const dr = Math.pow(0.6, dt);
        j.vx *= dr;
        j.vy = j.vy * dr + G * 0.9 * dt;
        j.x += j.vx * dt;
        j.y += j.vy * dt;
        if (j.col !== lastJet) {
          fx.strokeStyle = j.col;
          lastJet = j.col;
        }
        fx.globalAlpha = Math.min(1, (1 - j.life / j.max) * 1.5);
        fx.lineWidth = dot * 0.8;
        fx.beginPath();
        fx.moveTo(px, py);
        fx.lineTo(j.x, j.y);
        fx.stroke();
      }
      jets.length = nj;
      if (jets.length > 3000) jets.splice(0, jets.length - 3000);
      fx.globalAlpha = 1;

      let last = '';
      let n = 0;
      const born: Spark[] = [];
      for (const s of sparks) {
        s.life += dt;
        if (s.life > s.max) {
          if (s.split) {
            const a0 = Math.atan2(s.vy, s.vx) + Math.PI / 4;
            for (let k = 0; k < 4; k++) {
              const a = a0 + (k * Math.PI) / 2;
              born.push({ ...s, vx: Math.cos(a) * H * 0.14, vy: Math.sin(a) * H * 0.14, life: 0, max: 0.8 + rnd() * 0.3, split: false, trail: 18, w: 0.9 });
            }
          }
          continue;
        }
        sparks[n++] = s;
        const px = s.x;
        const py = s.y;
        const dr = Math.pow(s.drag, dt);
        s.vx *= dr;
        s.vy = s.vy * dr + s.grav * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.trail) {
          s.acc += s.trail * dt;
          while (s.acc >= 1) {
            s.acc -= 1;
            embers.push({ x: s.x + (rnd() - 0.5) * dot, y: s.y, vy: H * 0.01, life: 0, max: s.trailLife * (0.6 + rnd() * 0.6), col: s.hot });
          }
        }
        const k = 1 - s.life / s.max;
        let a = Math.min(1, k / 0.3);
        if (k < 0.15 && rnd() < 0.3) a *= 0.2;   // burning out with a flicker
        if (s.strobe) a *= (s.life * 9 + s.seed) % 1 < 0.45 ? 0.55 + high * 0.8 : 0.08;
        const style = k > 0.78 ? s.hot : s.col;
        if (style !== last) {
          tx.strokeStyle = style;
          last = style;
        }
        tx.globalAlpha = a;
        tx.lineWidth = dot * s.w * (0.7 + k * 0.9);
        tx.beginPath();
        tx.moveTo(px, py);
        tx.lineTo(s.x, s.y);
        tx.stroke();
      }
      sparks.length = n;
      for (const s of born) sparks.push(s);
      if (sparks.length > 5000) sparks.splice(0, sparks.length - 5000);

      n = 0;
      last = '';
      const es = dot * 0.9;
      for (const e of embers) {
        e.life += dt;
        if (e.life > e.max) continue;
        embers[n++] = e;
        e.vy += G * 0.1 * dt;
        e.y += e.vy * dt;
        if (e.col !== last) {
          tx.fillStyle = e.col;
          last = e.col;
        }
        tx.globalAlpha = (1 - e.life / e.max) * 0.75;
        tx.fillRect(e.x - es / 2, e.y - es / 2, es, es);
      }
      embers.length = n;
      if (embers.length > 6000) embers.splice(0, embers.length - 6000);
      tx.globalAlpha = 1;

      // a small bloom: the burst layer halved four times, each level added back blurred
      let src: HTMLCanvasElement = trail.c;
      for (const b of bloom) {
        b.x.globalCompositeOperation = 'copy';
        b.x.imageSmoothingEnabled = true;
        b.x.drawImage(src, 0, 0, b.c.width, b.c.height);
        src = b.c;
      }

      // --- the sky above the water ---
      flash.s *= Math.pow(0.02, dt);
      const sx = scene.x;
      sx.globalCompositeOperation = 'source-over';
      sx.globalAlpha = 1;
      const pa = vivid(f.palette[0]);
      const sky = sx.createLinearGradient(0, 0, 0, HZ);
      sky.addColorStop(0, 'rgb(3,3,9)');
      sky.addColorStop(0.65, rgb(mixc({ r: 6, g: 5, b: 16 }, pa, 0.06)));
      sky.addColorStop(1, rgb(mixc({ r: 10, g: 8, b: 22 }, pa, 0.16 + f.bass * 0.08)));
      sx.fillStyle = sky;
      sx.fillRect(0, 0, W, HZ);
      sx.fillStyle = '#fff';
      for (let i = 0; i < stars.length; i += 4) {
        sx.globalAlpha = (0.25 + 0.35 * Math.sin(clock * 1.5 + stars[i + 3]!) ** 2) * (1 - flash.s * 0.4);
        sx.fillRect(stars[i]!, stars[i + 1]!, stars[i + 2]! * (H / 900), stars[i + 2]! * (H / 900));
      }
      sx.globalAlpha = 1;
      sx.globalCompositeOperation = 'lighter';
      if (flash.s > 0.01) {
        const fl = sx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, H * 0.75);
        fl.addColorStop(0, rgba(flash.c, 0.16 * flash.s));
        fl.addColorStop(1, rgba(flash.c, 0));
        sx.fillStyle = fl;
        sx.fillRect(0, 0, W, HZ);
      }
      // the smoke the bursts leave, drifting with the wind, lit by the latest burst
      sx.globalCompositeOperation = 'source-over';
      n = 0;
      for (const p of puffs) {
        p.life += dt;
        if (p.life > p.max) continue;
        puffs[n++] = p;
        p.r += H * 0.012 * dt;
        p.x += H * 0.01 * dt;
        p.y -= H * 0.003 * dt;
        const k = p.life / p.max;
        const near = Math.exp(-Math.hypot(p.x - flash.x, p.y - flash.y) / (H * 0.35));
        const c = mixc({ r: 34, g: 30, b: 46 }, mixc(p.c, flash.c, near * flash.s), Math.min(1, 0.35 * (1 - k) + near * flash.s * 0.8));
        const a = 0.12 * (1 - k) * Math.min(1, p.life * 2);
        const gr = sx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, rgba(c, a));
        gr.addColorStop(1, rgba(c, 0));
        sx.fillStyle = gr;
        sx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      puffs.length = n;

      sx.globalCompositeOperation = 'lighter';
      sx.drawImage(trail.c, 0, 0);
      sx.imageSmoothingEnabled = true;
      for (const [i, b] of bloom.entries()) {
        if (!i) continue;
        sx.globalAlpha = [0, 0.4, 0.55, 0.7][i]!;
        sx.drawImage(b.c, 0, 0, W, HZ);
      }
      sx.globalAlpha = 1;

      // the city: silhouettes, windows (some following the spectrum), rooftops lit by the bursts, antenna lights
      sx.globalCompositeOperation = 'source-over';
      sx.drawImage(city.canvas, 0, HZ - city.h);
      sx.globalCompositeOperation = 'lighter';
      // the fountains in front of the city, with a soft glow of their own
      frontGlow.x.globalCompositeOperation = 'copy';
      frontGlow.x.drawImage(front.c, 0, 0, frontGlow.c.width, frontGlow.c.height);
      sx.drawImage(front.c, 0, 0);
      sx.globalAlpha = 0.7;
      sx.drawImage(frontGlow.c, 0, 0, W, HZ);
      sx.globalAlpha = 1;
      for (const w of city.windows) {
        const v = Math.min(1, Math.max(0, sampleLevel(f.levels, w.band) * 1.4 - 0.15));
        if (v < 0.02) continue;
        sx.fillStyle = `rgba(${w.c},${(v * 0.9).toFixed(3)})`;
        sx.fillRect(w.x, w.y, w.w, w.h);
      }
      if (flash.s > 0.02) {
        const rim = Math.max(1, H * 0.002);
        for (let i = 0; i < city.roofs.length; i += 3) {
          const x = city.roofs[i]! + city.roofs[i + 1]! / 2;
          const near = Math.exp(-Math.abs(x - flash.x) / (W * 0.4));
          sx.fillStyle = rgba(mixc(flash.c, WHITE, 0.3), Math.min(1, flash.s * near * 0.8));
          sx.fillRect(city.roofs[i]!, city.roofs[i + 2]!, city.roofs[i + 1]!, rim);
        }
      }
      const blink = (clock % 1.6) < 0.5 ? 1 : 0.15;
      sx.fillStyle = `rgba(255,60,50,${blink})`;
      const ls = Math.max(1.5, H * 0.003);
      for (let i = 0; i < city.lights.length; i += 2) sx.fillRect(city.lights[i]! - ls / 2, city.lights[i + 1]! - ls / 2, ls, ls);

      // --- the frame: sky on top, the water below mirroring it with ripples ---
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(scene.c, 0, 0);
      const WH = H - HZ;
      const water = ctx.createLinearGradient(0, HZ, 0, H);
      water.addColorStop(0, rgb(mixc({ r: 8, g: 7, b: 18 }, pa, 0.08)));
      water.addColorStop(1, 'rgb(2,2,6)');
      ctx.fillStyle = water;
      ctx.fillRect(0, HZ, W, WH);
      ctx.globalCompositeOperation = 'lighter';
      const strip = Math.max(2, Math.round(H / 260));
      for (let y = HZ; y < H; y += strip) {
        const d = (y - HZ) / WH;
        // the mirror image is squashed so the whole sky fits in the water
        const srcY = HZ - (y - HZ + strip) / 0.28;
        const srcH = strip / 0.28;
        if (srcY + srcH < 0) break;
        const off = (Math.sin(y * 0.09 + clock * 1.7) * 0.7 + Math.sin(y * 0.031 - clock * 1.1)) * (1 + d * 5) * (H / 500) * (1 + f.bass * 0.6);
        ctx.globalAlpha = 0.5 * (1 - d * 0.55);
        ctx.drawImage(scene.c, 0, Math.max(0, srcY), W, srcH, off, y, W, strip);
      }
      // glints on the water in the colour of the last burst
      ctx.globalAlpha = 1;
      const glint = Math.min(1, flash.s * 0.8 + f.bass * 0.15);
      if (glint > 0.03) {
        ctx.fillStyle = rgba(mixc(flash.c, WHITE, 0.4), glint * 0.6);
        const slot = Math.floor(clock * 4);
        for (let i = 0; i < 60; i++) {
          const h1 = Math.sin(i * 12.9898 + slot * 78.233) * 43758.5453;
          const h2 = Math.sin(i * 39.346 + slot * 11.135) * 24634.6345;
          const gx = (h1 - Math.floor(h1)) * W;
          const d = h2 - Math.floor(h2);
          const near = Math.exp(-Math.abs(gx - flash.x) / (W * 0.3));
          if (near < 0.15) continue;
          const gy = HZ + d * d * WH;
          ctx.fillRect(gx, gy, W * (0.008 + d * 0.03) * near, Math.max(1, H * 0.0015));
        }
      }
      // mist on the horizon and a vignette
      ctx.globalCompositeOperation = 'source-over';
      const mist = ctx.createLinearGradient(0, HZ - H * 0.06, 0, HZ + H * 0.04);
      mist.addColorStop(0, rgba(mixc({ r: 20, g: 18, b: 34 }, pa, 0.2), 0));
      mist.addColorStop(0.6, rgba(mixc({ r: 20, g: 18, b: 34 }, pa, 0.2), 0.35));
      mist.addColorStop(1, rgba(mixc({ r: 20, g: 18, b: 34 }, pa, 0.2), 0));
      ctx.fillStyle = mist;
      ctx.fillRect(0, HZ - H * 0.06, W, H * 0.1);
      const vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    },
  };
}

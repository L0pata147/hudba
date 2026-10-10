import { SCENE_HEADER } from './gl';
import { beatEdge, createShaderScene } from './scene';
import type { Renderer } from './types';

type Url = () => string | undefined;

/* ------------------------------------------------------------------ */
/* Black hole                                                          */
/* ------------------------------------------------------------------ */

const BLACKHOLE = `${SCENE_HEADER}
uniform float spin;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  p += vec2(sin(t * 0.13), cos(t * 0.11)) * 0.01;
  float rs = 0.105 * (1.0 + bass * 0.04);
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);

  // gravitational lensing of the sky: everything is pulled round the hole (Einstein ring at re)
  float re = rs * 1.9;
  vec2 q = p - dir * (re * re / max(r, 1e-3));
  vec3 sky = coverAt(q * 0.35 + 0.5, 5.0) * fbm(q * 2.5 + t * 0.01) * 0.55;
  vec2 sg = q * 90.0;
  float star = step(0.985, hash(floor(sg))) * smoothstep(0.35, 0.0, length(fract(sg) - 0.5));
  sky += vec3(star) * (0.6 + 0.4 * sin(t * 2.0 + hash(floor(sg)) * 40.0)) * (0.5 + high);
  vec3 col = sky * smoothstep(rs * 0.9, rs * 2.4, r);

  // accretion disk, seen almost edge-on
  float incl = 0.2;
  vec2 dp = vec2(p.x, p.y / incl);
  float e = length(dp);
  float rin = rs * 1.6;
  float rout = rs * 5.2;
  float a = atan(dp.y, dp.x);
  float speed = 2.2 / (e / rs);
  float swirl = a + spin * speed;
  float streak = fbm(vec2(e * 18.0, swirl * 2.5)) * 0.8 + fbm(vec2(e * 50.0, swirl * 6.0)) * 0.4;
  float ring = smoothstep(rin, rin * 1.15, e) * smoothstep(rout, rin * 1.6, e);
  float doppler = 1.0 + 0.75 * (-dp.x / max(e, 1e-3));            // the side coming towards us is brighter
  float heat = smoothstep(rout, rin, e);
  vec3 dcol = mix(c1, mix(c2, vec3(1.0, 0.95, 0.85), heat * heat), heat);
  float band = level(fract(swirl / (2.0 * PI)) * 0.5 + 0.1);        // the disk flickers with the spectrum
  float diskB = ring * streak * doppler * (0.7 + bass * 1.2 + band * 0.6 + kick * 0.5);
  bool behind = p.y > 0.0 && r < rs * 1.02;                         // far half hidden by the hole
  if (!behind) col += dcol * diskB * 1.6;

  // the far side of the disk, bent up over the top (and a little under the bottom)
  float arc = smoothstep(rs * 1.02, rs * 1.08, r) * smoothstep(rs * 1.75, rs * 1.15, r);
  float arcStreak = fbm(vec2(r * 40.0, (atan(p.y, p.x) + spin * 0.8) * 3.0));
  float arcSide = mix(0.35, 1.0, smoothstep(-0.3, 0.6, dir.y));
  col += mix(c2, vec3(1.0), 0.4) * arc * arcStreak * arcSide * (0.9 + bass * 1.1 + kick * 0.6);

  // photon ring and the shadow
  col += vec3(1.0, 0.92, 0.85) * exp(-abs(r - rs * 1.04) * 260.0) * (0.8 + kick);
  col *= smoothstep(rs * 0.96, rs * 1.0, r);
  // faint jets on beats
  col += mix(c2, vec3(1.0), 0.5) * exp(-abs(p.x) * 70.0) * exp(-abs(p.y) * 3.5) * kick * 0.6 * step(rs, abs(p.y));
  col *= 1.0 - smoothstep(0.5, 1.2, length(p)) * 0.6;
  o = vec4(aces(col * 1.2), 1.0);
}`;

export function createBlackHoleRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  let spin = 0;
  return createShaderScene(
    canvas,
    {
      name: 'blackhole',
      fs: BLACKHOLE,
      uniforms: ['spin'],
      update: (gl, U, f) => {
        spin += f.dt * (0.35 + f.bass * 1.2) * (f.reduced ? 0.3 : 1);
        gl.uniform1f(U.spin!, spin);
      },
    },
    url,
  );
}

/* ------------------------------------------------------------------ */
/* Synthwave drive                                                     */
/* ------------------------------------------------------------------ */

const DRIVE = `${SCENE_HEADER}
uniform float travel;
float gridLine(float x, float w) {
  float d = abs(fract(x + 0.5) - 0.5) / max(fwidth(x), 1e-4);
  return 1.0 - smoothstep(0.0, w, d);
}
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float hor = -0.04;
  vec3 pink = mix(vec3(1.0, 0.25, 0.7), c1, 0.35);
  vec3 cyan = mix(vec3(0.2, 0.9, 1.0), c2, 0.35);
  vec3 col;
  if (p.y > hor) {
    float sy = p.y - hor;
    col = mix(pink * 0.55 + vec3(0.15, 0.0, 0.12), vec3(0.02, 0.0, 0.06), smoothstep(0.0, 0.45, sy));
    vec2 sg = p * 120.0;
    col += vec3(step(0.992, hash(floor(sg))) * smoothstep(0.4, 0.0, length(fract(sg) - 0.5))) * smoothstep(0.12, 0.3, sy) * (0.6 + high);
    // the sun, striped at the bottom, pulsing with the bass
    vec2 sp = p - vec2(0.0, hor + 0.27);
    float sr = 0.21 * (1.0 + bass * 0.05 + kick * 0.03);
    float sd = length(sp);
    float rel = (sp.y + sr) / (2.0 * sr);                  // 0 at the bottom of the sun, 1 at the top
    float gapW = mix(0.6, 0.0, rel / 0.55);
    float stripe = step(gapW, fract(rel * 9.0 - t * 0.25)) * (1.0 - step(0.55, rel)) + step(0.55, rel);
    float sun = smoothstep(sr, sr - 0.003, sd) * stripe;
    vec3 sunCol = mix(vec3(1.0, 0.25, 0.55), vec3(1.0, 0.9, 0.35), rel);
    col += pink * exp(-max(sd - sr, 0.0) * 9.0) * (0.35 + bass * 0.4);
    col = mix(col, sunCol, sun);
    // mountains
    float m1 = hor + 0.06 + fbm(vec2(p.x * 3.0 + 3.0, 1.0)) * 0.12 * (1.0 - smoothstep(0.1, 0.9, abs(p.x)) * 0.4);
    if (p.y < m1) {
      col = mix(vec3(0.05, 0.0, 0.08), pink * 0.25, smoothstep(m1 - 0.12, m1, p.y));
      col += pink * exp(-abs(p.y - m1) * 300.0) * 0.8;
    }
    // city skyline: every building is a band of the spectrum (bass in the middle)
    float bw = 0.028;
    float bi = floor(p.x / bw);
    float band = clamp(abs(bi * bw) / 0.9, 0.0, 1.0);
    float bh = hor + 0.015 + hash1(bi) * 0.03 + level(band) * 0.14;
    if (p.y < bh && abs(p.x) < 0.95) {
      col = vec3(0.03, 0.0, 0.06);
      vec2 wv = vec2(fract(p.x / bw * 4.0), fract((p.y - hor) * 90.0));
      float win = step(0.35, wv.x) * step(wv.x, 0.75) * step(0.4, wv.y) * step(hash(floor(vec2(p.x / bw * 4.0, (p.y - hor) * 90.0))), 0.35 + level(band) * 0.6);
      col += mix(cyan, pink, hash1(bi * 3.1)) * win * 0.9;
      col += cyan * exp(-abs(p.y - bh) * 400.0) * 0.6;
    }
    col += vec3(0.6, 0.2, 0.8) * exp(-sy * 25.0) * 0.25;   // haze on the horizon
  } else {
    // the neon grid floor rushing towards us
    float d = hor - p.y;
    float z = 0.18 / d;
    float x = p.x * z;
    vec2 g = vec2(x * 1.4, z * 1.2 + travel);
    float lines = max(gridLine(g.x, 1.2), gridLine(g.y, 1.2));
    float fade = exp(-z * 0.08);
    col = vec3(0.02, 0.0, 0.05) + pink * lines * fade * (0.8 + bass * 0.8);
    col += pink * exp(-d * 30.0) * 0.35;
    // road with edge lines and centre dashes
    float road = step(abs(x), 1.1);
    col = mix(col, vec3(0.015, 0.01, 0.03) + cyan * gridLine(g.y, 1.0) * 0.08 * fade, road * 0.85);
    col += cyan * (1.0 - smoothstep(0.0, 0.035 * z, abs(abs(x) - 1.1))) * fade * 1.4;
    float dash = step(abs(x), 0.04) * step(0.5, fract(g.y * 0.5));
    col += vec3(1.0, 0.9, 0.6) * dash * fade;
    // the sun reflected on the road
    col += vec3(1.0, 0.4, 0.6) * exp(-abs(p.x) * 30.0) * exp(-d * 6.0) * 0.4 * road;
  }

  // the car, from behind, bobbing with the bass
  vec2 cp = p - vec2(0.0, -0.36 + bass * 0.006 + sin(t * 9.0) * 0.0015);
  float body = box(cp, vec2(0.17, 0.035), 0.012);
  float roof = box(cp - vec2(0.0, 0.055), vec2(0.105, 0.03), 0.02);
  float tyres = min(box(cp - vec2(-0.12, -0.045), vec2(0.035, 0.022), 0.008), box(cp - vec2(0.12, -0.045), vec2(0.035, 0.022), 0.008));
  float car = min(min(body, roof), tyres);
  col = mix(col, vec3(0.02, 0.01, 0.03), smoothstep(0.002, 0.0, car));
  col += pink * exp(-max(roof, 0.0) * 300.0) * 0.25 * step(0.0, roof);
  float lights = min(box(cp - vec2(-0.105, 0.006), vec2(0.05, 0.007), 0.004), box(cp - vec2(0.105, 0.006), vec2(0.05, 0.007), 0.004));
  vec3 tail = vec3(1.0, 0.12, 0.25);
  col += tail * smoothstep(0.003, 0.0, lights) * (1.2 + kick);
  col += tail * exp(-max(lights, 0.0) * 60.0) * (0.25 + kick * 0.5);
  col *= 1.0 - smoothstep(0.55, 1.3, length(p)) * 0.5;
  o = vec4(aces(col * 1.1), 1.0);
}`;

export function createDriveRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  let travel = 0;
  return createShaderScene(
    canvas,
    {
      name: 'drive',
      fs: DRIVE,
      uniforms: ['travel'],
      update: (gl, U, f) => {
        travel += f.dt * (1.2 + f.bass * 3 + f.kick * 3) * (f.reduced ? 0.3 : 1);
        gl.uniform1f(U.travel!, travel);
      },
    },
    url,
  );
}

/* ------------------------------------------------------------------ */
/* Turntable                                                           */
/* ------------------------------------------------------------------ */

const VINYL = `${SCENE_HEADER}
uniform float angle, arm;
float seg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  // the deck, seen from a little above
  vec2 q = vec2(p.x + 0.08, (p.y + 0.02) / 0.82);
  // table and light
  vec3 col = mix(vec3(0.05, 0.035, 0.03), vec3(0.015, 0.01, 0.01), length(p) * 1.2);
  col += mix(c1, vec3(1.0, 0.8, 0.6), 0.6) * exp(-dot(p - vec2(-0.1, 0.15), p - vec2(-0.1, 0.15)) * 4.0) * 0.12;
  // plinth
  vec2 bq = abs(q) - vec2(0.62, 0.48);
  float plinth = length(max(bq + 0.04, 0.0)) + min(max(bq.x + 0.04, bq.y + 0.04), 0.0) - 0.04;
  if (plinth < 0.0) {
    float brushed = 0.5 + 0.5 * noise(vec2(q.x * 900.0, q.y * 3.0));
    col = vec3(0.07, 0.065, 0.07) * (0.85 + brushed * 0.3);
    col += vec3(1.0) * exp(-abs(q.y - 0.3 + q.x * 0.4) * 30.0) * 0.04;
  }
  col += c2 * exp(-abs(plinth) * 200.0) * 0.15;
  float r = length(q);
  // glow under the platter, pulsing with the bass
  col += mix(c1, c2, 0.5) * exp(-max(r - 0.44, 0.0) * 25.0) * (0.15 + bass * 0.5) * step(0.42, r);
  // platter rim with strobe dots
  if (r < 0.45) {
    float a = atan(q.y, q.x) + angle;
    col = vec3(0.16, 0.16, 0.17) * (0.8 + 0.2 * cos(a * 2.0));
    float dots = step(0.5, fract(a / (2.0 * PI) * 90.0)) * smoothstep(0.43, 0.44, r);
    col += vec3(0.3) * dots;
  }
  // the record
  if (r < 0.42) {
    float a = atan(q.y, q.x);
    float grooves = 0.5 + 0.5 * sin(r * 1400.0 + hash(vec2(floor(r * 120.0), 0.0)) * 6.0);
    float gap = smoothstep(0.004, 0.0, abs(fract(r * 9.0) - 0.5) - 0.48);   // gaps between the tracks
    col = vec3(0.025) + vec3(0.02) * grooves - gap * 0.01;
    // anisotropic sheen of the grooves: two light wedges that stay put while the record turns
    float sheen = pow(abs(cos(a - 0.9)), 28.0) + pow(abs(cos(a - 0.9 + PI)), 28.0) * 0.6;
    col += mix(vec3(1.0), mix(c1, c2, 0.5), 0.35) * sheen * (0.09 + high * 0.35) * (0.6 + grooves * 0.4) * smoothstep(0.14, 0.2, r);
    // the label: the cover, turning with the record
    if (r < 0.14) {
      float la = a + angle;
      vec2 luv = vec2(cos(la), sin(la)) * r / 0.28 + 0.5;
      col = coverAt(luv, 0.0) * (0.9 + bass * 0.15);
      col *= smoothstep(0.14, 0.135, r);
      col = mix(col, vec3(0.75), smoothstep(0.009, 0.007, r));      // spindle
    }
  }
  // shadow of the tonearm
  vec2 pivot = vec2(0.52, 0.32);
  vec2 stylus = vec2(0.52 - 0.22 - arm * 0.08, -0.12 + arm * 0.06);
  float sh = seg(q - vec2(0.015, -0.02), pivot, stylus, 0.012);
  col *= 1.0 - smoothstep(0.03, 0.0, sh) * 0.5;
  // tonearm with a highlight, the head shell and the counterweight
  float tube = seg(q, pivot, stylus, 0.008);
  float shell = seg(q, stylus, stylus + vec2(-0.03, -0.035), 0.016);
  float weight = length(q - (pivot + vec2(0.07, 0.05))) - 0.035;
  float base = length(q - pivot) - 0.045;
  float armD = min(min(tube, shell), min(weight, base));
  vec3 metal = vec3(0.7, 0.7, 0.72) * (0.7 + 0.3 * smoothstep(0.008, -0.008, tube + 0.004));
  col = mix(col, metal, smoothstep(0.002, 0.0, armD));
  col += vec3(1.0) * smoothstep(0.004, 0.0, abs(tube + 0.004)) * 0.25 * step(tube, 0.0);
  // dust floating in the light, catching it with the music
  vec2 dg = p * 18.0 + vec2(t * 0.05, -t * 0.08);
  vec2 did = floor(dg);
  float hd = hash(did);
  if (hd > 0.9) {
    vec2 c = vec2(hash(did + 1.7), hash(did + 9.1)) - 0.5;
    col += vec3(1.0, 0.9, 0.8) * smoothstep(0.08, 0.0, length(fract(dg) - 0.5 - c * 0.6)) * (0.08 + mid * 0.25) * exp(-dot(p - vec2(-0.1, 0.15), p - vec2(-0.1, 0.15)) * 3.0);
  }
  col *= 1.0 - smoothstep(0.45, 1.2, length(p)) * 0.7;
  o = vec4(aces(col * 1.3), 1.0);
}`;

export function createVinylRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  let angle = 0;
  return createShaderScene(
    canvas,
    {
      name: 'vinyl',
      fs: VINYL,
      uniforms: ['angle', 'arm'],
      update: (gl, U, f) => {
        // 33⅓ rpm with a hint of wow
        angle -= f.dt * 3.49 * (1 + Math.sin(f.t * 0.9) * 0.004) * (f.reduced ? 0.4 : 1);
        gl.uniform1f(U.angle!, angle);
        // the arm creeps inwards over the song and trembles a little with the treble
        gl.uniform1f(U.arm!, ((f.t * 0.01) % 1) + Math.sin(f.t * 40) * 0.0015 * (f.reduced ? 0 : 1));
      },
    },
    url,
  );
}

/* ------------------------------------------------------------------ */
/* Rain on glass                                                       */
/* ------------------------------------------------------------------ */

const RAIN = `${SCENE_HEADER}
/** One layer of drops: xy = refraction offset, z = how much is wet. */
vec3 drops(vec2 uv, float scale, float speed, float seed) {
  vec2 aspect = vec2(2.0, 1.0);
  vec2 g = uv * scale * aspect;
  float col = floor(g.x);
  g.y += t * speed * (0.6 + hash1(col + seed) * 0.8) + hash1(col * 7.1 + seed) * 10.0;
  vec2 id = floor(g);
  vec2 st = fract(g) - 0.5;
  float n = hash(id + seed);
  // a drop sliding down with a little wiggle, a trail of droplets above it
  float x = (n - 0.5) * 0.6 + sin(g.y * 6.0 + n * 20.0) * 0.06;
  float y = -0.45 + fract(-t * speed * 0.3 + n) * 0.9;
  y = -y;
  vec2 d = (st - vec2(x, y)) / aspect;
  float r = 0.06 + n * 0.04;
  float drop = smoothstep(r, r * 0.6, length(d * vec2(1.0, 0.8)));
  float trailMask = smoothstep(-0.02, 0.02, st.y - y) * smoothstep(0.5, y, st.y);
  vec2 td = vec2(st.x - x, fract(st.y * 8.0) - 0.5) / aspect;
  float trail = smoothstep(r * 0.5, r * 0.2, length(td * vec2(1.0, 0.9))) * trailMask * step(abs(st.x - x), 0.05);
  vec2 off = -d * drop * 5.0 - td * trail * 2.5;
  return vec3(off, max(drop, trail * 0.8));
}
vec3 still(vec2 uv, float scale) {
  vec2 g = uv * scale;
  vec2 id = floor(g);
  vec2 st = fract(g) - 0.5;
  vec2 c = vec2(hash(id), hash(id + 3.3)) - 0.5;
  float n = hash(id + 7.7);
  float life = fract(t * 0.05 + n);
  float r = 0.16 * n * n * smoothstep(0.0, 0.05, life) * smoothstep(1.0, 0.85, life);
  vec2 d = st - c * 0.6;
  float m = smoothstep(r, r * 0.5, length(d));
  return vec3(-d * m * 2.5, m);
}
void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  vec3 a = drops(p, 3.0, 0.22, 1.0);
  vec3 b = drops(p * 1.7 + 3.1, 3.0, 0.3, 4.0);
  vec3 s = still(p, 30.0);
  vec2 off = a.xy + b.xy * 0.7 + s.xy * 0.4;
  float wet = clamp(a.z + b.z + s.z, 0.0, 1.0);
  // behind the glass: the cover, very blurred, and city lights out of focus, flickering with the music
  vec2 bg = uv + off * 0.6;
  vec3 col = coverAt(vec2(bg.x, bg.y * 0.9 + 0.05), mix(7.0, 4.5, wet)) * (0.3 + bass * 0.12);
  vec2 lg = bg * vec2(res.x / res.y, 1.0) * 7.0 + vec2(t * 0.02, 0.0);
  vec2 lid = floor(lg);
  float lh = hash(lid);
  if (lh > 0.72) {
    vec2 c = vec2(hash(lid + 1.3), hash(lid + 5.9)) - 0.5;
    float rad = 0.18 + hash(lid + 2.2) * 0.2;
    float ld = length(fract(lg) - 0.5 - c * 0.4);
    float bok = smoothstep(rad, rad * mix(0.8, 0.2, wet), ld);
    float bandL = level(hash(lid + 8.1));
    col += mix(c1, c2, hash(lid + 4.4)) * bok * (0.15 + bandL * 0.8) * (0.6 + 0.4 * sin(t * 0.7 + lh * 30.0));
  }
  // the drops catch a little light and darken at their rims
  col += vec3(1.0) * pow(max(dot(normalize(vec3(off * 6.0, 1.0)), normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 30.0) * wet * 0.35;
  col *= 1.0 - smoothstep(0.85, 1.0, wet) * 0.0 + wet * 0.08;
  // misted glass and a lightning flash on hard beats
  col = mix(col, vec3(dot(col, vec3(0.33))) + mix(c1, c2, 0.5) * 0.05, (1.0 - wet) * 0.18);
  col += vec3(0.8, 0.85, 1.0) * smoothstep(0.85, 1.0, kick) * 0.15;
  col *= 1.0 - smoothstep(0.5, 1.2, length(p)) * 0.6;
  o = vec4(aces(col * 1.25), 1.0);
}`;

export function createRainRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  return createShaderScene(canvas, { name: 'rain', fs: RAIN }, url);
}

/* ------------------------------------------------------------------ */
/* Kaleidoscope                                                        */
/* ------------------------------------------------------------------ */

const KALEIDO = `${SCENE_HEADER}
uniform float segA, segB, mixAB, rot, zoom;
vec3 fold(vec2 p, float segs) {
  float r = length(p);
  float a = atan(p.y, p.x) + rot;
  float s = 2.0 * PI / segs;
  a = mod(a, s);
  a = abs(a - s * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r;
  q *= zoom * (1.0 - bass * 0.08);
  q += vec2(t * 0.015, t * 0.011);
  vec3 c = coverAt(q + 0.5, 0.3 + r * 1.5);
  // bright seams where the mirrors meet
  c += mix(c1, c2, r) * exp(-abs(a) * 60.0 / max(r, 0.05)) * 0.25 * (0.5 + high);
  return c;
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float r = length(p);
  p *= 1.0 + sin(r * 22.0 - t * 4.0) * 0.012 * kick;     // a ripple on beats
  vec3 col = mix(fold(p, segA), fold(p, segB), mixAB);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.35);                          // a little more saturation
  col += mix(c1, c2, 0.5) * exp(-r * 6.0) * (0.25 + bass * 0.5);
  col *= 1.0 - smoothstep(0.45, 1.05, r) * 0.85;
  o = vec4(aces(col * 1.15), 1.0);
}`;

export function createKaleidoRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  const choices = [6, 8, 10, 12, 5, 7];
  let segA = 6;
  let segB = 6;
  let mixAB = 1;
  let beats = 0;
  let rot = 0;
  const edge = beatEdge();
  return createShaderScene(
    canvas,
    {
      name: 'kaleido',
      fs: KALEIDO,
      uniforms: ['segA', 'segB', 'mixAB', 'rot', 'zoom'],
      update: (gl, U, f) => {
        // every 8 beats the number of mirrors changes, cross-fading over half a second
        if (edge(f.kick) && !f.reduced && ++beats % 8 === 0) {
          segA = segB;
          segB = choices[(beats / 8) % choices.length]!;
          mixAB = 0;
        }
        mixAB = Math.min(1, mixAB + f.dt * 2);
        rot += f.dt * (0.08 + f.bass * 0.35) * (f.reduced ? 0.2 : 1);
        gl.uniform1f(U.segA!, segA);
        gl.uniform1f(U.segB!, segB);
        gl.uniform1f(U.mixAB!, mixAB);
        gl.uniform1f(U.rot!, rot);
        gl.uniform1f(U.zoom!, 1.1 + Math.sin(f.t * 0.13) * 0.25);
      },
    },
    url,
  );
}

/* ------------------------------------------------------------------ */
/* Night ocean                                                         */
/* ------------------------------------------------------------------ */

const OCEAN = `${SCENE_HEADER}
uniform float travel;
uniform vec4 amp;   // wave octaves: swell (bass) … chop (treble)
float wave(vec2 p, float choppy) {
  p += noise(p) - 0.5;
  vec2 w = 1.0 - abs(sin(p));
  vec2 s = abs(cos(p));
  w = mix(w, s, w);
  return pow(1.0 - pow(w.x * w.y, 0.65), choppy);
}
float sea(vec2 p, int oct) {
  float h = 0.0;
  float f = 0.16;
  float ch = 4.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    float a = i == 0 ? amp.x : i == 1 ? amp.y : i == 2 ? amp.z : amp.w * 0.6;
    float d = wave((p + travel) * f, ch) + wave((p - travel) * f, ch);
    h += d * a;
    p *= m;
    f *= 1.9;
    ch = mix(ch, 1.0, 0.2);
  }
  return h;
}
vec3 sky(vec3 d, vec3 moonDir) {
  float y = max(d.y, 0.0);
  vec3 c = mix(mix(c1, c2, 0.5) * 0.12 + vec3(0.01, 0.02, 0.045), vec3(0.003, 0.005, 0.015), pow(y, 0.45));
  c += vec3(1.0, 0.97, 0.9) * smoothstep(0.9994, 0.9997, dot(d, moonDir)) * 2.0;
  c += mix(vec3(0.8, 0.85, 1.0), c2, 0.3) * pow(max(dot(d, moonDir), 0.0), 200.0) * 0.6;
  vec2 sg = d.xz / max(d.y, 0.05) * 60.0;
  c += vec3(step(0.995, hash(floor(sg))) * smoothstep(0.4, 0.0, length(fract(sg) - 0.5))) * smoothstep(0.05, 0.25, y) * (0.5 + high);
  return c;
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  vec3 ro = vec3(0.0, 3.5 + sin(t * 0.3) * 0.15, 0.0);
  vec3 rd = normalize(vec3(p.x, p.y - 0.05, 1.5));
  vec3 moonDir = normalize(vec3(0.12, 0.16, 1.0));
  vec3 col;
  if (rd.y >= 0.0) {
    col = sky(rd, moonDir);
  } else {
    // march to the water (height field), then refine
    float tt = 0.0;
    float h0 = ro.y;
    float tPrev = 0.0;
    for (int i = 0; i < 48; i++) {
      vec3 pos = ro + rd * tt;
      float hh = pos.y - sea(pos.xz, 3);
      if (hh < 0.02) break;
      tPrev = tt;
      tt += max(hh * 0.6, 0.02 * tt);
      if (tt > 120.0) break;
    }
    vec3 pos = ro + rd * tt;
    // fewer octaves and a wider step in the distance keep the far sea from shimmering
    int oct = tt < 25.0 ? 5 : tt < 60.0 ? 4 : 3;
    vec2 e = vec2(0.02 + tt * 0.004, 0.0);
    float hc = sea(pos.xz, oct);
    vec3 n = normalize(vec3(hc - sea(pos.xz + e.xy, oct), e.x, hc - sea(pos.xz + e.yx, oct)));
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(20.0, 110.0, tt)));
    float fres = clamp(pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.65, 0.0, 1.0);
    vec3 refl = sky(reflect(rd, n), moonDir);
    vec3 deep = mix(c1, c2, 0.3) * 0.025 + vec3(0.0, 0.01, 0.022);
    col = mix(deep, refl, fres);
    // glowing foam on the crests, lit up on beats
    float foam = smoothstep(0.55, 1.0, hc / max(amp.x * 2.0 + amp.y * 2.0, 0.1));
    col += mix(c2, vec3(0.8, 1.0, 1.0), 0.4) * foam * (0.12 + kick * 0.6 + bass * 0.2);
    float fog = 1.0 - exp(-tt * 0.012);
    col = mix(col, sky(vec3(rd.x, 0.0, rd.z), moonDir) * 0.8, fog);
  }
  col *= 1.0 - smoothstep(0.55, 1.3, length(p)) * 0.5;
  o = vec4(aces(col * 1.5), 1.0);
}`;

export function createOceanRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  let travel = 0;
  const amp = [0.6, 0.25, 0.12, 0.06];
  return createShaderScene(
    canvas,
    {
      name: 'ocean',
      fs: OCEAN,
      uniforms: ['travel', 'amp'],
      scale: 0.7,
      update: (gl, U, f) => {
        const m = f.reduced ? 0.3 : 1;
        travel += f.dt * (0.55 + f.bass * 0.6) * m;
        // swell follows the bass, chop the treble
        const target = [0.45 + f.bass * 0.9, 0.16 + sampleBand(f.levels, 0.3) * 0.28, 0.06 + sampleBand(f.levels, 0.55) * 0.1, 0.02 + sampleBand(f.levels, 0.8) * 0.05];
        for (let i = 0; i < 4; i++) amp[i]! += (target[i]! * m - amp[i]!) * Math.min(1, f.dt * 4);
        gl.uniform1f(U.travel!, travel);
        gl.uniform4f(U.amp!, amp[0]!, amp[1]!, amp[2]!, amp[3]!);
      },
    },
    url,
  );
}

function sampleBand(levels: Float32Array, x: number): number {
  const n = levels.length;
  if (!n) return 0;
  const p = Math.max(0, Math.min(1, x)) * (n - 1);
  const i = Math.floor(p);
  return (levels[i] ?? 0) + ((levels[Math.min(n - 1, i + 1)] ?? 0) - (levels[i] ?? 0)) * (p - i);
}

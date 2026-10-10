import { sampleLevel } from '@sonora/core';
import type { RGB } from '@sonora/ui';
import { imageLoader } from './ambient';
import { createProgram, fullscreenQuad, lumProbe, QUAD_VS, uniformsOf } from './gl';
import type { Renderer, VisFrame } from './types';

const SPIKES = 26;
const DROPS = 6;

/**
 * A raymarched liquid drop: a wobbling ball with spikes standing up along
 * fixed directions (heights from the spectrum, bass at the bottom), droplets
 * merging in and out, glass-like shading (refraction of the cover with
 * dispersion, reflections of an environment made of the cover, Fresnel,
 * highlights, coloured rim) over the cover flowing in the background.
 */
const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res;
uniform sampler2D cover;
uniform float hasCover, t, bass, kick, high, R0;
uniform vec3 c1, c2;
uniform vec3 spikeDir[${SPIKES}];
uniform float spikeH[${SPIKES}];
uniform vec4 drops[${DROPS}];   // xyz, radius (0 = none)
uniform vec4 ripples;            // beat ripple ages 0…1, < 0 = none
uniform mat3 cam;
uniform vec3 eye;
const float PI = 3.14159265;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float blob(vec3 p) {
  float r = length(p);
  vec3 n = p / max(r, 1e-4);
  float w = 0.04 * sin(n.x * 4.0 + t * 1.3) * sin(n.y * 5.0 - t * 1.1) * sin(n.z * 3.0 + t * 0.9)
          + 0.018 * sin(dot(n, vec3(7.0, 3.0, 5.0)) + t * 2.1);
  float s = 0.0;
  for (int i = 0; i < ${SPIKES}; i++) {
    float c = dot(n, spikeDir[i]);
    // conical ferrofluid spike: sharp tip, wide foot
    s += spikeH[i] * pow(max(c, 0.0), 260.0) + spikeH[i] * 0.22 * pow(max(c, 0.0), 18.0);
  }
  return (r - R0 - w - s) * 0.4;   // spikes stretch the field, so step carefully
}

float map(vec3 p) {
  float d = blob(p);
  for (int i = 0; i < ${DROPS}; i++) {
    if (drops[i].w > 0.0) d = smin(d, length(p - drops[i].xyz) - drops[i].w, 0.28);
  }
  return d;
}

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(0.0025, -0.0025);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

vec3 coverAt(vec2 uv, float lod) {
  return hasCover > 0.5 ? textureLod(cover, uv, lod).rgb : mix(c1, c2, clamp(uv.y, 0.0, 1.0));
}

/** Environment the liquid reflects: the blurred cover wrapped around, plus two studio lights. */
vec3 env(vec3 d) {
  vec2 uv = vec2(atan(d.x, -d.z) / (2.0 * PI) + 0.5, d.y * 0.5 + 0.5);
  vec3 c = coverAt(uv, 4.0) * 0.9 + mix(c1, c2, uv.y) * 0.15;
  c += vec3(1.0) * pow(max(dot(d, normalize(vec3(-0.5, 0.75, 0.55))), 0.0), 60.0) * 4.0;
  c += mix(c2, vec3(1.0), 0.3) * pow(max(dot(d, normalize(vec3(0.75, 0.15, 0.35))), 0.0), 10.0) * 1.1;
  c += c1 * pow(max(dot(d, normalize(vec3(-0.2, -0.9, 0.3))), 0.0), 6.0) * 0.6;
  return c;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

/** Background: the cover dissolved into slow liquid, ripples running out on beats, glow around the drop. */
vec3 backdrop(vec2 p) {
  vec2 q = p * 0.5;
  q += 0.18 * vec2(noise(q * 2.0 + t * 0.07), noise(q * 2.0 + 7.3 - t * 0.06)) - 0.09;
  float r = length(p);
  for (int i = 0; i < 4; i++) {
    float a = ripples[i];
    if (a < 0.0) continue;
    float w = r - (0.35 + a * 1.4);
    q += (p / max(r, 1e-3)) * sin(w * 38.0) * exp(-abs(w) * 9.0) * 0.05 * (1.0 - a);
  }
  vec3 c = coverAt(q + 0.5, 5.5) * (0.17 + bass * 0.08);
  c += mix(c1, c2, 0.5 + 0.5 * sin(atan(p.y, p.x) * 2.0 + t * 0.4)) * exp(-r * 3.2) * (0.25 + bass * 0.45 + kick * 0.3);
  c *= 1.0 - smoothstep(0.3, 1.1, r) * 0.88;
  return c;
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  vec3 rd = normalize(cam * vec3(p, 1.75));
  vec3 col = backdrop(p);

  // only march where the drop can be (bounding sphere)
  float bound = R0 + 1.25;
  float b = dot(eye, rd);
  float cc = dot(eye, eye) - bound * bound;
  float h = b * b - cc;
  if (h > 0.0) {
    float tt = max(0.0, -b - sqrt(h));
    float tmax = -b + sqrt(h);
    bool hit = false;
    float glowAcc = 0.0;
    for (int i = 0; i < 110; i++) {
      vec3 pos = eye + rd * tt;
      float d = map(pos);
      glowAcc += exp(-max(d, 0.0) * 18.0) * 0.012;
      if (d < 0.0008 * tt) { hit = true; break; }
      tt += d;
      if (tt > tmax) break;
    }
    // soft coloured halo where the ray passed close to the liquid
    col += mix(c1, c2, 0.5) * glowAcc * (0.6 + bass * 0.8);
    if (hit) {
      vec3 pos = eye + rd * tt;
      vec3 n = normalAt(pos);
      float ndv = max(dot(n, -rd), 0.0);
      float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
      vec3 refl = env(reflect(rd, n));
      // the cover seen through the liquid, split a little into colours at the edges
      vec2 base = 0.5 + pos.xy * 0.3;
      vec3 rr = refract(rd, n, 1.0 / 1.31);
      vec3 rg = refract(rd, n, 1.0 / 1.33);
      vec3 rb = refract(rd, n, 1.0 / 1.36);
      vec3 inside = vec3(coverAt(base + rr.xy * 0.22, 0.5).r, coverAt(base + rg.xy * 0.22, 0.5).g, coverAt(base + rb.xy * 0.22, 0.5).b);
      // a little absorption: deeper parts take on the palette
      inside = mix(inside, inside * mix(c1, c2, 0.5) * 1.6, (1.0 - ndv) * 0.35);
      vec3 surf = mix(inside, refl, clamp(fres * 1.15 + 0.06, 0.0, 1.0));
      vec3 L = normalize(vec3(-0.5, 0.75, 0.55));
      surf += vec3(1.0) * pow(max(dot(reflect(rd, n), L), 0.0), 140.0) * (1.6 + high * 1.2);
      surf += mix(c1, c2, 0.5 + 0.5 * n.y) * pow(1.0 - ndv, 3.0) * (0.35 + bass * 0.6 + kick * 0.4);
      col = surf;
    }
  }
  col = aces(col * 1.1);
  col += (hash(gl_FragCoord.xy + fract(t) * 37.0) - 0.5) * 0.012;
  o = vec4(col, 1.0);
}`;

const BLIT_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D src;
uniform vec2 res;
void main() { o = texture(src, gl_FragCoord.xy / res); }`;

const toVec = (c: RGB): [number, number, number] => {
  const max = Math.max(c.r, c.g, c.b, 1);
  return [c.r / max, c.g / max, c.b / max];
};

/** Evenly spread directions on a sphere (Fibonacci lattice). */
function fibonacciDirs(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    out.push([Math.cos(g * i) * r, y, Math.sin(g * i) * r]);
  }
  return out;
}

interface Drop {
  p: [number, number, number];
  v: [number, number, number];
  r: number;
  life: number;
}

/**
 * Liquid (WebGL2): a real 3D drop, raymarched — see FS above. Beats fling
 * droplets out that a spring pulls back in; three more drift around it. The
 * camera slowly circles. Rendered at a resolution that adapts to the frame
 * rate, then scaled up. Without a readable (CORS) cover the palette stands in.
 */
export function createLiquid3dRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  const prog = createProgram(gl, QUAD_VS, FS, 'liquid3d');
  const blit = createProgram(gl, QUAD_VS, BLIT_FS, 'liquid3d blit');
  if (!prog || !blit) return null;
  const U = uniformsOf(gl, prog, ['res', 'cover', 'hasCover', 't', 'bass', 'kick', 'high', 'R0', 'c1', 'c2', 'spikeDir', 'spikeH', 'drops', 'ripples', 'cam', 'eye']);
  const B = uniformsOf(gl, blit, ['src', 'res']);
  const quad = fullscreenQuad(gl);
  const probe = lumProbe(gl, canvas);

  const coverTex = gl.createTexture();
  let hasCover = false;
  const load = imageLoader((img) => {
    try {
      gl.bindTexture(gl.TEXTURE_2D, coverTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      hasCover = true;
    } catch {
      hasCover = false;
    }
  });

  // adaptive-resolution target
  const target = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let tw = 0;
  let th = 0;
  let scale = 0.8;
  let slow = 0;
  let fast = 0;
  const ensureTarget = (w: number, h: number) => {
    if (w === tw && h === th) return;
    tw = w;
    th = h;
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  };

  const base = fibonacciDirs(SPIKES);
  const dirs = new Float32Array(SPIKES * 3);
  const heights = new Float32Array(SPIKES);
  const dropData = new Float32Array(DROPS * 4);
  const splash: Drop[] = [];
  let spin = 0;
  let prevKick = 0;
  const ripples: number[] = [];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  return {
    draw(f: VisFrame) {
      load(getUrl());
      const m = f.reduced ? 0 : 1;
      const t = f.reduced ? 0 : f.t;
      const dt = f.dt;
      // adapt the resolution to keep ~50+ fps
      if (dt > 1 / 42) slow++;
      else if (dt < 1 / 57) fast++;
      if (slow > 20) {
        scale = Math.max(0.45, scale - 0.1);
        slow = fast = 0;
      } else if (fast > 120) {
        scale = Math.min(1, scale + 0.05);
        slow = fast = 0;
      }
      const W = canvas.width;
      const H = canvas.height;
      const w = Math.max(1, Math.round(W * scale));
      const h = Math.max(1, Math.round(H * scale));
      ensureTarget(w, h);

      const kick = f.reduced ? 0 : f.kick;
      const R0 = 0.62 * (1 + f.bass * 0.08 * m + kick * 0.05);
      // spikes: a slowly turning lattice; each one listens to a band (bass at the bottom)
      spin += dt * (0.12 + f.bass * 0.5) * m;
      const cs = Math.cos(spin);
      const sn = Math.sin(spin);
      for (let i = 0; i < SPIKES; i++) {
        const [x, y, z] = base[i]!;
        dirs[i * 3] = x * cs - z * sn;
        dirs[i * 3 + 1] = y;
        dirs[i * 3 + 2] = x * sn + z * cs;
        const band = Math.min(1, Math.max(0, (y + 1) / 2) * 0.85 + ((i * 0.618) % 1) * 0.15);
        const lvl = sampleLevel(f.levels, band);
        heights[i] = Math.pow(lvl, 1.3) * (0.75 + kick * 0.2) * (0.25 + 0.75 * m);
      }

      // droplets: three drifting around, plus splashes flung out on beats and pulled back by a spring
      const started = kick > 0.9 && prevKick < kick - 0.05;
      prevKick = kick;
      if (started && m) {
        for (let k = 0; k < 2; k++) {
          const a = rnd() * Math.PI * 2;
          const y = rnd() * 1.4 - 0.5;
          const dir: [number, number, number] = [Math.cos(a), y, Math.sin(a)];
          const len = Math.hypot(...dir);
          const d: [number, number, number] = [dir[0] / len, dir[1] / len, dir[2] / len];
          splash.push({ p: [d[0] * R0, d[1] * R0, d[2] * R0], v: [d[0] * (2.6 + f.bass * 1.5), d[1] * (2.6 + f.bass * 1.5), d[2] * (2.6 + f.bass * 1.5)], r: 0.1 + rnd() * 0.08, life: 0 });
        }
        while (splash.length > 3) splash.shift();
        ripples.unshift(0);
        if (ripples.length > 4) ripples.pop();
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i]! += dt / 1.3;
        if (ripples[i]! >= 1) ripples.splice(i, 1);
      }
      for (let i = splash.length - 1; i >= 0; i--) {
        const s = splash[i]!;
        s.life += dt;
        for (let k = 0 as 0 | 1 | 2; k < 3; k = (k + 1) as 0 | 1 | 2) {
          s.v[k] += (-s.p[k] * 9 - s.v[k] * 1.6) * dt;
          s.p[k] += s.v[k] * dt;
        }
        if (s.life > 2.2) splash.splice(i, 1);
      }
      dropData.fill(0);
      for (let i = 0; i < 3; i++) {
        const ang = t * (0.45 + i * 0.13) * (i % 2 ? -1 : 1) + i * 2.1;
        const orbit = R0 * (1.55 + 0.35 * Math.sin(t * (0.6 + i * 0.21) + i));
        dropData.set([Math.cos(ang) * orbit, Math.sin(t * 0.5 + i * 1.7) * 0.45, Math.sin(ang) * orbit, 0.09 + 0.03 * i + sampleLevel(f.levels, 0.3 + i * 0.2) * 0.06], i * 4);
      }
      splash.forEach((s, i) => dropData.set([...s.p, s.r * Math.min(1, s.life * 6)], (3 + i) * 4));

      // camera slowly circling the drop
      const yaw = Math.sin(t * 0.11) * 0.55;
      const pitch = 0.18 + Math.sin(t * 0.07) * 0.12;
      const dist = 4.4 - f.bass * 0.15 * m - kick * 0.1;
      const eye: [number, number, number] = [Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist];
      type V3 = [number, number, number];
      const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const norm = (a: V3): V3 => {
        const l = Math.hypot(...a) || 1;
        return [a[0] / l, a[1] / l, a[2] / l];
      };
      const fwd = norm([-eye[0], -eye[1], -eye[2]]);
      const right = norm(cross(fwd, [0, 1, 0]));
      const up = cross(right, fwd);
      // columns: right, up, forward (rd = cam * (x, y, focal))
      const camM = new Float32Array([...right, ...up, ...fwd]);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coverTex);
      gl.uniform1i(U.cover!, 0);
      gl.uniform1f(U.hasCover!, hasCover ? 1 : 0);
      gl.uniform2f(U.res!, w, h);
      gl.uniform1f(U.t!, t);
      gl.uniform1f(U.bass!, f.bass);
      gl.uniform1f(U.kick!, kick);
      gl.uniform1f(U.high!, sampleLevel(f.levels, 0.75));
      gl.uniform1f(U.R0!, R0);
      gl.uniform3f(U.c1!, ...toVec(f.palette[0]));
      gl.uniform3f(U.c2!, ...toVec(f.palette[1]));
      gl.uniform3fv(U.spikeDir!, dirs);
      gl.uniform1fv(U.spikeH!, heights);
      gl.uniform4fv(U.drops!, dropData);
      gl.uniform4f(U.ripples!, ripples[0] ?? -1, ripples[1] ?? -1, ripples[2] ?? -1, ripples[3] ?? -1);
      gl.uniformMatrix3fv(U.cam!, false, camM);
      gl.uniform3f(U.eye!, ...eye);
      quad.draw();

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(blit);
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.uniform1i(B.src!, 0);
      gl.uniform2f(B.res!, W, H);
      quad.draw();
      probe();
    },
    dispose() {
      quad.dispose();
      gl.deleteTexture(coverTex);
      gl.deleteTexture(target);
      gl.deleteFramebuffer(fbo);
      gl.deleteProgram(prog);
      gl.deleteProgram(blit);
    },
  };
}

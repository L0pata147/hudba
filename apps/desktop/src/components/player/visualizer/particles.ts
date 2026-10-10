import { sampleLevel } from '@sonora/core';
import { imageLoader } from './ambient';
import { bright, coverTexture, createProgram, fullscreenQuad, lumProbe, QUAD_VS, uniformsOf } from './gl';
import { createPost } from './post';
import { beatEdge } from './scene';
import type { Renderer, VisFrame } from './types';

const GRID = 220;

/**
 * Each particle is one pixel of the cover, and the particles keep changing
 * shape: the picture standing out in relief, a globe with the picture wrapped
 * round it, a spiral galaxy, a landscape made of the spectrum, a torus knot.
 * Every 16 beats they fly (each on its own path, a little delayed) to the next
 * shape; each beat sends a wave through them, halfway through a shape they are
 * blown apart and swirl back, and the camera slowly turns round them.
 */
const VS = `#version 300 es
in vec2 uv;
in float rnd;
out vec3 col;
out float alpha;
uniform vec2 res;
uniform float S, t, bass, high, pt, big, bigPower, rotY, rotX, formA, formB, morph;
uniform vec4 rings;      // seconds since recent beats (waves), < 0 = none
uniform float lv[24];
uniform sampler2D cover;
uniform float hasCover;
uniform vec3 c1, c2;
const float TAU = 6.2831853;
float h1(float n) { return fract(sin(n) * 43758.5453); }
float level(float x) {
  float f = clamp(x, 0.0, 1.0) * 23.0;
  int i = int(floor(f));
  return mix(lv[i], lv[min(i + 1, 23)], fract(f));
}
vec3 knot(float u) {
  float r = 0.34 + 0.13 * cos(3.0 * u);
  return vec3(cos(2.0 * u) * r, 0.14 * sin(3.0 * u), sin(2.0 * u) * r);
}
// where a particle sits in each shape (in units of S, centred on 0)
vec3 shape(float k, vec2 uv, float lum) {
  vec2 c = uv - 0.5;
  if (k < 0.5) {
    // the picture, bright parts standing out, each column rippling with its band
    vec3 p = vec3(c, 0.0);
    p.z += (lum - 0.35) * 0.16 * (0.35 + bass * 0.9);
    p.z += sin(uv.y * 12.0 - t * 3.0 + uv.x * 4.0) * level(uv.x) * 0.025;
    return p;
  }
  if (k < 1.5) {
    // a globe with the picture wrapped round it, its surface lifted by the spectrum
    float lon = uv.x * TAU + t * 0.3;
    float lat = (uv.y - 0.5) * 3.1;
    float R = 0.38 + (lum - 0.4) * 0.04 + level(uv.y) * 0.05;
    return vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon)) * R;
  }
  if (k < 2.5) {
    // a spiral galaxy: the picture's rows become rings, the inner ones turning faster, bunched into two arms
    float r = 0.03 + uv.y * 0.55;
    float a = uv.x * TAU - t * 0.25 / (0.2 + r * 2.0);
    a += sin(a * 2.0 - r * 10.0) * 0.3;
    float thick = (fract(uv.x * 37.0 + uv.y * 91.0) - 0.5) * 0.05 * (1.0 - uv.y);
    return vec3(cos(a) * r, thick + level(uv.y) * 0.05 * sin(a * 3.0 + t), sin(a) * r);
  }
  if (k < 3.5) {
    // a landscape of the spectrum: bass at the front, treble at the back, rolling waves across
    float hgt = level(uv.y) * 0.28 * (0.55 + 0.45 * sin(uv.x * 9.0 + t * 1.6)) + lum * 0.05;
    return vec3(c.x * 1.25, -0.18 + hgt, -c.y * 1.25);
  }
  // a torus knot, the picture wrapped round its tube
  float u = uv.x * TAU + t * 0.15;
  float v = uv.y * TAU;
  vec3 kp = knot(u);
  vec3 T = normalize(knot(u + 0.01) - kp);
  vec3 N = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
  vec3 B = cross(T, N);
  return kp + (N * cos(v) + B * sin(v)) * (0.065 + level(uv.x) * 0.035);
}
void main() {
  vec3 tex = hasCover > 0.5 ? textureLod(cover, uv, 0.0).rgb : mix(c1, c2, uv.y);
  float lum = dot(tex, vec3(0.299, 0.587, 0.114));
  // fly from one shape to the next, each particle a little late and on a curving path of its own
  float e = clamp(morph * 1.4 - rnd * 0.4, 0.0, 1.0);
  e = e * e * (3.0 - 2.0 * e);
  vec3 pa = shape(formA, uv, lum);
  vec3 pos = e >= 1.0 ? shape(formB, uv, lum) : mix(pa, shape(formB, uv, lum), e);
  float m = sin(e * 3.14159);
  vec3 wander = vec3(h1(rnd * 91.0), h1(rnd * 53.0), h1(rnd * 17.0)) - 0.5;
  pos += wander * m * 0.45;
  float sw = m * (rnd - 0.5) * 2.5;
  pos.xz = mat2(cos(sw), sin(sw), -sin(sw), cos(sw)) * pos.xz;
  float planar = (formA < 0.5 ? 1.0 - e : 0.0) + (formB < 0.5 ? e : 0.0);
  // beat waves running out from the middle
  float wave = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = rings[i];
    if (a < 0.0) continue;
    float w = length(pos) * 1.5 - a * 1.8;
    float amp = exp(-w * w * 55.0) * exp(-a * 2.2);
    pos += normalize(pos + 1e-4) * amp * 0.04;
    pos.z += amp * 0.11 * planar;
    wave += amp;
  }
  // the blast: out fast, then a slow swirl back into place
  float blast = 0.0;
  if (big >= 0.0) {
    float b = (1.0 - exp(-big * 8.0)) * exp(-big * 0.85) * bigPower;
    vec3 dir = normalize(pos * 2.0 + wander * 1.2 + vec3(0.0, 0.0, (h1(rnd * 7.0) - 0.5) * 1.5));
    pos += dir * b * (0.35 + rnd * 0.7);
    float s2 = b * (rnd - 0.5) * 3.0 + b * 1.2;
    pos.xy = mat2(cos(s2), sin(s2), -sin(s2), cos(s2)) * pos.xy;
    blast = b;
  }
  pos *= S;
  // the camera turning slowly round them
  float cy = cos(rotY), sy = sin(rotY), cx = cos(rotX), sx = sin(rotX);
  pos = vec3(pos.x * cy + pos.z * sy, pos.y, -pos.x * sy + pos.z * cy);
  pos = vec3(pos.x, pos.y * cx - pos.z * sx, pos.y * sx + pos.z * cx);
  float f = S * 2.2;
  float sc = f / max(f - pos.z, f * 0.2);
  gl_Position = vec4((res * 0.5 + pos.xy * sc) / res * 2.0 - 1.0, 0.0, 1.0);
  // depth of field: far from the focal plane the dots grow and fade
  float blur = clamp(abs(pos.z) / S * 2.5, 0.0, 3.0);
  gl_PointSize = pt * sc * (0.85 + lum * 0.35 + bass * 0.25) * (1.0 + blur * 1.6) * (1.0 + m * 0.5);
  vec3 hot = mix(c2, vec3(1.0), 0.6);
  float sparkle = step(0.965, rnd) * high * (0.5 + 0.5 * sin(t * 9.0 + rnd * 300.0));
  col = tex * (0.75 + lum * 0.5 + high * 0.25 + sparkle * 1.8) + hot * (wave * 0.6 + blast * 0.35 + m * 0.25);
  alpha = (0.9 + wave * 0.3) / (1.0 + blur * blur * 1.5);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 col;
in float alpha;
out vec4 o;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, d) * alpha;
  o = vec4(col * a, a);
}`;

const BG_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res;
uniform vec3 c1, c2;
uniform float bass, kick, hasCover, t;
uniform sampler2D cover;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float r = length(p);
  vec3 blur = hasCover > 0.5 ? textureLod(cover, p * 0.6 + 0.5, 6.5).rgb : mix(c1, c2, 0.5);
  vec3 c = vec3(0.008, 0.007, 0.014) + blur * exp(-r * 2.2) * (0.16 + bass * 0.14 + kick * 0.08);
  // faint stars far behind
  vec2 g = gl_FragCoord.xy / 3.0;
  float h = hash(floor(g));
  c += vec3(0.7, 0.75, 1.0) * step(0.997, h) * (0.25 + 0.25 * sin(t * 2.0 + h * 80.0));
  o = vec4(c, 1.0);
}`;

/** Camera tilt for each shape: the picture face on, the galaxy and the landscape from above. */
const TILT = [0.12, 0.2, 0.75, 0.55, 0.4];
const ORDER = [0, 1, 2, 0, 3, 4];

/**
 * Particle cover (WebGL2): the cover as ~48 000 glowing particles — see VS.
 */
export function createParticlesRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  const prog = createProgram(gl, VS, FS, 'particles', 'uv');
  const bg = createProgram(gl, QUAD_VS, BG_FS, 'particles bg');
  const post = createPost(gl, { bloom: 1, threshold: 0.5, grain: 0.015 }, 'particles');
  if (!prog || !bg || !post) return null;
  gl.bindAttribLocation(prog, 1, 'rnd');
  gl.linkProgram(prog);
  const U = uniformsOf(gl, prog, ['res', 'S', 't', 'bass', 'high', 'pt', 'rings', 'big', 'bigPower', 'rotY', 'rotX', 'formA', 'formB', 'morph', 'lv', 'cover', 'hasCover', 'c1', 'c2']);
  const BU = uniformsOf(gl, bg, ['res', 'c1', 'c2', 'bass', 'kick', 'hasCover', 'cover', 't']);
  const quad = fullscreenQuad(gl);
  const probe = lumProbe(gl, canvas);
  const cover = coverTexture(gl, imageLoader);

  const data = new Float32Array(GRID * GRID * 3);
  let k = 0;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      data[k++] = (x + 0.5) / GRID;
      data[k++] = (y + 0.5) / GRID;
      data[k++] = rnd();
    }
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

  const edge = beatEdge();
  const rings: number[] = [];
  let beats = 0;
  let big = -1;
  let bigPower = 1;
  let step = 0;
  let formA = 0;
  let formB = 0;
  let morph = 1;
  let sinceForm = 0;
  const lv = new Float32Array(24);

  const nextForm = () => {
    formA = formB;
    step = (step + 1) % ORDER.length;
    formB = ORDER[step]!;
    morph = 0;
    sinceForm = 0;
  };

  return {
    draw(f: VisFrame) {
      cover.load(getUrl());
      const W = canvas.width;
      const H = canvas.height;
      const [c1, c2] = [bright(f.palette[0]), bright(f.palette[1])];
      sinceForm += f.dt;
      if (edge(f.kick) && !f.reduced) {
        rings.unshift(0);
        if (rings.length > 4) rings.pop();
        beats++;
        // every 16 beats a new shape; halfway through one, a blast when the music is going
        if (beats % 16 === 0) nextForm();
        else if (beats % 16 === 8 && f.bass > 0.35) {
          big = 0;
          bigPower = 0.6 + f.bass * 0.5;
        }
      }
      if (!f.reduced && sinceForm > 24) nextForm();
      for (let i = 0; i < rings.length; i++) rings[i]! += f.dt;
      if (big >= 0) big = big > 6 ? -1 : big + f.dt;
      morph = Math.min(1, morph + f.dt / 2.8);
      for (let i = 0; i < 24; i++) lv[i] = sampleLevel(f.levels, i / 23);
      const m = f.reduced ? 0 : 1;
      const e = morph * morph * (3 - 2 * morph);

      post.begin(W, H);
      gl.disable(gl.BLEND);
      gl.useProgram(bg);
      gl.uniform2f(BU.res!, W, H);
      gl.uniform3f(BU.c1!, ...c1);
      gl.uniform3f(BU.c2!, ...c2);
      gl.uniform1f(BU.bass!, f.bass);
      gl.uniform1f(BU.kick!, f.reduced ? 0 : f.kick);
      gl.uniform1f(BU.t!, f.reduced ? 0 : f.t);
      cover.bind(0);
      gl.uniform1i(BU.cover!, 0);
      gl.uniform1f(BU.hasCover!, cover.has() ? 1 : 0);
      quad.draw();

      gl.useProgram(prog);
      cover.bind(0);
      gl.uniform1i(U.cover!, 0);
      gl.uniform1f(U.hasCover!, cover.has() ? 1 : 0);
      gl.uniform2f(U.res!, W, H);
      const S = Math.min(W, H) * 0.66;
      gl.uniform1f(U.S!, S);
      gl.uniform1f(U.pt!, Math.max(1.2, S / GRID));
      gl.uniform1f(U.t!, f.reduced ? 0 : f.t);
      gl.uniform1f(U.bass!, f.bass);
      gl.uniform1f(U.high!, sampleLevel(f.levels, 0.75));
      gl.uniform4f(U.rings!, rings[0] ?? -1, rings[1] ?? -1, rings[2] ?? -1, rings[3] ?? -1);
      gl.uniform1f(U.big!, big);
      gl.uniform1f(U.bigPower!, bigPower);
      gl.uniform1f(U.formA!, formA);
      gl.uniform1f(U.formB!, formB);
      gl.uniform1f(U.morph!, morph);
      gl.uniform1f(U.rotY!, Math.sin(f.t * 0.17) * 0.42 * m);
      gl.uniform1f(U.rotX!, TILT[formA]! + (TILT[formB]! - TILT[formA]!) * e + Math.sin(f.t * 0.11) * 0.1 * m);
      gl.uniform1fv(U.lv!, lv);
      gl.uniform3f(U.c1!, ...c1);
      gl.uniform3f(U.c2!, ...c2);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, GRID * GRID);
      gl.disable(gl.BLEND);
      gl.disableVertexAttribArray(1);
      post.end(W, H, f.bass);
      probe();
    },
    dispose() {
      quad.dispose();
      cover.dispose();
      post.dispose();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteProgram(bg);
    },
  };
}

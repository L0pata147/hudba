import { sampleLevel } from '@sonora/core';
import { imageLoader } from './ambient';
import { bright, coverTexture, createProgram, fullscreenQuad, lumProbe, QUAD_VS, uniformsOf } from './gl';
import { beatEdge } from './scene';
import type { Renderer, VisFrame } from './types';

const GRID = 220;

/**
 * Each particle is one pixel of the cover. The picture stands out in relief
 * (brighter pixels come forward, more with the bass), every column ripples
 * with its band, each beat sends a wave through it, and every 16 beats it is
 * blown apart and swirls back together. The camera slowly turns round it.
 */
const VS = `#version 300 es
in vec2 uv;
in float rnd;
out vec3 col;
out float alpha;
uniform vec2 res;
uniform float S, t, bass, mid, high, pt, big, bigPower, rotY, rotX;
uniform vec4 rings;      // seconds since recent beats (waves), < 0 = none
uniform float lv[24];
uniform sampler2D cover;
uniform float hasCover;
uniform vec3 c1, c2;
float h1(float n) { return fract(sin(n) * 43758.5453); }
float level(float x) {
  float f = clamp(x, 0.0, 1.0) * 23.0;
  int i = int(floor(f));
  return mix(lv[i], lv[min(i + 1, 23)], fract(f));
}
void main() {
  vec3 tex = hasCover > 0.5 ? textureLod(cover, uv, 0.0).rgb : mix(c1, c2, uv.y);
  float lum = dot(tex, vec3(0.299, 0.587, 0.114));
  vec2 c = uv - 0.5;
  vec3 pos = vec3(c * S, 0.0);
  // relief: bright parts come forward
  pos.z += (lum - 0.35) * S * 0.16 * (0.35 + bass * 0.9);
  // each column ripples with its band (bass on the left, treble on the right)
  float lvl = level(uv.x);
  pos.z += sin(uv.y * 12.0 - t * 3.0 + uv.x * 4.0) * lvl * S * 0.025;
  // beat waves running out from the centre
  float wave = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = rings[i];
    if (a < 0.0) continue;
    float w = length(c) * 1.5 - a * 1.8;
    float amp = exp(-w * w * 55.0) * exp(-a * 2.2);
    pos.z += amp * S * 0.11;
    pos.xy += normalize(c + 1e-4) * amp * S * 0.025;
    wave += amp;
  }
  // the big explosion: out fast, then a slow swirl back into place
  float blast = 0.0;
  if (big >= 0.0) {
    float e = (1.0 - exp(-big * 8.0)) * exp(-big * 0.85) * bigPower;
    vec3 dir = normalize(vec3(c * 2.0 + (vec2(h1(rnd * 91.0), h1(rnd * 53.0)) - 0.5) * 1.2, (h1(rnd * 17.0) - 0.5) * 2.4));
    pos += dir * e * S * (0.35 + rnd * 0.7);
    float sw = e * (rnd - 0.5) * 3.0 + e * 1.2;
    pos.xy = mat2(cos(sw), sin(sw), -sin(sw), cos(sw)) * pos.xy;
    blast = e;
  }
  // camera turning slowly round the picture
  float cy = cos(rotY), sy = sin(rotY), cx = cos(rotX), sx = sin(rotX);
  pos = vec3(pos.x * cy + pos.z * sy, pos.y, -pos.x * sy + pos.z * cy);
  pos = vec3(pos.x, pos.y * cx - pos.z * sx, pos.y * sx + pos.z * cx);
  float f = S * 2.2;
  float sc = f / max(f - pos.z, f * 0.2);
  vec2 sp = res * 0.5 + pos.xy * sc;
  gl_Position = vec4(sp / res * 2.0 - 1.0, 0.0, 1.0);
  // depth of field: particles far off the picture plane blur into larger, fainter dots
  float blur = clamp(abs(pos.z) / S * 2.5, 0.0, 3.0);
  gl_PointSize = pt * sc * (0.85 + lum * 0.35 + bass * 0.25) * (1.0 + blur * 1.6);
  vec3 hot = mix(c2, vec3(1.0), 0.6);
  float sparkle = step(0.965, rnd) * high * (0.5 + 0.5 * sin(t * 9.0 + rnd * 300.0));   // a few glitter with the treble
  col = tex * (0.75 + lum * 0.5 + high * 0.25 + sparkle * 1.8) + hot * (wave * 0.6 + blast * 0.35);
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
uniform float bass, kick, hasCover;
uniform sampler2D cover;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float r = length(p);
  vec3 blur = hasCover > 0.5 ? textureLod(cover, p * 0.6 + 0.5, 6.5).rgb : mix(c1, c2, 0.5);
  vec3 c = vec3(0.008, 0.007, 0.014) + blur * exp(-r * 2.2) * (0.16 + bass * 0.14 + kick * 0.08);
  o = vec4(c, 1.0);
}`;

/**
 * Particle cover (WebGL2): the cover as ~48 000 glowing particles — see VS.
 */
export function createParticlesRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  const prog = createProgram(gl, VS, FS, 'particles', 'uv');
  const bg = createProgram(gl, QUAD_VS, BG_FS, 'particles bg');
  if (!prog || !bg) return null;
  gl.bindAttribLocation(prog, 1, 'rnd');
  gl.linkProgram(prog);
  const U = uniformsOf(gl, prog, ['res', 'S', 't', 'bass', 'mid', 'high', 'pt', 'rings', 'big', 'bigPower', 'rotY', 'rotX', 'lv', 'cover', 'hasCover', 'c1', 'c2']);
  const BU = uniformsOf(gl, bg, ['res', 'c1', 'c2', 'bass', 'kick', 'hasCover', 'cover']);
  const quad = fullscreenQuad(gl);
  const probe = lumProbe(gl, canvas);
  const cover = coverTexture(gl, imageLoader);

  const data = new Float32Array(GRID * GRID * 3);
  let k = 0;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
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
  const lv = new Float32Array(24);

  return {
    draw(f: VisFrame) {
      cover.load(getUrl());
      const W = canvas.width;
      const H = canvas.height;
      const [c1, c2] = [bright(f.palette[0]), bright(f.palette[1])];
      if (edge(f.kick) && !f.reduced) {
        rings.unshift(0);
        if (rings.length > 4) rings.pop();
        // every 16 beats (once the music is going) the picture is blown apart
        if (++beats % 16 === 0 && f.bass > 0.35) {
          big = 0;
          bigPower = 0.7 + f.bass * 0.6;
        }
      }
      for (let i = 0; i < rings.length; i++) rings[i]! += f.dt;
      if (big >= 0) big = big > 6 ? -1 : big + f.dt;
      for (let i = 0; i < 24; i++) lv[i] = sampleLevel(f.levels, i / 23);
      const m = f.reduced ? 0 : 1;

      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      gl.useProgram(bg);
      gl.uniform2f(BU.res!, W, H);
      gl.uniform3f(BU.c1!, ...c1);
      gl.uniform3f(BU.c2!, ...c2);
      gl.uniform1f(BU.bass!, f.bass);
      gl.uniform1f(BU.kick!, f.reduced ? 0 : f.kick);
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
      gl.uniform1f(U.pt!, Math.max(1.2, (S / GRID) * 1.0));
      gl.uniform1f(U.t!, f.reduced ? 0 : f.t);
      gl.uniform1f(U.bass!, f.bass);
      gl.uniform1f(U.mid!, sampleLevel(f.levels, 0.45));
      gl.uniform1f(U.high!, sampleLevel(f.levels, 0.75));
      gl.uniform4f(U.rings!, rings[0] ?? -1, rings[1] ?? -1, rings[2] ?? -1, rings[3] ?? -1);
      gl.uniform1f(U.big!, big);
      gl.uniform1f(U.bigPower!, bigPower);
      gl.uniform1f(U.rotY!, Math.sin(f.t * 0.17) * 0.42 * m);
      gl.uniform1f(U.rotX!, (0.12 + Math.sin(f.t * 0.11) * 0.12) * m);
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
      probe();
    },
    dispose() {
      quad.dispose();
      cover.dispose();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteProgram(bg);
    },
  };
}

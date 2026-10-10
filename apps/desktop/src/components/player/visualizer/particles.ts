import { sampleLevel } from '@sonora/core';
import { imageLoader } from './ambient';
import { bright, coverTexture, createProgram, fullscreenQuad, lumProbe, QUAD_VS, uniformsOf } from './gl';
import { beatEdge } from './scene';
import type { Renderer, VisFrame } from './types';

const GRID = 190;

/** Each particle is one pixel of the cover; beats blow it apart and it flows back together. */
const VS = `#version 300 es
in vec2 uv;
in float rnd;
out vec3 col;
out float alpha;
uniform vec2 res;
uniform float S, t, bass, mid, high, pt;
uniform vec4 ages;       // seconds since the last four explosions, < 0 = none
uniform vec4 power;      // how hard each one hit
uniform sampler2D cover;
uniform float hasCover;
uniform vec3 c1, c2;
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec3 pos = vec3((uv - 0.5) * S, 0.0);
  // a slow wave rolls across the picture with the mids
  pos.z += sin(uv.x * 7.0 + t * 1.3) * sin(uv.y * 5.0 - t * 1.1) * S * 0.04 * (0.4 + mid);
  float blast = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = ages[i];
    if (a < 0.0) continue;
    // out fast, back slowly
    float e = (1.0 - exp(-a * 9.0)) * exp(-a * 1.25) * power[i];
    vec3 dir = normalize(vec3((uv - 0.5) * 2.0 + (vec2(h1(rnd * 91.0 + float(i)), h1(rnd * 53.0 + float(i))) - 0.5) * 0.9,
                              (h1(rnd * 17.0 + float(i)) - 0.5) * 2.2));
    pos += dir * e * S * (0.55 + rnd * 0.6);
    // and swirl a little on the way
    float sw = e * (rnd - 0.5) * 2.4;
    pos.xy = mat2(cos(sw), sin(sw), -sin(sw), cos(sw)) * pos.xy;
    blast += e;
  }
  float f = S * 2.4;
  float sc = f / (f - pos.z);
  vec2 sp = res * 0.5 + pos.xy * sc;
  gl_Position = vec4(sp / res * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = pt * sc * (1.0 + bass * 0.5 + blast * 0.8 + rnd * 0.4);
  vec3 c = hasCover > 0.5 ? textureLod(cover, uv, 0.0).rgb : mix(c1, c2, uv.y);
  // flying particles burn hotter
  col = mix(c, mix(c2, vec3(1.0), 0.5), clamp(blast * 0.6, 0.0, 0.7)) * (0.85 + high * 0.5);
  alpha = 0.75 + blast * 0.4;
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
uniform float bass, kick;
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float r = length(p);
  vec3 c = vec3(0.012, 0.01, 0.02) + mix(c1, c2, 0.5 + 0.5 * p.y) * exp(-r * 2.4) * (0.12 + bass * 0.18 + kick * 0.12);
  o = vec4(c, 1.0);
}`;

/**
 * Particle cover (WebGL2): the cover as ~36 000 glowing particles. Every beat
 * blows them apart in 3D (harder with more bass) and they swirl back into the
 * picture; a wave rolls across it with the mids and the treble makes them glitter.
 */
export function createParticlesRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  const prog = createProgram(gl, VS, FS, 'particles', 'uv');
  const bg = createProgram(gl, QUAD_VS, BG_FS, 'particles bg');
  if (!prog || !bg) return null;
  gl.bindAttribLocation(prog, 1, 'rnd');
  gl.linkProgram(prog);
  const U = uniformsOf(gl, prog, ['res', 'S', 't', 'bass', 'mid', 'high', 'pt', 'ages', 'power', 'cover', 'hasCover', 'c1', 'c2']);
  const BU = uniformsOf(gl, bg, ['res', 'c1', 'c2', 'bass', 'kick']);
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
  const ages: number[] = [];
  const power: number[] = [];

  return {
    draw(f: VisFrame) {
      cover.load(getUrl());
      const W = canvas.width;
      const H = canvas.height;
      const [c1, c2] = [bright(f.palette[0]), bright(f.palette[1])];
      if (edge(f.kick) && !f.reduced) {
        ages.unshift(0);
        power.unshift(0.55 + f.bass * 0.8);
        if (ages.length > 4) {
          ages.pop();
          power.pop();
        }
      }
      for (let i = 0; i < ages.length; i++) ages[i]! += f.dt;

      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      gl.useProgram(bg);
      gl.uniform2f(BU.res!, W, H);
      gl.uniform3f(BU.c1!, ...c1);
      gl.uniform3f(BU.c2!, ...c2);
      gl.uniform1f(BU.bass!, f.bass);
      gl.uniform1f(BU.kick!, f.reduced ? 0 : f.kick);
      quad.draw();

      gl.useProgram(prog);
      cover.bind(0);
      gl.uniform1i(U.cover!, 0);
      gl.uniform1f(U.hasCover!, cover.has() ? 1 : 0);
      gl.uniform2f(U.res!, W, H);
      const S = Math.min(W, H) * 0.62;
      gl.uniform1f(U.S!, S);
      gl.uniform1f(U.pt!, Math.max(1.5, (S / GRID) * 1.5));
      gl.uniform1f(U.t!, f.reduced ? 0 : f.t);
      gl.uniform1f(U.bass!, f.bass);
      gl.uniform1f(U.mid!, sampleLevel(f.levels, 0.45));
      gl.uniform1f(U.high!, sampleLevel(f.levels, 0.75));
      gl.uniform4f(U.ages!, ages[0] ?? -1, ages[1] ?? -1, ages[2] ?? -1, ages[3] ?? -1);
      gl.uniform4f(U.power!, power[0] ?? 0, power[1] ?? 0, power[2] ?? 0, power[3] ?? 0);
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

import { sampleLevel } from '@sonora/core';
import type { DanceStyle } from '../../../lib/characters';
import { createDance } from './dance';
import type { Renderer, VisFrame } from './types';

const QUAD_VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

/** The stage: dark violet room, two coloured lights following the dance, a lit floor, drifting sparkles. */
const STAGE_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res;
uniform vec2 feet;     // px, GL coordinates (y up)
uniform float size;    // character height, px
uniform float t, bass, kick, high, lean, jump, has;
const vec3 PINK = vec3(1.0, 0.36, 0.72);
const vec3 LILAC = vec3(0.6, 0.42, 1.0);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 q = (px - feet) / size;                 // character units, 0 at the feet
  float floorY = feet.y;
  vec3 col = mix(vec3(0.07, 0.03, 0.10), vec3(0.025, 0.01, 0.04), smoothstep(0.0, 1.3, q.y));
  // two soft lights on the back wall, swinging with the dance
  float l1 = exp(-pow(length((q - vec2(-0.55 + lean * 0.25, 0.75)) * vec2(1.0, 1.4)), 2.0) * 2.2);
  float l2 = exp(-pow(length((q - vec2(0.6 + lean * 0.25, 0.85)) * vec2(1.0, 1.4)), 2.0) * 2.2);
  float glow = 0.28 + bass * 0.45 + kick * 0.25;
  col += PINK * l1 * glow * 0.55 + LILAC * l2 * glow * 0.5;
  // spotlight cone from above onto the character
  float cone = smoothstep(0.42 + q.y * 0.18, 0.0, abs(q.x - lean * 0.15 * q.y)) * smoothstep(1.9, 0.2, q.y) * step(0.0, q.y);
  col += mix(PINK, vec3(1.0), 0.35) * cone * (0.05 + bass * 0.07 + kick * 0.05) * has;
  // floor
  if (px.y < floorY) {
    float d = (floorY - px.y) / size;
    col = mix(vec3(0.09, 0.04, 0.10), vec3(0.03, 0.015, 0.035), smoothstep(0.0, 0.5, d));
    // lit circle under the dancer, pulsing with the bass
    float ring = exp(-pow(length(vec2(q.x * 0.75, d * 2.6)), 2.0) * 4.0);
    col += PINK * ring * (0.25 + bass * 0.5 + kick * 0.3);
    // shadow at the feet, smaller while in the air
    float sh = exp(-pow(length(vec2(q.x * 1.6, d * 9.0)), 2.0) * 3.0) * (0.75 - jump * 0.5) * has;
    col *= 1.0 - sh;
    // floor edge line
    col += PINK * exp(-d * size * 0.35) * 0.35;
  }
  // sparkles drifting up, brighter with the treble
  vec2 cell = px / 46.0 + vec2(0.0, -t * 0.35);
  vec2 id = floor(cell);
  vec2 f = fract(cell) - 0.5;
  float r = hash(id);
  if (r > 0.86) {
    vec2 c = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
    float s = exp(-dot(f - c * 0.7, f - c * 0.7) * 380.0);
    float tw = 0.5 + 0.5 * sin(t * 3.0 + r * 40.0);
    col += mix(PINK, LILAC, hash(id + 1.3)) * s * tw * (0.35 + high * 1.2);
  }
  // vignette
  vec2 uv = px / res - 0.5;
  col *= 1.0 - dot(uv, uv) * 0.9;
  o = vec4(col, 1.0);
}`;

/** The character as a flexible grid: the feet stay on the floor, the body bends, the head nods, loose parts lag. */
const CHAR_VS = `#version 300 es
in vec2 g;             // grid 0…1, v = 0 at the feet
out vec2 uv;
out float vy;
uniform vec2 res, feet, dims;   // dims = width, height in px
uniform float lean, lag, jump, squash, nod, tilt, kick, t, flip, grow;
void main() {
  float v = g.y;
  float u = g.x - 0.5;
  float sx = 1.0 + squash * 0.09;
  float sy = 1.0 - squash * 0.11;
  float H = dims.y;
  vec2 p = vec2(u * dims.x * sx, v * H * sy);
  // body bend: nothing at the feet, most at the top, along an arc
  p.x += lean * H * 0.13 * v * v;
  p.y -= abs(lean) * H * 0.02 * v * v;
  // head and loose parts
  float head = smoothstep(0.58, 0.9, v);
  p.x += (tilt * 0.035 + (lag - lean) * 0.09) * H * head;
  p.y -= nod * H * 0.022 * head;
  p.x += nod * H * 0.01 * head * sign(lean + 0.0001);
  // a quick shiver through the body on each beat
  p.x += kick * sin(v * 13.0 - t * 24.0) * H * 0.0035 * v;
  p.y += jump * H * 0.16;
  p = (p - vec2(0.0, H * 0.5)) * grow + vec2(0.0, H * 0.5);
  vec2 pos = feet + vec2(p.x, flip * p.y);
  gl_Position = vec4(pos / res * 2.0 - 1.0, 0.0, 1.0);
  uv = vec2(g.x, 1.0 - g.y);
  vy = v;
}`;

const CHAR_FS = `#version 300 es
precision highp float;
in vec2 uv;
in float vy;
out vec4 o;
uniform sampler2D tex;
uniform float mode, glow, kick;  // mode 0 = body, 1 = glow halo, 2 = floor reflection
const vec3 PINK = vec3(1.0, 0.36, 0.72);
void main() {
  if (mode > 1.5) {
    vec4 c = texture(tex, uv);
    o = c * 0.2 * smoothstep(0.45, 0.0, vy);
  } else if (mode > 0.5) {
    // soft halo: a blurred, slightly enlarged silhouette
    float a = 0.0;
    for (int i = 0; i < 12; i++) {
      float ang = float(i) * 0.5236;
      a += textureLod(tex, uv + vec2(cos(ang), sin(ang)) * 0.025, 3.0).a;
    }
    a = a / 12.0;
    o = vec4(PINK * a * glow * 0.75, 0.0);
  } else {
    vec4 c = texture(tex, uv);
    // a pink rim light from the stage, brighter on beats
    float rim = (1.0 - textureLod(tex, uv, 2.5).a) * c.a;
    c.rgb += PINK * rim * (0.35 + glow * 0.6) + c.a * kick * 0.05;
    o = c;
  }
}`;

function program(gl: WebGL2RenderingContext, vs: string, fs: string, attr: string): WebGLProgram | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
    console.warn('dancer shader:', gl.getShaderInfoLog(s));
    return null;
  };
  const v = sh(gl.VERTEX_SHADER, vs);
  const f = sh(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, attr);
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

const uniforms = (gl: WebGL2RenderingContext, p: WebGLProgram, names: string[]) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));

export interface DancerSource {
  image: HTMLImageElement | null;
  dance: DanceStyle;
}

/**
 * Dancer: a character picture that dances to the beat on a small neon stage.
 * The picture is drawn as a grid that bends like a body (see CHAR_VS) driven by
 * the beat clock in dance.ts.
 */
export function createDancerRenderer(canvas: HTMLCanvasElement, getSource: () => DancerSource, getIntensity: () => number): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true });
  if (!gl) return null;
  const stage = program(gl, QUAD_VS, STAGE_FS, 'p');
  const body = program(gl, CHAR_VS, CHAR_FS, 'g');
  if (!stage || !body) return null;
  const SU = uniforms(gl, stage, ['res', 'feet', 'size', 't', 'bass', 'kick', 'high', 'lean', 'jump', 'has']);
  const CU = uniforms(gl, body, ['res', 'feet', 'dims', 'lean', 'lag', 'jump', 'squash', 'nod', 'tilt', 'kick', 't', 'flip', 'grow', 'tex', 'mode', 'glow']);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  // grid of 24 × 36 cells as triangles
  const GX = 24;
  const GY = 36;
  const verts: number[] = [];
  for (let y = 0; y < GY; y++) {
    for (let x = 0; x < GX; x++) {
      const x0 = x / GX;
      const x1 = (x + 1) / GX;
      const y0 = y / GY;
      const y1 = (y + 1) / GY;
      verts.push(x0, y0, x1, y0, x0, y1, x1, y0, x1, y1, x0, y1);
    }
  }
  const grid = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, grid);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const gridCount = verts.length / 2;

  const tex = gl.createTexture();
  let uploaded: HTMLImageElement | null = null;
  const dance = createDance();
  let frames = 0;

  const upload = (img: HTMLImageElement) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    uploaded = img;
  };

  return {
    draw(f: VisFrame) {
      const W = canvas.width;
      const H = canvas.height;
      const src = getSource();
      const img = src.image;
      if (img && img !== uploaded) upload(img);
      const has = img ? 1 : 0;
      const intensity = Math.max(0, Math.min(1, getIntensity()));
      const pose = dance.step(f.t, f.dt, f.reduced ? 0 : f.kick, f.bass, src.dance, intensity, f.reduced);
      const kick = f.reduced ? 0 : f.kick;

      // Character size: 70 % of the height, narrower pictures stay within 80 % of the width.
      const aspect = img ? img.naturalWidth / Math.max(1, img.naturalHeight) : 0.6;
      let ch = H * 0.68;
      if (ch * aspect > W * 0.8) ch = (W * 0.8) / aspect;
      const cw = ch * aspect;
      const feetX = W / 2;
      const feetY = H * 0.16;
      const glow = Math.min(1.2, (0.3 + f.bass * 0.6 + kick * 0.5) * (0.4 + intensity * 0.6));

      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      gl.useProgram(stage);
      gl.uniform2f(SU.res!, W, H);
      gl.uniform2f(SU.feet!, feetX, feetY);
      gl.uniform1f(SU.size!, H * 0.68);
      gl.uniform1f(SU.t!, f.reduced ? 0 : f.t);
      gl.uniform1f(SU.bass!, f.bass);
      gl.uniform1f(SU.kick!, kick);
      gl.uniform1f(SU.high!, sampleLevel(f.levels, 0.75));
      gl.uniform1f(SU.lean!, pose.lean);
      gl.uniform1f(SU.jump!, pose.jump);
      gl.uniform1f(SU.has!, has);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (img) {
        gl.useProgram(body);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(CU.tex!, 0);
        gl.uniform2f(CU.res!, W, H);
        gl.uniform2f(CU.feet!, feetX, feetY);
        gl.uniform2f(CU.dims!, cw, ch);
        gl.uniform1f(CU.lean!, pose.lean);
        gl.uniform1f(CU.lag!, pose.lag);
        gl.uniform1f(CU.jump!, pose.jump);
        gl.uniform1f(CU.squash!, pose.squash);
        gl.uniform1f(CU.nod!, pose.nod);
        gl.uniform1f(CU.tilt!, pose.tilt);
        gl.uniform1f(CU.kick!, kick * intensity);
        gl.uniform1f(CU.t!, f.t);
        gl.uniform1f(CU.glow!, glow);
        gl.bindBuffer(gl.ARRAY_BUFFER, grid);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND);
        const pass = (mode: number, flip: number, grow: number, additive: boolean) => {
          gl.blendFunc(gl.ONE, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
          gl.uniform1f(CU.mode!, mode);
          gl.uniform1f(CU.flip!, flip);
          gl.uniform1f(CU.grow!, grow);
          gl.drawArrays(gl.TRIANGLES, 0, gridCount);
        };
        pass(2, -1, 1, false); // reflection in the floor
        pass(1, 1, 1.04 + glow * 0.02, true); // neon halo
        pass(0, 1, 1, false); // the character
        gl.disable(gl.BLEND);
      }

      if (++frames % 60 === 10) {
        const px = new Uint8Array(32 * 32 * 4);
        gl.readPixels((W >> 1) - 16, (H >> 1) - 16, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += px[i]! + px[i + 1]! + px[i + 2]!;
        canvas.dataset.lum = String(Math.round(sum / (32 * 32 * 3)));
        const c = dance.clock();
        canvas.dataset.bpm = String(Math.round(60 / c.interval));
      }
    },
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(quad);
      gl.deleteBuffer(grid);
      gl.deleteProgram(stage);
      gl.deleteProgram(body);
    },
  };
}

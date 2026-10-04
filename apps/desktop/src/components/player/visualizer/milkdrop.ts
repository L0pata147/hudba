import type { Renderer, VisFrame } from './types';

/**
 * Milkdrop-style feedback visualizer (WebGL2).
 *
 * Every frame the previous image is re-sampled through a warp (zoom/spin,
 * ripple swirl, 4- and 6-way kaleidoscope, wobbling tunnel), faded and slowly
 * hue-rotated; then the waveform, the spectrum ring, orbiting light dots and
 * beat bursts are splatted on top as soft additive points. The result is
 * shown with a cheap in-shader bloom and becomes the next frame's input.
 * Modes cross-fade every ~16 s.
 */

const QUAD_VS = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const WARP_FS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D prev;
uniform float t, bass, kick, aspect, modeA, modeB, blend, hue;
uniform vec3 c1;
const float PI = 3.14159265;

vec2 warp(float m, float r, float a) {
  if (m < 0.5) {            // zoom + spin
    r *= 0.982 - bass * 0.03 - kick * 0.03;
    a += 0.005 + 0.004 * sin(t * 0.3);
  } else if (m < 1.5) {     // ripple swirl
    r *= 0.99 - bass * 0.02;
    a += 0.012 + 0.035 * sin(r * 14.0 - t * 1.8);
  } else if (m < 2.5) {     // 4-way kaleidoscope
    r *= 0.985 - bass * 0.025 - kick * 0.02;
    a += 0.006;
    return abs(vec2(cos(a), sin(a)) * r);
  } else if (m < 3.5) {     // 6-way kaleidoscope
    r *= 0.985 - bass * 0.025 - kick * 0.02;
    float seg = PI / 3.0;
    a = mod(a + t * 0.05, seg);
    a = abs(a - seg * 0.5);
  } else {                  // wobbling tunnel
    r = r * (0.975 - bass * 0.02) + 0.006 * sin(a * 5.0 + t * 1.3);
    a -= 0.008;
  }
  return vec2(cos(a), sin(a)) * r;
}

vec3 hueRotate(vec3 c, float h) {
  const vec3 k = vec3(0.57735);
  float ca = cos(h);
  return c * ca + cross(k, c) * sin(h) + k * dot(k, c) * (1.0 - ca);
}

void main() {
  vec2 p = uv - 0.5;
  p.x *= aspect;
  float r = length(p);
  float a = atan(p.y, p.x);
  vec2 q = mix(warp(modeA, r, a), warp(modeB, r, a), blend);
  q.x /= aspect;
  vec2 s = q + 0.5 + 0.0025 * vec2(sin(uv.y * 11.0 + t * 0.9), cos(uv.x * 9.0 - t * 1.1));
  vec3 col = texture(prev, s).rgb;
  // Fade (with a constant term so 8-bit values really reach black) and drift the hue.
  col = max(col * 0.958 - 1.2 / 255.0, 0.0);
  col = hueRotate(col, hue);
  col += c1 * kick * 0.03;
  o = vec4(col, 1.0);
}`;

const SHOW_FS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D img;
uniform vec2 px;
uniform float glow;
void main() {
  vec3 c = texture(img, uv).rgb;
  vec3 b = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float an = float(i) * 0.785398;
    b += texture(img, uv + vec2(cos(an), sin(an)) * px * 7.0).rgb;
    b += texture(img, uv + vec2(cos(an + 0.39), sin(an + 0.39)) * px * 16.0).rgb;
  }
  c += b / 16.0 * glow;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.25);
  float v = smoothstep(1.0, 0.35, length(uv - 0.5));
  o = vec4(pow(max(c, 0.0), vec3(0.92)) * (0.6 + 0.4 * v), 1.0);
}`;

const POINT_VS = `#version 300 es
in vec2 p;
uniform float size;
void main() { gl_Position = vec4(p, 0.0, 1.0); gl_PointSize = size; }`;

const POINT_FS = `#version 300 es
precision mediump float;
out vec4 o;
uniform vec3 color;
uniform float alpha;
void main() {
  float m = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
  o = vec4(color * m * alpha, 1.0);
}`;

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

const MODES = 5;
const MODE_SECONDS = 16;
const BLEND_SECONDS = 3;

interface Burst {
  x: number;
  y: number;
  age: number;
  hue: 0 | 1;
}

export function createMilkdropRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  let warp: WebGLProgram, show: WebGLProgram, dots: WebGLProgram;
  try {
    warp = program(gl, QUAD_VS, WARP_FS);
    show = program(gl, QUAD_VS, SHOW_FS);
    dots = program(gl, POINT_VS, POINT_FS);
  } catch {
    return null;
  }
  const u = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const U = {
    warp: {
      prev: u(warp, 'prev'),
      t: u(warp, 't'),
      bass: u(warp, 'bass'),
      kick: u(warp, 'kick'),
      aspect: u(warp, 'aspect'),
      modeA: u(warp, 'modeA'),
      modeB: u(warp, 'modeB'),
      blend: u(warp, 'blend'),
      hue: u(warp, 'hue'),
      c1: u(warp, 'c1'),
    },
    show: { img: u(show, 'img'), px: u(show, 'px'), glow: u(show, 'glow') },
    dots: { size: u(dots, 'size'), color: u(dots, 'color'), alpha: u(dots, 'alpha') },
  };

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pts = gl.createBuffer();
  const scratch = new Float32Array(2048 * 2);

  // Two feedback targets (ping-pong) at reduced resolution.
  const tex: WebGLTexture[] = [];
  const fbo: WebGLFramebuffer[] = [];
  let fw = 0;
  let fh = 0;
  let cur = 0;
  let frames = 0;
  let prevKick = 0;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bursts: Burst[] = [];

  const alloc = (w: number, h: number) => {
    for (const t of tex) gl.deleteTexture(t);
    for (const f of fbo) gl.deleteFramebuffer(f);
    tex.length = 0;
    fbo.length = 0;
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      tex.push(t);
      fbo.push(f);
    }
    fw = w;
    fh = h;
  };

  const drawQuad = () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const drawPoints = (n: number, size: number, color: [number, number, number], alpha: number) => {
    if (n <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, pts);
    gl.bufferData(gl.ARRAY_BUFFER, scratch.subarray(0, n * 2), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(U.dots.size, size);
    gl.uniform3f(U.dots.color, color[0], color[1], color[2]);
    gl.uniform1f(U.dots.alpha, alpha);
    gl.drawArrays(gl.POINTS, 0, n);
  };

  return {
    draw(f: VisFrame) {
      const W = canvas.width;
      const H = canvas.height;
      const w = Math.max(64, Math.round(W * 0.75));
      const h = Math.max(64, Math.round(H * 0.75));
      if (w !== fw || h !== fh) alloc(w, h);
      const aspect = w / h;
      const next = 1 - cur;
      const [c1, c2] = f.palette;
      const col1: [number, number, number] = [c1.r / 255, c1.g / 255, c1.b / 255];
      const col2: [number, number, number] = [c2.r / 255, c2.g / 255, c2.b / 255];
      const light = (c: [number, number, number]): [number, number, number] => [Math.min(1, c[0] + 0.35), Math.min(1, c[1] + 0.35), Math.min(1, c[2] + 0.35)];
      const bass = f.reduced ? 0 : f.bass;
      const kick = f.reduced ? 0 : f.kick;

      // Mode schedule with a smooth cross-fade.
      const slot = f.reduced ? 0 : Math.floor(f.t / MODE_SECONDS);
      const into = f.reduced ? 0 : f.t - slot * MODE_SECONDS;
      const modeA = slot % MODES;
      const modeB = (slot + 1) % MODES;
      const x = Math.max(0, (into - (MODE_SECONDS - BLEND_SECONDS)) / BLEND_SECONDS);
      const blend = x * x * (3 - 2 * x);
      const mode = blend < 0.5 ? modeA : modeB;

      // 1) warp the previous frame into the next target
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[next]!);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.useProgram(warp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]!);
      gl.uniform1i(U.warp.prev, 0);
      gl.uniform1f(U.warp.t, f.t);
      gl.uniform1f(U.warp.bass, bass);
      gl.uniform1f(U.warp.kick, kick);
      gl.uniform1f(U.warp.aspect, aspect);
      gl.uniform1f(U.warp.modeA, modeA);
      gl.uniform1f(U.warp.modeB, modeB);
      gl.uniform1f(U.warp.blend, blend);
      gl.uniform1f(U.warp.hue, f.reduced ? 0 : 0.003 + kick * 0.03);
      gl.uniform3f(U.warp.c1, col1[0], col1[1], col1[2]);
      drawQuad();

      // 2) splat shapes on top
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(dots);
      const scale = Math.max(1, h / 400);

      // waveform: dense points (interpolated) — a line, or a circle in the round modes
      const wave = f.wave;
      let peak = 0.05;
      for (let i = 0; i < wave.length; i++) peak = Math.max(peak, Math.abs(wave[i]!));
      const gain = 0.6 / peak;
      const n = Math.min(1024, wave.length * 2);
      const circular = mode !== 0;
      for (let i = 0; i < n; i++) {
        const pos = (i / n) * (wave.length - 1);
        const k = Math.floor(pos);
        const v = ((wave[k] ?? 0) + ((wave[k + 1] ?? 0) - (wave[k] ?? 0)) * (pos - k)) * gain;
        if (circular) {
          const a = (i / n) * Math.PI * 2 + f.t * 0.2;
          const r = (mode === 4 ? 0.16 : 0.3) + v * 0.12;
          scratch[i * 2] = (Math.cos(a) * r) / aspect;
          scratch[i * 2 + 1] = Math.sin(a) * r;
        } else {
          scratch[i * 2] = -0.88 + (1.76 * i) / (n - 1);
          scratch[i * 2 + 1] = v * 0.32;
        }
      }
      drawPoints(n, (2.4 + kick * 2.5 + bass * 1.5) * scale, col1, 0.42);

      // spectrum ring
      const lv = f.levels;
      const SPEC = 240;
      for (let i = 0; i < SPEC; i++) {
        const uu = i / SPEC;
        const band = lv[Math.round((1 - Math.abs(Math.cos(Math.PI * uu))) * (lv.length - 1))] ?? 0;
        const a = uu * Math.PI * 2 - Math.PI / 2;
        const r = 0.17 + band * 0.32 + kick * 0.05;
        scratch[i * 2] = (Math.cos(a) * r) / aspect;
        scratch[i * 2 + 1] = Math.sin(a) * r;
      }
      drawPoints(SPEC, (2.6 + bass * 2.2) * scale, col2, 0.45);

      // three orbiting light dots: they leave swirling ribbons in the feedback
      if (!f.reduced) {
        for (let k = 0; k < 3; k++) {
          const a = f.t * (0.7 + k * 0.23) + (k * Math.PI * 2) / 3;
          const r = 0.22 + 0.12 * Math.sin(f.t * 0.5 + k) + bass * 0.12;
          scratch[k * 2] = (Math.cos(a) * r) / aspect;
          scratch[k * 2 + 1] = Math.sin(a * 1.3) * r;
        }
        drawPoints(3, (7 + bass * 8) * scale, light(col2), 0.5);
      }

      // beat bursts: expanding rings of light
      const started = f.kick > 0.9 && prevKick < f.kick - 0.05;
      prevKick = f.kick;
      if (started && !f.reduced && bursts.length < 6) bursts.push({ x: (rand() - 0.5) * 0.9, y: (rand() - 0.5) * 0.7, age: 0, hue: rand() < 0.5 ? 0 : 1 });
      for (let b = bursts.length - 1; b >= 0; b--) {
        const burst = bursts[b]!;
        burst.age += f.dt;
        if (burst.age > 0.6) {
          bursts.splice(b, 1);
          continue;
        }
        const r = 0.02 + burst.age * 0.5;
        const N = 120;
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          scratch[i * 2] = burst.x + (Math.cos(a) * r) / aspect;
          scratch[i * 2 + 1] = burst.y + Math.sin(a) * r;
        }
        drawPoints(N, 3 * scale, light(burst.hue ? col2 : col1), 0.7 * (1 - burst.age / 0.6));
      }
      gl.disable(gl.BLEND);

      // A cheap brightness probe for tests/diagnostics, once a second.
      if (++frames % 60 === 0) {
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0;
        let cnt = 0;
        for (let i = 0; i < px.length; i += 4 * 16, cnt++) sum += px[i]! + px[i + 1]! + px[i + 2]!;
        canvas.dataset.lum = String(Math.round(sum / (cnt * 3)));
      }

      // 3) show it with a soft bloom
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(show);
      gl.bindTexture(gl.TEXTURE_2D, tex[next]!);
      gl.uniform1i(U.show.img, 0);
      gl.uniform2f(U.show.px, 1 / w, 1 / h);
      gl.uniform1f(U.show.glow, 0.9 + kick * 0.6);
      drawQuad();
      cur = next;
    },
    dispose() {
      for (const t of tex) gl.deleteTexture(t);
      for (const fb of fbo) gl.deleteFramebuffer(fb);
      gl.deleteBuffer(quad);
      gl.deleteBuffer(pts);
      gl.deleteProgram(warp);
      gl.deleteProgram(show);
      gl.deleteProgram(dots);
    },
  };
}

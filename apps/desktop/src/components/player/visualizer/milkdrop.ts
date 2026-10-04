import type { Renderer, VisFrame } from './types';

/**
 * Milkdrop-style feedback visualizer (WebGL2).
 *
 * Every frame the previous image is sampled slightly zoomed, rotated and
 * warped, faded and hue-shifted ("warp" pass), then the waveform and the
 * spectrum are splatted on top as soft additive points. The result is shown
 * on screen and becomes the next frame's input. The warp mode changes every
 * ~18 s: plain zoom, ripple swirl, and a 4-way kaleidoscope.
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
uniform float t, bass, kick, mode, aspect;
uniform vec3 c1;
void main() {
  vec2 p = uv - 0.5;
  p.x *= aspect;
  float r = length(p);
  float a = atan(p.y, p.x);
  // Sampling closer to the centre makes the picture flow outwards.
  r *= 0.985 - bass * 0.025 - kick * 0.03;
  a += 0.004 + 0.004 * sin(t * 0.25);
  if (mode > 0.5 && mode < 1.5) a += 0.03 * sin(r * 12.0 - t * 1.7);
  vec2 q = vec2(cos(a), sin(a)) * r;
  if (mode > 1.5) q = abs(q) * sign(vec2(sin(t * 0.11), cos(t * 0.13)) + 0.0001);
  q.x /= aspect;
  vec2 s = q + 0.5 + 0.0025 * vec2(sin(uv.y * 11.0 + t * 0.9), cos(uv.x * 9.0 - t * 1.1));
  vec3 col = texture(prev, s).rgb;
  // Fade (with a constant term so 8-bit values really reach black) and drift the hue.
  col = max(col * 0.955 - 1.5 / 255.0, 0.0);
  col = mix(col, col.gbr, 0.02);
  col += c1 * kick * 0.035;
  o = vec4(col, 1.0);
}`;

const SHOW_FS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D img;
void main() {
  vec3 c = texture(img, uv).rgb;
  float v = smoothstep(0.95, 0.3, length(uv - 0.5));
  o = vec4(pow(c, vec3(0.9)) * (0.55 + 0.45 * v), 1.0);
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
    warp: { prev: u(warp, 'prev'), t: u(warp, 't'), bass: u(warp, 'bass'), kick: u(warp, 'kick'), mode: u(warp, 'mode'), aspect: u(warp, 'aspect'), c1: u(warp, 'c1') },
    show: { img: u(show, 'img') },
    dots: { size: u(dots, 'size'), color: u(dots, 'color'), alpha: u(dots, 'alpha') },
  };

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pts = gl.createBuffer();
  const WAVE_PTS = 512;
  const SPEC_PTS = 192;
  const scratch = new Float32Array(Math.max(WAVE_PTS, SPEC_PTS) * 2);

  // Two feedback targets (ping-pong) at reduced resolution.
  const tex: WebGLTexture[] = [];
  const fbo: WebGLFramebuffer[] = [];
  let fw = 0;
  let fh = 0;
  let cur = 0;
  let frames = 0;
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
      const mode = f.reduced ? 0 : Math.floor(f.t / 18) % 3;

      // 1) warp the previous frame into the next target
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[next]!);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.useProgram(warp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[cur]!);
      gl.uniform1i(U.warp.prev, 0);
      gl.uniform1f(U.warp.t, f.t);
      gl.uniform1f(U.warp.bass, f.reduced ? 0 : f.bass);
      gl.uniform1f(U.warp.kick, f.reduced ? 0 : f.kick);
      gl.uniform1f(U.warp.mode, mode);
      gl.uniform1f(U.warp.aspect, aspect);
      gl.uniform3f(U.warp.c1, col1[0], col1[1], col1[2]);
      drawQuad();

      // 2) splat the waveform and spectrum on top
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(dots);
      const scale = Math.max(1, h / 400);
      const wave = f.wave;
      let peak = 0.05;
      for (let i = 0; i < wave.length; i++) peak = Math.max(peak, Math.abs(wave[i]!));
      const gain = 0.6 / peak;
      const n = Math.min(WAVE_PTS, wave.length);
      for (let i = 0; i < n; i++) {
        const v = (wave[i] ?? 0) * gain;
        if (mode === 1) {
          const a = (i / n) * Math.PI * 2;
          const r = 0.32 + v * 0.12;
          scratch[i * 2] = (Math.cos(a) * r) / aspect;
          scratch[i * 2 + 1] = Math.sin(a) * r;
        } else {
          scratch[i * 2] = -0.85 + (1.7 * i) / (n - 1);
          scratch[i * 2 + 1] = v * 0.35;
        }
      }
      drawPoints(n, (2.2 + f.kick * 2.5) * scale, col1, 0.55);
      const lv = f.levels;
      for (let i = 0; i < SPEC_PTS; i++) {
        const u = i / SPEC_PTS;
        const band = lv[Math.round((1 - Math.abs(Math.cos(Math.PI * u))) * (lv.length - 1))] ?? 0;
        const a = u * Math.PI * 2 - Math.PI / 2;
        const r = 0.18 + band * 0.32 + f.kick * 0.05;
        scratch[i * 2] = (Math.cos(a) * r) / aspect;
        scratch[i * 2 + 1] = Math.sin(a) * r;
      }
      drawPoints(SPEC_PTS, (2.6 + f.bass * 2) * scale, col2, 0.5);
      gl.disable(gl.BLEND);

      // A cheap brightness probe for tests/diagnostics, once a second.
      if (++frames % 60 === 0) {
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < px.length; i += 4 * 16, n++) sum += px[i]! + px[i + 1]! + px[i + 2]!;
        canvas.dataset.lum = String(Math.round(sum / (n * 3)));
      }

      // 3) show it
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(show);
      gl.bindTexture(gl.TEXTURE_2D, tex[next]!);
      gl.uniform1i(U.show.img, 0);
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

import { sampleLevel } from '@sonora/core';
import type { Renderer, VisFrame } from './types';

const VS = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D cover;
uniform vec2 res;
uniform vec4 box;      // centre x, centre y, size, corner radius (px)
uniform float t, bass, kick, high, pix, ca;
uniform vec4 ripples;  // ages 0…1, < 0 = unused
uniform vec3 c1, c2;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = (uv * res - box.xy) / box.z;          // −0.5…0.5 inside the cover
  float d = sdRoundBox(p, vec2(0.5), box.w / box.z);
  if (d > 0.0) {
    // soft coloured halo around the cover
    float g = exp(-d * 9.0) * (0.3 + bass * 0.5 + kick * 0.4);
    vec3 col = mix(c1, c2, 0.5 + 0.5 * sin(atan(p.y, p.x) + t * 0.5));
    o = vec4(col * g, g);
    return;
  }
  vec2 q = p;
  // liquid flow
  vec2 flow = vec2(
    sin(q.y * 9.0 + t * 1.6) + 0.5 * sin(q.y * 21.0 - t * 2.3 + q.x * 4.0),
    cos(q.x * 8.0 - t * 1.3) + 0.5 * cos(q.x * 19.0 + t * 2.1 + q.y * 3.0));
  q += flow * (0.004 + bass * 0.018 + high * 0.006);
  // ripples racing out from the centre on beats
  float r = length(p);
  for (int i = 0; i < 4; i++) {
    float a = ripples[i];
    if (a < 0.0) continue;
    float w = r - a * 0.9;
    q += (p / max(r, 1e-3)) * sin(w * 70.0) * exp(-abs(w) * 22.0) * 0.035 * (1.0 - a);
  }
  vec2 st = q + 0.5;
  if (pix > 1.0) st = (floor(st * pix) + 0.5) / pix;
  // chromatic aberration grows towards the edges and on beats
  vec2 dir = p * ca;
  vec3 col = vec3(texture(cover, st + dir).r, texture(cover, st).g, texture(cover, st - dir).b);
  // a slow diagonal sheen
  float band = fract(t * 0.12) * 3.0 - 1.5;
  col += smoothstep(0.09, 0.0, abs(p.x + p.y - band)) * 0.22 + kick * 0.07;
  float aa = clamp(-d * box.z, 0.0, 1.0);
  o = vec4(col * aa, aa);
}`;

function compile(gl: WebGL2RenderingContext): WebGLProgram | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const v = sh(gl.VERTEX_SHADER, VS);
  const f = sh(gl.FRAGMENT_SHADER, FS);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

/**
 * The cover as a liquid surface (WebGL2): it breathes with the bass, flows,
 * sends ripples out from the centre on beats, briefly snaps into pixels,
 * splits its colour channels and carries a slow sheen and a coloured halo.
 * Needs the cover with CORS; otherwise `onFallback` asks the host for the 2D version.
 */
export function createLiquidGlRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined, onFallback: () => void): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const prog = compile(gl);
  if (!prog) return null;
  const U = Object.fromEntries(
    ['cover', 'res', 'box', 't', 'bass', 'kick', 'high', 'pix', 'ca', 'ripples', 'c1', 'c2'].map((n) => [n, gl.getUniformLocation(prog, n)]),
  );
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const tex = gl.createTexture();
  let url: string | undefined;
  let ready = false;
  let failed = false;
  let prevKick = 0;
  let frames = 0;
  const ripples: number[] = [];

  const load = (next: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (url !== next) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        ready = true;
      } catch {
        failed = true;
        onFallback();
      }
    };
    img.onerror = () => {
      if (url !== next || failed) return;
      failed = true;
      onFallback();
    };
    img.src = next;
  };

  return {
    draw(f: VisFrame) {
      const next = getUrl();
      if (next !== url) {
        url = next;
        ready = false;
        if (next) load(next);
      }
      const W = canvas.width;
      const H = canvas.height;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!ready) return;

      const started = f.kick > 0.9 && prevKick < f.kick - 0.05;
      prevKick = f.kick;
      if (started && !f.reduced) {
        ripples.unshift(0);
        if (ripples.length > 4) ripples.pop();
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        ripples[i]! += f.dt / 1.1;
        if (ripples[i]! >= 1) ripples.splice(i, 1);
      }
      const reduced = f.reduced;
      const S = Math.min(W, H) * 0.62 * (reduced ? 1 : 1 + f.bass * 0.05 + f.kick * 0.06);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U.cover!, 0);
      gl.uniform2f(U.res!, W, H);
      gl.uniform4f(U.box!, W / 2 + f.shakeX, H / 2 - f.shakeY, S, S * 0.045);
      gl.uniform1f(U.t!, reduced ? 0 : f.t);
      gl.uniform1f(U.bass!, reduced ? 0 : f.bass);
      gl.uniform1f(U.kick!, reduced ? 0 : f.kick);
      gl.uniform1f(U.high!, reduced ? 0 : sampleLevel(f.levels, 0.75));
      gl.uniform1f(U.pix!, !reduced && f.kick > 0.2 ? Math.max(8, Math.round(56 - f.kick * 44)) : 0);
      gl.uniform1f(U.ca!, reduced ? 0 : 0.006 + f.kick * 0.03 + f.bass * 0.008);
      gl.uniform4f(U.ripples!, ripples[0] ?? -1, ripples[1] ?? -1, ripples[2] ?? -1, ripples[3] ?? -1);
      const [c1, c2] = f.palette;
      gl.uniform3f(U.c1!, c1.r / 255, c1.g / 255, c1.b / 255);
      gl.uniform3f(U.c2!, c2.r / 255, c2.g / 255, c2.b / 255);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (++frames % 60 === 0) {
        const px = new Uint8Array(32 * 32 * 4);
        gl.readPixels((W >> 1) - 16, (H >> 1) - 16, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0;
        for (let i = 0; i < px.length; i += 4) sum += px[i]! + px[i + 1]! + px[i + 2]!;
        canvas.dataset.lum = String(Math.round(sum / (32 * 32 * 3)));
      }
    },
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(quad);
      gl.deleteProgram(prog);
    },
  };
}

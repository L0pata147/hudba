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
uniform vec2 centre;   // px
uniform float scale;   // px per unit (min side)
uniform float t, bass, kick, mid, high, ca, spin;
uniform float lv[24];
uniform vec4 ripples;  // ages 0…1, < 0 = unused
uniform vec3 c1, c2;

const float PI = 3.14159265;
const float SPIKES = 18.0;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

/** Level of band x ∈ [0,1], interpolated. */
float level(float x) {
  float f = clamp(x, 0.0, 1.0) * 23.0;
  int i = int(floor(f));
  return mix(lv[i], lv[min(i + 1, 23)], fract(f));
}

float R0() { return 0.26 * (1.0 + bass * 0.07 + kick * 0.05); }

/** Signed distance to the drop: a wobbling ball with music spikes and orbiting droplets. */
float scene(vec2 p) {
  float r = length(p);
  float a = atan(p.x, -p.y) + spin;               // 0 at the bottom
  // Spikes stand where the field is strong: one per band, mirrored left/right (bass at the bottom).
  float s = a * SPIKES / (2.0 * PI);
  float k = floor(s + 0.5);
  float f = s - k;
  float band = abs(mod(k + SPIKES * 0.5, SPIKES) - SPIKES * 0.5) / (SPIKES * 0.5);
  float lvl = level(band);
  float spike = pow(max(cos(f * PI), 0.0), 3.0) * pow(lvl, 1.5) * (0.11 + kick * 0.04);
  float wob = 0.008 * sin(a * 3.0 + t * 1.3) + 0.006 * sin(a * 5.0 - t * 1.9) + 0.004 * sin(a * 9.0 + t * 2.7);
  float d = r - (R0() + wob + spike);
  d *= 0.8; // the spikes make it a loose bound
  // droplets drifting around, merging back in when they come close
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float ang = t * (0.35 + fi * 0.11) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0) + fi * 1.7;
    float orbit = R0() * (1.35 + 0.35 * sin(t * (0.6 + fi * 0.23) + fi));
    vec2 c = vec2(sin(ang), -cos(ang)) * orbit;
    float rr = 0.022 + 0.008 * fi + level(0.3 + fi * 0.15) * 0.025;
    d = smin(d, length(p - c) - rr, 0.09);
  }
  return d;
}

/** Background: the cover dissolved into slowly flowing liquid. */
vec3 backdrop(vec2 p) {
  vec2 q = p * 0.55;
  for (int i = 0; i < 3; i++) {
    float fi = float(i) + 1.0;
    q += 0.12 / fi * vec2(sin(q.y * 3.1 * fi + t * 0.23 * fi), cos(q.x * 2.7 * fi - t * 0.19 * fi));
  }
  // ripples running out from the drop on beats
  float r = length(p);
  for (int i = 0; i < 4; i++) {
    float a = ripples[i];
    if (a < 0.0) continue;
    float w = r - (R0() + a * 1.2);
    q += (p / max(r, 1e-3)) * sin(w * 45.0) * exp(-abs(w) * 14.0) * 0.06 * (1.0 - a);
  }
  vec3 col = textureLod(cover, q + 0.5, 5.0).rgb;
  float vig = smoothstep(1.25, 0.2, r);
  return col * (0.32 + bass * 0.12) * vig;
}

void main() {
  vec2 p = (uv * res - centre) / scale;
  float d = scene(p);
  float px = 1.5 / scale;
  vec3 bg = backdrop(p);
  // coloured glow around the drop
  vec3 tint = mix(c1, c2, 0.5 + 0.5 * sin(atan(p.y, p.x) * 2.0 + t * 0.6));
  bg += tint * exp(-max(d, 0.0) * 18.0) * (0.25 + bass * 0.45 + kick * 0.35);
  if (d > px) {
    o = vec4(bg, 1.0);
    return;
  }
  // Treat the drop as a dome: height from the distance inside, normal from its slope.
  // A thin rim (th) keeps the top flat, so the cover stays readable; a wide step smooths the spikes.
  float e = 0.012;
  float th = 0.07;
  #define H(x) sqrt(max(0.0, 1.0 - pow(1.0 + clamp(x, -th, 0.0) / th, 2.0)))
  float hx = H(scene(p + vec2(e, 0.0))) - H(scene(p - vec2(e, 0.0)));
  float hy = H(scene(p + vec2(0.0, e))) - H(scene(p - vec2(0.0, e)));
  vec3 n = normalize(vec3(-hx, -hy, 2.0 * e / th * 1.6));
  // the cover seen through the drop (a lens), channels split a little at the rim
  vec2 lens = p / (R0() * 2.6) - n.xy * 0.12;
  vec2 st = lens + 0.5;
  vec2 dir = n.xy * ca;
  vec3 inside = vec3(texture(cover, st + dir).r, texture(cover, st).g, texture(cover, st - dir).b);
  // mirror-like rim reflecting the blurred cover and the palette
  vec3 rv = reflect(vec3(0.0, 0.0, -1.0), n);
  vec3 env = textureLod(cover, rv.xy * 0.45 + 0.5, 3.5).rgb * 0.7 + tint * 0.35;
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.5);
  vec3 col = mix(inside, env, clamp(fres * 1.3, 0.0, 1.0));
  // highlights: a key light up-left and a soft fill
  vec3 L = normalize(vec3(-0.45, 0.6, 0.9));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);
  float sheen = pow(max(dot(reflect(-normalize(vec3(0.6, -0.3, 0.8)), n), vec3(0.0, 0.0, 1.0)), 0.0), 12.0);
  col += spec * (0.9 + high * 0.6) + sheen * 0.12 * tint + kick * 0.06;
  // dark edge line so the drop reads as glass/liquid
  col *= 0.75 + 0.25 * smoothstep(0.0, -0.012, d);
  float aa = clamp(-d / px * 0.5 + 0.5, 0.0, 1.0);
  o = vec4(mix(bg, col, aa), 1.0);
}`;

function compile(gl: WebGL2RenderingContext): WebGLProgram | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
    console.warn("liquid shader:", gl.getShaderInfoLog(s));
    return null;
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
 * Liquid (WebGL2): a ferrofluid drop with the cover seen through it like a
 * lens. Spikes stand up from its surface with the music (one per band,
 * mirrored, bass at the bottom), droplets drift around and merge back in,
 * the rim mirrors the blurred cover, and the cover itself flows as liquid in
 * the background with ripples running out on beats.
 * Needs the cover with CORS; otherwise `onFallback` asks the host for the 2D version.
 */
export function createLiquidGlRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined, onFallback: () => void): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const prog = compile(gl);
  if (!prog) return null;
  const U = Object.fromEntries(
    ['cover', 'res', 'centre', 'scale', 't', 'bass', 'kick', 'mid', 'high', 'ca', 'spin', 'lv', 'ripples', 'c1', 'c2'].map((n) => [n, gl.getUniformLocation(prog, n)]),
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
  const lv = new Float32Array(24);
  let spin = 0;

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
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
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
      const m = reduced ? 0 : 1;
      for (let i = 0; i < 24; i++) lv[i] = sampleLevel(f.levels, i / 23) * m;
      spin += f.dt * (0.04 + f.bass * 0.25) * m;
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U.cover!, 0);
      gl.uniform2f(U.res!, W, H);
      gl.uniform2f(U.centre!, W / 2 + f.shakeX, H / 2 - f.shakeY);
      gl.uniform1f(U.scale!, Math.min(W, H));
      gl.uniform1f(U.t!, reduced ? 0 : f.t);
      gl.uniform1f(U.bass!, f.bass * m);
      gl.uniform1f(U.kick!, f.kick * m);
      gl.uniform1f(U.mid!, sampleLevel(f.levels, 0.45) * m);
      gl.uniform1f(U.high!, sampleLevel(f.levels, 0.75) * m);
      gl.uniform1f(U.ca!, 0.01 + (f.kick * 0.03 + f.bass * 0.01) * m);
      gl.uniform1f(U.spin!, spin);
      gl.uniform1fv(U.lv!, lv);
      gl.uniform4f(U.ripples!, ripples[0] ?? -1, ripples[1] ?? -1, ripples[2] ?? -1, ripples[3] ?? -1);
      const [c1, c2] = f.palette;
      gl.uniform3f(U.c1!, c1.r / 255, c1.g / 255, c1.b / 255);
      gl.uniform3f(U.c2!, c2.r / 255, c2.g / 255, c2.b / 255);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (++frames % 60 === 10) {
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

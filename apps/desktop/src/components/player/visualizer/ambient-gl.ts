import { sampleLevel } from '@sonora/core';
import type { RGB } from '@sonora/ui';
import { imageLoader } from './ambient';
import { createProgram, fullscreenQuad, lumProbe, QUAD_VS, uniformsOf } from './gl';
import type { Renderer, VisFrame } from './types';

/** Flowing light made of the cover's colours: a domain-warped noise field, light ribbons, drifting bokeh. */
const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res;
uniform sampler2D cover;
uniform float hasCover, t, bass, kick, high, dim;
uniform vec3 c1, c2;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);
  float T = t * 0.06;
  // two layers of domain warping give the slow, liquid flow
  vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, T)), fbm(p * 1.3 + vec2(5.2, 1.3) - T * 0.8));
  vec2 r = vec2(fbm(p * 1.7 + 3.5 * q + vec2(1.7, 9.2) + T * 1.3), fbm(p * 1.7 + 3.5 * q + vec2(8.3, 2.8) - T));
  float f = fbm(p * 1.9 + 3.0 * r + bass * 0.25);

  // colours: the cover itself, smeared along the flow (or the palette without a readable cover)
  vec2 st = 0.5 + (r - 0.5) * 1.1 + p * 0.25;
  vec3 a = hasCover > 0.5 ? textureLod(cover, st, 5.0).rgb : mix(c1, c2, r.x);
  vec3 b = hasCover > 0.5 ? textureLod(cover, 1.0 - st.yx, 4.0).rgb : mix(c2, c1, q.y);
  vec3 col = mix(a, b, smoothstep(0.25, 0.75, q.x));
  // keep it vivid: push saturation and blend a little of the palette in
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.5);
  col = mix(col, mix(c1, c2, f), 0.25);
  // contrast: bright folds of light, deep shade between them
  float light = smoothstep(0.25, 0.85, f);
  col *= 0.18 + light * light * (1.15 + bass * 0.45 + kick * 0.25);
  // soft ribbons of light drifting across, like an aurora
  float rib = exp(-abs(sin(p.y * 2.2 + f * 5.0 - t * 0.18)) * 7.0) * smoothstep(0.35, 0.8, r.y);
  col += mix(c2, vec3(1.0), 0.35) * rib * (0.18 + bass * 0.3);

  // out-of-focus light dots floating upwards, brighter with the treble
  vec2 g = p * 6.0 + vec2(0.0, -t * 0.12);
  vec2 id = floor(g);
  float hd = hash(id);
  if (hd > 0.88) {
    vec2 c = vec2(hash(id + 1.7), hash(id + 9.1)) - 0.5;
    float d = length(fract(g) - 0.5 - c * 0.5);
    float rad = 0.12 + hash(id + 4.4) * 0.18;
    float bok = smoothstep(rad, rad * 0.7, d) * (0.5 + 0.5 * sin(t * 0.8 + hd * 50.0));
    col += mix(c1, c2, hash(id + 2.2)) * bok * (0.1 + high * 0.4);
  }

  // vignette and a touch of film grain
  col *= 1.0 - smoothstep(0.35, 1.0, length(p * vec2(0.75, 1.0))) * 0.75;
  col += (hash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.025;
  o = vec4(max(col, 0.0) * dim, 1.0);
}`;

const BLIT_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D src;
uniform vec2 res;
void main() { o = texture(src, gl_FragCoord.xy / res); }`;

const toVec = (c: RGB): [number, number, number] => [c.r / 255, c.g / 255, c.b / 255];

/**
 * Ambient (WebGL2): the cover's colours flowing like liquid light — a
 * domain-warped noise field coloured by the blurred cover, with bright folds
 * that swell with the bass, aurora-like ribbons and drifting bokeh. Drawn at
 * half resolution (it is soft anyway) and scaled up. `dim` < 1 makes it a
 * calmer background (under the lyric pulse). Without a readable (CORS) cover
 * the palette colours stand in.
 */
export function createAmbientGlRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined, dim = 1): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  const prog = createProgram(gl, QUAD_VS, FS, 'ambient');
  const blit = createProgram(gl, QUAD_VS, BLIT_FS, 'ambient blit');
  if (!prog || !blit) return null;
  const U = uniformsOf(gl, prog, ['res', 'cover', 'hasCover', 't', 'bass', 'kick', 'high', 'dim', 'c1', 'c2']);
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
      // No CORS on the cover: the palette carries the colours.
      hasCover = false;
    }
  });

  // half-resolution target
  const target = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let tw = 0;
  let th = 0;
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

  return {
    draw(f: VisFrame) {
      load(getUrl());
      const W = canvas.width;
      const H = canvas.height;
      const w = Math.max(1, W >> 1);
      const h = Math.max(1, H >> 1);
      ensureTarget(w, h);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coverTex);
      gl.uniform1i(U.cover!, 0);
      gl.uniform1f(U.hasCover!, hasCover ? 1 : 0);
      gl.uniform2f(U.res!, w, h);
      gl.uniform1f(U.t!, f.reduced ? 0 : f.t);
      gl.uniform1f(U.bass!, f.bass);
      gl.uniform1f(U.kick!, f.reduced ? 0 : f.kick);
      gl.uniform1f(U.high!, sampleLevel(f.levels, 0.75));
      gl.uniform1f(U.dim!, dim);
      gl.uniform3f(U.c1!, ...toVec(f.palette[0]));
      gl.uniform3f(U.c2!, ...toVec(f.palette[1]));
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

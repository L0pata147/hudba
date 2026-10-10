import { createProgram, fullscreenQuad, QUAD_VS, uniformsOf } from './gl';

/** Halves the picture with a 5-tap filter; the first pass keeps only what is bright. */
const DOWN_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D src;
uniform vec2 texel;      // of the source
uniform float threshold; // < 0: no threshold
void main() {
  vec2 uv = gl_FragCoord.xy * 2.0 * texel;
  vec3 c = texture(src, uv).rgb * 4.0;
  c += texture(src, uv + vec2(-1.0, -1.0) * texel).rgb;
  c += texture(src, uv + vec2(1.0, -1.0) * texel).rgb;
  c += texture(src, uv + vec2(-1.0, 1.0) * texel).rgb;
  c += texture(src, uv + vec2(1.0, 1.0) * texel).rgb;
  c /= 8.0;
  if (threshold >= 0.0) {
    float l = max(c.r, max(c.g, c.b));
    c *= smoothstep(threshold, threshold + 0.3, l);
  }
  o = vec4(c, 1.0);
}`;

/** Doubles the picture with a tent filter (added onto the level above). */
const UP_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D src;
uniform vec2 texel;      // of the source
uniform vec2 res;        // of the target
void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec3 c = texture(src, uv + vec2(-2.0, 0.0) * texel).rgb;
  c += texture(src, uv + vec2(2.0, 0.0) * texel).rgb;
  c += texture(src, uv + vec2(0.0, -2.0) * texel).rgb;
  c += texture(src, uv + vec2(0.0, 2.0) * texel).rgb;
  c += texture(src, uv + vec2(-1.0, -1.0) * texel).rgb * 2.0;
  c += texture(src, uv + vec2(1.0, -1.0) * texel).rgb * 2.0;
  c += texture(src, uv + vec2(-1.0, 1.0) * texel).rgb * 2.0;
  c += texture(src, uv + vec2(1.0, 1.0) * texel).rgb * 2.0;
  o = vec4(c / 12.0, 1.0);
}`;

/** Depth of field: the scene leaves how blurred each pixel should be (0…1) in alpha. */
const DOF_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D src;
uniform vec2 res;
uniform float radius;    // the largest blur, in pixels
void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec4 c0 = texture(src, uv);
  float r0 = c0.a * radius;
  if (r0 < 0.5) {
    o = vec4(c0.rgb, 1.0);
    return;
  }
  vec3 sum = c0.rgb;
  float wsum = 1.0;
  // a golden-angle spiral of samples; sharp pixels are not smeared over blurred ones
  for (int i = 1; i < 32; i++) {
    float fi = float(i);
    float r = sqrt(fi / 32.0) * r0;
    float a = fi * 2.39996;
    vec4 s = texture(src, uv + vec2(cos(a), sin(a)) * r / res);
    float w = smoothstep(r - 1.5, r + 0.5, s.a * radius + 1.0);
    sum += s.rgb * w;
    wsum += w;
  }
  o = vec4(sum / wsum, 1.0);
}`;

/** The final picture: scene + bloom (screen blend, no clipping), a little fringing and grain. */
const COMPOSE_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D src;
uniform sampler2D glow;
uniform vec2 res;
uniform float strength, grain, fringe, seed;
void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec3 c;
  if (fringe > 0.0) {
    vec2 d = (uv - 0.5) * fringe;
    c = vec3(texture(src, uv - d).r, texture(src, uv).g, texture(src, uv + d).b);
  } else {
    c = texture(src, uv).rgb;
  }
  vec3 b = texture(glow, uv).rgb * strength;
  c = 1.0 - (1.0 - c) * (1.0 - min(b, 1.0));
  c += (fract(sin(dot(gl_FragCoord.xy + seed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * grain;
  o = vec4(c, 1.0);
}`;

export interface PostSpec {
  /** strength of the glow round bright parts (0: none) */
  bloom?: number;
  /** brightness where the glow starts (default 0.55) */
  threshold?: number;
  /** the scene writes its blur amount (0…1) to alpha; this is the largest blur as a share of the height */
  dof?: number;
  /** film grain (default 0) */
  grain?: number;
  /** colour fringing towards the edges (default 0) */
  fringe?: number;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

/**
 * Post-processing for a WebGL scene: draw the scene between `begin` and `end`;
 * `end` adds depth of field (when the scene leaves the blur amount in alpha),
 * bloom (bright parts halved five times and added back up, blurred), colour
 * fringing and grain, and puts the result on the screen.
 */
export function createPost(gl: WebGL2RenderingContext, post: PostSpec, name: string) {
  const down = createProgram(gl, QUAD_VS, DOWN_FS, `${name} bloom down`);
  const up = createProgram(gl, QUAD_VS, UP_FS, `${name} bloom up`);
  const dof = createProgram(gl, QUAD_VS, DOF_FS, `${name} dof`);
  const compose = createProgram(gl, QUAD_VS, COMPOSE_FS, `${name} compose`);
  if (!down || !up || !dof || !compose) return null;
  const DU = uniformsOf(gl, down, ['src', 'texel', 'threshold']);
  const UU = uniformsOf(gl, up, ['src', 'texel', 'res']);
  const FU = uniformsOf(gl, dof, ['src', 'res', 'radius']);
  const CU = uniformsOf(gl, compose, ['src', 'glow', 'res', 'strength', 'grain', 'fringe', 'seed']);
  const quad = fullscreenQuad(gl);
  const bloomOn = (post.bloom ?? 0) > 0;

  const makeTarget = (): Target => ({ tex: gl.createTexture()!, fbo: gl.createFramebuffer()!, w: 0, h: 0 });
  const size = (t: Target, w: number, h: number) => {
    if (t.w === w && t.h === h) return;
    t.w = w;
    t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  };
  const bind = (t: Target | null, w: number, h: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, w, h);
  };
  const source = (t: Target, unit = 0) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
  };

  const scene = makeTarget();
  const sharp = makeTarget();
  const levels = Array.from({ length: 5 }, makeTarget);
  const black = makeTarget();
  size(black, 1, 1);
  let seed = 0;

  return {
    /** Renders into the scene target from here on (w×h). */
    begin(w: number, h: number) {
      size(scene, w, h);
      bind(scene, w, h);
    },
    /** Post-processes the scene onto the screen (W×H); the glow breathes a little with the bass. */
    end(W: number, H: number, bass: number) {
      const { w, h } = scene;
      gl.disable(gl.BLEND);
      let img = scene;
      if (post.dof) {
        size(sharp, w, h);
        bind(sharp, w, h);
        gl.useProgram(dof);
        source(scene);
        gl.uniform1i(FU.src!, 0);
        gl.uniform2f(FU.res!, w, h);
        gl.uniform1f(FU.radius!, post.dof * h);
        quad.draw();
        img = sharp;
      }

      let glow = black;
      if (bloomOn) {
        gl.useProgram(down);
        gl.uniform1i(DU.src!, 0);
        let src = img;
        for (const [i, lvl] of levels.entries()) {
          size(lvl, Math.max(1, src.w >> 1), Math.max(1, src.h >> 1));
          bind(lvl, lvl.w, lvl.h);
          source(src);
          gl.uniform2f(DU.texel!, 1 / src.w, 1 / src.h);
          gl.uniform1f(DU.threshold!, i === 0 ? (post.threshold ?? 0.55) : -1);
          quad.draw();
          src = lvl;
        }
        gl.useProgram(up);
        gl.uniform1i(UU.src!, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        for (let i = levels.length - 2; i >= 0; i--) {
          const from = levels[i + 1]!;
          const to = levels[i]!;
          bind(to, to.w, to.h);
          source(from);
          gl.uniform2f(UU.texel!, 1 / from.w, 1 / from.h);
          gl.uniform2f(UU.res!, to.w, to.h);
          quad.draw();
        }
        gl.disable(gl.BLEND);
        glow = levels[0]!;
      }

      bind(null, W, H);
      gl.useProgram(compose);
      source(img, 0);
      source(glow, 1);
      gl.uniform1i(CU.src!, 0);
      gl.uniform1i(CU.glow!, 1);
      gl.uniform2f(CU.res!, W, H);
      // the levels add up, so divide by their number
      gl.uniform1f(CU.strength!, bloomOn ? ((post.bloom ?? 0) * (0.85 + bass * 0.4)) / levels.length : 0);
      gl.uniform1f(CU.grain!, post.grain ?? 0);
      gl.uniform1f(CU.fringe!, post.fringe ?? 0);
      seed = (seed + 17.31) % 1000;
      gl.uniform1f(CU.seed!, seed);
      quad.draw();
      gl.activeTexture(gl.TEXTURE0);
    },
    dispose() {
      quad.dispose();
      for (const t of [scene, sharp, black, ...levels]) {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      }
      for (const p of [down, up, dof, compose]) gl.deleteProgram(p);
    },
  };
}

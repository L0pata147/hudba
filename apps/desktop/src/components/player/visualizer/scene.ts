import { sampleLevel } from '@sonora/core';
import { imageLoader } from './ambient';
import { bright, coverTexture, createProgram, fullscreenQuad, lumProbe, QUAD_VS, SCENE_UNIFORMS, uniformsOf } from './gl';
import type { Renderer, VisFrame } from './types';

const BLIT_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D src;
uniform vec2 res;
void main() { o = texture(src, gl_FragCoord.xy / res); }`;

export interface ShaderSceneSpec {
  name: string;
  /** fragment shader; starts with SCENE_HEADER */
  fs: string;
  /** its own uniforms besides the shared ones */
  uniforms?: string[];
  /** per frame: set the scene's own uniforms (the program is bound) */
  update?: (gl: WebGL2RenderingContext, U: Record<string, WebGLUniformLocation | null>, f: VisFrame) => void;
  /** starting render scale (adapts to the frame rate between 0.45 and 1) */
  scale?: number;
}

/**
 * A full-screen fragment-shader scene: shared uniforms (time, bass, beat,
 * spectrum, palette, cover texture) plus the scene's own, rendered at a
 * resolution that adapts to the frame rate and scaled up.
 */
export function createShaderScene(canvas: HTMLCanvasElement, spec: ShaderSceneSpec, getUrl: () => string | undefined): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  const prog = createProgram(gl, QUAD_VS, spec.fs, spec.name);
  const blit = createProgram(gl, QUAD_VS, BLIT_FS, `${spec.name} blit`);
  if (!prog || !blit) return null;
  const U = uniformsOf(gl, prog, [...SCENE_UNIFORMS, ...(spec.uniforms ?? [])]);
  const B = uniformsOf(gl, blit, ['src', 'res']);
  const quad = fullscreenQuad(gl);
  const probe = lumProbe(gl, canvas);
  const cover = coverTexture(gl, imageLoader);
  const lv = new Float32Array(24);

  const target = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let tw = 0;
  let th = 0;
  let scale = spec.scale ?? 0.85;
  let slow = 0;
  let fast = 0;

  return {
    draw(f: VisFrame) {
      cover.load(getUrl());
      if (f.dt > 1 / 42) slow++;
      else if (f.dt < 1 / 57) fast++;
      if (slow > 20) {
        scale = Math.max(0.45, scale - 0.1);
        slow = fast = 0;
      } else if (fast > 120) {
        scale = Math.min(1, scale + 0.05);
        slow = fast = 0;
      }
      const W = canvas.width;
      const H = canvas.height;
      const w = Math.max(1, Math.round(W * scale));
      const h = Math.max(1, Math.round(H * scale));
      if (w !== tw || h !== th) {
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
      }
      for (let i = 0; i < 24; i++) lv[i] = sampleLevel(f.levels, i / 23);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      cover.bind(0);
      gl.uniform1i(U.cover!, 0);
      gl.uniform1f(U.hasCover!, cover.has() ? 1 : 0);
      gl.uniform2f(U.res!, w, h);
      gl.uniform1f(U.t!, f.reduced ? 0 : f.t);
      gl.uniform1f(U.bass!, f.bass);
      gl.uniform1f(U.kick!, f.reduced ? 0 : f.kick);
      gl.uniform1f(U.mid!, sampleLevel(f.levels, 0.45));
      gl.uniform1f(U.high!, sampleLevel(f.levels, 0.75));
      gl.uniform1fv(U.lv!, lv);
      gl.uniform3f(U.c1!, ...bright(f.palette[0]));
      gl.uniform3f(U.c2!, ...bright(f.palette[1]));
      spec.update?.(gl, U, f);
      quad.draw();

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(blit);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.uniform1i(B.src!, 0);
      gl.uniform2f(B.res!, W, H);
      quad.draw();
      probe();
    },
    dispose() {
      quad.dispose();
      cover.dispose();
      gl.deleteTexture(target);
      gl.deleteFramebuffer(fbo);
      gl.deleteProgram(prog);
      gl.deleteProgram(blit);
    },
  };
}

/** Detects the start of a beat from the host's decaying kick signal. */
export function beatEdge() {
  let prev = 0;
  return (kick: number) => {
    const started = kick > 0.9 && prev < kick - 0.05;
    prev = kick;
    return started;
  };
}

import { sampleLevel } from '@sonora/core';
import { imageLoader } from './ambient';
import { bright, coverTexture, createProgram, fullscreenQuad, lumProbe, QUAD_VS, SCENE_UNIFORMS, uniformsOf } from './gl';
import { createPost, type PostSpec } from './post';
import type { Renderer, VisFrame } from './types';

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
  post?: PostSpec;
}

/**
 * A full-screen fragment-shader scene: shared uniforms (time, bass, beat,
 * spectrum, palette, cover texture) plus the scene's own, rendered at a
 * resolution that adapts to the frame rate, then post-processed (bloom,
 * optional depth of field, grain) and scaled up.
 */
export function createShaderScene(canvas: HTMLCanvasElement, spec: ShaderSceneSpec, getUrl: () => string | undefined): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  const prog = createProgram(gl, QUAD_VS, spec.fs, spec.name);
  const post = createPost(gl, spec.post ?? {}, spec.name);
  if (!prog || !post) return null;
  const U = uniformsOf(gl, prog, [...SCENE_UNIFORMS, ...(spec.uniforms ?? [])]);
  const quad = fullscreenQuad(gl);
  const probe = lumProbe(gl, canvas);
  const cover = coverTexture(gl, imageLoader);
  const lv = new Float32Array(24);
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
      for (let i = 0; i < 24; i++) lv[i] = sampleLevel(f.levels, i / 23);

      post.begin(w, h);
      gl.disable(gl.BLEND);
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
      post.end(W, H, f.bass);
      probe();
    },
    dispose() {
      quad.dispose();
      cover.dispose();
      post.dispose();
      gl.deleteProgram(prog);
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

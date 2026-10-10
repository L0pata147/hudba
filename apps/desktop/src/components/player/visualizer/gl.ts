/** Small WebGL2 helpers shared by the full-screen shader renderers. */

export const QUAD_VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

/** Compiles and links a program (attribute 0 = `attr`); logs and returns null on failure. */
export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string, name: string, attr = 'p'): WebGLProgram | null {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
    console.warn(`${name} shader:`, gl.getShaderInfoLog(s));
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

export const uniformsOf = (gl: WebGL2RenderingContext, p: WebGLProgram, names: string[]) =>
  Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) as Record<string, WebGLUniformLocation | null>;

/** A buffer with one full-screen triangle strip. */
export function fullscreenQuad(gl: WebGL2RenderingContext) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  return {
    draw() {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose: () => gl.deleteBuffer(buf),
  };
}

/** Every 60 frames: average brightness of the centre (data-lum, used by the E2E tests). */
export function lumProbe(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
  let frames = 0;
  return () => {
    if (++frames % 60 !== 10) return;
    const W = canvas.width;
    const H = canvas.height;
    const px = new Uint8Array(16 * 16 * 4);
    let sum = 0;
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.35], [0.7, 0.35], [0.3, 0.65], [0.7, 0.65]] as const) {
      gl.readPixels(Math.round(W * fx) - 8, Math.round(H * fy) - 8, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let i = 0; i < px.length; i += 4) sum += px[i]! + px[i + 1]! + px[i + 2]!;
    }
    canvas.dataset.lum = String(Math.round(sum / (16 * 16 * 3 * 5)));
  };
}

/**
 * The cover as a mipmapped texture (CORS first; without CORS `has()` stays
 * false and shaders fall back to the palette). Call `load(url)` every frame.
 */
export function coverTexture(gl: WebGL2RenderingContext, loader: (onReady: (img: HTMLImageElement) => void) => (url: string | undefined) => void) {
  const tex = gl.createTexture();
  let ok = false;
  const load = loader((img) => {
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      ok = true;
    } catch {
      ok = false;
    }
  });
  return {
    load,
    has: () => ok,
    bind(unit: number) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    },
    dispose: () => gl.deleteTexture(tex),
  };
}

/** A palette colour scaled to full brightness, 0…1. */
export function bright(c: { r: number; g: number; b: number }): [number, number, number] {
  const max = Math.max(c.r, c.g, c.b, 1);
  return [c.r / max, c.g / max, c.b / max];
}

/** GLSL shared by the full-screen scenes: uniforms every scene gets and small helpers. */
export const SCENE_HEADER = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res;
uniform float t, bass, kick, mid, high;
uniform float lv[24];
uniform vec3 c1, c2;
uniform sampler2D cover;
uniform float hasCover;
const float PI = 3.14159265;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash1(float n) { return fract(sin(n) * 43758.5453); }
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
float level(float x) {
  float f = clamp(x, 0.0, 1.0) * 23.0;
  int i = int(floor(f));
  return mix(lv[i], lv[min(i + 1, 23)], fract(f));
}
vec3 coverAt(vec2 uv, float lod) {
  return hasCover > 0.5 ? textureLod(cover, uv, lod).rgb : mix(c1, c2, clamp(uv.y, 0.0, 1.0));
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
`;

export const SCENE_UNIFORMS = ['res', 't', 'bass', 'kick', 'mid', 'high', 'lv', 'c1', 'c2', 'cover', 'hasCover'];

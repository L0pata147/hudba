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
    const px = new Uint8Array(32 * 32 * 4);
    gl.readPixels((W >> 1) - 16, (H >> 1) - 16, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i]! + px[i + 1]! + px[i + 2]!;
    canvas.dataset.lum = String(Math.round(sum / (32 * 32 * 3)));
  };
}

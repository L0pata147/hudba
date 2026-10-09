import { sampleLevel } from '@sonora/core';
import type { RGB } from '@sonora/ui';
import { createProgram, fullscreenQuad, lumProbe, QUAD_VS, uniformsOf } from './gl';
import type { Renderer, VisFrame } from './types';

const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res, sway;
uniform float t, travel, bass, kick, speed, high;
uniform float lv[24];
uniform vec4 pulses;   // travel position of each beat ring, < 0 = unused
uniform vec3 c1, c2;
const float PI = 3.14159265;
const float SIDES = 6.0;
const float CELLS = 24.0;   // wall panels around the tube

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float level(float x) {
  float f = clamp(x, 0.0, 1.0) * 23.0;
  int i = int(floor(f));
  return mix(lv[i], lv[min(i + 1, 23)], fract(f));
}
/** Radius of a unit hexagon with softened corners at angle a. */
float hexR(float a) {
  float s = PI / SIDES;
  float l = mod(a, 2.0 * s) - s;
  return mix(cos(s) / cos(l), 1.0, 0.25);
}
/** Thin glowing line at the integer crossings of x (anti-aliased). */
float line(float x, float w) {
  float d = abs(fract(x + 0.5) - 0.5) / max(fwidth(x), 1e-4);
  return 1.0 - smoothstep(0.0, w, d);
}
float glow(float x, float k) {
  return exp(-abs(fract(x + 0.5) - 0.5) * k);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y + sway;
  float r = length(p) + 1e-4;
  float a0 = atan(p.y, p.x);
  // depth along the tube; the tube twists further the deeper you look
  float z = 0.16 / (r / hexR(a0 - t * 0.12));
  float a = a0 - t * 0.12 - z * 0.22;
  z = 0.16 / (r / hexR(a));
  float v = z + travel;               // along the tube
  float u = a / (2.0 * PI) + 0.5;     // around, 0…1
  vec3 tint = mix(c1, c2, smoothstep(0.3, 3.5, z));

  // Wall panels light up with the spectrum (mirrored around, bass at the bottom).
  vec2 cell = vec2(floor(u * CELLS), floor(v * 4.0));
  float band = abs(fract(u + 0.25) - 0.5) * 2.0;
  float lvl = level(band);
  float flick = hash(cell);
  float lit = smoothstep(flick * 0.9, flick * 0.9 + 0.25, lvl * 1.15);
  vec2 inCell = fract(vec2(u * CELLS, v * 4.0));
  // each panel is a dark plate with a glowing LED strip across it
  float strip = exp(-abs(inCell.y - 0.5) * 9.0) * smoothstep(0.0, 0.12, min(inCell.x, 1.0 - inCell.x));
  float near = smoothstep(0.08, 0.6, z);          // the huge panels right next to you stay dim
  vec3 col = tint * 0.035 * near + tint * lit * strip * (0.25 + lvl * 0.9) * near;

  // Wire grid: rings along the tube, edges at the corners, faint lines between panels.
  float ring = line(v * 4.0, 1.3);
  float edge = line(u * SIDES, 1.6);
  float seam = line(u * CELLS, 1.0) * 0.35;
  col += mix(tint, vec3(1.0), 0.35) * (ring * 0.7 + edge + seam) * (0.5 + bass * 0.6) * (0.4 + 0.6 * near);
  col += tint * (glow(v * 4.0, 16.0) * 0.18 + glow(u * SIDES, 30.0) * 0.35) * near;

  // Light streaks rushing past, longer the faster we fly.
  float lane = floor(u * 160.0);
  float hs = hash(vec2(lane, 7.0));
  if (hs > 0.86) {
    float pos = fract(v * 0.35 + hs * 13.0);
    float len = 0.04 + speed * 0.05;
    float streak = smoothstep(len, 0.0, pos) * smoothstep(0.0, 0.005, pos);
    col += mix(vec3(1.0), tint, 0.4) * streak * (0.4 + speed * 0.5) * (0.6 + high);
  }

  // Beat rings flying towards you.
  for (int i = 0; i < 4; i++) {
    float pv = pulses[i];
    if (pv < 0.0) continue;
    float zp = pv - travel;
    if (zp < 0.02) continue;
    float d = abs(z - zp);
    col += mix(vec3(1.0), c2, 0.3) * exp(-d * 40.0 / max(0.4, zp)) * 1.4 * smoothstep(0.02, 0.3, zp);
  }

  // Fog into the distance with a bright core at the far end.
  col *= exp(-z * 0.32);
  col += mix(c2, vec3(1.0), 0.5) * (0.012 + bass * 0.01 + kick * 0.01) / (r * r * 6.0 + 0.012);
  col += mix(c1, c2, 0.5) * exp(-r * 4.0) * (0.25 + bass * 0.4);
  // vignette
  col *= 1.0 - smoothstep(0.45, 1.2, length(p * vec2(0.8, 1.0)));
  o = vec4(1.0 - exp(-col * 1.25), 1.0);  // soft tone-mapping keeps bright overlaps from clipping
}`;

const toVec = (c: RGB): [number, number, number] => {
  const max = Math.max(c.r, c.g, c.b, 1);
  return [c.r / max, c.g / max, c.b / max];
};

/**
 * Warp tunnel (WebGL2): flight through a twisting hexagonal tube. Its wall
 * panels light up with the spectrum, the grid glows with the bass, streaks
 * rush past faster with the music, and every beat sends a ring of light
 * flying towards you. Falls back to the path version without WebGL 2.
 */
export function createTunnelGlRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  const prog = createProgram(gl, QUAD_VS, FS, 'tunnel');
  if (!prog) return null;
  const U = uniformsOf(gl, prog, ['res', 'sway', 't', 'travel', 'bass', 'kick', 'speed', 'high', 'lv', 'pulses', 'c1', 'c2']);
  const quad = fullscreenQuad(gl);
  const probe = lumProbe(gl, canvas);
  const lv = new Float32Array(24);
  let travel = 0;
  let prevKick = 0;
  const pulses: number[] = [];

  return {
    draw(f: VisFrame) {
      const m = f.reduced ? 0.3 : 1;
      const speed = (0.35 + f.bass * 1.6 + f.kick * 3) * m;
      travel += f.dt * speed;
      if (!f.reduced && f.kick > 0.9 && prevKick < f.kick - 0.05) {
        pulses.unshift(travel + 4.5);
        if (pulses.length > 4) pulses.pop();
      }
      prevKick = f.kick;
      while (pulses.length && pulses[pulses.length - 1]! < travel) pulses.pop();
      for (let i = 0; i < 24; i++) lv[i] = sampleLevel(f.levels, i / 23);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.uniform2f(U.res!, canvas.width, canvas.height);
      const t = f.reduced ? 0 : f.t;
      gl.uniform2f(U.sway!, Math.sin(t * 0.37) * 0.03 + f.shakeX * 0.0004, Math.cos(t * 0.29) * 0.025 - f.shakeY * 0.0004);
      gl.uniform1f(U.t!, t);
      gl.uniform1f(U.travel!, travel);
      gl.uniform1f(U.bass!, f.bass);
      gl.uniform1f(U.kick!, f.reduced ? 0 : f.kick);
      gl.uniform1f(U.speed!, speed);
      gl.uniform1f(U.high!, sampleLevel(f.levels, 0.75));
      gl.uniform1fv(U.lv!, lv);
      gl.uniform4f(U.pulses!, pulses[0] ?? -1, pulses[1] ?? -1, pulses[2] ?? -1, pulses[3] ?? -1);
      gl.uniform3f(U.c1!, ...toVec(f.palette[0]));
      gl.uniform3f(U.c2!, ...toVec(f.palette[1]));
      quad.draw();
      probe();
    },
    dispose() {
      quad.dispose();
      gl.deleteProgram(prog);
    },
  };
}

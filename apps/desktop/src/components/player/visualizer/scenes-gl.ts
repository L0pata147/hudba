import { SCENE_HEADER } from './gl';
import { beatEdge, createShaderScene } from './scene';
import type { Renderer } from './types';

type Url = () => string | undefined;

/* ------------------------------------------------------------------ */
/* Black hole                                                          */
/* ------------------------------------------------------------------ */

const BLACKHOLE = `${SCENE_HEADER}
uniform float spin, elev;
// Light paths are integrated around the hole (pseudo-Newtonian null geodesics, horizon radius 1),
// so the Einstein ring, the far side of the disk bent over the top and under the bottom and the
// photon ring all come out of the geometry.
vec3 skyAt(vec3 d) {
  vec2 uv = vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  float neb = fbm(uv * vec2(9.0, 5.0) + 3.0) * fbm(uv * vec2(17.0, 9.0) - 1.0);
  vec3 c = coverAt(uv * vec2(2.0, 1.0), 6.0) * neb * neb * 0.9 + mix(c1, c2, neb) * neb * neb * neb * 0.25;
  c += mix(c1, c2, 0.5) * exp(-abs(d.y - 0.15 * sin(uv.x * 6.0)) * 8.0) * 0.05;     // a faint galactic band
  for (int l = 0; l < 2; l++) {
    vec2 g = uv * vec2(900.0, 450.0) / (1.0 + float(l) * 1.7);
    vec2 id = floor(g);
    float h = hash(id + float(l) * 13.0);
    float s = step(0.996, h) * smoothstep(0.3, 0.0, length(fract(g) - 0.5));
    c += mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash(id + 5.0)) * s * (0.6 + 0.4 * sin(t * 2.0 + h * 60.0)) * (0.7 + high);
  }
  return c;
}
vec3 diskColor(vec3 x, vec3 rd, out float alpha) {
  float r = length(x.xz);
  float rin = 2.6;
  float rout = 11.0;
  if (r < rin || r > rout) { alpha = 0.0; return vec3(0.0); }
  float ang = atan(x.z, x.x);
  float omega = 2.2 * pow(r, -1.5);                                   // inner parts orbit faster
  float a = ang + spin * omega * 6.0;
  float lr = log(r);
  float turb = fbm(vec2(lr * 6.0, a * 2.0)) * 0.7 + fbm(vec2(lr * 18.0 + 4.0, a * 6.0)) * 0.5;
  turb = pow(turb, 1.6) * 1.8 * (0.8 + 0.4 * fbm(vec2(lr * 60.0, a * 20.0)));   // fine filaments
  float lanes = 0.75 + 0.25 * sin(lr * 23.0 + turb * 9.0 + a);
  float heat = pow(rin / r, 0.9);
  float edgeIn = smoothstep(rin, rin * 1.12, r);
  float edgeOut = smoothstep(rout, rout * 0.35, r);
  float dens = edgeIn * edgeOut * turb * lanes;
  // relativistic beaming: the side moving towards us is brighter and bluer
  vec3 orbit = normalize(vec3(-x.z, 0.0, x.x));
  float v = sqrt(0.5 / r) * 1.7;
  float g = 1.0 + dot(orbit, -rd) * v;
  float beam = g * g * g;
  vec3 hot = mix(vec3(1.0, 0.96, 0.9), vec3(0.8, 0.9, 1.0), clamp(g - 1.0, 0.0, 1.0));
  vec3 col = mix(c1 * 0.9, mix(c2, hot, smoothstep(0.5, 0.95, heat)), smoothstep(0.15, 0.7, heat));
  float band = level(fract(a / (2.0 * PI)) * 0.6 + 0.05);           // hot clumps flicker with the spectrum
  float glow = (0.7 + bass * 1.3 + kick * 0.8 * heat) * (0.75 + band * 0.7);
  alpha = clamp(dens * 1.4, 0.0, 1.0);
  return col * dens * beam * glow * (0.35 + heat * 2.4);
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float dist = 31.0 - bass * 0.8;
  vec3 ro = vec3(sin(t * 0.03) * 2.0, sin(elev) * dist, -cos(elev) * dist);
  vec3 fwd = normalize(-ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(fwd * 1.9 + right * p.x + up * p.y);
  vec3 pos = ro;
  vec3 vel = rd;
  float h2 = dot(cross(pos, vel), cross(pos, vel));
  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool horizon = false;
  float haze = 0.0;
  for (int i = 0; i < 170; i++) {
    float r2 = dot(pos, pos);
    if (r2 < 1.0) { horizon = true; break; }
    if (r2 > 1600.0 && dot(pos, vel) > 0.0) break;
    float r = sqrt(r2);
    float dt = clamp(0.07 * r, 0.03, 1.2);
    vec3 prev = pos;
    vel += -1.5 * h2 * pos / (r2 * r2 * r) * dt;
    pos += vel * dt;
    haze += exp(-(r - 1.5) * (r - 1.5) * 6.0) * dt;                   // light piling up near the photon sphere
    // relativistic jets along the axis on beats
    float jr = length(pos.xz);
    haze += kick * exp(-jr * jr * 5.0) * exp(-abs(pos.y) * 0.12) * step(1.5, abs(pos.y)) * dt * 0.6;
    // soft glow above and below the bright inner disk
    haze += exp(-abs(pos.y) * 2.5) * smoothstep(11.0, 2.6, jr) * smoothstep(2.0, 3.0, jr) * dt * 0.025;
    if (prev.y * pos.y < 0.0) {
      vec3 x = mix(prev, pos, prev.y / (prev.y - pos.y));
      float a;
      vec3 dc = diskColor(x, normalize(vel), a);
      col += trans * dc;
      trans *= 1.0 - a;
      if (trans < 0.02) break;
    }
  }
  vec3 sky = horizon ? vec3(0.0) : skyAt(normalize(vel));
  col += trans * sky;
  col += mix(c2, vec3(1.0), 0.5) * haze * (0.05 + bass * 0.05 + kick * 0.06) * (horizon ? 0.0 : 1.0);
  col *= 1.0 - smoothstep(0.5, 1.25, length(p)) * 0.55;
  o = vec4(aces(col * 1.15), 1.0);
}`;

export function createBlackHoleRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  let spin = 0;
  return createShaderScene(
    canvas,
    {
      name: 'blackhole',
      fs: BLACKHOLE,
      uniforms: ['spin', 'elev'],
      scale: 0.65,
      update: (gl, U, f) => {
        spin += f.dt * (0.35 + f.bass * 1.2) * (f.reduced ? 0.3 : 1);
        gl.uniform1f(U.spin!, spin);
        // a slow nod of the camera around the plane of the disk
        gl.uniform1f(U.elev!, 0.13 + Math.sin(f.t * 0.05) * 0.05 * (f.reduced ? 0 : 1));
      },
    },
    url,
  );
}

/* ------------------------------------------------------------------ */
/* Synthwave drive                                                     */
/* ------------------------------------------------------------------ */

const DRIVE = `${SCENE_HEADER}
uniform float travel, sway;
const float HOR = -0.05;
const float CAMH = 0.2;
const float RW = 0.95;
float gridLine(float x, float w) {
  float d = abs(fract(x + 0.5) - 0.5) / max(fwidth(x), 1e-4);
  return 1.0 - smoothstep(0.0, w, d);
}
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float seg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
vec3 PINK() { return mix(vec3(1.0, 0.2, 0.65), c1, 0.3); }
vec3 CYAN() { return mix(vec3(0.15, 0.9, 1.0), c2, 0.3); }

/** A palm tree silhouette (trunk bending to one side, drooping fronds). */
float palm(vec2 p, float h, float lean, float wind) {
  if (p.x < -h * 0.9 || p.x > h * 0.9 || p.y < -0.02 || p.y > h * 1.25) return 1.0;
  float d = 1.0;
  vec2 prev = vec2(0.0);
  for (int i = 1; i <= 7; i++) {
    float s = float(i) / 7.0;
    vec2 q = vec2((lean + wind * 0.3) * s * s * h, h * s);
    d = min(d, seg(p, prev, q, h * mix(0.05, 0.022, s)));
    prev = q;
  }
  vec2 top = prev;
  for (int k = 0; k < 11; k++) {
    float a = PI * (-0.08 + float(k) / 10.0 * 1.16);
    vec2 dir = vec2(cos(a), sin(a) * 0.6 + 0.1);
    vec2 lp = top;
    float L = h * (0.4 + 0.1 * sin(float(k) * 2.3));
    float droop = h * (0.3 + 0.15 * hash1(float(k)));
    for (int j = 1; j <= 5; j++) {
      float s = float(j) / 5.0;
      vec2 q = top + dir * L * s + vec2(wind * s * s * h * 0.2, -droop * s * s);
      // wide in the middle like a frond, narrow at both ends
      d = min(d, seg(p, lp, q, h * 0.055 * sin(s * PI * 0.85 + 0.25)));
      lp = q;
    }
  }
  return d;
}

/** The sky: gradient, stars, a shooting star now and then, the striped sun, wireframe mountains, the skyline. */
vec3 skyView(vec2 p) {
  float sy = p.y - HOR;
  vec3 col = mix(PINK() * 0.55 + vec3(0.18, 0.02, 0.1), vec3(0.02, 0.0, 0.06), smoothstep(0.0, 0.5, sy));
  col += vec3(0.6, 0.1, 0.5) * exp(-sy * 12.0) * 0.25;
  vec2 sg = p * 130.0;
  float st = step(0.993, hash(floor(sg))) * smoothstep(0.4, 0.0, length(fract(sg) - 0.5));
  col += vec3(st) * smoothstep(0.1, 0.3, sy) * (0.5 + 0.5 * sin(t * 3.0 + hash(floor(sg)) * 50.0)) * (0.6 + high);
  // shooting star every few seconds
  float sl = floor(t / 4.0);
  float sa = fract(t / 4.0) / 0.18;
  if (sa < 1.0) {
    vec2 s0 = vec2(hash1(sl) * 1.4 - 0.7, 0.3 + hash1(sl + 3.0) * 0.15);
    vec2 sdir = normalize(vec2(-0.8, -0.35));
    vec2 head = s0 + sdir * sa * 0.5;
    float tail = seg(p, head, head - sdir * 0.12, 0.0015);
    col += vec3(1.0, 0.9, 1.0) * smoothstep(0.004, 0.0, tail) * (1.0 - sa);
  }
  // the sun: yellow to hot pink, striped at the bottom, the stripes sliding down
  vec2 sp = p - vec2(0.0, HOR + 0.27);
  float sr = 0.23 * (1.0 + bass * 0.04 + kick * 0.03);
  float sd = length(sp);
  float rel = (sp.y + sr) / (2.0 * sr);
  float gap = rel < 0.58 ? step(fract(rel * 11.0 + t * 0.35), mix(0.65, 0.04, rel / 0.58)) : 0.0;
  float sun = smoothstep(sr, sr - 0.003, sd) * (1.0 - gap);
  vec3 sunCol = mix(vec3(1.0, 0.1, 0.55), vec3(1.0, 0.9, 0.3), smoothstep(0.1, 0.9, rel));
  col += PINK() * exp(-max(sd - sr, 0.0) * 8.0) * (0.35 + bass * 0.45);
  col = mix(col, sunCol * 1.15, sun);
  // wireframe mountains
  float mx = p.x * 2.6;
  float m = HOR + 0.03 + (abs(fract(mx * 0.5) - 0.5) * 0.22 + fbm(vec2(mx, 2.0)) * 0.05) * (0.55 + 0.45 * smoothstep(0.1, 0.8, abs(p.x)));
  if (p.y < m) {
    col = mix(vec3(0.03, 0.0, 0.06), PINK() * 0.12, smoothstep(HOR, m, p.y));
    float contour = gridLine((m - p.y) * 45.0, 1.0) + gridLine(mx * 6.0, 1.0) * 0.6;
    col += PINK() * contour * 0.18 * smoothstep(HOR, m, p.y);
    col += PINK() * exp(-(m - p.y) * 350.0) * 0.9;
  }
  // the skyline: every building is a band of the spectrum, bass in the middle
  float bw = 0.026;
  float bi = floor(p.x / bw);
  float band = clamp(abs((bi + 0.5) * bw) / 0.9, 0.0, 1.0);
  float bh = HOR + 0.012 + hash1(bi) * 0.025 + level(band) * 0.13;
  if (p.y < bh && abs(p.x) < 0.95) {
    col = vec3(0.025, 0.0, 0.05);
    vec2 wg = vec2(p.x / bw * 4.0, (p.y - HOR) * 95.0);
    vec2 wv = fract(wg);
    float win = step(0.3, wv.x) * step(wv.x, 0.75) * step(0.35, wv.y) * step(hash(floor(wg)), 0.3 + level(band) * 0.6);
    col += mix(CYAN(), PINK(), hash1(bi * 3.1)) * win;
    col += CYAN() * exp(-abs(p.y - bh) * 450.0) * (0.4 + level(band));
  }
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  vec3 col;
  if (p.y > HOR) {
    col = skyView(p);
  } else {
    float d = HOR - p.y;
    float z = CAMH / d;
    float x = p.x * z;
    float fade = exp(-z * 0.05);
    // neon grid beside the road
    vec2 g = vec2(x * 0.9, z * 0.9 + travel);
    float lines = max(gridLine(g.x, 1.3), gridLine(g.y, 1.3));
    col = vec3(0.015, 0.0, 0.035) + PINK() * lines * fade * (0.65 + bass * 0.9);
    col += PINK() * exp(-d * 25.0) * 0.4;
    // the road: dark and wet, mirroring the sky
    if (abs(x) < RW) {
      vec3 refl = skyView(vec2(p.x + sin(z * 3.0 + travel) * 0.002, HOR + d * 0.85));
      col = vec3(0.02, 0.012, 0.035) + refl * 0.45 * (0.5 + 0.5 * fade) * smoothstep(0.0, 0.05, d);
      col += CYAN() * smoothstep(0.03, 0.0, abs(abs(x) - (RW - 0.04)) - 0.012) * fade * 1.2;
      float dash = step(abs(x), 0.016) * step(fract((z + travel) * 0.45), 0.42);
      col += vec3(1.0, 0.95, 0.8) * dash * fade * 0.5;
    }
    // light poles rushing by, their lamps flashing on beats
    for (int i = 0; i < 8; i++) {
      float zi = 1.2 + float(i) * 3.0 - mod(travel, 3.0);
      if (zi < 0.6) continue;
      for (int sd = -1; sd <= 1; sd += 2) {
        float X = float(sd) * (RW + 0.55);
        float sx = X / zi;
        float base = HOR - CAMH / zi;
        float top = base + 1.1 / zi;
        if (abs(p.x - sx) < 0.01 / zi + 0.002 && p.y > base && p.y < top) col = vec3(0.02, 0.01, 0.04);
        vec2 lamp = vec2(sx - float(sd) * 0.12 / zi, top);
        float ld = length(p - lamp) * zi;
        vec3 lc = mod(float(i), 2.0) < 0.5 ? PINK() : CYAN();
        col += lc * (exp(-ld * 60.0) * 1.2 + exp(-ld * 9.0) * 0.15) * (0.7 + kick * 0.9) * exp(-zi * 0.04);
      }
    }
  }
  // poles above the horizon too (their upper parts)
  if (p.y > HOR) {
    for (int i = 0; i < 8; i++) {
      float zi = 1.2 + float(i) * 3.0 - mod(travel, 3.0);
      if (zi < 0.6) continue;
      for (int sd = -1; sd <= 1; sd += 2) {
        float X = float(sd) * (RW + 0.55);
        float sx = X / zi;
        float base = HOR - CAMH / zi;
        float top = base + 1.1 / zi;
        if (abs(p.x - sx) < 0.01 / zi + 0.002 && p.y < top) col = vec3(0.02, 0.01, 0.04);
        vec2 arm0 = vec2(sx, top);
        vec2 arm1 = vec2(sx - float(sd) * 0.12 / zi, top);
        if (seg(p, arm0, arm1, 0.004 / zi + 0.001) < 0.0) col = vec3(0.02, 0.01, 0.04);
        vec2 lamp = arm1;
        float ld = length(p - lamp) * zi;
        vec3 lc = mod(float(i), 2.0) < 0.5 ? PINK() : CYAN();
        col += lc * (exp(-ld * 60.0) * 1.2 + exp(-ld * 9.0) * 0.15) * (0.7 + kick * 0.9) * exp(-zi * 0.04);
      }
    }
  }

  // palm trees framing the view
  float pl = palm(vec2(-p.x - 0.7, p.y + 0.56), 0.6, 0.3, sway);
  float pr = palm(vec2(p.x - 0.74, p.y + 0.56), 0.52, 0.26, -sway);
  float palms = min(pl, pr);
  col = mix(col, vec3(0.01, 0.0, 0.02), smoothstep(0.002, 0.0, palms));
  col += PINK() * smoothstep(0.006, 0.0, abs(palms + 0.002)) * 0.35 * step(palms, 0.004);

  // the car, from behind, bobbing a little on the bass
  vec2 cp = p - vec2(0.0, -0.37 + bass * 0.006 + sin(t * 11.0) * 0.0012);
  float shadow = length(cp * vec2(1.0, 4.0) + vec2(0.0, 0.25)) - 0.24;
  col *= 1.0 - smoothstep(0.05, -0.05, shadow) * 0.7;
  float body = box(cp, vec2(0.215, 0.042), 0.022);
  float cabin = box(vec2(cp.x * (1.0 + (cp.y - 0.05) * 3.5), cp.y - 0.075), vec2(0.125, 0.034), 0.024);
  float wheels = min(box(cp - vec2(-0.16, -0.052), vec2(0.04, 0.02), 0.008), box(cp - vec2(0.16, -0.052), vec2(0.04, 0.02), 0.008));
  float car = min(min(body, cabin), wheels);
  if (car < 0.0) {
    col = mix(vec3(0.05, 0.02, 0.08), vec3(0.015, 0.005, 0.03), smoothstep(0.03, -0.05, cp.y));
    // rear window with the sunset in it
    float win = box(vec2(cp.x * (1.0 + (cp.y - 0.05) * 3.5), cp.y - 0.077), vec2(0.105, 0.022), 0.016);
    if (win < 0.0) col = mix(vec3(1.0, 0.35, 0.5), vec3(0.25, 0.05, 0.3), smoothstep(0.06, 0.1, cp.y)) * 0.8 + vec3(0.2) * smoothstep(0.004, 0.0, abs(cp.x + cp.y * 0.8 - 0.02));
    // dark grille with the light bar across it
    float grille = box(cp - vec2(0.0, 0.008), vec2(0.195, 0.017), 0.006);
    if (grille < 0.0) col = vec3(0.01) + vec3(0.04) * step(0.5, fract(cp.y * 160.0));
    float plate = box(cp - vec2(0.0, -0.022), vec2(0.035, 0.011), 0.003);
    if (plate < 0.0) col = vec3(0.7, 0.7, 0.75);
  }
  float lightBar = box(cp - vec2(0.0, 0.009), vec2(0.19, 0.005), 0.003);
  vec3 tail = vec3(1.0, 0.08, 0.22);
  col += tail * smoothstep(0.003, 0.0, lightBar) * (1.3 + kick * 1.2);
  col += tail * exp(-max(lightBar, 0.0) * 55.0) * (0.25 + kick * 0.55);
  // tail lights on the wet road
  if (p.y < cp.y + 0.37 - 0.43 && abs(cp.x) < 0.2) col += tail * exp(-abs(cp.x - 0.15 * sign(cp.x)) * 60.0) * exp(-(-0.06 - cp.y) * 7.0) * 0.15 * step(cp.y, -0.06);
  // rim light from the sun along the top of the car
  col += PINK() * smoothstep(0.005, 0.0, abs(car)) * step(0.0, cp.y) * 0.6;

  // retro screen: scanlines and vignette
  col *= 0.93 + 0.07 * sin(gl_FragCoord.y * PI * 0.5);
  col *= 1.0 - smoothstep(0.6, 1.35, length(p)) * 0.55;
  o = vec4(aces(col * 1.12), 1.0);
}`;

export function createDriveRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  let travel = 0;
  return createShaderScene(
    canvas,
    {
      name: 'drive',
      fs: DRIVE,
      uniforms: ['travel', 'sway'],
      update: (gl, U, f) => {
        travel += f.dt * (2.2 + f.bass * 4 + f.kick * 4) * (f.reduced ? 0.3 : 1);
        gl.uniform1f(U.travel!, travel);
        // palms swaying in the breeze, a little more with the bass
        gl.uniform1f(U.sway!, (Math.sin(f.t * 0.7) * 0.08 + f.bass * 0.05) * (f.reduced ? 0 : 1));
      },
    },
    url,
  );
}

/* ------------------------------------------------------------------ */
/* Turntable                                                           */
/* ------------------------------------------------------------------ */

const VINYL = `${SCENE_HEADER}
uniform float angle, pitch, focal;
uniform vec3 sty, camPos, camTgt;
// A turntable, ray traced analytically (boxes, cylinders, capsules) with shadows and reflections: a gunmetal
// deck on a walnut plinth, the aluminium platter with strobe dots, the record with groove sheen and the
// cover as its label, a chrome S-arm, start/stop, pitch fader and an LED spectrum meter, and an LED ring
// under the platter that glows with the spectrum.
struct Hit { float t; vec3 n; int id; };
void take(inout Hit h, float t, vec3 n, int id) { if (t > 0.0 && t < h.t) { h.t = t; h.n = n; h.id = id; } }
void box(vec3 ro, vec3 rd, vec3 c, vec3 b, int id, inout Hit h) {
  vec3 m = 1.0 / rd;
  vec3 k = abs(m) * b;
  vec3 nn = -m * (ro - c);
  vec3 t1 = nn - k;
  vec3 t2 = nn + k;
  float tN = max(max(t1.x, t1.y), t1.z);
  float tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tF < 0.0) return;
  take(h, tN, -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz), id);
}
// a vertical cylinder with a top cap
void cyl(vec3 ro, vec3 rd, vec2 c, float y0, float y1, float r, int id, inout Hit h) {
  vec2 o = ro.xz - c;
  vec2 d = rd.xz;
  float a = dot(d, d);
  float b = dot(o, d);
  float disc = b * b - a * (dot(o, o) - r * r);
  if (disc > 0.0 && a > 1e-6) {
    float t = (-b - sqrt(disc)) / a;
    float y = ro.y + rd.y * t;
    if (y > y0 && y < y1) take(h, t, normalize(vec3(o.x + d.x * t, 0.0, o.y + d.y * t)), id);
  }
  if (abs(rd.y) > 1e-5) {
    float t = (y1 - ro.y) / rd.y;
    vec2 q = o + d * t;
    if (dot(q, q) < r * r) take(h, t, vec3(0.0, 1.0, 0.0), id);
  }
}
void cap(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float r, int id, inout Hit h) {
  vec3 ba = pb - pa;
  vec3 oa = ro - pa;
  float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
  float a = baba - bard * bard;
  float b = baba * rdoa - baoa * bard;
  float c = baba * oaoa - baoa * baoa - r * r * baba;
  float disc = b * b - a * c;
  if (disc < 0.0) return;
  float t = (-b - sqrt(disc)) / a;
  float y = baoa + t * bard;
  if (y <= 0.0 || y >= baba) {
    vec3 oc = y <= 0.0 ? oa : ro - pb;
    b = dot(rd, oc);
    disc = b * b - dot(oc, oc) + r * r;
    if (disc <= 0.0) return;
    t = -b - sqrt(disc);
  }
  if (t > 0.0 && t < h.t) {
    vec3 pa2 = ro + rd * t - pa;
    take(h, t, (pa2 - clamp(dot(pa2, ba) / baba, 0.0, 1.0) * ba) / r, id);
  }
}
const vec3 PC = vec3(0.32, -0.2, 0.12);    // plinth centre and half size
const vec3 PB = vec3(1.72, 0.15, 1.38);
const vec3 PIV = vec3(1.32, 0.24, -0.82);  // tonearm pivot
vec3 LD() { return normalize(vec3(-0.45, 1.0, 0.35)); }
vec3 armDir() { return normalize(vec3(sty.x - PIV.x, 0.0, sty.z - PIV.z)); }
float knobZ() { return mix(0.25, 0.95, pitch); }
Hit trace(vec3 ro, vec3 rd) {
  Hit h;
  h.t = 1e9;
  h.id = 0;
  h.n = vec3(0.0);
  box(ro, rd, PC, PB, 1, h);
  cyl(ro, rd, vec2(0.0), -0.05, 0.055, 1.08, 2, h);                    // platter
  cyl(ro, rd, vec2(0.0), 0.055, 0.075, 1.0, 3, h);                     // record
  cyl(ro, rd, vec2(0.0), 0.075, 0.13, 0.022, 4, h);                    // spindle
  cyl(ro, rd, PIV.xz, -0.05, 0.15, 0.15, 5, h);                        // arm base
  cyl(ro, rd, PIV.xz, 0.15, 0.22, 0.07, 6, h);                         // gimbal
  vec3 dir = armDir();
  vec3 side = vec3(-dir.z, 0.0, dir.x);
  vec3 head = sty + vec3(0.0, 0.045, 0.0);
  vec3 elbow = mix(PIV, head, 0.6) + side * 0.1;
  cap(ro, rd, PIV, elbow, 0.022, 6, h);                                // the S-shaped arm
  cap(ro, rd, elbow, head - dir * 0.05, 0.02, 6, h);
  cap(ro, rd, head - dir * 0.05, head + dir * 0.1, 0.024, 8, h);       // head shell
  cap(ro, rd, sty + vec3(0.0, 0.016, 0.0) - dir * 0.01, sty + vec3(0.0, 0.016, 0.0) + dir * 0.06, 0.024, 9, h);  // cartridge
  cap(ro, rd, sty + vec3(0.0, -0.032, 0.0), sty, 0.004, 6, h);         // stylus
  cap(ro, rd, head + dir * 0.09, head + dir * 0.1 - side * 0.09 + vec3(0.0, 0.025, 0.0), 0.007, 6, h);  // finger lift
  cap(ro, rd, PIV - dir * 0.15, PIV - dir * 0.33, 0.07, 7, h);         // counterweight
  cyl(ro, rd, vec2(1.25, 0.12), -0.05, 0.15, 0.022, 6, h);             // arm rest
  box(ro, rd, vec3(-1.05, -0.036, 1.2), vec3(0.15, 0.014, 0.1), 11, h); // start/stop
  box(ro, rd, vec3(-0.72, -0.044, 1.22), vec3(0.07, 0.006, 0.045), 12, h);  // 33
  box(ro, rd, vec3(-0.54, -0.044, 1.22), vec3(0.07, 0.006, 0.045), 13, h);  // 45
  box(ro, rd, vec3(1.8, -0.026, knobZ()), vec3(0.075, 0.024, 0.04), 14, h);  // pitch fader knob
  if (rd.y < 0.0) take(h, (-0.35 - ro.y) / rd.y, vec3(0.0, 1.0, 0.0), 10);  // the desk
  return h;
}
vec3 envLight(vec3 d) {
  // a dark studio: the softbox that is the key light, neon tubes on the far wall in the cover's colours
  vec3 c = mix(vec3(0.012, 0.01, 0.016), vec3(0.06, 0.058, 0.07), smoothstep(-0.1, 0.9, d.y));
  c += vec3(1.0, 0.96, 0.9) * smoothstep(0.95, 0.985, dot(d, LD())) * 3.0;
  float neon = smoothstep(0.06, 0.0, abs(d.y - 0.14)) * smoothstep(0.1, -0.3, d.z);
  c += mix(c1, c2, smoothstep(-0.6, 0.6, d.x)) * neon * (0.3 + bass * 0.6);
  return c;
}
// cheap shading of what the record reflects
vec3 quick(Hit h, vec3 rd) {
  if (h.id == 0 || h.id == 10) return envLight(rd);
  float d = max(dot(h.n, LD()), 0.0);
  if (h.id == 7 || h.id == 5) return vec3(0.03) * (0.3 + d) + envLight(reflect(rd, h.n)) * 0.25;
  if (h.id == 9) return mix(c1, c2, 0.3) * (0.15 + d * 0.8);
  if (h.id == 1 || h.id >= 11) return vec3(0.04) * (0.3 + d);
  return vec3(0.5) * (0.1 + d * 0.5) + envLight(reflect(rd, h.n)) * 0.8;
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  vec3 ro = camPos;
  vec3 fwd = normalize(camTgt - ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(fwd * focal + right * p.x + up * p.y);
  vec3 L = LD();
  Hit h = trace(ro, rd);
  vec3 pos = ro + rd * min(h.t, 80.0);
  float r = length(pos.xz);
  // the world size of a pixel, to keep the fine detail from shimmering (taken before any branching)
  float fr = max(fwidth(r), 1e-5);
  float fp = max(length(fwidth(pos)), 1e-5);
  vec3 n = h.n;
  vec3 v = -rd;
  vec3 H = normalize(L + v);
  float shadow = h.id == 0 ? 1.0 : (trace(pos + n * 0.003, L).t < 1e8 ? 0.0 : 1.0);
  float diff = max(dot(n, L), 0.0) * shadow;
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  // the LED ring under the platter: bright where the spectrum is (bass at the front, treble at the back)
  float u = abs(atan(pos.x, pos.z)) / PI;
  vec3 ledCol = mix(c1, c2, u);
  float led = (0.3 + bass * 0.7 + kick * 0.4) * (0.25 + level(u) * 1.8);
  vec3 col = vec3(0.0);
  if (h.id == 0) {
    col = envLight(rd);
    // out-of-focus lights in the background, flickering with the music
    vec2 g = p * 6.0 + vec2(t * 0.02, 0.0);
    vec2 id = floor(g);
    if (hash(id) > 0.78) {
      vec2 c = vec2(hash(id + 1.3), hash(id + 5.9)) - 0.5;
      float rad = 0.2 + hash(id + 2.2) * 0.2;
      float bok = smoothstep(rad, rad * 0.8, length(fract(g) - 0.5 - c * 0.4));
      col += mix(c1, c2, hash(id + 4.4)) * bok * (0.04 + level(hash(id + 8.1)) * 0.22);
    }
  } else if (h.id == 1) {
    if (n.y > 0.5) {
      // brushed gunmetal top, darker in the corners next to the platter and the arm base
      float brush = noise(vec2(pos.x * 3.0, pos.z * 300.0));
      float ao = mix(0.3, 1.0, smoothstep(1.08, 1.32, r)) * mix(0.45, 1.0, smoothstep(0.15, 0.32, length(pos.xz - PIV.xz)));
      col = vec3(0.05, 0.051, 0.056) * (0.9 + 0.2 * brush) * (0.25 + diff * 1.2) * ao;
      col += vec3(0.2) * pow(max(dot(n, H), 0.0), 50.0) * shadow * (0.6 + 0.4 * brush);
      col += envLight(reflect(rd, n)) * fres * 0.5;
      // the bevelled edge catching the light
      float edge = min(PB.x - abs(pos.x - PC.x), PB.z - abs(pos.z - PC.z));
      col += vec3(0.3) * smoothstep(0.025, 0.012, edge) * (0.25 + diff);
      // the LED ring's glow spilling out from under the platter
      col += ledCol * led * exp(-max(r - 1.08, 0.0) * 8.0) * 0.45;
      // the strobe lamp, flashing on the beat
      float sl = length(pos.xz - vec2(-0.92, 0.88));
      col += mix(c1, vec3(1.0), 0.3) * (smoothstep(0.045, 0.035, sl) * (0.5 + kick * 2.0) + exp(-sl * 20.0) * kick * 0.3);
      // pitch fader slot with tick marks and the green zero LED
      vec2 ps = pos.xz - vec2(1.8, 0.6);
      if (abs(ps.y) < 0.42) {
        col *= 1.0 - smoothstep(0.016, 0.01, abs(ps.x)) * 0.9;
        float tick = step(0.09, abs(ps.x)) * step(abs(ps.x), 0.13) * smoothstep(0.003 + fp, 0.0, abs(fract(ps.y / 0.08 + 0.5) - 0.5) * 0.08);
        col += vec3(0.22) * tick;
      }
      col += c2 * 1.5 * smoothstep(0.015, 0.01, length(pos.xz - vec2(1.95, 0.6)));
      // the LED spectrum meter along the front: 24 bands, 4 rows
      vec2 m = vec2((pos.x + 0.35) / 1.4, (1.34 - pos.z) / 0.16);
      if (m.x > 0.0 && m.x < 1.0 && m.y > 0.0 && m.y < 1.0) {
        vec2 cell = m * vec2(24.0, 4.0);
        vec2 id = floor(cell);
        vec2 q = abs(fract(cell) - 0.5) * vec2(1.4 / 24.0, 0.04);
        float dm = max(q.x / 0.019, q.y / 0.012);
        float aa = fp / 0.012;
        float dotM = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, dm);
        float on = step((id.y + 0.5) / 4.0, level((id.x + 0.5) / 24.0) * 1.25 + 0.04);
        vec3 lc = mix(mix(c1, c2, id.x / 23.0), vec3(1.0), id.y > 2.5 ? 0.45 : 0.0);
        col = mix(col, on > 0.5 ? lc * 1.6 : vec3(0.018), dotM);
        col += lc * on * exp(-max(dm - 1.0, 0.0) * 1.5) * 0.06;
      }
    } else if (pos.y > -0.075) {
      // the edge of the metal top plate
      col = vec3(0.06) * (0.25 + diff) + vec3(0.4) * pow(max(dot(n, H), 0.0), 60.0) * shadow + envLight(reflect(rd, n)) * 0.3;
    } else {
      // walnut sides with a clear coat
      float grain = noise(vec2((pos.x + pos.z) * 2.5, pos.y * 70.0 + noise(pos.xz * 3.0) * 7.0));
      col = mix(vec3(0.13, 0.06, 0.025), vec3(0.28, 0.14, 0.06), grain) * (0.18 + diff * 1.1);
      col += vec3(0.2) * pow(max(dot(n, H), 0.0), 40.0) * shadow + envLight(reflect(rd, n)) * fres * 0.6;
      col += ledCol * led * 0.05;
    }
  } else if (h.id == 2) {
    vec3 T = normalize(vec3(-pos.z, 0.0, pos.x));
    float th = dot(T, H);
    if (n.y > 0.5) {
      // brushed aluminium: only the rim around the record shows
      float an = pow(sqrt(max(1.0 - th * th, 0.0)), 30.0);
      col = vec3(0.45) * (0.2 + diff * 0.8) + vec3(1.0) * an * shadow * 0.8 + envLight(reflect(rd, n)) * 0.3;
    } else {
      // strobe dots in two rows, lit by the lamp on the beat; the LED ring glowing below
      float k = (atan(pos.z, pos.x) + angle) / (2.0 * PI);
      float aa = fp / 0.045;
      float dots = smoothstep(0.17 + aa, 0.17 - aa, abs(fract(k * 150.0) - 0.5)) * step(0.004, pos.y) * step(pos.y, 0.018);
      dots += smoothstep(0.17 + aa, 0.17 - aa, abs(fract(k * 148.0) - 0.5)) * step(0.03, pos.y) * step(pos.y, 0.044);
      col = vec3(0.3) * (0.2 + diff) + vec3(0.8) * pow(max(dot(n, H), 0.0), 60.0) * shadow + envLight(reflect(rd, n)) * 0.4;
      col += mix(c1, vec3(1.0), 0.5) * dots * (0.35 + kick * 1.6);
      col += ledCol * led * 1.3 * smoothstep(-0.015, -0.045, pos.y);
    }
  } else if (h.id == 3) {
    if (n.y < 0.5) {
      col = vec3(0.015) + vec3(0.35) * pow(max(dot(n, H), 0.0), 40.0) * shadow + envLight(reflect(rd, n)) * fres;
    } else if (r < 0.34) {
      // the label: the cover, turning with the record
      float a = angle;
      vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * pos.xz;
      vec2 luv = q / 0.34 * 0.485 + 0.5;
      float lod = hasCover > 0.5 ? log2(max(fp * float(textureSize(cover, 0).x) * 1.45, 1.0)) : 0.0;
      vec3 base = coverAt(vec2(luv.x, 1.0 - luv.y), lod);
      col = base * (0.3 + diff * 0.9) * (1.0 - smoothstep(0.25, 0.34, r) * 0.25);
      col += vec3(0.12) * pow(max(dot(n, H), 0.0), 20.0) * shadow;
      col *= smoothstep(0.34, 0.335, r) * (0.75 + 0.25 * smoothstep(0.03, 0.05, r));
    } else {
      // vinyl: fine grooves whose sheen is a bright wedge, mirror-smooth gaps between the tracks
      // and the run-out, and what the record reflects
      vec3 T = normalize(vec3(-pos.z, 0.0, pos.x));
      float th = dot(T, H);
      float s = sqrt(max(1.0 - th * th, 0.0));
      float aniso = pow(s, 160.0);
      float wide = pow(s, 14.0);
      float gAmp = clamp(1.0 - fr * 2200.0 / 4.0, 0.0, 1.0);
      float groove = 0.5 + 0.5 * sin(r * 2200.0) * gAmp;
      float loud = 0.55 + 0.9 * noise(vec2(r * 55.0, 3.0));
      float x = fract(r * 6.5 + 0.3);
      float gap = 1.0 - smoothstep(0.005, 0.005 + fr * 1.5, min(x, 1.0 - x) / 6.5);
      gap = max(gap, 1.0 - smoothstep(0.395, 0.4 + fr, r));                // run-out
      gap = max(gap, smoothstep(0.975, 0.98 + fr, r));                     // lead-in
      float gloss = (0.8 + high * 0.7) * shadow;
      col = vec3(0.012) * (1.0 + groove * 0.4 * (1.0 - gap));
      col += vec3(1.0, 0.97, 0.94) * aniso * (0.55 + groove * 0.7) * loud * (1.0 - gap * 0.9) * gloss;
      col += mix(c1, c2, 0.5 + 0.5 * sin(r * 9.0)) * wide * 0.07 * (1.0 - gap) * (0.6 + bass) * shadow;
      vec3 rdir = reflect(rd, n);
      Hit rh = trace(pos + n * 0.002, rdir);
      col += quick(rh, rdir) * mix(0.06, 0.7, fres) * (0.6 + gap * 0.8);
      col *= 0.25 + 0.75 * smoothstep(1.0, 0.99, r);
    }
  } else if (h.id == 10) {
    // a dark desk: the deck's soft contact shadow and the LED spill, fading into the dark
    vec2 q = abs(pos.xz - PC.xz) - PB.xz;
    float dbox = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float ao = smoothstep(-0.02, 0.5, dbox);
    vec3 base = vec3(0.035, 0.028, 0.024) * (0.85 + 0.3 * noise(pos.xz * vec2(1.0, 12.0)));
    col = base * (0.2 + diff * 1.1) * (0.35 + 0.65 * ao);
    col += ledCol * led * exp(-max(dbox, 0.0) * 2.5) * 0.08;
    col += envLight(reflect(rd, n)) * fres * 0.4;
    col *= exp(-max(length(pos.xz) - 3.0, 0.0) * 0.35);
  } else if (h.id >= 11) {
    // buttons and the pitch knob: black, with a lit 33 and a line on the knob
    bool top = n.y > 0.5;
    col = vec3(0.035) * (0.3 + diff) + vec3(0.3) * pow(max(dot(n, H), 0.0), 50.0) * shadow + envLight(reflect(rd, n)) * fres * 0.5;
    if (h.id == 12 && !top) col += c1 * 1.2;
    if (h.id == 12 && top) col += c1 * 0.25;
    if (h.id == 14 && top) col += vec3(0.6) * smoothstep(0.006, 0.003, abs(pos.z - knobZ()));
    if (h.id == 11 && top) col += vec3(0.08) * smoothstep(0.02, 0.0, abs(length((pos.xz - vec2(-1.05, 1.2)) * vec2(0.65, 1.0)) - 0.05));
  } else {
    // metal: chrome arm, stylus and spindle; black arm base and counterweight; head shell; cartridge
    vec3 refl = envLight(reflect(rd, n));
    float sp = pow(max(dot(n, H), 0.0), 120.0) * shadow;
    if (h.id == 5) {
      col = vec3(0.03) * (0.3 + diff) + refl * 0.15 + vec3(0.4) * sp;
      col += vec3(0.25) * smoothstep(0.01, 0.0, abs(pos.y - 0.13)) * (0.3 + diff);   // a chrome ring
    } else if (h.id == 7) {
      float knurl = 0.7 + 0.3 * step(0.5, fract(dot(pos - PIV, armDir()) * 90.0));
      col = vec3(0.05) * knurl * (0.3 + diff) + refl * 0.25 + vec3(0.6) * sp;
    } else if (h.id == 8) {
      col = vec3(0.35) * (0.15 + diff * 0.7) + refl * 0.5 + vec3(1.0) * sp;
    } else if (h.id == 9) {
      col = mix(c1, c2, 0.3) * (0.15 + diff * 0.9) + refl * 0.15 + vec3(0.8) * sp;
    } else {
      col = vec3(0.55) * (0.08 + diff * 0.5) + refl * 0.85 + vec3(1.0) * sp;
    }
  }
  col *= 1.0 - smoothstep(0.45, 1.25, length(p)) * 0.6;
  o = vec4(aces(col * 1.35), 1.0);
}`;

/** One camera position: spherical round a target (or the stylus), and the lens. */
interface Shot {
  az: number;
  elev: number;
  dist: number;
  tgt: [number, number, number] | 'stylus';
  focal: number;
}
const SHOTS: Shot[] = [
  { az: 0, elev: 0.72, dist: 5.1, tgt: [0.32, -0.12, 0.12], focal: 1.8 }, // the whole deck
  { az: 0.15, elev: 1.3, dist: 2.7, tgt: [0, 0, 0.05], focal: 1.7 },      // from above: the label
  { az: 0.75, elev: 0.28, dist: 1.5, tgt: 'stylus', focal: 2 },           // the stylus in the groove
  { az: -0.85, elev: 0.2, dist: 3.1, tgt: [0.1, 0.05, 0], focal: 1.8 },   // low along the record
  { az: 0.45, elev: 0.5, dist: 2.3, tgt: [1, 0.12, -0.35], focal: 1.8 },  // the tonearm
];
const ORDER = [0, 1, 0, 2, 3, 0, 4, 1, 2, 0, 3, 4];
const PIVOT: [number, number] = [1.32, -0.82];
const ARM = 1.6;

/** Where the stylus sits for an arm progress 0 (lead-in) … 1 (run-out): the arm keeps its length. */
function stylusAt(arm: number): [number, number, number] {
  const d = Math.hypot(PIVOT[0], PIVOT[1]);
  const rr = 0.96 - arm * 0.56;
  const th = Math.acos(Math.max(-1, Math.min(1, (rr * rr + d * d - ARM * ARM) / (2 * rr * d))));
  const a = Math.atan2(PIVOT[1], PIVOT[0]) + th;
  return [rr * Math.cos(a), 0.11, rr * Math.sin(a)];
}

export function createVinylRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  let angle = 0;
  const edge = beatEdge();
  let shot = 0;
  let step = 0;
  let since = 0;
  let from = { ...SHOTS[0]!, tgt: [0.32, -0.12, 0.12] as [number, number, number] };
  let cur = from;
  return createShaderScene(
    canvas,
    {
      name: 'vinyl',
      fs: VINYL,
      uniforms: ['angle', 'pitch', 'focal', 'sty', 'camPos', 'camTgt'],
      scale: 0.9,
      update: (gl, U, f) => {
        // 33⅓ rpm with a hint of wow
        angle -= f.dt * 3.49 * (1 + Math.sin(f.t * 0.9) * 0.004) * (f.reduced ? 0.4 : 1);
        gl.uniform1f(U.angle!, angle);
        // the arm creeps across the record and back, trembling a little
        const arm = 1 - Math.abs(((f.t * 0.004) % 2) - 1) + Math.sin(f.t * 40) * 0.001 * (f.reduced ? 0 : 1);
        const sty = stylusAt(arm);
        gl.uniform3f(U.sty!, ...sty);
        gl.uniform1f(U.pitch!, 0.5 + Math.sin(f.t * 0.05) * 0.08);

        // the camera glides to another shot on a beat every 10 s or so (or after 15 s anyway)
        since += f.dt;
        const beat = edge(f.kick);
        if (!f.reduced && ((beat && since > 10) || since > 15)) {
          from = cur;
          step = (step + 1) % ORDER.length;
          shot = ORDER[step]!;
          since = 0;
        }
        const s = f.reduced ? SHOTS[0]! : SHOTS[shot]!;
        const k = f.reduced ? 1 : Math.min(1, since / 3);
        const e = k * k * k * (k * (k * 6 - 15) + 10);
        const to = {
          az: s.az + (f.reduced ? 0 : Math.sin(f.t * 0.07) * 0.15),
          elev: s.elev,
          dist: s.dist * (1 - Math.min(since, 15) * 0.004),
          tgt: s.tgt === 'stylus' ? ([sty[0], sty[1] + 0.02, sty[2]] as [number, number, number]) : s.tgt,
          focal: s.focal,
        };
        const mix = (a: number, b: number) => a + (b - a) * e;
        cur = {
          az: mix(from.az, to.az),
          elev: mix(from.elev, to.elev),
          dist: mix(from.dist, to.dist),
          tgt: [mix(from.tgt[0], to.tgt[0]), mix(from.tgt[1], to.tgt[1]), mix(from.tgt[2], to.tgt[2])],
          focal: mix(from.focal, to.focal),
        };
        const dist = cur.dist * (1 - (f.reduced ? 0 : f.kick) * 0.012);
        const ce = Math.cos(cur.elev);
        gl.uniform3f(U.camPos!, cur.tgt[0] + dist * ce * Math.sin(cur.az), cur.tgt[1] + dist * Math.sin(cur.elev), cur.tgt[2] + dist * ce * Math.cos(cur.az));
        gl.uniform3f(U.camTgt!, ...cur.tgt);
        gl.uniform1f(U.focal!, cur.focal);
      },
    },
    url,
  );
}

/* ------------------------------------------------------------------ */
/* Rain on glass                                                       */
/* ------------------------------------------------------------------ */

const RAIN = `${SCENE_HEADER}
uniform float beats, slide, flash;
// A rainy window at night. Drops slide down the glass in jerks and leave a wet trail with little beads
// behind; new drops land on the beat; everywhere else the glass is misted. Through the mist the street
// outside is a blur of lights; through the water it is sharp (and, in the drops, upside down).

/** Sliding drops in one layer. x = height of the water, y = the wet trail (it wipes the mist). */
vec2 sliding(vec2 p, float scale, float seed) {
  vec2 g = p * scale * vec2(1.0, 1.0 / 3.0);   // cells three times taller than wide
  g.y += hash1(floor(g.x) * 3.7 + seed) * 7.0;
  vec2 id = floor(g);
  vec2 st = fract(g);
  float n = hash(id + seed);
  float n2 = hash(id + seed + 9.1);
  // the path wobbles a little; the drop moves in five jerks per trip down the cell
  float x = 0.5 + (n - 0.5) * 0.4 + sin(st.y * 9.0 + n * 30.0) * 0.035;
  float ph = fract(slide * (0.3 + n2 * 0.4) + n);
  float y = 0.93 - (floor(ph * 5.0) + smoothstep(0.0, 0.3, fract(ph * 5.0))) / 5.0 * 0.86;
  float r = 0.15 + n2 * 0.08;                   // in cell widths
  vec2 dp = (st - vec2(x, y)) * vec2(1.0, 3.0);
  dp.y *= dp.y < 0.0 ? 0.8 : 1.25;              // heavier at the bottom
  float h = sqrt(max(0.0, 1.0 - dot(dp, dp) / (r * r))) * r;
  // the trail: from the drop up to where it started, thinning with age, beads left along it
  float above = (st.y - y) * 3.0;
  float len = (0.93 - y) * 3.0;
  float inTrail = step(0.0, above) * step(above, len);
  float tw = r * 0.45 * (1.0 - above / max(len, 0.01) * 0.6);
  float trail = inTrail * smoothstep(tw, tw * 0.5, abs(st.x - x));
  float k = floor(above / 0.32);
  float bead = hash(id * 1.3 + k + seed);
  float rb = r * (0.2 + bead * 0.25) * step(0.45, bead) * (1.0 - smoothstep(0.0, len + 0.01, above) * 0.5);
  vec2 bp = vec2(st.x - x, above - (k + 0.5) * 0.32 + (hash(id + k * 3.1) - 0.5) * 0.1);
  h = max(h, sqrt(max(0.0, 1.0 - dot(bp, bp) / max(rb * rb, 1e-6))) * rb * inTrail);
  return vec2(h / scale, trail);
}

/** Drops landing on the beat: some cells get one on each beat, they shrink away over a few beats. */
float landed(vec2 p, float scale) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 st = fract(g) - 0.5;
  float h = 0.0;
  float bi = floor(beats);
  for (int k = 0; k < 6; k++) {
    float b = bi - float(k);
    if (hash(id + b * 1.37) > 0.16 + bass * 0.14) continue;
    vec2 c = (vec2(hash(id + b * 2.1), hash(id + b * 3.3)) - 0.5) * 0.5;
    float age = beats - b;
    float r = (0.1 + 0.16 * hash(id + b * 5.7)) * smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(2.5, 6.0, age));
    vec2 d = st - c;
    h = max(h, sqrt(max(0.0, 1.0 - dot(d, d) / max(r * r, 1e-6))) * r);
  }
  return h / scale;
}

/** Fine condensation beads, always there. */
float mistBeads(vec2 p) {
  vec2 g = p * 70.0;
  vec2 id = floor(g);
  vec2 st = fract(g) - 0.5 - (vec2(hash(id), hash(id + 4.2)) - 0.5) * 0.5;
  float r = 0.25 * hash(id + 2.6) * step(0.8, hash(id + 8.8));
  return sqrt(max(0.0, 1.0 - dot(st, st) / max(r * r, 1e-6))) * r / 70.0;
}

/** x = water height, y = wiped (trails and drops). */
vec2 glass(vec2 p) {
  vec2 a = sliding(p, 4.0, 1.0);
  vec2 b = sliding(p + vec2(0.37, 0.0), 6.5, 4.0);
  float h = max(max(a.x, b.x), max(landed(p, 11.0), mistBeads(p)));
  return vec2(h, max(a.y, b.y * 0.8));
}

/** A light of the street as the lens sees it: a sharp point, or a big soft disc through the mist. */
vec3 bokeh(vec2 q, vec2 pos, vec3 c, float R) {
  float d = length(q - pos);
  return c * smoothstep(R, R * 0.75, d) * clamp(pow(0.024 / R, 2.0), 0.25, 3.0) + c * exp(-d / (R * 2.0)) * 0.06;
}

/** The street outside: buildings with lit windows, a billboard with the cover, street lamps, cars, neon. */
vec3 street(vec2 q, float blur) {
  float R = mix(0.008, 0.07, blur);
  vec3 col = mix(vec3(0.05, 0.045, 0.08) + mix(c1, c2, 0.5) * 0.03, vec3(0.012, 0.014, 0.03), smoothstep(-0.1, 0.5, q.y));
  col += vec3(0.5, 0.55, 0.8) * flash * smoothstep(-0.1, 0.5, q.y) * 0.5;
  // buildings opposite, dark against the sky, with windows
  float bh = 0.18 + 0.12 * step(0.5, hash1(floor(q.x * 4.0 + 20.0)));
  float bmask = smoothstep(bh + R * 0.5, bh - R * 0.5, q.y);
  col = mix(col, vec3(0.012, 0.011, 0.018), bmask);
  vec2 wg = q * vec2(26.0, 32.0);
  vec2 wid = floor(wg);
  vec2 wd = abs(fract(wg) - 0.5);
  float sharpW = step(0.72, hash(wid)) * smoothstep(0.34, 0.24, max(wd.x, wd.y * 1.3));
  // through the mist the windows melt into an uneven glow
  float softW = smoothstep(0.3, 0.9, noise(q * vec2(9.0, 11.0) + 3.0)) * 0.22;
  float win = mix(sharpW, softW, smoothstep(0.15, 0.6, blur)) * bmask * step(-0.08, q.y);
  col += mix(vec3(1.0, 0.72, 0.4), vec3(0.6, 0.75, 1.0), step(0.85, hash(wid + 3.0)) * (1.0 - blur)) * win * 0.3;
  // the billboard with the cover, its neon frame breathing with the bass
  vec2 bc = (q - vec2(0.3, 0.17)) / 0.3 + 0.5;
  float edge = max(abs(bc.x - 0.5), abs(bc.y - 0.5));
  float soft = 0.004 + blur * 0.1;
  col = mix(col, coverAt(bc, blur * 6.5) * (0.5 + bass * 0.3), smoothstep(0.5 + soft, 0.5 - soft, edge));
  col += c1 * exp(-abs(edge - 0.52) * mix(60.0, 9.0, blur)) * (0.25 + bass * 0.6) * mix(1.0, 0.5, blur);
  // street lamps going off into the distance
  for (int i = 0; i < 7; i++) {
    float k = float(i) / 6.0;
    vec2 lp = mix(vec2(-0.85, 0.34), vec2(0.06, 0.02), sqrt(k));
    col += bokeh(q, lp, vec3(1.0, 0.68, 0.32) * (1.0 - k * 0.5), R * (1.0 - k * 0.4));
  }
  // cars: headlights coming one way, tail lights going the other, both mirrored in the wet road
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float xh = fract(t * 0.05 + fi * 0.29 + hash1(fi) * 0.2) * 2.8 - 1.4;
    float xt = 1.4 - fract(t * 0.04 + fi * 0.31 + hash1(fi + 7.0) * 0.2) * 2.8;
    vec3 hc = vec3(0.95, 0.95, 1.0) * 0.9;
    vec3 tc = vec3(1.0, 0.1, 0.06) * 0.8;
    for (int s = 0; s < 2; s++) {
      float o = float(s) * 0.055 - 0.0275;
      col += bokeh(q, vec2(xh + o, -0.27), hc, R);
      col += bokeh(q, vec2(xt + o, -0.2), tc, R * 0.85);
      col += hc * exp(-abs(q.x - xh - o) / (0.004 + R * 0.4)) * smoothstep(-0.27, -0.5, q.y) * exp((q.y + 0.27) * 4.0) * 0.08;
      col += tc * exp(-abs(q.x - xt - o) / (0.004 + R * 0.4)) * smoothstep(-0.2, -0.45, q.y) * exp((q.y + 0.2) * 4.0) * 0.06;
    }
  }
  // a column of neon signs on the left, each one a band of the spectrum
  for (int i = 0; i < 6; i++) {
    float k = float(i) / 5.0;
    float v = level(0.05 + k * 0.85);
    col += bokeh(q, vec2(-0.62 + sin(k * 9.0) * 0.03, -0.02 + k * 0.32), mix(c1, c2, k) * (0.15 + v * 1.6), R * 0.9);
  }
  // the wet road
  col += mix(c1, c2, 0.5) * smoothstep(-0.2, -0.5, q.y) * 0.015;
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float e = 1.0 / res.y;
  vec2 g0 = glass(p);
  vec2 grad = vec2(glass(p + vec2(e, 0.0)).x - g0.x, glass(p + vec2(0.0, e)).x - g0.x) / e;
  float slope = length(grad);
  float water = smoothstep(0.0, 0.3, slope + g0.x * 400.0);
  // the mist: thick where no water has run, a little uneven
  float fog = (1.0 - max(g0.y * 0.85, water)) * (0.8 + 0.2 * noise(p * 4.0));
  // the drops are lenses: they bend the view, the bigger the slope the more
  // (clamped at the rims, where the finite difference jumps)
  vec2 q = p - grad * min(1.0, 3.0 / max(slope, 1e-3)) * (0.015 + g0.x * 1.5);
  // the camera focuses on the glass, so even through the water the street stays a little soft
  // and the drops, little lenses, gather a bit more light than the glass around them
  vec3 col = street(q, max(fog, 0.6)) * (1.0 + water * 0.5);
  // light scattered by the misted glass
  col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))) * 0.8 + mix(c1, c2, 0.5) * 0.015, fog * 0.3);
  // dark rims and a highlight from the lamps in every drop
  vec3 N = normalize(vec3(-grad, 1.0));
  col *= 1.0 - smoothstep(4.0, 9.0, slope) * 0.5;
  float hl = max(dot(N, normalize(vec3(-0.5, 0.6, 1.0))), 0.0);
  col += vec3(1.0, 0.88, 0.75) * (pow(hl, 60.0) * 0.9 + pow(hl, 8.0) * 0.04) * water * (0.5 + high * 0.8 + flash * 1.5);
  // light gathered at the lower edge of each drop
  col += mix(c1, c2, 0.5) * smoothstep(1.5, 4.0, slope) * smoothstep(0.0, -0.5, grad.y / max(slope, 1e-3)) * water * 0.06;
  col += vec3(0.75, 0.8, 1.0) * flash * 0.12;
  col *= 1.0 - smoothstep(0.55, 1.2, length(p)) * 0.5;
  o = vec4(aces(col * 1.6), 1.0);
}`;

export function createRainRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  const edge = beatEdge();
  let clock = 0;
  let slide = 0;
  let period = 0.5;
  let sinceBeat = 9;
  let count = 0;
  let sinceFlash = 99;
  let flashT = 99;
  return createShaderScene(
    canvas,
    {
      name: 'rain',
      fs: RAIN,
      uniforms: ['beats', 'slide', 'flash'],
      scale: 0.8,
      update: (gl, U, f) => {
        const m = f.reduced ? 0.3 : 1;
        sinceBeat += f.dt;
        sinceFlash += f.dt;
        flashT += f.dt;
        // a beat clock: whole numbers on the beats, so drops land in time
        if (edge(f.kick) && !f.reduced) {
          if (sinceBeat > 0.2 && sinceBeat < 2) period += (sinceBeat - period) * 0.3;
          sinceBeat = 0;
          clock = Math.floor(clock) + 1;
          // lightning now and then on a heavy beat
          if ((f.bass > 0.8 && sinceFlash > 14) || ++count % 64 === 0) {
            flashT = 0;
            sinceFlash = 0;
          }
        } else if (sinceBeat > 2) clock += f.dt * 0.6 * m;
        else clock = Math.min(clock + f.dt / period, Math.floor(clock) + 0.999);
        slide += f.dt * (0.45 + f.bass * 0.3) * m;
        const flash = flashT < 1.5 ? Math.exp(-flashT * 9) + (flashT > 0.18 ? 0.7 * Math.exp(-(flashT - 0.18) * 6) : 0) : 0;
        gl.uniform1f(U.beats!, clock);
        gl.uniform1f(U.slide!, slide);
        gl.uniform1f(U.flash!, flash);
      },
    },
    url,
  );
}

/* ------------------------------------------------------------------ */
/* Kaleidoscope                                                        */
/* ------------------------------------------------------------------ */

const KALEIDO = `${SCENE_HEADER}
uniform float segA, segB, angA, angB, mixAB, rot, zoom, wave;
// A kaleidoscope of the cover: the view is folded into a rosette of mirrors and then folded a few times
// more (a small fractal), so the cover breaks into facets like cut glass: bright seams where the mirrors
// meet, every facet tilted its own way and glinting as the light turns, a little colour fringing.
mat2 rot2(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }
struct Fold { vec2 q; float seam; float facet; };
Fold fold(vec2 p, float segs, float ang) {
  Fold f;
  float r = length(p);
  float a = atan(p.y, p.x) + rot;
  float s = 2.0 * PI / segs;
  a = mod(a, s);
  a = abs(a - s * 0.5);
  f.seam = sin(a) * r;
  vec2 q = vec2(cos(a), sin(a)) * r;
  float sc = 1.0;
  f.facet = 0.0;
  for (int i = 0; i < 2; i++) {
    q = rot2(ang * (1.0 + float(i) * 0.6) + sin(t * 0.11 + float(i)) * 0.12) * q;
    f.facet = f.facet * 4.0 + step(0.0, q.x) + step(0.0, q.y) * 2.0;
    q = abs(q);
    f.seam = min(f.seam, min(q.x, q.y) / sc);
    q -= vec2(0.16, 0.1) * zoom;
    q *= 1.4;
    sc *= 1.4;
  }
  f.q = q / sc;
  return f;
}
/** Glass shards (a moving Voronoi mosaic): xy = the shard's centre, z = its id; edge = distance to its border. */
vec3 shards(vec2 q, float dens, float seed, out float edge) {
  vec2 g = q * dens;
  vec2 ip = floor(g);
  vec2 fp = fract(g);
  float d1 = 9.0;
  float d2 = 9.0;
  vec2 best = vec2(0.0);
  vec2 bestC = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 id = ip + o;
      float h = hash(id + seed);
      // the pieces tumble a little, as if the tube were turning
      vec2 c = o + 0.5 + 0.38 * sin(t * (0.15 + h * 0.25) + vec2(h, hash(id + seed + 1.7)) * 6.283);
      float d = length(fp - c);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        best = id;
        bestC = c;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  edge = (d2 - d1) * 0.5 / dens;
  return vec3((ip + bestC) / dens, hash(best + seed * 3.0));
}
vec3 shade(vec2 p, float segs, float ang, float r) {
  Fold f = fold(p, segs, ang);
  vec2 drift = vec2(sin(t * 0.05), cos(t * 0.04)) * 0.15;
  // pieces of coloured glass: each shows the cover round its centre, slightly magnified, colours fringed
  float e;
  vec3 s = shards(f.q, 7.0, segs, e);
  vec2 uv = s.xy * 1.3 + 0.5 + drift + (f.q - s.xy) * 0.7;
  vec2 dir = normalize(f.q - s.xy + 1e-4) * 0.01;
  vec3 c = vec3(coverAt(uv + dir, 1.2).r, coverAt(uv, 1.2).g, coverAt(uv - dir, 1.2).b);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = max(mix(vec3(l), c, 1.5), 0.0);
  // every piece has its band of the spectrum and lights up with it
  float id = s.z;
  c *= 0.6 + id * 0.45 + level(id) * 0.9;
  // tilted pieces catch the turning light in turn
  vec3 n = normalize(vec3((vec2(id, hash1(id * 31.0)) - 0.5) * 0.9, 1.0));
  vec3 L = normalize(vec3(cos(t * 0.4), sin(t * 0.4), 1.2));
  c += mix(c1, c2, id) * pow(max(dot(n, L), 0.0), 30.0) * (0.15 + high * 0.6);
  // dark lead between the pieces, a bright rim just inside
  float px = 1.0 / res.y;
  c *= 0.12 + 0.88 * smoothstep(px * 0.5, px * 2.5, e);
  c += mix(mix(c1, c2, id), vec3(1.0), 0.4) * smoothstep(px * 6.0, px * 2.0, e) * smoothstep(px, px * 2.5, e) * 0.18;
  // round beads rolling over the shards
  vec2 bg = f.q * 11.0 + vec2(t * 0.05, 0.0);
  vec2 bid = floor(bg);
  float bh = hash(bid + segs);
  vec2 bp = fract(bg) - 0.5 - (vec2(bh, hash(bid + 2.3)) - 0.5) * 0.4;
  float br = 0.18 + 0.12 * hash(bid + 5.1);
  float bead = step(0.72, bh) * smoothstep(br, br - px * 14.0, length(bp));
  vec3 bc = mix(c1, c2, hash(bid + 7.7)) * (0.5 + level(bh) * 1.2);
  c = mix(c, bc + vec3(1.0) * pow(max(1.0 - length(bp - vec2(-0.06, 0.06)) / br, 0.0), 6.0) * 0.8, bead * 0.75);
  // the mirror seams
  vec3 seamCol = mix(mix(c1, c2, r * 1.5), vec3(1.0), 0.35);
  c += seamCol * (smoothstep(px * 1.5, 0.0, f.seam) * 0.25 + exp(-f.seam * 120.0) * 0.06) * (0.4 + high * 0.8);
  return c;
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float r = length(p);
  p *= 1.0 - bass * 0.05;
  // a ripple running out from the centre on every beat
  float w = exp(-pow((r - wave * 0.9) * 10.0, 2.0)) * exp(-wave * 2.2);
  p *= 1.0 + w * 0.025;
  vec3 col = shade(p, segB, angB, r);
  if (mixAB < 1.0) col = mix(shade(p, segA, angA, r), col, smoothstep(0.0, 1.0, mixAB));
  col *= 1.0 + w * 0.8;
  // a ring of light round the middle, brighter where the spectrum is
  float ang = abs(fract((atan(p.y, p.x) + rot) / (2.0 * PI) * 2.0) - 0.5) * 2.0;
  float ring = exp(-abs(r - 0.36 - level(ang) * 0.04) * 80.0);
  col += mix(c1, c2, ang) * ring * (0.1 + level(ang) * 0.7);
  // the jewel in the middle, pulsing with the bass
  col += mix(c1, c2, 0.5) * exp(-r * 10.0) * (0.12 + bass * 0.4) + vec3(1.0) * exp(-r * 40.0) * (0.1 + kick * 0.3);
  col *= 1.0 - smoothstep(0.4, 1.0, r) * 0.8;
  o = vec4(aces(col * 1.05), 1.0);
}`;

export function createKaleidoRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  const choices = [6, 8, 5, 10, 7, 12];
  let segA = 6;
  let segB = 6;
  let angA = 0.6;
  let angB = 0.6;
  let mixAB = 1;
  let beats = 0;
  let rot = 0;
  let wave = 9;
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const edge = beatEdge();
  return createShaderScene(
    canvas,
    {
      name: 'kaleido',
      fs: KALEIDO,
      uniforms: ['segA', 'segB', 'angA', 'angB', 'mixAB', 'rot', 'zoom', 'wave'],
      update: (gl, U, f) => {
        wave += f.dt;
        if (edge(f.kick) && !f.reduced) {
          wave = 0;
          // every 8 beats the kaleidoscope is turned to a new pattern, cross-fading over a second
          if (++beats % 8 === 0) {
            segA = segB;
            angA = angB;
            segB = choices[(beats / 8) % choices.length]!;
            angB = 0.25 + rnd() * 1.1;
            mixAB = 0;
          }
        }
        mixAB = Math.min(1, mixAB + f.dt);
        rot += f.dt * (0.06 + f.bass * 0.3) * (f.reduced ? 0.2 : 1);
        gl.uniform1f(U.segA!, segA);
        gl.uniform1f(U.segB!, segB);
        gl.uniform1f(U.angA!, angA);
        gl.uniform1f(U.angB!, angB);
        gl.uniform1f(U.mixAB!, mixAB);
        gl.uniform1f(U.rot!, rot);
        gl.uniform1f(U.zoom!, 1 + Math.sin(f.t * 0.13) * 0.3);
        gl.uniform1f(U.wave!, f.reduced ? 9 : wave);
      },
    },
    url,
  );
}

/* ------------------------------------------------------------------ */
/* Night ocean                                                         */
/* ------------------------------------------------------------------ */

const OCEAN = `${SCENE_HEADER}
uniform float travel, H, chop, glow;
// The open sea at night. The water is a sum of sharp-crested waves (exp of a sine) in directions spread by
// the golden angle, each pulling the next towards its crests so they bunch up like real swell; the swell
// grows with the bass and the chop with the treble. A big moon lays a glittering path on the water,
// clouds drift past it, an aurora in the cover's colours ripples with the spectrum, and the crests light up
// with bioluminescence on the beat.
const vec3 MOON = vec3(0.1478, 0.1971, 0.9692);
float waves(vec2 p, int n) {
  float freq = 1.0;
  float amp = 1.0;
  float speed = 1.0;
  float ang = 0.4;
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = 0; i < 26; i++) {
    if (i >= n) break;
    vec2 d = vec2(sin(ang), cos(ang));
    float x = dot(d, p) * freq + travel * speed;
    float w = exp(sin(x) - 1.0);
    p -= d * w * cos(x) * amp * 0.3;
    float a = amp * (i < 5 ? 1.0 : chop);
    sum += w * a;
    wsum += a;
    amp *= 0.8;
    freq *= 1.19;
    speed *= 1.07;
    ang += 2.39996;
  }
  return sum / wsum;
}
float sea(vec2 xz, int n) { return (waves(xz * 0.3, n) - 1.0) * H; }
vec3 skyCol(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 c = mix(vec3(0.025, 0.035, 0.07) + mix(c1, c2, 0.5) * 0.04, vec3(0.002, 0.004, 0.012), pow(y, 0.4));
  float md = dot(d, MOON);
  // moonlit haze over the horizon
  c += mix(vec3(0.05, 0.06, 0.09), mix(c1, c2, 0.5) * 0.08, 0.4) * exp(-y * 25.0) * (0.5 + 0.5 * pow(max(dot(normalize(d.xz), normalize(MOON.xz)), 0.0), 4.0));
  // stars, twinkling with the treble
  vec2 sg = vec2(atan(d.x, d.z), d.y) * 160.0;
  vec2 sid = floor(sg);
  float sh = hash(sid);
  c += vec3(0.8, 0.85, 1.0) * step(0.993, sh) * smoothstep(0.35, 0.0, length(fract(sg) - 0.5)) * smoothstep(0.02, 0.2, y) * (0.4 + 0.6 * sin(t * 3.0 + sh * 50.0) * high + 0.3);
  // an aurora low over the sea: curtains in the cover's colours, brighter where the spectrum is
  float az = atan(d.x, d.z);
  if (y > 0.005 && y < 0.6) {
    float x = az * 2.5 + t * 0.02;
    float h0 = 0.05 + fbm(vec2(x * 1.5, t * 0.04)) * 0.08;
    float rays = 0.7 + 0.3 * sin(x * 30.0 + fbm(vec2(x * 4.0, t * 0.12)) * 14.0);
    float band = smoothstep(h0 - 0.012, h0 + 0.008, y) * exp(-(y - h0) * 11.0);
    // only some stretches of the sky have curtains, and they come and go
    float mask = smoothstep(0.3, 0.55, fbm(vec2(az * 1.2 + t * 0.015, t * 0.02)));
    float v = level(clamp(az / 2.4 + 0.5, 0.0, 1.0));
    c += mix(c2, c1, smoothstep(h0, h0 + 0.15, y)) * band * rays * mask * (0.06 + v * 0.6);
  }
  // the moon: a disc with darker seas, and its halo
  vec3 mu = normalize(cross(MOON, vec3(0.0, 1.0, 0.0)));
  vec3 mv = cross(mu, MOON);
  vec2 mp = vec2(dot(d, mu), dot(d, mv)) / 0.024;
  float disc = smoothstep(1.0, 0.96, length(mp)) * step(0.0, md);
  float maria = smoothstep(0.45, 0.7, fbm(mp * 1.6 + 3.0));
  c += vec3(1.0, 0.97, 0.9) * disc * (2.4 - maria * 0.9);
  c += mix(vec3(0.65, 0.72, 1.0), c2, 0.2) * (pow(max(md, 0.0), 2000.0) * 0.6 + pow(max(md, 0.0), 60.0) * 0.07);
  // thin clouds drifting past, their edges silvered by the moon
  if (d.y > 0.0) {
    vec2 cuv = d.xz / (d.y + 0.06) * 0.7 + vec2(t * 0.012, t * 0.004);
    float dens = smoothstep(0.5, 0.85, fbm(cuv)) * smoothstep(0.03, 0.2, d.y);
    float lit = pow(max(md, 0.0), 25.0);
    vec3 cc = c * 0.5 + vec3(0.03, 0.035, 0.055) + vec3(0.55, 0.6, 0.7) * lit * 0.5 + mix(c1, c2, 0.5) * 0.015;
    c = mix(c, cc, dens * 0.8);
  }
  return c;
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  // the camera rides the swell a little
  float roll = sin(t * 0.4) * 0.015 * (1.0 + bass);
  p = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * p;
  vec3 ro = vec3(0.0, 2.2 + sin(t * 0.55) * 0.12 * (0.6 + bass), 0.0);
  vec3 rd = normalize(vec3(p.x, p.y - 0.1, 1.5));
  vec3 col;
  if (rd.y >= 0.0) {
    col = skyCol(rd);
  } else {
    // into the slab of water between y = 0 and y = -H, stepping by the gap above the waves
    float tt = (0.0 - ro.y) / rd.y;
    float tEnd = min((-H - ro.y) / rd.y, 400.0);
    vec3 pos = ro + rd * tt;
    for (int i = 0; i < 48; i++) {
      pos = ro + rd * tt;
      float gap = pos.y - sea(pos.xz, 8);
      if (gap < 0.002 * tt || tt >= tEnd) break;
      tt = min(tt + clamp(gap / -rd.y * 0.55, 0.01, 25.0), tEnd);
    }
    pos = ro + rd * tt;
    // the normal, with fewer waves and a wider step in the distance (no shimmer)
    int n = tt < 25.0 ? 24 : tt < 80.0 ? 16 : 10;
    float e = 0.015 + tt * 0.0015;
    float h = sea(pos.xz, n);
    vec3 nn = normalize(vec3(h - sea(pos.xz + vec2(e, 0.0), n), e, h - sea(pos.xz + vec2(0.0, e), n)));
    nn = normalize(mix(nn, vec3(0.0, 1.0, 0.0), smoothstep(80.0, 400.0, tt)));
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nn, -rd), 0.0), 5.0);
    vec3 rdir = reflect(rd, nn);
    rdir.y = abs(rdir.y);
    vec3 refl = skyCol(rdir);
    // light through the crests (green-blue), the deep water dark
    // how high on the wave (0 trough … 1 the highest crests)
    float hn = smoothstep(0.15, 0.7, (h / H + 1.0 - 0.135) / 0.865);
    float toMoon = max(dot(normalize(rd.xz), normalize(MOON.xz)), 0.0);
    vec3 deep = vec3(0.002, 0.007, 0.015) + mix(c1, c2, 0.3) * 0.006;
    vec3 scatter = mix(vec3(0.03, 0.16, 0.18), c2 * 0.2, 0.35) * pow(hn, 2.5) * (0.3 + 0.7 * toMoon);
    col = mix(deep + scatter, refl, fres);
    // a faint sheen where the waves face the moon, so their shapes read in the dark
    col += vec3(0.5, 0.6, 0.8) * pow(max(dot(nn, MOON), 0.0), 3.0) * 0.012;
    // the moon's glitter path, sharper and stronger than the reflected disc alone, and wider glints round it
    float gl = max(dot(rdir, MOON), 0.0);
    col += vec3(1.0, 0.95, 0.85) * (pow(gl, 1500.0) * 6.0 + pow(gl, 120.0) * 0.12) * (0.6 + high);
    // bioluminescence on the crests, lighting up on the beat; sparks of plankton near the boat
    float crest = smoothstep(0.65, 1.0, hn) * smoothstep(0.35, 0.75, noise(pos.xz * 0.7 + travel * 0.6));
    float plankton = step(0.992, hash(floor(pos.xz * 6.0))) * smoothstep(0.4, 0.9, hn);
    vec3 bio = mix(c1, c2, noise(pos.xz * 0.08));
    col += bio * (crest * (0.03 + glow * 0.7) + plankton * glow * 1.5) * exp(-tt * 0.025);
    col = mix(col, skyCol(normalize(vec3(rd.x, 0.001, rd.z))) * 0.9, 1.0 - exp(-tt * 0.006));
  }
  col *= 1.0 - smoothstep(0.55, 1.3, length(p)) * 0.5;
  o = vec4(aces(col * 1.5), 1.0);
}`;

export function createOceanRenderer(canvas: HTMLCanvasElement, url: Url): Renderer | null {
  let travel = 0;
  let swell = 0.4;
  let chop = 0.6;
  return createShaderScene(
    canvas,
    {
      name: 'ocean',
      fs: OCEAN,
      uniforms: ['travel', 'H', 'chop', 'glow'],
      scale: 0.7,
      update: (gl, U, f) => {
        const m = f.reduced ? 0.3 : 1;
        travel += f.dt * (0.8 + f.bass * 0.5) * m;
        // the swell follows the bass, the chop the treble, both smoothed
        const k = Math.min(1, f.dt * 2);
        swell += ((0.3 + f.bass * 0.9) * m - swell) * k;
        chop += (0.5 + sampleBand(f.levels, 0.7) * 1.2 - chop) * k;
        gl.uniform1f(U.travel!, travel);
        gl.uniform1f(U.H!, 0.45 + swell * 0.9);
        gl.uniform1f(U.chop!, chop);
        gl.uniform1f(U.glow!, (f.reduced ? 0 : f.kick) * (0.4 + f.bass * 0.8));
      },
    },
    url,
  );
}

function sampleBand(levels: Float32Array, x: number): number {
  const n = levels.length;
  if (!n) return 0;
  const p = Math.max(0, Math.min(1, x)) * (n - 1);
  const i = Math.floor(p);
  return (levels[i] ?? 0) + ((levels[Math.min(n - 1, i + 1)] ?? 0) - (levels[i] ?? 0)) * (p - i);
}

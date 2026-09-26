// Double-precision vector helpers. Physics runs in float64 JS numbers; only camera-relative
// offsets are handed to three.js, which keeps the GPU precise near the player.
export const G = 6.674e-11;
export const AU = 1.495978707e11;
export const LY = 9.4607e15;
export const DAY = 86400;
export const YEAR = 365.25 * DAY;
export const C_LIGHT = 299792458;
export const G0 = 9.80665;
export const DEG = Math.PI / 180;

export class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) { const x = this.y * v.z - this.z * v.y, y = this.z * v.x - this.x * v.z, z = this.x * v.y - this.y * v.x; this.x = x; this.y = y; this.z = z; return this; }
  len() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  len2() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  norm() { const l = this.len() || 1; return this.scale(1 / l); }
  dist(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  applyQuat(q) { // three-style quaternion {x,y,z,w}
    const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + qy * tz - qz * ty; this.y = y + qw * ty + qz * tx - qx * tz; this.z = z + qw * tz + qx * ty - qy * tx; return this;
  }
  toArray() { return [this.x, this.y, this.z]; }
  static from(a) { return new V3(a[0], a[1], a[2]); }
}
export const v3 = (x, y, z) => new V3(x, y, z);
export const sub = (a, b) => new V3(a.x - b.x, a.y - b.y, a.z - b.z);
export const add = (a, b) => new V3(a.x + b.x, a.y + b.y, a.z + b.z);
export const cross = (a, b) => a.clone().cross(b);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Seeded RNG (mulberry32) + string hashing for deterministic procedural content.
export function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.gauss = () => { let u = 0, v = 0; while (u === 0) u = f(); v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return f;
}
export function hash3(x, y, z, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0;
}

export function fmtDist(m) {
  const a = Math.abs(m);
  if (a < 1e3) return m.toFixed(0) + ' m';
  if (a < 1e6) return (m / 1e3).toFixed(1) + ' km';
  if (a < 1e9) return (m / 1e6).toFixed(2) + ' Mm';
  if (a < 0.05 * LY) return (m / AU).toFixed(3) + ' AU';
  return (m / LY).toFixed(3) + ' ly';
}
export function fmtSpeed(v) { const a = Math.abs(v); if (a < 1e4) return v.toFixed(1) + ' m/s'; if (a < 0.01 * C_LIGHT) return (v / 1e3).toFixed(2) + ' km/s'; return (v / C_LIGHT).toFixed(4) + ' c'; }
export function fmtTime(s) {
  if (!isFinite(s)) return '∞';
  const neg = s < 0; s = Math.abs(s);
  const y = Math.floor(s / YEAR); s -= y * YEAR;
  const d = Math.floor(s / DAY); s -= d * DAY;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); const sec = Math.floor(s - m * 60);
  let out = '';
  if (y) out += y + 'y ';
  if (y || d) out += d + 'd ';
  out += String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  return (neg ? 'T-' : '') + out;
}
export function fmtMass(t) { return t < 1 ? (t * 1000).toFixed(0) + ' kg' : t.toFixed(2) + ' t'; }

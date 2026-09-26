// Procedural Milky Way: a density model (bulge + exponential disc + 4 logarithmic arms) and a
// hierarchical sector scheme that deterministically generates every star on demand.
import { rng, hash3 } from '../core/math.js';
import { REAL_STARS, SUN_GALPOS } from '../data/stars.js';
import { makeName } from './systemgen.js';

export const GALAXY_RADIUS = 52000; // ly
const R0 = Math.hypot(SUN_GALPOS[0], SUN_GALPOS[2]);
const PITCH = 12.5 * Math.PI / 180;

function armFactor(x, z) {
  const R = Math.hypot(x, z) + 1;
  const th = Math.atan2(z, x);
  let best = 1e9;
  for (let k = 0; k < 4; k++) {
    const armTh = Math.log(R / 4000) / Math.tan(PITCH) + k * Math.PI / 2;
    let d = ((th - armTh) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    best = Math.min(best, Math.abs(d) * R);
  }
  return 0.35 + 1.4 * Math.exp(-(best * best) / (2 * 1400 * 1400));
}
// relative stellar density (1 at the Sun)
export function density(x, y, z) {
  const R = Math.hypot(x, z), r = Math.hypot(x, y, z);
  const disc = Math.exp(-(R - R0) / 11400) * Math.exp(-Math.abs(y) / 1000) * armFactor(x, z) / armFactor(SUN_GALPOS[0], SUN_GALPOS[2]);
  const thick = 0.12 * Math.exp(-(R - R0) / 11400) * Math.exp(-Math.abs(y) / 3000);
  const bulge = 30 * Math.exp(-Math.pow(r / 2500, 1.2)) * (Math.abs(x * 0.5 + z * 0.87) < 3000 + 5000 * Math.exp(-r / 3000) ? 1.5 : 1);
  const halo = 0.002 * Math.pow(1 + r / R0, -3.5);
  return R > GALAXY_RADIUS * 1.2 ? halo : disc + thick + bulge + halo;
}

// Spectral classes: [class, fraction of all stars, level, temp range, mass range, lum fn]
const CLASSES = [
  { c: 'M', f: 0.73, lvl: 0, T: [2400, 3900], m: [0.08, 0.55] },
  { c: 'K', f: 0.12, lvl: 0, T: [3900, 5300], m: [0.55, 0.85] },
  { c: 'G', f: 0.076, lvl: 0, T: [5300, 6000], m: [0.85, 1.1] },
  { c: 'D', f: 0.05, lvl: 0, T: [5000, 40000], m: [0.5, 1.2], wd: true },
  { c: 'L', f: 0.06, lvl: 0, T: [700, 2200], m: [0.02, 0.075], bd: true },
  { c: 'F', f: 0.03, lvl: 1, T: [6000, 7500], m: [1.1, 1.6] },
  { c: 'K III', f: 0.004, lvl: 1, T: [3800, 4800], m: [1, 3], giant: true },
  { c: 'A', f: 0.006, lvl: 2, T: [7500, 10000], m: [1.6, 2.4] },
  { c: 'M III', f: 0.0015, lvl: 2, T: [3200, 3800], m: [1, 4], giant: true },
  { c: 'B', f: 0.0013, lvl: 3, T: [10000, 30000], m: [2.4, 16] },
  { c: 'O', f: 0.00003, lvl: 3, T: [30000, 50000], m: [16, 60] },
  { c: 'I', f: 0.00004, lvl: 3, T: [3500, 20000], m: [10, 25], supergiant: true },
];
export const LEVELS = [{ size: 20 }, { size: 80 }, { size: 320 }, { size: 1280 }];
const LEVEL_FRAC = LEVELS.map((_, l) => CLASSES.filter(k => k.lvl === l).reduce((s, k) => s + k.f, 0));
const BASE_DENSITY = 0.004; // stars per ly^3 near the Sun

function starFromClass(k, r) {
  const t = r();
  const mass = k.m[0] + (k.m[1] - k.m[0]) * t;
  let temp = k.T[0] + (k.T[1] - k.T[0]) * (k.giant || k.supergiant ? r() : t);
  let radius, lum;
  if (k.wd) { radius = 0.008 + r() * 0.006; lum = radius * radius * Math.pow(temp / 5772, 4); }
  else if (k.bd) { radius = 0.09 + r() * 0.03; lum = radius * radius * Math.pow(temp / 5772, 4); }
  else if (k.supergiant) { radius = 30 + r() * 800; lum = radius * radius * Math.pow(temp / 5772, 4); }
  else if (k.giant) { radius = 8 + r() * (k.c === 'M III' ? 150 : 40); lum = radius * radius * Math.pow(temp / 5772, 4); }
  else { lum = Math.pow(mass, mass < 0.43 ? 2.3 : mass < 2 ? 4 : 3.5) * (mass < 0.43 ? 0.23 : 1); radius = Math.pow(mass, 0.8); temp = 5772 * Math.pow(lum / (radius * radius), 0.25); }
  return { spec: k.c + (k.giant || k.supergiant || k.wd || k.bd ? '' : String(Math.floor(r() * 10)) + 'V'), mass, radius, temp, lum, whiteDwarf: !!k.wd, brownDwarf: !!k.bd };
}

const cellCache = new Map();
export function cellStars(level, ix, iy, iz) {
  const key = level + ':' + ix + ':' + iy + ':' + iz;
  let c = cellCache.get(key); if (c) return c;
  const S = LEVELS[level].size;
  const cx = (ix + 0.5) * S, cy = (iy + 0.5) * S, cz = (iz + 0.5) * S;
  const r = rng(hash3(ix, iy, iz, level * 7919 + 17));
  const rho = density(cx, cy, cz);
  const expected = BASE_DENSITY * S * S * S * rho * LEVEL_FRAC[level];
  // Poisson-ish count
  let n = Math.floor(expected); if (r() < expected - n) n++;
  n = Math.min(n, 4000);
  const cls = CLASSES.filter(k => k.lvl === level);
  const tot = cls.reduce((s, k) => s + k.f, 0);
  const stars = [];
  for (let i = 0; i < n; i++) {
    const x = ix * S + r() * S, y = iy * S + r() * S, z = iz * S + r() * S;
    // rejection against density gradient inside the cell (cheap)
    if (level < 2 && density(x, y, z) < rho * r() * 0.8) continue;
    if (Math.hypot(x - SUN_GALPOS[0], y - SUN_GALPOS[1], z - SUN_GALPOS[2]) < (level === 0 ? 22 : 30)) continue; // real neighbourhood
    let u = r() * tot, k = cls[0]; for (const q of cls) { if (u < q.f) { k = q; break; } u -= q.f; }
    const sr = rng(hash3(ix, iy, iz, level * 1000003 + i));
    const st = starFromClass(k, sr);
    const bright = st.lum > 50 || k.lvl >= 2;
    const name = bright ? makeName(sr) + (sr() < 0.5 ? ' ' + ['Majoris', 'Minoris', 'Prime', 'Borealis', 'Australis'][Math.floor(sr() * 5)] : '') : `BSC ${String(Math.abs(ix * 7 + iz * 13 + iy) % 9000 + 1000)}-${level}${String(i).padStart(3, '0')}`;
    stars.push({ id: `p:${level}:${ix}:${iy}:${iz}:${i}`, name, pos: [x, y, z], ...st });
  }
  c = stars; cellCache.set(key, c);
  if (cellCache.size > 6000) cellCache.delete(cellCache.keys().next().value);
  return c;
}

// Stars around a point up to a given radius, gathered from the appropriate levels.
export function starsNear(p, maxLevel = 3, radiusCells = 2) {
  const out = [];
  for (let l = 0; l <= maxLevel; l++) {
    const S = LEVELS[l].size;
    const ix = Math.floor(p[0] / S), iy = Math.floor(p[1] / S), iz = Math.floor(p[2] / S);
    const rc = radiusCells;
    for (let dx = -rc; dx <= rc; dx++) for (let dy = -rc; dy <= rc; dy++) for (let dz = -rc; dz <= rc; dz++) {
      if (dx * dx + dy * dy + dz * dz > (rc + 0.5) ** 2) continue;
      const cs = cellStars(l, ix + dx, iy + dy, iz + dz);
      for (const s of cs) out.push(s);
    }
  }
  return out;
}

export function starById(id) {
  if (id === 'sol') return SOL;
  if (id.startsWith('real:')) return REAL_STARS[+id.slice(5)];
  const [, l, x, y, z, i] = id.split(':').map(Number);
  return cellStars(l, x, y, z).find(s => s.id === id);
}
export const SOL = { id: 'sol', name: 'Sun', pos: SUN_GALPOS, spec: 'G2V', mass: 1, radius: 1, temp: 5772, lum: 1, real: true, sol: true };
export function allRealStars() { return [SOL, ...REAL_STARS]; }

// Galaxy-scale particle cloud for the far view
export function galaxyParticles(count = 160000, seed = 42) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
  let n = 0;
  while (n < count) {
    const bulge = r() < 0.18;
    let x, y, z;
    if (bulge) {
      const rr = -Math.log(1 - r()) * 2200, th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1);
      x = rr * Math.sin(ph) * Math.cos(th) * 1.6; z = rr * Math.sin(ph) * Math.sin(th) * 0.8; y = rr * Math.cos(ph) * 0.55;
      const c = x * 0.5 - z * 0.87, s = x * 0.87 + z * 0.5; x = c; z = s; // bar orientation
    } else {
      const R = -Math.log(1 - r()) * 11000 + 1500; if (R > GALAXY_RADIUS) continue;
      const th = r() * Math.PI * 2; x = R * Math.cos(th); z = R * Math.sin(th);
      if (r() > armFactor(x, z) / 1.75) continue;
      y = (r() - 0.5) * 2 * (-Math.log(1 - r()) * 350);
    }
    const i = n * 3;
    pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
    const arm = bulge ? 0 : armFactor(x, z);
    const young = !bulge && arm > 1.2 && r() < 0.5;
    const dust = !bulge && arm > 1.1 && r() < 0.15 && Math.abs(y) < 200;
    if (dust) { col[i] = -0.35; col[i + 1] = -0.3; col[i + 2] = -0.25; size[n] = 1.8 + r() * 2; }
    else if (young) { col[i] = 0.55 + r() * 0.2; col[i + 1] = 0.7 + r() * 0.2; col[i + 2] = 1.0; size[n] = 0.6 + r() * 1.6; if (r() < 0.05) { col[i] = 1.0; col[i + 1] = 0.45; col[i + 2] = 0.6; size[n] = 2.5; } }
    else { const w = bulge ? 0.8 : 0.9; col[i] = 1.0; col[i + 1] = 0.82 * w + 0.1; col[i + 2] = 0.6 * w; size[n] = 0.5 + r() * 1.2; }
    n++;
  }
  return { pos, col, size };
}

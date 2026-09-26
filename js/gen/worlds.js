// World bakes: equirectangular height (metres) + albedo (+ cloud coverage) for every body that has
// no real imagery. Runs inside js/workers/bakeWorker.js.
//   moons / icy bodies  -> Kalileo lunar pipeline (crater saturation, maria & basins, rayed craters)
//   Vesta-class rocks   -> GaeaButBetter "vesta" preset library (pre-baked offline, recoloured)
//   terrestrial worlds  -> World-Crucible-style plate tectonics + hydraulic erosion + drainage
//                          canyons + climate biomes + rivers (Kalileo), extended with plate motion
//                          (convergent / divergent / transform), hotspot chains and signature
//                          features so no two planets look alike.
// Map layout: row 0 = north, column 0 = longitude -180°.
import { Simplex3, mulberry32 } from './kalileo/noise.js';
import { applyCraterSaturation, stampYoungCraters, applyLunarRelief, applyLunarAlbedo, LUNAR_DEFAULTS } from './kalileo/lunarsurface.js';
import { applyMaria, applyMariaAlbedo, MARIA_DEFAULTS } from './kalileo/maria.js';
import { stampCrater } from './kalileo/craters.js';
import { hydraulicErode, carveCanyons, thermalErode } from './kalileo/terrain.js';
import { buildTerrestrialColor, percentileSeaField } from './kalileo/terrestrial.js';
import { buildCloudStack } from './kalileo/cloudstack.js';

export const BAKE_VERSION = 7;
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const tick = () => new Promise((r) => setTimeout(r, 0));

function forEachDir(w, h, fn) {
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * TAU - Math.PI;
      fn(y * w + x, cl * Math.cos(lon), sl, -cl * Math.sin(lon), lat, lon, x, y);
    }
  }
}
function randDir(rng) { let x, y, z, l; do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; l = x * x + y * y + z * z; } while (l < 1e-4 || l > 1); l = Math.sqrt(l); return [x / l, y / l, z / l]; }
// Kalileo's crater/maria code uses lon 0..2π from column 0; our column 0 is -π, so shift.
const toKLon = (lon) => ((lon + Math.PI) % TAU + TAU) % TAU;

// Stamp a cone (volcano) or pit onto a field, in map space (radius alpha in radians).
function stampCone(f, w, h, lat, lon, alpha, height, caldera = 0.12, shape = 1.6) {
  const cy = (0.5 - lat / Math.PI) * h;
  const ry = Math.ceil(alpha / Math.PI * h) + 1;
  const cosL = Math.max(0.05, Math.cos(lat));
  const rx = Math.ceil(alpha / TAU * w / cosL) + 1, cx = (lon + Math.PI) / TAU * w;
  const sL = Math.sin(lat), cL = Math.cos(lat);
  for (let yy = Math.max(0, Math.floor(cy - ry)); yy <= Math.min(h - 1, Math.ceil(cy + ry)); yy++) {
    const la = (0.5 - (yy + 0.5) / h) * Math.PI, sl = Math.sin(la), cl = Math.cos(la);
    for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
      const lo = ((xx + 0.5) / w) * TAU - Math.PI;
      const c = sl * sL + cl * cL * Math.cos(lo - lon);
      const d = Math.acos(Math.max(-1, Math.min(1, c))) / alpha;
      if (d >= 1) continue;
      let v = height * Math.pow(1 - d, shape);
      if (d < caldera) v -= height * 0.18 * (1 - d / caldera);
      f[yy * w + ((xx % w) + w) % w] += v;
    }
  }
}
function normalize(field) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < field.length; i++) { const v = field[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const s = Math.max(1e-9, mx - mn);
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - mn) / s;
}
function flipRows(rgba, w, h, ch = 4) {
  const out = new Uint8ClampedArray(rgba.length), row = w * ch;
  for (let y = 0; y < h; y++) out.set(rgba.subarray(y * row, y * row + row), (h - 1 - y) * row);
  return out;
}
const hex = (c) => '#' + c.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('');

// ================================================================= moons & icy bodies (Kalileo)
async function bakeMoon(p, report) {
  const { w, h, R, seed } = p;
  const rng = mulberry32(seed * 7919 + 13);
  const icy = p.recipe === 'icy';
  const pal = p.colors || { low: [0.3, 0.3, 0.3], mid: [0.5, 0.5, 0.5], high: [0.7, 0.7, 0.7] };
  const D = icy ? Math.min(9000, Math.max(900, R * 0.005)) : Math.min(16000, Math.max(1500, R * 0.009));
  const features = [];
  const sim = new Simplex3(seed + 1), sim2 = new Simplex3(seed + 2);
  const age = rng();
  const dicho = rng() < 0.45 ? 0.04 + rng() * 0.08 : 0, dd = randDir(rng);
  if (dicho) features.push('Hemispheric dichotomy');
  const field = new Float32Array(w * h);
  report('Laying down the ancient crust', 0.05);
  forEachDir(w, h, (i, x, y, z) => {
    let v = 0.5 + 0.07 * sim.fbm(x * 1.1, y * 1.1, z * 1.1, { octaves: 3 });
    const hm = sim.fbm(x * 4 + 3, y * 4, z * 4, { octaves: 6 });                 // hybrid multifractal crust
    v += 0.045 * hm * (0.6 + 0.4 * sstep(-0.3, 0.5, hm));
    v += 0.02 * sim2.fbm(x * 12, y * 12, z * 12, { octaves: 4, ridged: true });
    if (dicho) v += dicho * Math.tanh((x * dd[0] + y * dd[1] + z * dd[2]) * 3);
    field[i] = v;
  });
  // How battered vs. how alive: dead crusts are saturated with craters; geologically active worlds were
  // resurfaced (lava / cryolava plains) and show mountains, volcanoes, rilles, grooves and lineae instead.
  const rg = mulberry32(seed * 104729 + 71);
  const craterAmt = clamp01(p.craters ?? (0.25 + 0.75 * rg()));
  const act = clamp01(1 - craterAmt + (p.volcanic || 0) * 0.5 + (p.cracks || 0) * 0.25 + (p.grooves || 0) * 0.3);
  const sim3 = new Simplex3(seed + 31), sim4 = new Simplex3(seed + 32);
  report('Raising mountains and hills', 0.1);
  // mountain belts along a few great circles (compressional ranges), plus rolling hills everywhere
  const belts = []; const nBelts = act > 0.25 ? 1 + Math.floor(rg() * 3) : rg() < 0.4 ? 1 : 0;
  for (let k = 0; k < nBelts; k++) { const a = randDir(rg), b = randDir(rg); const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const nl = Math.hypot(...n); belts.push({ n: n.map(v => v / nl), a, w: 0.08 + rg() * 0.12, len: 0.3 + rg() * 0.9, hgt: (0.03 + rg() * 0.05) * (0.4 + act) }); }
  const hillAmp = 0.012 + 0.02 * act;
  forEachDir(w, h, (i, x, y, z) => {
    let add = hillAmp * sim3.fbm(x * 9, y * 9, z * 9, { octaves: 5 });
    for (const B of belts) {
      const d = x * B.n[0] + y * B.n[1] + z * B.n[2]; const al = x * B.a[0] + y * B.a[1] + z * B.a[2]; if (al < 1 - B.len * 2) continue;
      const wd = B.w * (0.7 + 0.5 * sim4.noise(x * 3, y * 3, z * 3));
      const m = Math.exp(-(d * d) / (wd * wd)) * sstep(1 - B.len * 2, 1 - B.len * 1.2, al);
      if (m > 0.01) add += B.hgt * m * Math.pow(Math.max(0, sim4.fbm(x * 14, y * 14, z * 14, { octaves: 6, ridged: true })), 1.5);
    }
    field[i] += add;
  });
  if (nBelts) features.push(nBelts > 1 ? 'Mountain belts' : 'A great mountain range');
  // volcanoes / cryovolcanic domes on active worlds
  const nVolc = act > 0.35 ? Math.floor(act * (icy ? 4 : 9) * (0.5 + rg())) : 0;
  for (let k = 0; k < nVolc; k++) { const lat = Math.asin(rg() * 1.6 - 0.8), lon = rg() * TAU - Math.PI; stampCone(field, w, h, lat, lon, 0.03 + rg() * 0.09, (icy ? 0.02 : 0.05) * (0.5 + rg()), 0.1 + rg() * 0.12, icy ? 1.0 : 1.6); }
  if (nVolc) features.push(icy ? 'Cryovolcanic domes' : nVolc > 4 ? 'Shield volcano provinces' : 'Shield volcanoes');
  const preCrater = Float32Array.from(field);
  const baseField = preCrater; // colour follows the terrain, not the craters (crater floors are not darker)
  await tick();
  report(craterAmt > 0.5 ? 'Heavy bombardment (crater saturation)' : 'Light cratering', 0.15);
  const lunarO = { ...LUNAR_DEFAULTS, seed: seed + 3, saturation: (0.3 + 0.65 * age) * craterAmt, saturationLargest: 3 + rng() * 6,
    youngCraters: Math.round((3 + rng() * 12) * (0.2 + 0.8 * craterAmt)), rayBrightness: icy ? 0.35 : 0.5 + rng() * 0.3, specks: Math.round(18000 * (w / 1024) ** 2 * craterAmt),
    mottling: 0.2 + rng() * 0.2, rayColor: icy ? '#f4f8ff' : '#e8e4dc', reliefTone: 0.16, heightTone: 0.1, slopeTone: 0.22 };
  applyCraterSaturation(field, w, h, lunarO, R, D);
  await tick();
  // giant impact basins (South Pole-Aitken / Hellas / Herschel-class)
  const nGiant = rng() < 0.55 * (0.2 + 0.8 * craterAmt) ? 1 + Math.floor(rng() * 2) : 0;
  for (let k = 0; k < nGiant; k++) {
    const lat = Math.asin(rng() * 2 - 1), lon = rng() * TAU - Math.PI, alpha = 0.18 + rng() * 0.35;
    stampCrater(field, w, h, { latC: lat, lonC: toKLon(lon), alpha, depth: 0.22 * (0.6 + rng() * 0.6), rimH: 0.05, rimW: 0.3, floor: 0.5, ejecta: 0.6, carve: true, peak: 0, terrace: 0.4, floorRoughness: 0.3, seedSalt: seed + k });
    features.push(k === 0 ? 'Giant impact basin' : 'Second giant basin');
  }
  // maria / cryovolcanic plains
  let mask = null, mOpts = null;
  const doMaria = !icy ? (R > 250e3 && rng() < 0.6) : (rng() < 0.4);
  if (doMaria) {
    report(icy ? 'Flooding cryovolcanic plains' : 'Flooding basins with mare basalt', 0.35);
    mOpts = { ...MARIA_DEFAULTS, enabled: true, seed: seed + 5, count: 2 + Math.floor(rng() * 10), hemisphereBias: rng() * 0.95, biasLongitude: rng() * 360 - 180,
      oceanus: rng() < 0.35 ? rng() * 0.7 : 0, fill: 0.55 + rng() * 0.4, irregularity: 0.15 + rng() * 0.3,
      color: icy ? hex([Math.min(1, pal.high[0] * 1.05), Math.min(1, pal.high[1] * 1.05), Math.min(1, pal.high[2] * 1.08)]) : hex([pal.low[0] * 0.55, pal.low[1] * 0.55, pal.low[2] * 0.58]),
      darkness: icy ? 0.6 : 0.92 };
    const res = applyMaria(field, preCrater, w, h, mOpts, R, D);
    mask = res.mask;
    features.push(icy ? 'Smooth cryovolcanic plains' : (mOpts.oceanus > 0.3 ? 'Vast mare ocean' : 'Dark maria'));
  }
  await tick();
  report('Young rayed craters', 0.5);
  stampYoungCraters(field, w, h, lunarO, R, D, null);
  if (lunarO.youngCraters > 0) features.push('Rayed craters');
  // resurfacing: young plains flood part of the old crust and erase its craters
  let resurf = null;
  if (act > 0.2) {
    report(icy ? 'Cryovolcanic resurfacing' : 'Lava plains resurfacing', 0.55);
    resurf = new Float32Array(w * h);
    const cover = 0.15 + 0.7 * act, thr = 0.35 - cover * 0.7;
    forEachDir(w, h, (i, x, y, z) => {
      const u = sim3.fbm(x * 1.8 + 7, y * 1.8, z * 1.8, { octaves: 5 }) + 0.12 * sim4.noise(x * 9, y * 9, z * 9);
      const m = sstep(thr, thr + 0.12, u); if (m <= 0) return;
      resurf[i] = m;
      // fresh plains sit on the smoothed old surface; wrinkle ridges (rocky) or grooves (icy) on top
      let plain = preCrater[i] - 0.004;
      if (!icy) plain += 0.006 * Math.pow(1 - Math.abs(sim4.noise(x * 16, y * 16, z * 16)), 10);
      field[i] = mix(field[i], plain, m * 0.92);
    });
    features.push(icy ? 'Smooth resurfaced ice plains' : 'Young volcanic plains');
  }
  // grooved terrain (Ganymede): bright lanes of parallel ridges cutting across older dark terrain
  if (icy && (act > 0.3 || p.grooves) && rg() < 0.8) {
    const lanes = []; const nL = 4 + Math.floor(rg() * 8);
    for (let k = 0; k < nL; k++) { const a = randDir(rg); lanes.push({ c: a, r: 0.25 + rg() * 0.5, dir: randDir(rg), k: 60 + rg() * 90, amp: 0.004 + rg() * 0.006 }); }
    if (!resurf) resurf = new Float32Array(w * h);
    forEachDir(w, h, (i, x, y, z) => {
      for (const L of lanes) {
        const d = Math.acos(Math.min(1, x * L.c[0] + y * L.c[1] + z * L.c[2])); if (d > L.r) continue;
        const m = 1 - sstep(L.r * 0.6, L.r, d + 0.08 * sim3.noise(x * 6, y * 6, z * 6));
        const g = Math.sin((x * L.dir[0] + y * L.dir[1] + z * L.dir[2]) * L.k + 3 * sim4.noise(x * 4, y * 4, z * 4));
        field[i] = mix(field[i], preCrater[i], m * 0.7) + L.amp * g * m; resurf[i] = Math.max(resurf[i], m * 0.8);
      }
    });
    features.push('Grooved terrain');
  }
  // sinuous rilles / canyons on rocky worlds with volcanic or tectonic history
  if (!icy && act > 0.3 && rg() < 0.7) {
    forEachDir(w, h, (i, x, y, z) => {
      const v = sim4.fbm(x * 5 + 3, y * 5, z * 5, { octaves: 4 }); const wd = 0.012 + 0.01 * sim3.noise(x * 20, y * 20, z * 20);
      const m = sstep(0.1, 0.4, sim3.fbm(x * 2, y * 2 + 5, z * 2, { octaves: 3 }));
      field[i] -= 0.02 * m * (1 - sstep(wd * 0.3, wd, Math.abs(v)));
    });
    features.push('Sinuous rilles and canyons');
  }
  // icy fracture networks: zero contours of fractal fields -> branching lineae / chasmata
  let crack = null;
  if (icy && rng() < 0.45 + 0.5 * Math.max(act, p.cracks || 0)) {
    crack = new Float32Array(w * h);
    const gens = [[2.2, 0.035, 0.05], [5, 0.02, 0.025], [11, 0.012, 0.012]];
    const fx = [new Simplex3(seed + 21), new Simplex3(seed + 22), new Simplex3(seed + 23)];
    const strength = 0.4 + rng() * 0.6;
    forEachDir(w, h, (i, x, y, z) => {
      let c = 0;
      gens.forEach(([fq, wd, dep], g) => {
        const v = fx[g].fbm(x * fq, y * fq, z * fq, { octaves: 4 });
        const line = 1 - sstep(0, wd, Math.abs(v));
        const shoulder = 1 - sstep(wd, wd * 3, Math.abs(v));
        field[i] += (-line * dep + shoulder * dep * 0.25) * strength;
        c = Math.max(c, line * (g === 0 ? 1 : 0.6));
      });
      crack[i] = c * strength;
    });
    features.push(rng() < 0.5 ? 'Global fracture network (lineae)' : 'Tectonic chasmata');
  }
  // chaos terrain: rafts of crust broken up and refrozen in a darker, reddish matrix (Europa)
  let chaos = null;
  if (icy && act > 0.45 && rg() < 0.6) {
    chaos = new Float32Array(w * h);
    forEachDir(w, h, (i, x, y, z) => {
      const m = sstep(0.3, 0.45, sim3.fbm(x * 3 + 11, y * 3, z * 3, { octaves: 4 })); if (m <= 0) return;
      const cx = Math.floor(x * 70 + sim4.noise(x * 30, y * 30, z * 30)), cy = Math.floor(y * 70), cz = Math.floor(z * 70);
      const raft = Math.sin(cx * 12.9898 + cy * 78.233 + cz * 37.719) * 43758.5453; const rv = raft - Math.floor(raft);
      field[i] += m * (rv > 0.55 ? 0.006 * rv : -0.004); chaos[i] = m * (rv > 0.55 ? 0.35 : 1);
    });
    features.push('Chaos terrain');
  }
  // equatorial ridge (Iapetus) or canyon system
  if (rng() < 0.08) { forEachDir(w, h, (i, x, y) => { field[i] += 0.12 * Math.exp(-(y * y) / 0.0012); }); features.push('Equatorial ridge'); }
  else if (rng() < 0.2) {
    const a = randDir(rng), b = randDir(rng); const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const nl = Math.hypot(...n);
    forEachDir(w, h, (i, x, y, z) => { const d = (x * n[0] + y * n[1] + z * n[2]) / nl; const along = x * a[0] + y * a[1] + z * a[2]; if (along < -0.2) return; const wd = 0.02 * (1 + 0.5 * sim.noise(x * 8, y * 8, z * 8)); field[i] -= 0.1 * (1 - sstep(wd * 0.5, wd, Math.abs(d))); });
    features.push('Great canyon system');
  }
  // lobate scarps: long thrust-fault cliffs from a cooling, shrinking crust (Mercury)
  if (p.scarps) {
    const n = 4 + Math.floor(rng() * 6);
    for (let k = 0; k < n; k++) {
      const a0 = randDir(rng), b0 = randDir(rng); const nn = [a0[1] * b0[2] - a0[2] * b0[1], a0[2] * b0[0] - a0[0] * b0[2], a0[0] * b0[1] - a0[1] * b0[0]]; const nl = Math.hypot(...nn);
      const len = 0.15 + rng() * 0.3, hgt = 0.012 + rng() * 0.02;
      forEachDir(w, h, (i, x, y, z) => { const al = x * a0[0] + y * a0[1] + z * a0[2]; if (al < 1 - len) return; const d = (x * nn[0] + y * nn[1] + z * nn[2]) / nl + 0.004 * sim.noise(x * 30, y * 30, z * 30); field[i] += hgt * sstep(-0.002, 0.004, d) * sstep(1 - len, 1 - len + 0.05, al); });
    }
    features.push('Lobate scarps (a shrinking crust)');
  }
  // ---- colour
  report('Painting albedo', 0.65);
  const rgba = new Uint8ClampedArray(w * h * 4);
  normalizeCopyStats(field);
  const twoTone = rng() < 0.06, ttDir = randDir(rng);
  forEachDir(w, h, (i, x, y, z) => {
    const t = clamp01((baseField[i] - 0.3) / 0.45 + 0.2 * sim2.fbm(x * 6, y * 6, z * 6, { octaves: 3 }));
    let c = t < 0.5 ? [mix(pal.low[0], pal.mid[0], t * 2), mix(pal.low[1], pal.mid[1], t * 2), mix(pal.low[2], pal.mid[2], t * 2)]
      : [mix(pal.mid[0], pal.high[0], t * 2 - 1), mix(pal.mid[1], pal.high[1], t * 2 - 1), mix(pal.mid[2], pal.high[2], t * 2 - 1)];
    // geologic units: broad regions whose composition (and so colour) differs a little
    const u1 = sim3.fbm(x * 2.3 + 40, y * 2.3, z * 2.3, { octaves: 3 }), u2 = sim4.fbm(x * 1.7, y * 1.7 + 17, z * 1.7, { octaves: 3 });
    const ub = 1 + 0.09 * u1, uw = 0.018 * u2; // brightness, plus a slight warm/cool shift
    c = [c[0] * (ub + uw), c[1] * ub, c[2] * (ub - uw)];
    if (resurf && resurf[i] > 0) c = icy ? c.map((v, j) => mix(v, Math.min(1, pal.high[j] * 1.04 + 0.02), resurf[i] * 0.55)) : c.map((v, j) => mix(v, pal.low[j] * 0.72, resurf[i] * 0.6));
    if (chaos && chaos[i] > 0) { const cc = p.crackColor || [0.52, 0.36, 0.26]; c = c.map((v, j) => mix(v, cc[j], chaos[i] * 0.6)); }
    if (icy && crack && crack[i] > 0.05) { const cc = p.crackColor || [0.55, 0.38, 0.26]; c = [mix(c[0], cc[0], crack[i] * 0.8), mix(c[1], cc[1], crack[i] * 0.8), mix(c[2], cc[2], crack[i] * 0.8)]; }
    if (twoTone) { const k = sstep(-0.15, 0.25, x * ttDir[0] + y * ttDir[1] + z * ttDir[2]); c = c.map((v) => v * (1 - 0.8 * k)); }
    if (p.polar && Math.abs(y) > 0.85) { const k = sstep(0.85, 0.93, Math.abs(y) + 0.03 * sim.noise(x * 20, y * 20, z * 20)); c = c.map((v, j) => mix(v, p.polar[j], k)); }
    rgba[i * 4] = c[0] * 255; rgba[i * 4 + 1] = c[1] * 255; rgba[i * 4 + 2] = c[2] * 255; rgba[i * 4 + 3] = 255;
  });
  if (twoTone) features.push('Two-tone hemispheres');
  applyLunarRelief(rgba, field, w, h, lunarO, R, D, mask);
  if (mask) applyMariaAlbedo(rgba, mask, w, h, mOpts);
  await tick();
  report('Rays and fresh ejecta', 0.85);
  applyLunarAlbedo(rgba, w, h, lunarO, R, mask, null);
  // Ceres-like bright faculae (salt deposits on crater floors) and bluish exposed-ice patches
  if (p.faculae) {
    for (let k = 0; k < p.faculae; k++) {
      const c = randDir(rng), rad = 0.004 + rng() * 0.012;
      forEachDir(w, h, (i, x, y, z) => { const d = Math.acos(Math.min(1, x * c[0] + y * c[1] + z * c[2])); if (d > rad * 2.5) return; const k2 = Math.exp(-(d * d) / (rad * rad * 0.35)) + 0.35 * Math.exp(-d / rad) * (0.5 + 0.5 * sim2.noise(x * 400, y * 400, z * 400)); const o = i * 4; rgba[o] = mix(rgba[o], 250, Math.min(1, k2)); rgba[o + 1] = mix(rgba[o + 1], 250, Math.min(1, k2)); rgba[o + 2] = mix(rgba[o + 2], 255, Math.min(1, k2)); });
    }
    features.push(p.faculae > 5 ? 'Brilliant salt faculae in many craters' : 'Bright salt faculae');
  }
  if (p.icePatches) {
    const ice = new Simplex3(seed + 404);
    forEachDir(w, h, (i, x, y, z) => { const v = ice.fbm(x * 5, y * 5, z * 5, { octaves: 5 }); const k2 = sstep(0.42, 0.55, v) * p.icePatches * (0.6 + 0.4 * Math.abs(y)); if (k2 <= 0) return; const o = i * 4; rgba[o] = mix(rgba[o], 150, k2); rgba[o + 1] = mix(rgba[o + 1], 185, k2); rgba[o + 2] = mix(rgba[o + 2], 245, k2); });
    features.push('Bluish exposed-ice deposits');
  }
  // keep albedo realistic: rescale to a target mean brightness (rock ~0.45, ice ~0.65 in display terms)
  { let sum = 0, n = 0; for (let i = 0; i < w * h; i += 7) { const o = i * 4; sum += 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]; n++; }
    const mean = sum / n / 255, target = icy ? 0.66 : 0.47; const k = Math.max(0.8, Math.min(1.9, target / Math.max(0.05, mean)));
    if (Math.abs(k - 1) > 0.03) for (let i = 0; i < w * h; i++) { const o = i * 4; rgba[o] = Math.min(255, rgba[o] * k); rgba[o + 1] = Math.min(255, rgba[o + 1] * k); rgba[o + 2] = Math.min(255, rgba[o + 2] * k); } }
  const height = new Float32Array(w * h); let mean = 0; for (let i = 0; i < field.length; i++) mean += field[i]; mean /= field.length;
  for (let i = 0; i < field.length; i++) height[i] = (field[i] - mean) * D;
  return { height, color: flipRows(rgba, w, h), w, h, seaLevel: null, features, relief: D };
}
function normalizeCopyStats() {}

// ================================================================= Vesta-class (GaeaButBetter library)
const VESTA_LIB = [11, 23, 37, 41, 59, 67, 73, 89];
async function loadPixels(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0); return { w: bmp.width, h: bmp.height, data: g.getImageData(0, 0, bmp.width, bmp.height).data };
}
async function bakeVesta(p, report) {
  const rng = mulberry32(p.seed * 31 + 7);
  const id = VESTA_LIB[Math.floor(rng() * VESTA_LIB.length)];
  report('Loading protoplanet template', 0.2);
  const base = new URL('../../assets/vesta/', import.meta.url).href;
  const [hp, cp, meta] = await Promise.all([loadPixels(base + `v${id}_h.png`), loadPixels(base + `v${id}_c.webp`), fetch(base + `v${id}.json`).then((r) => r.json())]);
  const w = hp.w, h = hp.h;
  const kScale = p.R / 262000; // library is baked for Vesta's 262 km radius
  const height = new Float32Array(w * h);
  // random longitude rotation so repeated templates don't line up
  const shift = Math.floor(rng() * w);
  const rgba = new Uint8ClampedArray(w * h * 4);
  const pal = p.colors || { mid: [0.5, 0.48, 0.45] };
  const tint = [pal.mid[0] / 0.5, pal.mid[1] / 0.48, pal.mid[2] / 0.45];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const src = y * w + ((x + shift) % w), dst = y * w + x;
    const v = (hp.data[src * 4] * 256 + hp.data[src * 4 + 1]) / 65535;
    height[dst] = (meta.min_km + v * meta.range_km) * 1000 * kScale;
    for (let c = 0; c < 3; c++) rgba[dst * 4 + c] = Math.min(255, cp.data[src * 4 + c] * mix(1, tint[c], 0.6));
    rgba[dst * 4 + 3] = 255;
  }
  let mean = 0; for (let i = 0; i < height.length; i++) mean += height[i]; mean /= height.length;
  for (let i = 0; i < height.length; i++) height[i] -= mean;
  return { height, color: flipRows(rgba, w, h), w, h, seaLevel: null, features: ['Battered protoplanet crust', 'Giant impact basins', 'Deep equatorial troughs'], relief: meta.range_km * 1000 * kScale };
}

// ================================================================= terrestrial worlds
// Plate tectonics with motion: every plate rotates about its own Euler pole, so each boundary is
// convergent (orogeny, volcanic arcs, trenches), divergent (rift valleys, mid-ocean ridges) or
// transform. Hotspots leave volcanic island chains along the plate's direction of travel.
function tectonics(w, h, a, rng, features) {
  const N = a.plates, landFrac = a.landFrac;
  const P = [];
  // supercontinent worlds cluster their continental plates
  const superC = a.supercontinent ? randDir(rng) : null;
  for (let i = 0; i < N; i++) {
    let c = randDir(rng);
    let cont = rng() < landFrac;
    if (superC) { const dp = c[0] * superC[0] + c[1] * superC[1] + c[2] * superC[2]; cont = dp > 1 - landFrac * 2.2; }
    const axis = randDir(rng), spd = (0.4 + rng()) * (rng() < 0.5 ? -1 : 1);
    P.push({ c, cont, base: cont ? 0.66 + rng() * 0.07 : 0.17 + rng() * 0.07, om: axis.map((v) => v * spd) });
  }
  const seed = a.seed;
  const warp = new Simplex3(seed + 131), belt = new Simplex3(seed + 771), within = new Simplex3(seed + 909), rift = new Simplex3(seed + 313);
  const field = new Float32Array(w * h);
  const mtn = a.mountains;
  let nConv = 0, nDiv = 0;
  forEachDir(w, h, (i, ox, oy, oz) => {
    let px = ox + warp.fbm(ox * 1.4, oy * 1.4, oz * 1.4, { octaves: 3 }) * 0.2;
    let py = oy + warp.fbm(ox * 1.4 + 9, oy * 1.4 + 9, oz * 1.4 + 9, { octaves: 3 }) * 0.2;
    let pz = oz + warp.fbm(ox * 1.4 - 9, oy * 1.4 - 9, oz * 1.4 - 9, { octaves: 3 }) * 0.2;
    const il = 1 / Math.hypot(px, py, pz); px *= il; py *= il; pz *= il;
    let d1 = -2, d2 = -2, p1 = 0, p2 = 0;
    for (let k = 0; k < N; k++) { const q = P[k].c, dp = px * q[0] + py * q[1] + pz * q[2]; if (dp > d1) { d2 = d1; p2 = p1; d1 = dp; p1 = k; } else if (dp > d2) { d2 = dp; p2 = k; } }
    const A = P[p1], B = P[p2];
    const distB = (Math.acos(Math.max(-1, Math.min(1, d2))) - Math.acos(Math.max(-1, Math.min(1, d1)))) * 0.5;
    const coast = sstep(0.16, 0, distB);
    let hgt = mix(A.base, (A.base + B.base) * 0.5, coast * 0.5);
    hgt += within.fbm(px * 3, py * 3, pz * 3, { octaves: 4 }) * 0.03;
    const near = sstep(0.11, 0, distB);
    if (near > 0) {
      // relative motion across the boundary
      const vA = [A.om[1] * pz - A.om[2] * py, A.om[2] * px - A.om[0] * pz, A.om[0] * py - A.om[1] * px];
      const vB = [B.om[1] * pz - B.om[2] * py, B.om[2] * px - B.om[0] * pz, B.om[0] * py - B.om[1] * px];
      let nx = B.c[0] - A.c[0], ny = B.c[1] - A.c[1], nz = B.c[2] - A.c[2];
      const dpn = nx * px + ny * py + nz * pz; nx -= dpn * px; ny -= dpn * py; nz -= dpn * pz; const nl = Math.hypot(nx, ny, nz) || 1;
      const conv = ((vA[0] - vB[0]) * nx + (vA[1] - vB[1]) * ny + (vA[2] - vB[2]) * nz) / nl;
      const ridge = Math.pow(Math.max(0, belt.fbm(px * 8, py * 8, pz * 8, { octaves: 5, ridged: true }) * 0.5 + 0.5), 1.5);
      const narrow = sstep(0.035, 0, distB);
      if (conv > 0.2) {
        const k = Math.min(1.7, conv);
        if (A.cont && B.cont) hgt += near * ridge * mtn * 0.55 * k;                                   // orogenic belt
        else if (A.cont !== B.cont) { hgt += near * ridge * mtn * 0.34 * (A.cont ? 1 : 0.6) * k; if (!A.cont) hgt -= narrow * 0.13 * k; } // arc + trench
        else hgt += near * sstep(0.62, 0.86, belt.fbm(px * 10 + 3, py * 10, pz * 10 + 3, { octaves: 3 }) * 0.5 + 0.5) * 0.5; // island arc
        nConv++;
      } else if (conv < -0.2) {
        const k = Math.min(1.5, -conv);
        if (A.cont && B.cont) hgt -= narrow * 0.09 * k * (0.7 + 0.3 * rift.noise(px * 20, py * 20, pz * 20)) - near * 0.02 * k;  // rift valley + shoulders
        else hgt += near * 0.05 * k * (0.6 + 0.4 * ridge) * (A.cont || B.cont ? 0.3 : 1);             // mid-ocean ridge
        nDiv++;
      } else hgt += narrow * 0.015 * rift.noise(px * 30, py * 30, pz * 30);                              // transform fault
    }
    field[i] = hgt;
  });
  if (nConv > nDiv * 1.4) features.push('Active collision mountain belts');
  else if (nDiv > nConv * 1.4) features.push('Spreading rifts & mid-ocean ridges');
  else features.push('Mixed plate boundaries (orogens, rifts, transform faults)');
  // hotspot island chains, trailing opposite to plate motion
  const nHot = Math.floor(rng() * 5);
  for (let k = 0; k < nHot; k++) {
    const c = randDir(rng); let best = 0, bd = -2; for (let j = 0; j < N; j++) { const dp = c[0] * P[j].c[0] + c[1] * P[j].c[1] + c[2] * P[j].c[2]; if (dp > bd) { bd = dp; best = j; } }
    const om = P[best].om; let v = [om[1] * c[2] - om[2] * c[1], om[2] * c[0] - om[0] * c[2], om[0] * c[1] - om[1] * c[0]]; const vl = Math.hypot(...v) || 1; v = v.map((x) => -x / vl);
    let q = c.slice();
    for (let s = 0; s < 8; s++) {
      const lat = Math.asin(q[1]), lon = Math.atan2(-q[2], q[0]);
      stampCone(field, w, h, lat, lon, 0.02 + rng() * 0.015, (0.12 + rng() * 0.08) * Math.pow(0.8, s));
      q = q.map((x, j) => x + v[j] * (0.035 + rng() * 0.02)); const ql = Math.hypot(...q); q = q.map((x) => x / ql);
    }
  }
  if (nHot) features.push(`${nHot} hotspot island chain${nHot > 1 ? 's' : ''}`);
  return field;
}

async function bakeTerrestrial(p, report) {
  const { w, h, seed, R } = p;
  const rng = mulberry32(seed * 104729 + 3);
  const features = [];
  const recipe = p.recipe; // terra | ocean | desert | venus | lava | titan
  const g = p.gravity || 9.81;
  // per-world character
  const a = { seed, plates: 6 + Math.floor(rng() * 16), mountains: 0.4 + rng() * 0.7, erosion: 0.35 + rng() * 0.5, erosionIterations: 40 + rng() * 60, canyons: 0.25 + rng() * 0.5, canyonWidth: rng(), talus: 0.4 + rng() * 0.4 };
  let seaFrac = recipe === 'ocean' ? 0.9 + rng() * 0.08 : recipe === 'terra' ? (p.oceanFrac ?? 0.4 + rng() * 0.45) : recipe === 'titan' ? 0.05 : recipe === 'desert' ? (rng() < 0.4 ? 0.03 + rng() * 0.08 : 0) : 0;
  a.landFrac = Math.max(0.05, 1 - seaFrac) * 0.95;
  a.supercontinent = recipe === 'terra' && rng() < 0.22;
  if (a.supercontinent) features.push('Supercontinent');
  if (recipe === 'terra' && a.plates > 17) features.push('Fragmented archipelago continents');
  if (recipe === 'venus' || recipe === 'lava') { a.erosion = 0; a.canyons = 0.05; a.mountains *= 0.6; }
  if (recipe === 'desert') { a.erosion *= 0.5; a.canyons *= 1.3; }
  report('Plate tectonics', 0.05);
  const field = tectonics(w, h, a, rng, features);
  await tick();
  // signature features ------------------------------------------------------------
  const sim = new Simplex3(seed + 55);
  if (rng() < 0.3 || recipe === 'desert') { // volcanic province with giant shields (Tharsis)
    const c = randDir(rng), lat0 = Math.asin(c[1]), lon0 = Math.atan2(-c[2], c[0]);
    stampCone(field, w, h, lat0, lon0, 0.45, 0.12, 0, 1.0);
    const n = 2 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) stampCone(field, w, h, lat0 + (rng() - 0.5) * 0.4, lon0 + (rng() - 0.5) * 0.5, 0.05 + rng() * 0.06, 0.25 + rng() * 0.25, 0.15, 1.4);
    features.push('Volcanic province with giant shield volcanoes');
  }
  if (rng() < (recipe === 'desert' ? 0.6 : 0.2)) { // great rift canyon (Valles Marineris)
    const a0 = randDir(rng), b0 = randDir(rng); const n = [a0[1] * b0[2] - a0[2] * b0[1], a0[2] * b0[0] - a0[0] * b0[2], a0[0] * b0[1] - a0[1] * b0[0]]; const nl = Math.hypot(...n);
    const len = 0.1 + rng() * 0.18;
    forEachDir(w, h, (i, x, y, z) => { const d = (x * n[0] + y * n[1] + z * n[2]) / nl; const al = x * a0[0] + y * a0[1] + z * a0[2]; if (al < 1 - len) return; const wd = 0.014 * (1 + 0.6 * sim.noise(x * 9, y * 9, z * 9)); field[i] -= 0.08 * (1 - sstep(wd * 0.4, wd, Math.abs(d))) * sstep(1 - len, 1 - len + 0.08, al); });
    features.push('Great rift canyon');
  }
  if (rng() < 0.25) { // ancient mega impact basin
    const lat = Math.asin(rng() * 2 - 1), lon = rng() * TAU - Math.PI;
    stampCrater(field, w, h, { latC: lat, lonC: toKLon(lon), alpha: 0.2 + rng() * 0.25, depth: 0.14, rimH: 0.04, rimW: 0.35, floor: 0.6, ejecta: 0.5, carve: true, peak: 0, terrace: 0, floorRoughness: 0.2, seedSalt: seed });
    features.push('Ancient mega impact basin');
  }
  if (recipe === 'desert' || recipe === 'venus' || recipe === 'titan') { // thin/old atmospheres keep craters
    applyCraterSaturation(field, w, h, { ...LUNAR_DEFAULTS, seed: seed + 9, saturation: recipe === 'desert' ? 0.25 : 0.06, saturationLargest: 3 }, R, 8000);
  }
  if (recipe === 'lava' || recipe === 'venus') { const n = 20 + Math.floor(rng() * 40); for (let k = 0; k < n; k++) stampCone(field, w, h, Math.asin(rng() * 2 - 1), rng() * TAU - Math.PI, 0.01 + rng() * 0.04, 0.03 + rng() * 0.08, 0.2, 1.3); }
  if (p.forming) { // fresh giant impacts: molten basins punched through the crust
    const n = 3 + Math.floor(rng() * 5);
    for (let k = 0; k < n; k++) stampCrater(field, w, h, { latC: Math.asin(rng() * 2 - 1), lonC: rng() * TAU, alpha: 0.08 + rng() * 0.2, depth: 0.12, rimH: 0.05, rimW: 0.3, floor: 0.5, ejecta: 0.7, carve: true, peak: 0, terrace: 0, floorRoughness: 0.2, seedSalt: seed + k * 17 });
    features.push('Molten giant-impact basins', 'Magma oceans under a thin crust');
  }
  await tick();
  // erosion ---------------------------------------------------------------------------
  if (a.erosion > 0) {
    report('Hydraulic erosion — rivers & valleys', 0.25);
    a.erosionIterations *= (w * h) / (2048 * 1024) * 1.2 + 0.2;
    hydraulicErode(field, w, h, a, () => {});
    await tick();
  }
  report('Carving drainage canyons', 0.45);
  carveCanyons(field, w, h, a);
  thermalErode(field, w, h, a, 3);
  const det = new Simplex3(seed + 5150);
  forEachDir(w, h, (i, x, y, z) => { const rough = det.fbm(x * 42, y * 42, z * 42, { octaves: 4, ridged: true }); field[i] += rough * 0.02 * sstep(0.5, 0.78, field[i]); });
  normalize(field);
  await tick();
  // climate & colour ---------------------------------------------------------------------
  report('Climate, biomes and rivers', 0.6);
  const eyeball = p.locked && (recipe === 'terra' || recipe === 'ocean');
  if (eyeball) features.push('Tidally locked "eyeball" climate');
  const Teq = p.Teq ?? 260;
  const warmth = recipe === 'desert' ? 0.7 + rng() * 0.3 : clamp01(0.58 + (Teq - 255) / 110 + (rng() - 0.5) * 0.2);
  const moisture = recipe === 'ocean' ? 1.2 : recipe === 'desert' ? 0.03 : 0.6 + rng() * 0.8;
  const veg = vegetationFor(p.starTemp || 5772, rng);
  if (recipe === 'terra' || recipe === 'ocean') features.push(veg.label);
  const oceanTint = p.ocean || [0.04, 0.12, 0.25];
  const cfg = { seed, seaLevel: seaFrac, warmth, moisture, vegColor: veg.hex, riverDensity: recipe === 'desert' ? 0.15 : 0.3 + rng() * 0.6, snowLine: 0.3 + rng() * 0.5, relief: 0, // lighting comes from the height map at runtime
    rivers: recipe !== 'venus' && recipe !== 'lava', beaches: recipe !== 'titan', seaIce: true, eyeball,
    ocean: { color: hex([oceanTint[0] * 2.2, oceanTint[1] * 2.2, oceanTint[2] * 1.6]), colorFromSpace: hex(oceanTint) } };
  const seaField = seaFrac > 0 ? percentileSeaField(field, seaFrac) : -1;
  let rgba = await buildTerrestrialColor(field, w, h, { ...cfg, seaLevel: Math.max(0, seaFrac) }, tick);
  // recipe-specific repaints
  if (recipe === 'venus' || recipe === 'lava' || recipe === 'titan' || recipe === 'desert') repaintSpecial(rgba, field, w, h, recipe, p, rng, seaField);
  if (recipe === 'desert' && seaFrac === 0) features.push('Dry river channels');
  let clouds = null;
  if (p.clouds && recipe !== 'titan') {
    report('Weather systems (Kalileo multi-layer clouds)', 0.8);
    const cw = Math.min(w, 1024), ch = cw / 2;
    const small = downsample(field, w, h, cw, ch);
    const land = new Float32Array(cw * ch); const sfv = Math.max(0, seaField);
    for (let i = 0; i < land.length; i++) land[i] = small[i] > sfv ? 1 : 0;
    const preset = recipe === 'desert' ? 'mars' : recipe === 'venus' ? 'venus' : 'earth';
    clouds = await cloudStack(preset, cw, ch, { seed, amount: Math.min(1.6, (p.cloudAmount ?? 0.5) * 2), storminess: 0.5 + rng(), land });
  }
  // heights in metres (sea level = 0)
  const landMax = Math.min(22000, 8500 * Math.sqrt(9.81 / Math.max(1, g))) * (recipe === 'venus' ? 0.6 : 1);
  const oceanMax = 6000;
  const height = new Float32Array(w * h);
  const sf = seaFrac > 0 ? seaField : percentileSeaField(field, 0.5);
  for (let i = 0; i < field.length; i++) {
    const f = field[i];
    height[i] = f >= sf ? (f - sf) / Math.max(1e-3, 1 - sf) * landMax + (seaFrac > 0 ? 2 : 0) : (seaFrac > 0 ? -(sf - f) / Math.max(1e-3, sf) * oceanMax - 2 : -(sf - f) / Math.max(1e-3, sf) * landMax * 0.6);
  }
  return { height, color: flipRows(rgba, w, h), w, h, seaLevel: seaFrac > 0 ? 0 : null, features, clouds, relief: landMax };
}

function vegetationFor(T, rng) {
  // photosynthetic pigments tuned to the host star's spectrum (speculative but physically motivated)
  const opts = T < 3700 ? [['#2a1f2e', 'Near-black vegetation (absorbs red-dwarf light)'], ['#4a2238', 'Purple vegetation'], ['#5b2a1c', 'Deep red vegetation']]
    : T < 5200 ? [['#6b4a22', 'Russet-orange vegetation'], ['#5d5a24', 'Olive-gold vegetation'], ['#7a3f22', 'Rust-red forests']]
    : T < 6300 ? [['#4e6236', 'Green vegetation'], ['#3f5a2e', 'Deep green forests'], ['#5a6a30', 'Yellow-green grasslands']]
    : [['#2f5a5a', 'Blue-green vegetation'], ['#6a7a30', 'Yellow vegetation (reflects harsh UV-blue light)'], ['#35506a', 'Blue-leaved forests']];
  const o = opts[Math.floor(rng() * opts.length)];
  return { hex: o[0], label: o[1] };
}
function downsample(f, w, h, cw, ch) {
  const out = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out[y * cw + x] = f[Math.floor(y * h / ch) * w + Math.floor(x * w / cw)];
  return out;
}
function repaintSpecial(rgba, field, w, h, recipe, p, rng, seaField) {
  const pal = p.colors || { low: [0.4, 0.3, 0.2], mid: [0.55, 0.4, 0.28], high: [0.7, 0.58, 0.42] };
  const sim = new Simplex3(p.seed + 77);
  forEachDir(w, h, (i, x, y, z, lat, lon, xx, yy) => {
    const f = field[i]; const o = i * 4;
    // own hillshade from the height field (independent of the biome colouring underneath)
    const cosL = Math.max(0.1, Math.cos(lat));
    const gx = (field[yy * w + (xx + 1) % w] - f) * cosL, gy = f - field[Math.min(h - 1, yy + 1) * w + xx];
    const shade = Math.max(0.55, Math.min(1.45, 1 + (gx + gy) * 40));
    let c;
    const t = clamp01((f - 0.3) / 0.5 + 0.15 * sim.fbm(x * 6, y * 6, z * 6, { octaves: 3 }));
    c = t < 0.5 ? pal.low.map((v, j) => mix(v, pal.mid[j], t * 2)) : pal.mid.map((v, j) => mix(v, pal.high[j], t * 2 - 1));
    let alpha = 255;
    if (recipe === 'lava') {
      const cr = Math.pow(1 - Math.abs(sim.fbm(x * 7, y * 7, z * 7, { octaves: 4 })), 12);
      const lava = p.forming ? Math.max(sstep(0.32, 0.18, f), sstep(0.55, 0.85, cr)) : Math.max(sstep(0.14, 0.06, f), sstep(0.7, 0.92, cr) * sstep(0.2, 0.35, f));
      c = [mix(0.06, 1.0, lava), mix(0.05, 0.35, lava), mix(0.05, 0.05, lava)];
      alpha = 255 - Math.round(lava * 255);
    }
    if (recipe === 'titan' && seaField > 0 && f < seaField) {
      if (Math.abs(lat) > 0.9) c = [0.03, 0.025, 0.02]; else c = pal.low; // methane seas only near the poles
    }
    if (recipe === 'titan' && Math.abs(lat) < 0.5) { const dune = 0.5 + 0.5 * Math.sin(x * 900 + sim.noise(x * 30, y * 30, z * 30) * 6); c = c.map((v) => v * (0.75 + 0.2 * dune)); }
    if (recipe === 'desert') {
      // dune seas in basins, dark basalt uplands, rusty dust
      const dust = sstep(0.4, 0.65, sim.fbm(x * 3 + 4, y * 3, z * 3, { octaves: 4 }) * 0.5 + 0.5);
      c = c.map((v, j) => mix(v, pal.high[j], dust * 0.4));
      const cap = Math.max(0.97, p.iceCaps || 0.97); if (Math.abs(y) > cap - 0.02) c = c.map((v) => mix(v, 0.95, sstep(cap, cap + 0.02, Math.abs(y) + 0.015 * sim.noise(x * 25, y * 25, z * 25))));
    }
    const k = 1; // no baked hillshade: the renderer lights the height map with the real sun
    rgba[o] = clamp01(c[0] * k) * 255; rgba[o + 1] = clamp01(c[1] * k) * 255; rgba[o + 2] = clamp01(c[2] * k) * 255; rgba[o + 3] = alpha;
  });
}

// ================================================================= Kalileo multi-layer clouds
// Packs a cloud stack into one RGBA map for the volumetric renderer:
//   earth: R base coverage, G cumulonimbus/storm coverage, B cirrus, A base cloud type (stratus->towers)
//   venus: R lower deck, G upper deck, B 0, A lower-deck type ; mars: R dust haze, G 0, B water-ice cirrus
async function cloudStack(preset, w, h, o, baseOverride = null) {
  const st = await buildCloudStack(preset, w, h, o, tick);
  const out = new Uint8ClampedArray(w * h * 4);
  const L = preset === 'earth' ? [st.base, st.storm, st.cirrus] : preset === 'venus' ? [st.lower, st.upper, null] : [st.dust, null, st.cirrus];
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = baseOverride ? baseOverride[i] : L[0].coverage[i];
    out[i * 4 + 1] = L[1] ? L[1].coverage[i] : 0;
    out[i * 4 + 2] = L[2] ? L[2].coverage[i] : 0;
    out[i * 4 + 3] = L[0].type ? L[0].type[i] : 60;
  }
  return { data: flipRows(out, w, h), w, h, stack: preset };
}
// Clouds for real planets (their surface is imagery, so only the weather is generated).
// Earth keeps the real satellite cloud map as its base layer and gains storm + cirrus layers.
async function bakeCloudsOnly(p, report) {
  const w = p.w, h = p.h;
  report('Weather systems (Kalileo multi-layer clouds)', 0.2);
  const base = new URL('../../assets/planets/', import.meta.url).href;
  let land = null, baseOverride = null;
  if (p.cloudPreset === 'earth') {
    const [wat, cl] = await Promise.all([loadPixels(base + 'earth_water.webp'), loadPixels(base + 'earth_clouds.webp')]);
    land = new Float32Array(w * h); baseOverride = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const wi = (Math.floor(y * wat.h / h) * wat.w + Math.floor(x * wat.w / w)) * 4; land[y * w + x] = wat.data[wi] > 128 ? 0 : 1;
      const ci = (Math.floor(y * cl.h / h) * cl.w + Math.floor(x * cl.w / w)) * 4; baseOverride[y * w + x] = cl.data[ci];
    }
  }
  const clouds = await cloudStack(p.cloudPreset, w, h, { seed: p.seed, amount: p.cloudPreset === 'mars' ? 1 : 1, storminess: 1, land }, baseOverride);
  return { cloudsOnly: true, clouds, w, h, features: [] };
}

// ================================================================= entry point
export function recipeFor(b) {
  const st = b.style || {}; const cls = b.class;
  if (st.kind === 'star' || st.kind === 'gas' || st.kind === 'earth') return null;
  const R = b.radius;
  if (R < 90e3) return null; // small rocks keep their analytic irregular shapes
  if (st.kind === 'asteroid' || (b.type === 'asteroid' && R < 700e3)) return R <= 700e3 ? 'vesta' : 'moon';
  // dwarf planets, KBOs and the small moons of minor bodies: battered protoplanet crusts
  if ((b.type === 'dwarf' || b.type === 'kbo' || (b.type === 'moon' && b.parentBody && ['dwarf', 'asteroid', 'kbo'].includes(b.parentBody.type))) && R <= 800e3) return 'vesta';
  if (cls === 'terra') return 'terra'; if (cls === 'ocean') return 'ocean'; if (cls === 'desert') return 'desert';
  if (cls === 'venus') return 'venus'; if (cls === 'lava' || cls === 'molten') return 'lava'; if (cls === 'titan') return 'titan';
  if (cls === 'scorched' || cls === 'iron') return 'moon'; if (cls === 'carbon') return 'desert';
  if (cls === 'ice' || cls === 'kbo' || st.kind === 'icy') return 'icy';
  if (st.kind === 'terra') return 'terra';
  return 'moon';
}

export async function bakeWorld(p, report = () => {}) {
  switch (p.recipe) {
    case 'clouds': return bakeCloudsOnly(p, report);
    case 'moon': case 'icy': return bakeMoon(p, report);
    case 'vesta': return bakeVesta(p, report);
    default: return bakeTerrestrial(p, report);
  }
}

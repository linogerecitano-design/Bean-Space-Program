// From Kalileo (C:/Users/ofici/Downloads/Kalileo/js/cloudstack.js), vendored into Bean Space Program.
/* ============================================================================
   cloudstack.js — realistic multi-layer cloud maps for rocky planets.

   Each preset mirrors a real, hand-tuned StockVolumetricClouds layer stack
   (cloud types and curves reused verbatim from cloudstack-stock.js) and
   generates the per-planet maps those layers need:
     coverage — how much cloud          (volumetric coverageMap, ALPHAMAP_R)
     type     — which cloud type        (0 = first type in the layer's list … 1 = last)
     scaled   — the 2D orbit texture    (RGBA: alpha ≈ coverage, RGB = brightness;
                                          measured r = 0.96 / 0.84 on Kerbin's own)
     normal   — deck relief for _BumpMap (Kerbin's layers only)

   The Earth preset is calibrated against numbers MEASURED from Kerbin's stock
   maps (which were built from real Earth satellite cloud imagery):
     base coverage 40% · poles ~0.6 · 40–60° storm tracks ~0.46 · subtropics ~0.25
     · tropics ~0.18 with an ITCZ bump · 75% of cloud is stratus, 20% cumulus,
     towers are rare tropical specks · storm layer 33% cover, 0.6% true cores.

   Pure JS (imports only noise.js) so it can be run and tuned under Node.
   Row 0 = north, matching every other Kalileo map.
============================================================================ */

import { Simplex3, mulberry32 } from './noise.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const gauss = (x, mu, s) => Math.exp(-((x - mu) * (x - mu)) / (2 * s * s));

/* ------------------------------------------------------------ presets */
/* `layers[].stock` names an object in STOCK_CLOUD_LAYERS; `key` names the
   generated map set that feeds it. refAtmo/refRadius are the stock body the
   layer altitudes and fade distances were tuned for, so they can be rescaled
   to the user's planet. */
export const CLOUD_STACK_PRESETS = {
  earth: {
    label: '🌍 Earth', blurb: 'Cyclone spirals over the storm tracks, marine stratocumulus cells, clear subtropical deserts, tropical thunderstorms and high cirrus — three layers like Kerbin\'s stock volumetrics.',
    refBody: 'Kerbin', refAtmo: 70000, refRadius: 600000,
    layers: [
      { key: 'base', stock: 'Kerbin-base-layer', normal: true },
      { key: 'storm', stock: 'Kerbin-cumulonimbus-layer', normal: true },
      { key: 'cirrus', stock: 'Duna-rare-cirrus' },
    ],
  },
  venus: {
    label: '🟡 Venus', blurb: 'A planet-wide overcast. A mottled convective lower deck under an unbroken upper deck with Venus\'s dark sideways-Y, bow-shaped streaks and bright polar collars — structured like Eve\'s stock clouds.',
    refBody: 'Eve', refAtmo: 90000, refRadius: 700000,
    layers: [
      { key: 'lower', stock: 'Eve-clouds1' },
      { key: 'upper', stock: 'Eve-clouds2' },
    ],
  },
  mars: {
    label: '🔴 Mars', blurb: 'A thin world: regional dust hazes plus wispy water-ice clouds — polar hoods and the equatorial aphelion cloud belt. Built on Duna\'s stock layers.',
    refBody: 'Duna', refAtmo: 50000, refRadius: 320000,
    layers: [
      { key: 'dust', stock: 'Duna-dust-scattered' },
      { key: 'cirrus', stock: 'Duna-rare-cirrus' },
    ],
  },
};

/* ------------------------------------------------------------ noise bits */
function hashU(i, j, k, s) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/* 3D Worley F1/F2 on the unit sphere. Writes into WF to avoid allocating per pixel. */
const WF = { f1: 0, f2: 0 };
function worley(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let f1 = 9, f2 = 9;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const cx = xi + dx, cy = yi + dy, cz = zi + dz;
    const px = cx + hashU(cx, cy, cz, seed) - x;
    const py = cy + hashU(cx, cy, cz, seed + 1) - y;
    const pz = cz + hashU(cx, cy, cz, seed + 2) - z;
    const d = px * px + py * py + pz * pz;
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  WF.f1 = Math.sqrt(f1); WF.f2 = Math.sqrt(f2);
  return WF;
}

/* Piecewise-linear zonal profile from [latDeg, value] knots. */
function zonal(knots, latDeg) {
  if (latDeg <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    if (latDeg <= knots[i][0]) {
      const [a, va] = knots[i - 1], [b, vb] = knots[i];
      return va + (vb - va) * (latDeg - a) / (b - a);
    }
  }
  return knots[knots.length - 1][1];
}

/* Per-row calibration: pick each row's threshold so the row's mean coverage hits
   the target, then smooth the thresholds across rows so no seams appear. This is
   what pins the zonal climatology to the measured profile while the noise decides
   WHERE along the row the cloud actually sits. */
function calibrateRows(field, w, h, targetOfRow, width, out, mul = null) {
  const thr = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const target = clamp01(targetOfRow(y));
    let lo = -3, hi = 3;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2;
      let s = 0;
      for (let x = 0, i = y * w; x < w; x++, i++) s += sstep(mid - width, mid + width, field[i]) * (mul ? mul[i] : 1);
      if (s / w > target) lo = mid; else hi = mid;
    }
    thr[y] = (lo + hi) / 2;
  }
  const sm = new Float32Array(h), R = Math.max(2, Math.round(h / 90));
  for (let y = 0; y < h; y++) {
    let s = 0, n = 0;
    for (let k = -R; k <= R; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += thr[yy]; n++; } }
    sm[y] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) out[i] = sstep(sm[y] - width, sm[y] + width, field[i]) * (mul ? mul[i] : 1);
  return out;
}

/* Separable box blur, longitude wraps, latitude clamps. */
function blurField(f, w, h, rad) {
  let a = f;
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(w * h), inv = 1 / (rad * 2 + 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -rad; k <= rad; k++) s += pass === 0 ? a[y * w + ((x + k + w) % w)] : a[Math.max(0, Math.min(h - 1, y + k)) * w + x];
      b[y * w + x] = s * inv;
    }
    a = b;
  }
  return a;
}
/* Linearly remap a field onto a target mean / standard deviation, keeping its structure.
   Each stock layer's coverage and density curves were tuned for a particular input
   distribution; feeding them the same statistics as the stock map makes the tuning hold. */
function matchStats(f, mean, sd) {
  const n = f.length;
  let m = 0, q = 0;
  for (let i = 0; i < n; i++) { m += f[i]; q += f[i] * f[i]; }
  m /= n;
  const s0 = Math.sqrt(Math.max(1e-8, q / n - m * m)), k = sd / s0;
  for (let i = 0; i < n; i++) f[i] = clamp01(mean + (f[i] - m) * k);
  return f;
}

/* Global (not per-row) calibration, for sparse layers where rows are mostly empty. */
function calibrateGlobal(field, n, target, width, out) {
  let lo = -3, hi = 3;
  for (let it = 0; it < 26; it++) {
    const mid = (lo + hi) / 2;
    let s = 0;
    for (let i = 0; i < n; i++) s += sstep(mid - width, mid + width, field[i]);
    if (s / n > target) lo = mid; else hi = mid;
  }
  const t = (lo + hi) / 2;
  for (let i = 0; i < n; i++) out[i] = sstep(t - width, t + width, field[i]);
  return out;
}

/* ------------------------------------------------------------ outputs */
function toGrey(f) { const o = new Uint8ClampedArray(f.length); for (let i = 0; i < f.length; i++) o[i] = f[i] * 255 + 0.5; return o; }
function toScaledAlpha(cov, bright, alphaMul) {
  const o = toScaled(cov, bright);
  for (let i = 3; i < o.length; i += 4) o[i] *= alphaMul;
  return o;
}
function toScaled(cov, bright) {
  const o = new Uint8ClampedArray(cov.length * 4);
  for (let i = 0; i < cov.length; i++) {
    const g = clamp01(bright(cov[i], i)) * 255;
    o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g;
    o[i * 4 + 3] = cov[i] * 255;
  }
  return o;
}
/* Deck relief from a blurred thickness field. Blurred first for the same reason as
   the gas-giant deck normal: a gradient over hard coverage edges gives near-tangent
   normals that render as dark filaments. */
export function toNormal(thick, w, h, strength = 1) {
  let a = Float32Array.from(thick);
  const rad = Math.max(1, Math.round(w / 512));
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(w * h), inv = 1 / (rad * 2 + 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -rad; k <= rad; k++) s += pass === 0 ? a[y * w + ((x + k + w) % w)] : a[Math.max(0, Math.min(h - 1, y + k)) * w + x];
      b[y * w + x] = s * inv;
    }
    a = b;
  }
  const o = new Uint8ClampedArray(w * h * 4), k = 2.0 * strength;
  for (let y = 0; y < h; y++) {
    const yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    const fade = Math.min(1, (0.5 - Math.abs((y + 0.5) / h - 0.5)) * 9);
    for (let x = 0; x < w; x++) {
      const dx = (a[y * w + (x + 1) % w] - a[y * w + (x + w - 1) % w]) * k * fade;
      const dy = (a[yd * w + x] - a[yu * w + x]) * k * fade;
      const L = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      o[i] = (-dx / L * 0.5 + 0.5) * 255; o[i + 1] = (-dy / L * 0.5 + 0.5) * 255;
      o[i + 2] = (1 / L * 0.5 + 0.5) * 255; o[i + 3] = 255;
    }
  }
  return o;
}

/* ------------------------------------------------------------ geometry */
function rotateAbout(px, py, pz, cx, cy, cz, th, out) {
  const c = Math.cos(th), s = Math.sin(th), d = px * cx + py * cy + pz * cz;
  out[0] = px * c + (cy * pz - cz * py) * s + cx * d * (1 - c);
  out[1] = py * c + (cz * px - cx * pz) * s + cy * d * (1 - c);
  out[2] = pz * c + (cx * py - cy * px) * s + cz * d * (1 - c);
}
function dirOf(latDeg, lonRad) {
  const la = latDeg * DEG, cl = Math.cos(la);
  return [cl * Math.cos(lonRad), Math.sin(la), cl * Math.sin(lonRad)];
}

/* Weather systems shared by every layer of the Earth stack, so the storm layer's
   shields and the cirrus sit on the same cyclones the base layer spirals around. */
function makeSystems(rng, storminess) {
  const cyc = [];
  for (const hemi of [1, -1]) {
    // The southern storm track is the stronger one on Earth (and on Kerbin's maps).
    const n = Math.max(0, Math.round((hemi < 0 ? 6 : 5) * storminess));
    for (let i = 0; i < n; i++) {
      const lat = hemi * (40 + rng() * 24), lon = rng() * TAU;
      cyc.push({ c: dirOf(lat, lon), lat, R: 0.15 + rng() * 0.13, str: 0.7 + rng() * 0.6,
        spin: hemi, a0: rng() * TAU, tropical: false });
    }
  }
  const nTC = Math.round(rng() * 2.4 * storminess);
  for (let i = 0; i < nTC; i++) {
    const hemi = rng() < 0.6 ? 1 : -1, lat = hemi * (12 + rng() * 14);
    cyc.push({ c: dirOf(lat, rng() * TAU), lat, R: 0.045 + rng() * 0.035, str: 1.4, spin: hemi, a0: rng() * TAU, tropical: true });
  }
  // local tangent frames for bearings
  for (const s of cyc) {
    const [cx, cy, cz] = s.c;
    let ex = -cz, ez = cx; const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;   // east = up × c
    s.e = [ex, 0, ez];
    s.n = [cy * ez, cz * ex - cx * ez, -cy * ex];                                     // north = c × east
  }
  return cyc;
}

const tick0 = () => Promise.resolve();

/* ============================================================ EARTH */
const EARTH_BASE_ZONAL = [[-90, 0.60], [-75, 0.58], [-50, 0.48], [-30, 0.25], [-12, 0.16], [0, 0.20], [6, 0.21], [12, 0.18], [30, 0.24], [50, 0.44], [75, 0.63], [90, 0.62]];
const EARTH_TOP_ZONAL = [[-90, 0.66], [-75, 0.64], [-50, 0.32], [-30, 0.12], [-12, 0.07], [-5, 0.12], [0, 0.26], [5, 0.30], [12, 0.14], [30, 0.11], [50, 0.23], [75, 0.62], [90, 0.64]];

async function earth(w, h, o, tick) {
  const seed = o.seed | 0, amount = o.amount ?? 1, storm = o.storminess ?? 1;
  const fq = 1 / Math.max(0.3, Math.min(3, o.scale ?? 1));            // cloud size (> 1 = bigger features)
  const rng = mulberry32(seed * 7919 + 17);
  const sim = new Simplex3(seed + 101), sim2 = new Simplex3(seed + 202), sim3 = new Simplex3(seed + 303);
  const sys = makeSystems(rng, storm);
  const n = w * h, land = o.land || null;

  const G = new Float32Array(n), TEX = new Float32Array(n), CONV = new Float32Array(n);
  const ARM = new Float32Array(n), ITCZ = new Float32Array(n), POLAR = new Float32Array(n);
  const FIB = new Float32Array(n), PATCH = new Float32Array(n), OPEN = new Float32Array(n);
  const rp = [0, 0, 0];
  // The ITCZ meanders; a fixed latitude reads as a ruled line.
  const itczLat = lon => 6 + 5 * sim2.noise(Math.cos(lon) * 1.3, 4.2, Math.sin(lon) * 1.3);

  for (let y = 0; y < h; y++) {
    const latDeg = 90 - (y + 0.5) / h * 180, la = latDeg * DEG, cl = Math.cos(la), sl = Math.sin(la), alat = Math.abs(latDeg);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, lon = (x + 0.5) / w * TAU - Math.PI;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const lnd = land ? land[i] : 0, ocean = 1 - lnd;

      // ---- cyclones: a GENTLE domain twist plus soft comma shields ----
      // (a strong twist wound the noise into cartoon tentacles)
      let arm = 0, cdo = 0, qx = px, qy = py, qz = pz;
      for (let k = 0; k < sys.length; k++) {
        const s = sys[k];
        const dot = px * s.c[0] + py * s.c[1] + pz * s.c[2];
        if (dot < 0.8) continue;
        const d = Math.acos(Math.min(1, dot)), reach = s.R * 2.2;
        if (d > reach) continue;
        const f = 1 - d / reach;
        rotateAbout(qx, qy, qz, s.c[0], s.c[1], s.c[2], s.spin * s.str * (s.tropical ? 4.0 : 1.7) * f * f, rp);
        qx = rp[0]; qy = rp[1]; qz = rp[2];
        const tx = px - s.c[0] * dot, ty = py - s.c[1] * dot, tz = pz - s.c[2] * dot;
        const bear = Math.atan2(tx * s.n[0] + ty * s.n[1] + tz * s.n[2], tx * s.e[0] + tz * s.e[2]);
        const rr = Math.max(d, s.R * 0.03) / s.R;
        const armAng = s.a0 + s.spin * (s.tropical ? 2.6 : 1.5) * Math.log(rr);
        let dA = (bear - armAng) % TAU; if (dA > Math.PI) dA -= TAU; else if (dA < -Math.PI) dA += TAU;
        const ring = sstep(0.1, 0.5, rr) * (1 - sstep(1.1, 2.2, rr));
        if (s.tropical) {
          const eye = 1 - sstep(0.05, 0.12, rr);
          cdo += s.str * ((1 - sstep(0.3, 0.65, rr)) - eye * 1.7);
          arm += s.str * 0.6 * gauss(dA, 0, 0.55) * ring;
        } else {
          // broad comma: the frontal band plus a dense head, both soft-edged
          arm += s.str * (0.8 * gauss(dA, 0, 0.75) * ring + 0.55 * (1 - sstep(0.05, 0.65, rr)));
        }
      }

      // ---- synoptic field ----
      const ax = qx, ay = qy * 1.6, az = qz;
      const wx = sim2.fbm(ax * 1.4 + 3.1, ay * 1.4, az * 1.4, { octaves: 3, persistence: 0.5 });
      const wy = sim2.fbm(ax * 1.4, ay * 1.4 + 7.7, az * 1.4, { octaves: 3, persistence: 0.5 });
      const wz = sim2.fbm(ax * 1.4, ay * 1.4, az * 1.4 + 5.3, { octaves: 3, persistence: 0.5 });
      const bx = ax + wx * 0.45, by = ay + wy * 0.45, bz = az + wz * 0.45;
      const F = sim.fbm(bx * 2.2 * fq, by * 2.2 * fq, bz * 2.2 * fq, { octaves: 6, persistence: 0.56 });
      // internal cloud texture — what turns flat white blobs into broken, lumpy cloud
      // Mostly unwarped: sampling the texture in the fully warped domain streaked it
      // into marble. Real cloud texture is lumpy, not flowing.
      const tx2 = px + wx * 0.12, ty2 = py * 1.25 + wy * 0.12, tz2 = pz + wz * 0.12;
      const tex = sim3.fbm(tx2 * 12 * fq, ty2 * 12 * fq, tz2 * 12 * fq, { octaves: 5, persistence: 0.6 });

      // ---- stratocumulus cells, kept subtle ----
      const regional = sim3.fbm(px * 1.6 + 11, py * 1.6, pz * 1.6, { octaves: 2, persistence: 0.5 });
      const scMask = gauss(alat, 23, 8) * ocean * sstep(-0.25, 0.35, regional);
      const openMask = sstep(36, 48, alat) * (1 - sstep(62, 74, alat)) * ocean * sstep(-0.15, 0.4, -regional);
      let cells = 0;
      if (scMask + openMask > 0.03) {
        // warp the cell lattice so cells vary in size and don't tile like a honeycomb print
        const jx = sim.noise(px * 9 * fq, py * 9 * fq, pz * 9 * fq) * 0.35;
        const c = worley((px + jx * 0.02) * 48 * fq, (py + jx * 0.02) * 48 * fq, pz * 48 * fq, seed + 900);
        cells = scMask * ((1 - sstep(0.1, 0.6, c.f1)) - 0.5) * 0.55
              + openMask * ((1 - sstep(0.02, 0.25, c.f2 - c.f1)) - 0.55) * 0.45;
      }

      // ---- ITCZ: irregular convective clusters along a meandering band ----
      const band = gauss(latDeg, itczLat(lon), 6.5);
      let itcz = 0;
      if (band > 0.03) {
        const cl2 = sim2.fbm(bx * 5.5 * fq + 21, by * 3.5 * fq, bz * 5.5 * fq, { octaves: 4, persistence: 0.55 });
        itcz = band * sstep(0.0, 0.45, cl2);
      }

      const landMod = lnd * (-0.5 * gauss(alat, 25, 9) + 0.22 * gauss(latDeg, 3, 14) + 0.12 * gauss(alat, 50, 12));

      G[i] = F * 0.95 + arm * 0.75 + cdo * 1.1 + cells + itcz * 0.85 + landMod + tex * 0.2;
      TEX[i] = tex;
      ARM[i] = arm + cdo * 1.2;
      ITCZ[i] = itcz;
      OPEN[i] = openMask;
      CONV[i] = clamp01(gauss(latDeg, 5, 14) + 0.4 * gauss(alat, 22, 9) + 0.25 * gauss(alat, 46, 12) + openMask * 0.5 + lnd * 0.35 * gauss(alat, 14, 16));
      POLAR[i] = sstep(55, 75, alat);
      // cirrus: fibrous (ridged, stretched along the flow) inside irregular patches
      FIB[i] = Math.pow(1 - Math.abs(sim.noise(bx * 3.5 * fq, by * 16 * fq, bz * 3.5 * fq)), 2) * (0.6 + 0.4 * (1 - Math.abs(sim2.noise(bx * 9 * fq, by * 30 * fq, bz * 9 * fq))));
      PATCH[i] = sstep(-0.25, 0.55, sim2.fbm(px * 2.4 * fq + 90, py * 2.4 * fq, pz * 2.4 * fq, { octaves: 3, persistence: 0.5 }));
    }
    if (y % 24 === 0) await tick(y / h * 0.5);
  }

  // ---- BASE layer: soft threshold, then broken up by the internal texture ----
  const breakup = new Float32Array(n);
  for (let i = 0; i < n; i++) breakup[i] = 0.52 + 0.48 * sstep(-0.55, 0.45, TEX[i]);
  const baseCov = calibrateRows(G, w, h, y => zonal(EARTH_BASE_ZONAL, 90 - (y + 0.5) / h * 180) * amount, 0.42, new Float32Array(n), breakup);

  const baseType = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const latDeg = 90 - (y + 0.5) / h * 180, la = latDeg * DEG, cl = Math.cos(la), sl = Math.sin(la);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (baseCov[i] < 0.02) { baseType[i] = 0.02; continue; }
      const lon = (x + 0.5) / w * TAU - Math.PI;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const reg = sim3.fbm(px * 4 + 40, py * 4, pz * 4, { octaves: 3, persistence: 0.5 }) * 0.5 + 0.5;
      const cu = CONV[i] * (0.45 + 0.75 * reg) + OPEN[i] * 0.3;
      let t = 0.02 + 0.2 * sstep(0.2, 0.95, cu);
      // Towers. Worley f1 < r is a hit inside a 3D BALL, so the hit rate grows as r³ —
      // r has to be far larger than a 2D intuition suggests.
      // Convection organises into clusters; an even scatter reads as a starfield.
      const clump = sstep(0.05, 0.5, sim2.fbm(px * 7 * fq + 13, py * 7 * fq, pz * 7 * fq, { octaves: 3, persistence: 0.5 }));
      const dens = (CONV[i] * CONV[i] + ARM[i] * 0.15 + ITCZ[i] * 0.6) * storm * clump * 3.2;
      if (dens > 0.05 && baseCov[i] > 0.25) {
        const jx = sim.noise(px * 20 * fq, py * 20 * fq, pz * 20 * fq) * 0.3;
        const c = worley(px * 50 * fq + jx, py * 50 * fq, pz * 50 * fq - jx, seed + 1300);
        const r = 0.36 * Math.sqrt(Math.min(1, dens));
        if (c.f1 < r) t = Math.max(t, 0.32 + 0.68 * sstep(0, 0.85, 1 - c.f1 / r));
      }
      baseType[i] = t;
    }
    if (y % 48 === 0) await tick(0.5 + y / h * 0.15);
  }

  // ---- STORM layer: smooth anvil shields, not a copy of the base texture ----
  const rad = Math.max(2, Math.round(w / 170));
  const Gs = blurField(G, w, h, rad), As = blurField(ARM, w, h, rad), Is = blurField(ITCZ, w, h, rad);
  const topField = new Float32Array(n);
  for (let i = 0; i < n; i++) topField[i] = Gs[i] * 0.55 + As[i] * 0.85 + POLAR[i] * 0.75 + Is[i] * 1.4 + (baseCov[i] - 0.4) * 0.3 + TEX[i] * 0.06;
  const softTex = new Float32Array(n);
  for (let i = 0; i < n; i++) softTex[i] = 0.72 + 0.28 * sstep(-0.6, 0.6, TEX[i]);
  const topCov = calibrateRows(topField, w, h, y => zonal(EARTH_TOP_ZONAL, 90 - (y + 0.5) / h * 180) * amount, 0.3, new Float32Array(n), softTex);

  const topType = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const latDeg = 90 - (y + 0.5) / h * 180, la = latDeg * DEG, cl = Math.cos(la), sl = Math.sin(la);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (topCov[i] < 0.35) continue;
      // Where thunderstorms fire: tropical convection, but also embedded in mid-latitude
      // frontal shields (Kerbin's storm map has cores at every latitude, ~uniformly).
      const act = (CONV[i] * 0.9 + ARM[i] * 0.8 + ITCZ[i] * 0.8 + 0.15 * (1 - POLAR[i])) * storm;
      if (act < 0.12) continue;
      const lon = (x + 0.5) / w * TAU - Math.PI;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      const jx = sim2.noise(px * 25 * fq, py * 25 * fq, pz * 25 * fq) * 0.3;
      const c = worley(px * 55 * fq + jx, py * 55 * fq, pz * 55 * fq + jx, seed + 1700);
      const clump = sstep(0.0, 0.45, sim2.fbm(px * 7 * fq + 13, py * 7 * fq, pz * 7 * fq, { octaves: 3, persistence: 0.5 }));
      // r × 1.4 with a core cut at k > 0.62 keeps the core the same size (0.38 × 1.4 ≈ 0.53 r)
      // while giving it a wider 'edge' halo, matching the stock core:edge ratio.
      const r = 1.4 * 0.46 * Math.sqrt(Math.min(1, act)) * (0.55 + 0.45 * clump);
      if (c.f1 < r) { const k = 1 - c.f1 / r; topType[i] = k > 0.62 ? 1 : 0.5 * sstep(0.02, 0.62, k); }  // core / edge / trail
    }
    if (y % 48 === 0) await tick(0.65 + y / h * 0.12);
  }

  // ---- CIRRUS: fibrous patches tied to fronts, convection and the jets ----
  const cirField = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const alat = Math.abs(90 - (y + 0.5) / h * 180);
    const jets = 0.25 + 0.35 * gauss(alat, 32, 10) + 0.3 * gauss(alat, 55, 12);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      cirField[i] = FIB[i] * PATCH[i] * (jets + As[i] * 0.5 + Is[i] * 0.6 + topType[i] * 0.4);
    }
  }
  const cirCov = calibrateGlobal(cirField, n, 0.08 * (o.cirrus ?? 1), 0.3, new Float32Array(n));
  const cirType = new Float32Array(n);
  for (let i = 0; i < n; i++) cirType[i] = clamp01(PATCH[i] * 0.7 + FIB[i] * 0.3);
  await tick(0.88);

  const thickBase = new Float32Array(n), thickTop = new Float32Array(n);
  for (let i = 0; i < n; i++) { thickBase[i] = baseCov[i] * (0.6 + 0.4 * baseType[i]); thickTop[i] = topCov[i] * (0.7 + 0.3 * topType[i]); }
  return {
    base: { coverage: baseCov, type: baseType, scaled: toScaled(baseCov, c => 0.3 + 0.7 * Math.pow(c, 0.7)), normal: toNormal(thickBase, w, h) },
    storm: { coverage: topCov, type: topType, scaled: toScaled(topCov, c => 0.25 + 0.75 * c), normal: toNormal(thickTop, w, h, 0.8) },
    // cirrus is translucent from orbit: alpha well below its coverage
    cirrus: { coverage: cirCov, type: cirType, scaled: toScaledAlpha(cirCov, () => 0.97, 0.7) },
  };
}

/* ============================================================ VENUS */
async function venus(w, h, o, tick) {
  const seed = o.seed | 0, amount = o.amount ?? 1, contrast = o.features ?? 1;
  const sim = new Simplex3(seed + 11), sim2 = new Simplex3(seed + 22), sim3 = new Simplex3(seed + 33);
  const n = w * h;
  const lowCov = new Float32Array(n), lowType = new Float32Array(n);
  const upCov = new Float32Array(n), upType = new Float32Array(n), albedo = new Float32Array(n);
  // Cloud size: > 1 = bigger streaks, cells and towers (every feature frequency is divided by it).
  const fq = 1 / Math.max(0.3, Math.min(3, o.scale ?? 1));
  // The dark sideways Y, drawn fresh for every seed. `yRandom` 0 = the textbook Y, 1 = wild:
  // lopsided arms at different latitudes and lengths, curved or kinked, a fork off the
  // equator, sometimes a third (psi) arm, the whole thing bent and broken up by noise.
  const yr = clamp01(o.yRandom ?? 0.6), yStr = Math.max(0, o.yStrength ?? 1);
  const rnd = mulberry32((seed * 7919 + 404) >>> 0);
  const J = a => (rnd() * 2 - 1) * a * yr;
  const PI = Math.PI;
  const y0 = yr > 0 ? rnd() * TAU : (seed % 360) * DEG;             // where the Y opens
  const forkLat = J(9);                                               // fork / stem latitude
  const armN = { top: 32 + J(16), w: Math.max(5.5, 7 * (1 + J(0.45))), rise: 1.34 * (1 + J(0.55)), curve: Math.exp(J(0.7)), gain: 1 - 0.5 * Math.max(0, J(1)), end: PI * (0.75 + J(0.2)) };
  const armS = { top: 32 + J(16), w: Math.max(5.5, 7 * (1 + J(0.45))), rise: 1.34 * (1 + J(0.55)), curve: Math.exp(J(0.7)), gain: 1 - 0.5 * Math.max(0, J(1)), end: PI * (0.75 + J(0.2)) };
  if (rnd() < 0.5) armN.gain = Math.max(armN.gain, 1); else armS.gain = Math.max(armS.gain, 1);  // one arm stays full
  const stemW = Math.max(5.5, 7 * (1 + J(0.4))), stemA = PI * (1.25 + J(0.15)), stemB = Math.min(TAU - 0.15, stemA + PI * 0.45 * (1 + J(0.4)));
  const psi = rnd() < 0.45 * yr ? { gain: 0.45 + 0.4 * rnd(), end: PI * (0.3 + 0.35 * rnd()) } : null;
  const warpLat = 16 * yr, warpLon = 0.5 * yr, breakAmt = 0.45 * yr;
  const armCurve = (A, rel, sign) => {                                 // arm latitude west of the fork
    const t = Math.min(1, rel / Math.max(0.2, A.rise));
    return forkLat + (sign * A.top - forkLat) * Math.pow(t, A.curve);
  };
  // arms leave the fork at the stem's width and strength, then grow into their own,
  // so there is no step where the stem (rel -> 2pi) meets the arms (rel -> 0)
  const armW = (A, rel) => { const t = sstep(0, A.rise, rel); return stemW + (A.w - stemW) * t; };
  const armG = (A, rel) => 1 + (A.gain - 1) * sstep(0, A.rise, rel);

  for (let y = 0; y < h; y++) {
    const latDeg = 90 - (y + 0.5) / h * 180, la = latDeg * DEG, cl = Math.cos(la), sl = Math.sin(la), alat = Math.abs(latDeg);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, lon = (x + 0.5) / w * TAU - Math.PI;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);

      // Super-rotation shears everything into long zonal streaks: stretch hard in latitude.
      const streak = sim.fbm(px * 2.2 * fq, py * 14 * fq, pz * 2.2 * fq, { octaves: 5, persistence: 0.55 });
      // Bow-shaped streaks: features lean poleward as they run west.
      const bow = sim2.fbm((px * 3 + py * 2.4) * fq, py * 9 * fq, (pz * 3 - py * 2.4) * fq, { octaves: 4, persistence: 0.5 });

      // Dark sideways Y: a dark stem that forks into two arms. Both branches blend
      // continuously: the arms converge on the fork latitude at rel = 0, where the stem
      // arrives from the east (rel -> 2pi); a hard switch between them left a vertical seam.
      // Low-frequency warps bend the whole shape so no two seeds share the same letter.
      // smooth, large bends only: higher octaves made the arms jagged like lightning
      const wl = warpLat ? sim3.fbm(px * 0.9 + 7, py * 0.9, pz * 0.9, { octaves: 2, persistence: 0.35 }) * warpLat : 0;
      const wo = warpLon ? sim3.noise(px * 0.8 - 4, py * 0.8 + 9, pz * 0.8) * warpLon : 0;
      const lat = latDeg + wl;
      const rel = ((lon - y0 + wo) % TAU + TAU) % TAU;               // 0..2pi, measured west of the fork
      const fadeN = 1 - sstep(armN.end, armN.end + PI * 0.35, rel), fadeS = 1 - sstep(armS.end, armS.end + PI * 0.35, rel);
      let yDark = Math.max(
        gauss(lat, armCurve(armN, rel, 1), armW(armN, rel)) * fadeN * armG(armN, rel),
        gauss(lat, armCurve(armS, rel, -1), armW(armS, rel)) * fadeS * armG(armS, rel),
        gauss(lat, forkLat, stemW) * sstep(stemA, stemB, rel));
      if (psi) yDark = Math.max(yDark, gauss(lat, forkLat, stemW * 0.8) * (1 - sstep(psi.end * 0.6, psi.end, rel)) * (1 + (psi.gain - 1) * sstep(0, 0.6, rel)));
      if (breakAmt) yDark *= 1 - breakAmt * sstep(0.1, 0.6, sim3.fbm(px * 2.2 + 31, py * 3.5, pz * 2.2, { octaves: 2, persistence: 0.4 }));
      yDark *= yStr;
      // Mottled convective cells in the low-latitude, sunlit region.
      let cells = 0;
      if (alat < 45) {
        const jx = sim.noise(px * 7 * fq, py * 7 * fq, pz * 7 * fq) * 0.5;
        const c = worley(px * 24 * fq + jx, py * 24 * fq, pz * 24 * fq - jx, seed + 70);
        const patch = sstep(-0.3, 0.4, sim2.fbm(px * 3 * fq + 9, py * 3 * fq, pz * 3 * fq, { octaves: 3, persistence: 0.5 }));
        cells = (1 - sstep(0.04, 0.32, c.f2 - c.f1)) * gauss(latDeg, 0, 17) * patch;
      }
      // Bright cold collar ~65–72°, darker polar vortex region inside it.
      const collar = gauss(alat, 68, 4);
      const vortex = sstep(74, 88, alat) * (0.5 + 0.5 * sim2.noise(px * 6, py * 6, pz * 6));

      albedo[i] = clamp01(0.78 + contrast * (streak * 0.08 + bow * 0.06 - yDark * 0.22 - cells * 0.05 + collar * 0.12 - vortex * 0.1));

      // Upper deck: unbroken overcast (Eve's own upper coverage map is solid white);
      // the faint variation just gives the raymarcher something to shape.
      upCov[i] = clamp01((0.93 + 0.07 * sstep(-0.4, 0.4, streak)) * amount);
      // Cloud TYPE follows the big streaks and the polar collar only. It used to add the
      // convective cells, which are the EDGES of a Voronoi pattern (f2 - f1 small): the
      // dense cloud type then ran along every cell wall and the deck rendered as a
      // honeycomb of polygonal walls from orbit. The cells stay a faint mottling in the
      // albedo, where they belong.
      const upVar = sim2.fbm(px * 5 * fq + 3, py * 5 * fq, pz * 5 * fq, { octaves: 3, persistence: 0.5 });
      upType[i] = clamp01(0.15 + Math.max(0, bow) * 0.3 + collar * 0.25 + upVar * 0.12);

      // Lower deck: Eve's lower coverage is a mid-grey noise field (mean ~0.5).
      const lowN = sim.fbm(px * 4 * fq + 50, py * 4 * fq, pz * 4 * fq, { octaves: 5, persistence: 0.55 });
      lowCov[i] = clamp01((0.52 + lowN * 0.35 + cells * 0.1) * amount);
      // Pillars: scattered small lumps in a thin stratus, like Eve's PerlinPillars. At
      // frequency 6 the lumps were ~180 km blobs that joined into a network of towering
      // walls (the other half of the honeycomb). High-frequency, thresholded = separate towers.
      const lump = sim2.fbm(px * 26 * fq, py * 26 * fq, pz * 26 * fq, { octaves: 3, persistence: 0.5 });
      lowType[i] = clamp01(sstep(0.18, 0.55, lump) * (0.6 + 0.4 * sstep(-0.2, 0.4, lowN)));
    }
    if (y % 24 === 0) await tick(y / h * 0.95);
  }
  // Measured from Eve's stock maps: EveCoverage .642/.067 and PerlinPillars .156/.219.
  // PerlinPillars is mostly thin stratus with scattered dense lumps; the old even ~0.24
  // type map mixed the cloud types uniformly and the deck read as a flat sheet.
  matchStats(lowCov, 0.642 * Math.min(1.2, amount), 0.067);
  matchStats(lowType, 0.156, 0.219);
  matchStats(upType, 0.156, 0.219);
  return {
    lower: { coverage: lowCov, type: lowType, scaled: toScaled(lowCov, (c, i) => 0.55 + 0.45 * c) },
    upper: { coverage: upCov, type: upType, scaled: toScaled(upCov, (c, i) => albedo[i]) },
  };
}

/* ============================================================ MARS */
async function mars(w, h, o, tick) {
  const seed = o.seed | 0, amount = o.amount ?? 1;
  const sim = new Simplex3(seed + 31), sim2 = new Simplex3(seed + 62);
  const fq = 1 / Math.max(0.3, Math.min(3, o.scale ?? 1));            // cloud size (> 1 = bigger features)
  const n = w * h;
  const dustF = new Float32Array(n), cirF = new Float32Array(n), cirT = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const latDeg = 90 - (y + 0.5) / h * 180, la = latDeg * DEG, cl = Math.cos(la), sl = Math.sin(la), alat = Math.abs(latDeg);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, lon = (x + 0.5) / w * TAU - Math.PI;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      // Regional dust hazes, favouring the southern mid-latitudes (Hellas / southern spring).
      dustF[i] = sim.fbm(px * 2.6 * fq, py * 3.2 * fq, pz * 2.6 * fq, { octaves: 5, persistence: 0.55 }) + 0.35 * gauss(latDeg, -38, 18);
      // Water-ice cloud: polar hoods + the equatorial aphelion cloud belt, both wispy.
      // Polar hoods are extensive diffuse haze with streaks through it; the aphelion belt
      // is broad and thin. Hard-thresholded ridges made both look like rows of blobs.
      const streakM = Math.pow(1 - Math.abs(sim2.noise(px * 3 * fq, py * 14 * fq, pz * 3 * fq)), 2);
      const haze = 0.5 + 0.5 * sim.fbm(px * 5 * fq, py * 5 * fq, pz * 5 * fq, { octaves: 4, persistence: 0.55 });
      const hood = sstep(45, 62, alat) * (1 - sstep(82, 90, alat));
      const belt = gauss(latDeg, 10, 13);
      cirF[i] = hood * (haze * 0.75 + streakM * 0.35) + belt * streakM * haze * 0.9;
      cirT[i] = clamp01(0.5 + 0.5 * sim2.noise(px * 3, py * 3, pz * 3));
    }
    if (y % 24 === 0) await tick(y / h * 0.9);
  }
  // Stock Duna: DustScatteredCoverage mean .047, DunaCirrus .004 — the layers' density
  // curves expect sparse input; 0.14 / 0.07 over-clouded it. Kept a little above stock so
  // the preset still reads as Mars rather than an empty sky.
  const dust = calibrateGlobal(dustF, n, 0.06 * amount, 0.25, new Float32Array(n));
  const cir = calibrateGlobal(cirF, n, 0.02 * (o.cirrus ?? 1), 0.3, new Float32Array(n));
  return {
    dust: { coverage: dust, scaled: toScaled(dust, c => 0.7) },
    cirrus: { coverage: cir, type: cirT, scaled: toScaledAlpha(cir, () => 0.97, 0.75) },
  };
}

const GENERATORS = { earth, venus, mars };

/**
 * Build every map a cloud-stack preset needs.
 * @param {'earth'|'venus'|'mars'} preset
 * @param {number} w  width (height is w/2 by convention, but pass it explicitly)
 * @param {object} o  { seed, amount, storminess, cirrus, features, land: Float32Array|null }
 * @param {(frac:number)=>Promise} tick  progress/yield callback
 * @returns {Promise<Record<string, {coverage, type?, scaled, normal?}>>}  greyscale planes as
 *          Uint8ClampedArray (w*h), scaled/normal as RGBA (w*h*4); row 0 = north.
 */
export async function buildCloudStack(preset, w, h, o = {}, tick = tick0) {
  const gen = GENERATORS[preset] || GENERATORS.earth;
  const raw = await gen(w, h, o, tick);
  const out = {};
  for (const [key, L] of Object.entries(raw)) {
    out[key] = { coverage: toGrey(L.coverage), scaled: L.scaled };
    if (L.type) out[key].type = toGrey(L.type);
    if (L.normal) out[key].normal = L.normal;
  }
  await tick(1);
  return out;
}

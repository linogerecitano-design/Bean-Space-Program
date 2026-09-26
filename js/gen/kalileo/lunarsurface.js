// From Kalileo (C:/Users/ofici/Downloads/Kalileo/js/lunarsurface.js), vendored into Bean Space Program.
/* ============================================================================
   lunarsurface.js — the full-moon look: young rayed craters, bright ejecta,
   fresh-crater specks and mottled highlands.

   At full moon the Sun is behind the observer, so there are almost no shadows:
   what you see is ALBEDO, and lunar albedo is set by SURFACE AGE, not height.
   Fresh material is bright; space weathering slowly darkens it. That gives:
     • Young rayed craters (Tycho, Copernicus, Kepler, Aristarchus): a bright
       continuous ejecta blanket out to ~1–2 crater radii, then long, broken,
       feathery RAYS running along great circles. Tycho (85 km across) throws
       rays past 1,500 km — ~35 crater radii — straight across the maria.
       Rays are chains of secondary-impact streaks, not solid lines.
     • A thin dark collar of impact melt just outside some fresh rims (Tycho).
     • Countless small fresh craters, too small to see in relief, that still
       show as bright specks with a heavy-tailed brightness distribution.
     • Highland albedo mottling at several scales.
     • Maria stay dark (maria.js) but rays and specks cross them.
   Albedo reference: maria ~0.07, highlands ~0.11–0.18, fresh ejecta/rays ~0.2–0.3,
   Aristarchus (brightest) ~0.3.

   Pure JS (noise.js + craters.js). Coordinates follow craters.js stampCrater:
   lon 0..2π from x = 0, lat −π/2..π/2, row 0 = north.
============================================================================ */

import { Simplex3, mulberry32, sphereFbmGrid, sampleSphereGrid } from './noise.js';
import { stampCrater, applyCraterLayer } from './craters.js';

const TAU = Math.PI * 2;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export const LUNAR_DEFAULTS = {
  enabled: false,
  seed: 11,
  youngCraters: 12,       // rayed craters
  minDiameter: 25,        // km
  maxDiameter: 95,        // km (Tycho 85, Copernicus 93)
  rayCount: 30,           // rays per crater (the biggest gets more)
  rayLength: 22,          // in crater radii (Tycho's longest ~35)
  rayWidth: 0.32,         // in crater radii (never thinner than ~6 km)
  rayBrightness: 0.62,
  haloStrength: 0.6,      // bright continuous ejecta blanket
  nimbus: 0.35,           // broad bright splash zone around big rayed craters
  darkCollar: 0.4,        // thin dark melt ring just outside the rim
  specks: 100000,         // small fresh craters, seen only as bright spots
  speckBrightness: 0.1,
  mottling: 0.25,         // highland brightness variation
  rayColor: '#ebe8e2',
  stampRelief: true,      // also cut the rayed craters into the terrain
  saturation: 0.7,        // highland crater saturation: layers upon layers of overlapping craters
  saturationLargest: 7,   // largest saturation crater, % of the body radius (Moon: ~120 km)
  heightTone: 0.3,        // colour map: high ground a little brighter than low ground
  slopeTone: 0.35,        // colour map: steep walls brighter (fresh rock keeps sliding down them)
  reliefTone: 0.5,        // colour map: crater rims and peaks lighter, floors and pits darker
  scaleWithRadius: true,  // km sizes describe a Moon-sized body and shrink with the radius
  refRadius: 1737000,
};

function hexRGB(h) {
  h = String(h || '#ebe8e2').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/* Deterministic plan shared by the relief and albedo passes, so rays leave the
   exact crater that was stamped. The first crater is the showpiece (largest,
   freshest, most rays) — every rayed Moon has its Tycho. */
/* focusLon (radians, this module's 0..2π convention): where the showpiece crater should land —
   the maria side, like Tycho on the Moon's near side. Others stay uniform over the sphere. */
const lunarScale = (o, planetRadius) =>
  o.scaleWithRadius === false ? 1 : Math.max(0.01, planetRadius / (o.refRadius || 1737000));

export function planYoungCraters(o, planetRadius, focusLon = null) {
  const rng = mulberry32(((o.seed | 0) || 11) * 2246822519 + 3);
  const kR = lunarScale(o, planetRadius);
  const out = [];
  const n = Math.max(0, Math.round(o.youngCraters ?? 7));
  const minD = o.minDiameter ?? 25, maxD = Math.max(minD, o.maxDiameter ?? 95);
  for (let k = 0; k < n; k++) {
    let lat = Math.asin(rng() * 2 - 1), lon = rng() * TAU;
    const hero = k === 0;
    if (hero && focusLon != null) { lon = focusLon + (lon / TAU - 0.5) * 1.6; lat = lat * 0.55; }
    const dRef = hero ? maxD : minD + Math.pow(rng(), 1.8) * (maxD - minD);
    const dKm = dRef * kR;
    const R = Math.min(0.5, (dKm * 1000 / 2) / Math.max(1, planetRadius));
    const age = hero ? 0 : rng();
    const bright = 1 - 0.4 * age;                         // older rays have faded
    const nr = Math.max(3, Math.round((o.rayCount ?? 22) * (hero ? 1.5 : 0.6 + 0.8 * rng())));
    const rays = [];
    for (let r = 0; r < nr; r++) {
      // ~30% of rays cluster near an earlier one: real ray systems are lumpy, not a starburst
      let bearing = rng() * TAU;
      if (rays.length && rng() < 0.3) bearing = rays[Math.floor(rng() * rays.length)].bearing + (rng() - 0.5) * 0.3;
      bearing = ((bearing % TAU) + TAU) % TAU;
      rays.push({
        bearing,
        len: Math.min(1.2, R * (o.rayLength ?? 22) * (0.3 + 0.7 * Math.pow(rng(), 0.7)) * (hero ? 1.25 : 1)),
        // floor ~6 km: at a width of a fraction of a pixel the rays simply vanished on smaller craters
        width: Math.max(6000 * kR / Math.max(1, planetRadius), R * (o.rayWidth ?? 0.32) * (0.5 + rng())),
        str: 0.5 + 0.5 * rng(),
        seed: rng() * 1000,
      });
    }
    rays.sort((a, b) => a.bearing - b.bearing);
    out.push({ lat, lon, R, dKm, dRef, bright, rays, collar: hero || rng() < 0.45, maxLen: Math.max(R * 3, ...rays.map(r => r.len)) });
  }
  return out;
}

/**
 * Crater SATURATION: the lunar highlands are cratered so densely that every new
 * impact erases older ones, at every size, so the surface never goes smooth.
 * Built as size bands, each half the diameter of the one before, from a large size
 * down to ~2.5 pixels. Big (old) bands are stamped first and smaller (younger) ones
 * carve over them — stampCrater's carve mode cuts relative to the height at the new
 * crater's centre, which is exactly how a fresh impact overprints older terrain.
 * Counts put each band over roughly half the surface, a size-frequency law close to
 * lunar equilibrium. Band seeds are fixed from the largest down, so the big craters
 * are identical at every resolution and higher resolutions simply add finer bands.
 * Run BEFORE the maria, so the flood embays this rugged surface (which is what makes
 * mare shorelines jagged) and buries it to ghost craters.
 */
export function applyCraterSaturation(field, w, h, o, planetRadius, deformity) {
  const sat = clamp01(o.saturation ?? 0.7);
  if (sat <= 0) return;
  const Rkm = Math.max(1, planetRadius / 1000);
  const kmPerPx = TAU * Rkm / w;
  let dMax = Math.max(1, (o.saturationLargest ?? 7) / 100 * Rkm);
  const sphereKm2 = 4 * Math.PI * Rkm * Rkm;
  for (let k = 0; k < 10; k++) {
    const dMin = dMax / 2;
    if (dMin < kmPerPx * 2.5) break;                        // sub-pixel: nothing to see
    const dMean = (dMin + dMax) / 2;
    const count = Math.min(400000, Math.round(sat * 0.56 * sphereKm2 / (Math.PI * (dMean / 2) ** 2)));
    const complex = dMean / Rkm > 0.012;                     // larger ones get flat floors and peaks
    applyCraterLayer(field, w, h, {
      enabled: true, name: `Saturation ${k}`, count, minSize: dMin, maxSize: dMax,
      depthRatio: complex ? 0.04 : 0.1, rimHeightRatio: complex ? 0.015 : 0.03, rimWidth: 0.26,
      floorFlatness: complex ? 0.3 : 0, ejecta: 0.35, sizeBias: 1.3,
      seed: ((o.seed | 0) || 11) * 131 + k * 977, latMin: -90, latMax: 90,
      blend: 'carve', profile: complex ? 'complex' : 'simple', distortion: 0.08, floorRoughness: 0.15,
    }, planetRadius, deformity, null, null);
    dMax = dMin;
  }
}

/** Cut the young rayed craters into the height field (fresh, sharp, deep). */
export function stampYoungCraters(field, w, h, o, planetRadius, deformity, focusLon = null) {
  if (o.stampRelief === false) return;
  for (const [k, c] of planYoungCraters(o, planetRadius, focusLon).entries()) {
    const big = c.dRef > 25;
    stampCrater(field, w, h, {
      latC: c.lat, lonC: c.lon, alpha: c.R,
      depth: (c.dKm * 1000 * 0.055) / deformity,          // Tycho: 85 km wide, ~4.8 km deep
      rimH: (c.dKm * 1000 * 0.022) / deformity,
      rimW: 0.28, floor: big ? 0.35 : 0.05, ejecta: 0.9, carve: true,
      peak: big ? 0.7 : 0, terrace: big ? 0.8 : 0,
      floorRoughness: 0.2, seedSalt: 90001 + k * 7919,
    });
  }
}

/* Separable box blur, x wraps, y clamps. Two passes of this ≈ a Gaussian. */
function boxBlur(src, w, h, r) {
  if (r < 1) return Float32Array.from(src);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[row + ((k % w) + w) % w];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s * inv;
      s += src[row + (x + r + 1) % w] - src[row + ((x - r) % w + w) % w];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.max(0, Math.min(h - 1, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s * inv;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/* |value| percentile from a sparse sample — normalises each term to the map itself. */
function absPercentile(a, q, abs = true) {
  const step = Math.max(1, Math.floor(a.length / 60000)), s = [];
  for (let i = 0; i < a.length; i += step) s.push(abs ? Math.abs(a[i]) : a[i]);
  s.sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

/**
 * Terrain detail in the colour map. Full-moon brightness is albedo, and a flat albedo threw
 * away all the crater detail the height map has (the relief render showed far more than the
 * colour map). Only NON-directional terms — a baked hillshade would put shadows on the wrong
 * side as the sun moves; the normal map does the lighting in game:
 *   height — high ground a little brighter than low ground
 *   slope  — steep walls brighter: fresh rock keeps sliding down them, exposing unweathered material
 *   relief — local convexity at a fine and a medium scale: rims and peaks lighter, floors and pits
 *            darker, which is what makes the crater population read like the relief map
 * Each term is normalised by its own percentile over this map, so the look holds at any
 * resolution, radius and deformity.
 */
export function applyLunarRelief(rgba, field, w, h, o, planetRadius, deformity, mariaMask = null) {
  const hT = Math.max(0, o.heightTone ?? 0.3), sT = Math.max(0, o.slopeTone ?? 0.35), cT = Math.max(0, o.reliefTone ?? 0.5);
  if (hT <= 0 && sT <= 0 && cT <= 0) return;
  const n = w * h;
  const f = field instanceof Float32Array ? field : Float32Array.from(field);

  // true slope, metres per metre
  const S = new Float32Array(n);
  const dyM = Math.PI * planetRadius / h;
  for (let y = 0; y < h; y++) {
    const cl = Math.max(0.15, Math.cos((0.5 - (y + 0.5) / h) * Math.PI));
    const dxM = 2 * Math.PI * planetRadius * cl / w;
    const yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const gx = (f[y * w + (x + 1) % w] - f[y * w + (x - 1 + w) % w]) * deformity / (2 * dxM);
      const gy = (f[yu * w + x] - f[yd * w + x]) * deformity / ((yd - yu) * dyM);
      S[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  // band-pass relief at two scales (difference of blurs)
  const sc = Math.max(1, w / 2048);
  const r1 = Math.max(1, Math.round(1.5 * sc)), r2 = Math.max(r1 + 2, Math.round(6 * sc));
  const b1 = boxBlur(boxBlur(f, w, h, r1), w, h, r1);
  const b2 = boxBlur(boxBlur(b1, w, h, r2), w, h, r2);
  const fine = new Float32Array(n), med = new Float32Array(n);
  for (let i = 0; i < n; i++) { fine[i] = f[i] - b1[i]; med[i] = b1[i] - b2[i]; }

  const sRef = Math.max(1e-6, absPercentile(S, 0.95, false));
  const fRef = Math.max(1e-7, absPercentile(fine, 0.9)), mRef = Math.max(1e-7, absPercentile(med, 0.9));
  const hLo = absPercentile(f, 0.02, false), hHi = absPercentile(f, 0.98, false);
  const hSpan = Math.max(1e-6, hHi - hLo);
  let sMean = 0;
  for (let i = 0; i < n; i += 7) sMean += Math.min(1, S[i] / sRef);
  sMean /= Math.ceil(n / 7);

  for (let i = 0; i < n; i++) {
    const mare = mariaMask ? mariaMask[i] : 0;
    const hC = Math.max(-1, Math.min(1, ((f[i] - hLo) / hSpan - 0.5) * 2));
    const sN = Math.min(1, S[i] / sRef);
    const m = 1
      + hT * 0.14 * hC * (1 - 0.7 * mare)          // maria are already dark; don't sink them further
      + sT * 0.2 * (sN - sMean)
      + cT * (0.13 * Math.tanh(fine[i] / fRef) + 0.11 * Math.tanh(med[i] / mRef));
    const o4 = i * 4;
    rgba[o4] = rgba[o4] * m; rgba[o4 + 1] = rgba[o4 + 1] * m; rgba[o4 + 2] = rgba[o4 + 2] * m;
  }
}

/**
 * Paint the full-moon albedo onto a colour map (RGBA 0..255), in place.
 * @param {Float32Array|null} mariaMask  if present, mottling is softened on the maria
 */
export function applyLunarAlbedo(rgba, w, h, o, planetRadius, mariaMask = null, focusLon = null) {
  const n = w * h;
  const A = new Float32Array(n);          // brightening toward fresh-ejecta colour
  const D = new Float32Array(n);          // darkening (melt collars)
  const sim = new Simplex3((o.seed | 0) + 7717);
  const rayB = o.rayBrightness ?? 0.85, haloS = o.haloStrength ?? 0.6, collarS = o.darkCollar ?? 0.4;

  // ---- rayed craters ----
  for (const c of planYoungCraters(o, planetRadius, focusLon)) {
    const sinLatC = Math.sin(c.lat), cosLatC = Math.cos(c.lat);
    const maxAng = Math.min(Math.PI, c.maxLen);
    const y0 = Math.max(0, Math.floor((0.5 - (c.lat + maxAng) / Math.PI) * h));
    const y1 = Math.min(h - 1, Math.ceil((0.5 - (c.lat - maxAng) / Math.PI) * h));
    const cosMax = Math.cos(maxAng);
    const maxW = Math.max(...c.rays.map(r => r.width)) * 1.8;

    const xC = c.lon / TAU * w;
    for (let y = y0; y <= y1; y++) {
      const lat = (0.5 - (y + 0.5) / h) * Math.PI, sinLat = Math.sin(lat), cosLat = Math.cos(lat);
      // Only the longitudes this crater can actually reach at this latitude. Scanning the whole
      // width for every crater was most of the cost of this pass on a big map.
      const cosHalf = (cosMax - sinLat * sinLatC) / Math.max(1e-9, cosLat * cosLatC);
      if (cosHalf >= 1) continue;
      const halfLon = cosHalf <= -1 ? Math.PI : Math.acos(cosHalf);
      const halfPx = Math.min(w / 2, halfLon / TAU * w + 1);
      const xStart = Math.ceil(xC - halfPx), xEnd = Math.floor(xC + halfPx);
      for (let xx = xStart; xx <= xEnd; xx++) {
        const x = ((xx % w) + w) % w;
        const lon = (xx + 0.5) / w * TAU;
        const dLon = lon - c.lon;
        const cosD = sinLat * sinLatC + cosLat * cosLatC * Math.cos(dLon);
        if (cosD < cosMax) continue;
        const d = Math.acos(Math.min(1, cosD)), i = y * w + x, u = d / c.R;

        // continuous bright ejecta + bright fresh interior
        if (u < 2.8) A[i] += c.bright * haloS * (u < 1 ? 0.7 : 1 - sstep(1.0, 2.8, u)) * (0.75 + 0.25 * sim.noise(lon * 40, lat * 40, c.R * 100));
        if (u > 1 && u < 12) A[i] += c.bright * (o.nimbus ?? 0.35) * Math.exp(-(u - 1) / 3.2) * sstep(1, 1.6, u) * Math.min(1, c.dKm / 60);
        if (c.collar && u > 0.95 && u < 1.4) D[i] += c.bright * collarS * 0.5 * Math.exp(-(((u - 1.13) / 0.09) ** 2));
        if (u < 1.2) continue;

        // proper spherical bearing from the crater, so long rays follow great circles
        const brg = Math.atan2(Math.sin(dLon) * cosLat, cosLatC * sinLat - sinLatC * cosLat * Math.cos(dLon));
        const b0 = (brg + TAU) % TAU, sinD = Math.sin(d);
        // only the rays whose bearing is close enough to reach this pixel
        const win = sinD > 1e-6 ? Math.min(Math.PI, Math.asin(Math.min(1, maxW * 3 / sinD))) : Math.PI;
        // Plain loop with a cheap angular reject: a binary search plus early break ran off the
        // end of the list and skipped rays wrapping past bearing 0 (a visible seam).
        for (let j = 0; j < c.rays.length; j++) {
          const r = c.rays[j];
          let dphi = r.bearing - b0; if (dphi > Math.PI) dphi -= TAU; else if (dphi < -Math.PI) dphi += TAU;
          if (dphi > win || dphi < -win) continue;
          const cross = Math.asin(Math.max(-1, Math.min(1, sinD * Math.sin(dphi))));    // off-ray distance
          const along = d * Math.cos(dphi);
          if (along <= 0 || along > r.len) continue;
          const wd = r.width * (1 + 0.8 * along / r.len);                              // rays widen outward
          const g = Math.exp(-((cross / wd) ** 2));
          if (g < 0.01) continue;
          const fade = (1 - sstep(0.35 * r.len, r.len, along)) * sstep(1.0 * c.R, 1.8 * c.R, along);
          // broken, feathery segments — chains of secondary impacts, not a painted line
          // broad soft swath, broken into feathery segments along its length
          const streak = sstep(-0.65, 0.35, sim.noise(along / (c.R * 1.4) + r.seed, cross / wd * 0.5, r.seed * 0.1))
            * (0.55 + 0.45 * sstep(-0.5, 0.6, sim.noise(along / (c.R * 0.22) + r.seed, cross / wd * 1.6, 3.1)));
          A[i] += c.bright * r.str * rayB * g * fade * streak;
        }
      }
    }
  }

  // ---- small fresh craters: bright specks with a heavy-tailed brightness ----
  const rng = mulberry32(((o.seed | 0) || 11) * 40503 + 17);
  const nSpecks = Math.max(0, Math.round(o.specks ?? 5000));
  const pxAng = TAU / w;
  for (let s = 0; s < nSpecks; s++) {
    const lat = Math.asin(rng() * 2 - 1), lon = rng() * TAU;
    // cluster them: an even sprinkle reads as salt, real fresh craters are patchy
    const cl0 = Math.cos(lat);
    const dens = sstep(-0.35, 0.55, sim.fbm(cl0 * Math.cos(lon) * 3 + 50, Math.sin(lat) * 3, cl0 * Math.sin(lon) * 3, { octaves: 3, persistence: 0.5 }));
    if (rng() > 0.25 + 0.75 * dens) continue;
    const rAng = Math.max(pxAng * 0.9, (0.8 + rng() * 3.5) * 1000 * lunarScale(o, planetRadius) / Math.max(1, planetRadius));
    const b = Math.pow(rng(), 2.8) * (o.speckBrightness ?? 0.6) * 1.25;
    const cy = (0.5 - lat / Math.PI) * h, cx = lon / TAU * w;
    const cosLatS = Math.cos(lat);
    const ry = Math.ceil(3 * rAng / Math.PI * h), rx = Math.ceil(3 * rAng / TAU * w / Math.max(0.15, cosLatS));
    // hot loop: 100k specks x their discs. hypot and exp are both slow in V8 for this, and the
    // falloff only has to be a smooth bump, so it is squared distance and a rational curve.
    const invR2 = 1 / (rAng * rAng), dLonPx = TAU / w * cosLatS;
    for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) {
      if (yy < 0 || yy >= h) continue;
      const dLa = (0.5 - (yy + 0.5) / h) * Math.PI - lat, dLa2 = dLa * dLa;
      const row = yy * w;
      for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
        const dLo = ((xx + 0.5) / w * TAU - lon) * cosLatS;
        const q = (dLa2 + dLo * dLo) * invR2;                 // (distance / radius)^2
        if (q > 9) continue;
        A[row + ((xx % w) + w) % w] += b / (1 + q * (1 + 0.5 * q));   // ~exp(-q), no exp()
      }
    }
  }

  // ---- apply: mottle, darken collars, brighten toward fresh ejecta ----
  const ray = hexRGB(o.rayColor);
  const mot = o.mottling ?? 0.18;
  // The three mottle scales are all far coarser than the map itself, so they are baked onto
  // small grids once and read back per pixel (was nine noise calls per pixel).
  const g1w = 256, g2w = 640, g3w = Math.min(w, 1536);
  const G1 = sphereFbmGrid(sim, g1w, g1w >> 1, 4, { octaves: 4, persistence: 0.5 });
  const G2 = sphereFbmGrid(sim, g2w, g2w >> 1, 18, { octaves: 3, persistence: 0.5 }, 3);
  const G3 = sphereFbmGrid(sim, g3w, g3w >> 1, 70, { octaves: 2, persistence: 0.5 }, 9);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, u = (x + 0.5) / w;
      const mare = mariaMask ? mariaMask[i] : 0;
      const m = 1 + mot * (1 - 0.5 * mare) * (0.4 * sampleSphereGrid(G1, g1w, g1w >> 1, u, v)
        + 0.35 * sampleSphereGrid(G2, g2w, g2w >> 1, u, v)
        + 0.25 * sampleSphereGrid(G3, g3w, g3w >> 1, u, v));
      const k = (1 - Math.min(0.8, D[i])) * m;
      // soft saturation: overlapping rays and halos get brighter without clipping to paint-white
      const a = (1 - Math.exp(-A[i] * 1.35)) * 0.88, o4 = i * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = rgba[o4 + ch] * k;
        rgba[o4 + ch] = v + (ray[ch] - v) * a;
      }
    }
  }
}

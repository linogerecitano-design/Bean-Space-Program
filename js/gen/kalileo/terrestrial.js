// From Kalileo (C:/Users/ofici/Downloads/Kalileo/js/terrestrial.js), vendored into Bean Space Program.
// Terrestrial (Earth-like) generator — climate-based satellite colouring, rivers
// and clouds, tuned to read like The World Crucible's satellite view.
//
// Continents + eroded mountains come from terrain.js (advanced terrain). This module
// reads the finished height field and paints a SATELLITE map from a climate model:
//   • temperature  latitude + elevation lapse + warmth bias
//   • moisture     latitude rain-belts + continentality (distance-to-sea) + orographic
//   • biome        smooth Köppen-ish blend, arid-dominant rusty palette like TWC
//   • snow         CRISP caps driven by elevation (mountain snow line rises toward the
//                  equator) plus polar cold
//   • rivers       D8 flow accumulation → dendritic river network drawn into the map
//   • ocean        teal shelf → mid blue → deep navy by depth
//   • relief       hillshade so ranges read from orbit
// Oceans get their blue-from-space from the scaled overlay too; here the base map
// already carries a full ocean colour so the satellite view looks right on its own.
import { Simplex3, mulberry32 } from './noise.js';
// (editor state removed: ocean colours now come from cfg.ocean)
function hexToRGBA(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1]; }

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const hex255 = h => hexToRGBA(h).map(v => v * 255);
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

// Satellite palette (sRGB 0..255). Land leans rusty/arid like TWC's default worlds;
// green appears only where it's genuinely warm AND wet.
const C = {
  seaShelf: [46, 120, 140], seaMid: [26, 66, 94], seaDeep: [12, 30, 48],
  beach:  [206, 182, 136],
  desert: [178, 108, 62],   // hot arid rust
  sand:   [196, 150, 96],   // dune
  steppe: [150, 108, 68],   // cool dry brown
  rust:   [150, 92, 56],
  grass:  [128, 132, 80],   // olive
  forest: [76, 98, 54],
  jungle: [46, 78, 42],
  taiga:  [80, 94, 66],
  tundra: [154, 142, 114],
  rock:   [126, 114, 100],
  snow:   [240, 244, 247],
  river:  [46, 92, 120],
  seaIce: [226, 232, 236],   // frozen ocean (polar caps)
};

// Area-based sea level: return the normalized height (0..1) below which `frac` of the
// surface lies, so "sea level 0.5" means 50% of the AREA is ocean regardless of the
// height distribution (a plate world is bimodal, so a linear cut floods badly).
export function percentileSeaField(field, frac) {
  const HIST = 1024, hist = new Int32Array(HIST);
  for (let i = 0; i < field.length; i++) hist[Math.min(HIST - 1, Math.max(0, (field[i] * HIST) | 0))]++;
  const target = field.length * clamp01(frac ?? 0.5);
  let acc = 0;
  for (let b = 0; b < HIST; b++) { acc += hist[b]; if (acc >= target) return b / HIST; }
  return 0.5;
}

// Chamfer distance from land to the nearest ocean (x wraps), normalised 0..1.
function continentality(field, seaField, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = field[i] > seaField ? INF : 0;
  const at = (x, y) => d[y * w + ((x % w) + w) % w];
  const relax = (x, y, base, cost) => { const v = base + cost, i = y * w + x; if (v < d[i]) d[i] = v; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y > 0) { relax(x, y, at(x, y - 1), 1); relax(x, y, at(x - 1, y - 1), 1.4142); relax(x, y, at(x + 1, y - 1), 1.4142); }
    relax(x, y, at(x - 1, y), 1);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    if (y < h - 1) { relax(x, y, at(x, y + 1), 1); relax(x, y, at(x - 1, y + 1), 1.4142); relax(x, y, at(x + 1, y + 1), 1.4142); }
    relax(x, y, at(x + 1, y), 1);
  }
  const scale = Math.max(1, w * 0.13);
  for (let i = 0; i < w * h; i++) d[i] = clamp01(d[i] / scale);
  return d;
}

function rainBand(latDeg) {
  const g = (c, s) => Math.exp(-((latDeg - c) * (latDeg - c)) / (2 * s * s));
  return clamp01(0.2 + 0.95 * g(0, 11) + 0.5 * g(52, 16) - 0.4 * g(28, 9) - 0.35 * g(90, 20));
}

// Temperature (°C) and moisture (0..1). Moisture is a simplified PRECIPITATION model:
// oceans supply humidity, prevailing winds (tropical/polar easterlies, mid-latitude
// westerlies) carry it inland and it rains out — extra on the WINDWARD side of ranges
// (orographic) — so it depletes across continents (dry rain-shadow interiors) instead
// of merely banding by latitude. That's why forests hug coasts, river valleys and
// windward mountains, and interiors/subtropics turn to desert — like a real world.
function climateFields(field, w, h, cfg, seaField) {
  const n = w * h;
  const temp = new Float32Array(n), moist = new Float32Array(n);
  const warm = cfg.warmth ?? 0.5, gMoist = 0.35 + (cfg.moisture ?? 0.5) * 1.35;
  const nz = new Simplex3((cfg.seed | 0) + 5150);
  const landRange = Math.max(0.001, 1 - seaField);
  const isSea = i => field[i] <= seaField;

  // Temperature: warm equator, cold poles, minus an elevation lapse.
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    // Sea-level temperature: TWC's range is roughly -18°C (pole) .. +36°C (equator).
    const seaTemp = mix(-18, 36, Math.max(0, Math.cos(lat))) + (warm - 0.5) * 38;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, above = field[i] - seaField;
      let st = seaTemp;
      if (cfg.eyeball) { // BSP: tidally locked world — temperature follows the substellar angle, not latitude
        const lon = ((x + 0.5) / w) * 2 * Math.PI - Math.PI;
        const c = Math.cos(lat) * Math.cos(lon);
        st = mix(-45, 42, Math.max(0, c) ** 0.6) + (c < 0 ? c * 25 : 0) + (warm - 0.5) * 38;
      }
      temp[i] = st - (above > 0 ? clamp01(above / landRange) : 0) * 34;
    }
  }

  // Prevailing-wind humidity advection → precipitation.
  const humid = new Float32Array(n), precip = new Float32Array(n);
  for (let i = 0; i < n; i++) humid[i] = isSea(i) ? 1 : 0.04;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      const latDeg = Math.abs((0.5 - (y + 0.5) / h) * 180);
      const dir = (latDeg >= 30 && latDeg < 60) ? 1 : -1;   // mid-lat westerlies vs easterlies
      for (let step = 0; step < w; step++) {
        const x = dir > 0 ? step : (w - 1 - step);
        const i = y * w + x;
        if (isSea(i)) { humid[i] = 1; precip[i] = 1; continue; }
        const ui = y * w + ((x - dir) % w + w) % w;
        const hval = humid[ui];
        const rise = Math.max(0, field[i] - field[ui]);
        const rain = hval * Math.min(0.7, 0.1 + rise * 11);   // base rainout + orographic
        precip[i] = rain;
        humid[i] = Math.max(humid[i] * 0.25, hval - rain);
      }
    }
  }

  // Combine precipitation with latitude (wet ITCZ, dry subtropics) and global moisture.
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const latDeg = Math.abs(lat * 180 / Math.PI);
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const itcz = Math.exp(-(latDeg * latDeg) / (2 * 11 * 11)) * 0.35;
    const subDry = 1 - 0.55 * Math.exp(-((latDeg - 26) * (latDeg - 26)) / (2 * 9 * 9));
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (isSea(i)) { moist[i] = 0.9; continue; }
      const lon = ((x + 0.5) / w) * 2 * Math.PI;
      const nn = nz.fbm(cl * Math.cos(lon) * 3, sl * 3, cl * Math.sin(lon) * 3, { octaves: 3, persistence: 0.55 });
      moist[i] = clamp01((precip[i] * 3 + itcz) * subDry * gMoist + nn * 0.06);
    }
  }
  return { temp, moist };
}

// TWC-style biome LOOKUP TABLE: colour by (temperature × precipitation) like a
// Whittaker diagram, instead of hardcoded sequential blends. rows = precipitation
// (0 driest .. 4 wettest), cols = temperature (0 = -18°C frozen .. 5 = +38°C hot).
// Vegetated cells derive from the user's plant colour so it stays recolourable.
function buildBiomeLUT(vegColor) {
  const v = vegColor ? hex255(vegColor) : [78, 98, 54];
  const gG = mix3(v, [188, 192, 118], 0.55);   // grassland (yellow-green)
  const gF = v;                                // temperate/subtropical forest
  const gJ = v.map(c => c * 0.66);             // rainforest (deep green)
  const gB = mix3(v, [92, 104, 84], 0.5);      // boreal/taiga
  const T = [142, 150, 140], R = [164, 158, 146];  // tundra, cold steppe/rock
  //           t0(-18)         t1(-5)               t2(6)      t3(16)                    t4(26)          t5(37)
  return [
    /*driest*/  [R,             [156, 142, 120],     [176, 156, 112], [192, 142, 90],   [206, 118, 58], [212, 128, 54]],
    /*semiarid*/[T,             [162, 152, 122],     [182, 168, 110], [190, 170, 100],  [196, 150, 80], [202, 138, 68]],
    /*moderate*/[T,             mix3(gB, R, 0.4),    gG,              mix3(gG, gF, 0.5), [166, 150, 78], mix3(gF, [150, 140, 72], 0.5)],
    /*wet*/     [[134, 148, 134], gB,               mix3(gF, gG, 0.3), gF,              mix3(gF, gJ, 0.4), mix3(gJ, gF, 0.3)],
    /*wettest*/ [[132, 150, 140], mix3(gB, gF, 0.5), gF,              mix3(gF, gJ, 0.5), gJ,             gJ],
  ];
}
// Bilinear sample: tempC (-18..38) → column, precip (0..1) → row (like sampling the LUT texture).
function sampleBiome(lut, tempC, precip) {
  const tn = clamp01((tempC + 18) / 56) * 5, pn = clamp01(precip) * 4;
  const c0 = Math.min(5, Math.floor(tn)), c1 = Math.min(5, c0 + 1), ft = tn - c0;
  const r0 = Math.min(4, Math.floor(pn)), r1 = Math.min(4, r0 + 1), fp = pn - r0;
  return mix3(mix3(lut[r0][c0], lut[r0][c1], ft), mix3(lut[r1][c0], lut[r1][c1], ft), fp);
}

// D8 flow-accumulation river network. Returns a per-pixel river strength 0..1.
function computeRivers(field, w, h, moist, seaField, cfg) {
  const n = w * h, river = new Float32Array(n);
  if (cfg.rivers === false) return river;
  const down = new Int32Array(n).fill(-1);
  const accum = new Float32Array(n);
  for (let i = 0; i < n; i++) accum[i] = 0.3 + (moist[i] || 0);   // rainfall-weighted
  // Steepest-descent downstream neighbour (x wraps, y clamps).
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (field[i] <= seaField) continue;
    let best = -1, bestH = field[i];
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = ((x + dx) % w + w) % w, j = yy * w + xx;
        if (field[j] < bestH) { bestH = field[j]; best = j; }
      }
    }
    down[i] = best;
  }
  // Order cells by height (counting sort), accumulate high → low.
  const LV = 1024, cnt = new Int32Array(LV + 1), lvl = new Int32Array(n);
  for (let i = 0; i < n; i++) { const L = Math.min(LV - 1, Math.max(0, (field[i] * LV) | 0)); lvl[i] = L; cnt[L + 1]++; }
  for (let L = 0; L < LV; L++) cnt[L + 1] += cnt[L];
  const order = new Int32Array(n), tmp = cnt.slice();
  for (let i = 0; i < n; i++) order[tmp[lvl[i]]++] = i;     // ascending by height
  for (let k = n - 1; k >= 0; k--) { const i = order[k], d = down[i]; if (d >= 0) accum[d] += accum[i]; }
  // Threshold (resolution-independent). Higher density → lower threshold → more rivers.
  const thr = mix(1800, 280, clamp01(cfg.riverDensity ?? 0.5)) * (n / 2.0e6);
  for (let i = 0; i < n; i++) {
    if (field[i] <= seaField) continue;
    if (accum[i] > thr) river[i] = clamp01(0.45 + Math.log(accum[i] / thr) / 3);
  }
  // Widen the rivers a couple of pixels so they stay visible at preview resolution.
  let cur = river;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(cur);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (cur[i] > 0 || field[i] <= seaField) continue;
      const l = cur[y * w + ((x - 1 + w) % w)], r = cur[y * w + ((x + 1) % w)];
      const u = y > 0 ? cur[(y - 1) * w + x] : 0, dn = y < h - 1 ? cur[(y + 1) * w + x] : 0;
      const m = Math.max(l, r, u, dn);
      if (m > 0) out[i] = m * 0.7;
    }
    cur = out;
  }
  return cur;
}

export { climateFields, computeRivers };
export async function buildTerrestrialColor(field, w, h, cfg, tick = async () => {}) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const seaField = percentileSeaField(field, cfg.seaLevel ?? 0.5);
  const { temp, moist } = climateFields(field, w, h, cfg, seaField);
  const river = computeRivers(field, w, h, moist, seaField, cfg);
  const relief = cfg.relief ?? 0.35;
  const beaches = cfg.beaches !== false;
  const seaIce = cfg.seaIce !== false;
  const landRange = Math.max(0.001, 1 - seaField);
  const vnz = new Simplex3((cfg.seed | 0) + 909);    // gentle large-scale colour break-up
  const bnz = new Simplex3((cfg.seed | 0) + 717);    // organic biome-boundary dithering

  const lut = buildBiomeLUT(cfg.vegColor);
  // Snow: TWC uses smoothstep(2°C → -6°C). The elevation lapse is already baked into
  // temp[i], so peaks/poles are the cold cells. snowLine biases the threshold: higher =
  // colder = snow only on the very tallest / most polar ground.
  const snowBias = (0.5 - clamp01(cfg.snowLine ?? 0.5)) * 10;
  const iceCol = [228, 233, 237];
  // Sea colour is the OCEAN panel's colour (shallow) → colour-from-space (deep), so
  // recolouring the ocean actually dyes the sea in both the surface and scaled maps.
  const oc = cfg.ocean || {};
  const seaShallow = oc.color ? hex255(oc.color) : C.seaShelf;
  const seaDeep = oc.colorFromSpace ? hex255(oc.colorFromSpace) : C.seaDeep;
  const seaMid = mix3(seaShallow, seaDeep, 0.55);

  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const cosLat = Math.max(0.05, Math.cos(lat));
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const yd = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, above = field[i] - seaField;
      const lon = ((x + 0.5) / w) * 2 * Math.PI;
      const px = cl * Math.cos(lon), pz = cl * Math.sin(lon);
      let col;
      if (above <= 0) {
        const depth = clamp01(-above / Math.max(0.001, seaField));
        col = mix3(seaShallow, seaMid, smoothstep(0.02, 0.28, depth));
        col = mix3(col, seaDeep, smoothstep(0.28, 0.82, depth));
        if (seaIce) {
          const ice = smoothstep(-1.5, -6, temp[i]);   // TWC sea-ice thresholds
          if (ice > 0) col = mix3(col, iceCol, ice);
        }
      } else {
        const landH = clamp01(above / landRange);
        // Biome from the (temp × precip) LUT, with organic fbm distortion of the
        // lookup coords so boundaries dither naturally instead of banding (TWC trick).
        const dT = bnz.fbm(px * 9, sl * 9, pz * 9, { octaves: 2 }) * 3.5;
        const dP = bnz.fbm(px * 9 + 11, sl * 9 + 11, pz * 9 + 11, { octaves: 2 }) * 0.06;
        col = sampleBiome(lut, temp[i] + dT, moist[i] + dP);
        // Gentle large-scale value variation so biomes don't look flat/painted.
        const vn = vnz.fbm(px * 2.2, sl * 2.2, pz * 2.2, { octaves: 3, persistence: 0.5 });
        const vk = 1 + vn * 0.06;
        col = [col[0] * vk, col[1] * vk, col[2] * vk];
        if (beaches && landH < 0.03) col = mix3(C.beach, col, landH / 0.03);
        // Snow: cold peaks/poles only (temp already includes the elevation lapse).
        const snow = smoothstep(2 + snowBias, -6 + snowBias, temp[i]);
        if (snow > 0) col = mix3(col, C.snow, snow);
        if (river[i] > 0) col = mix3(col, C.river, river[i] * 0.8);
        if (relief > 0) {
          const xr = (x + 1) % w;
          const sx = (field[i] - field[y * w + xr]) * cosLat, sy = field[i] - field[yd * w + x];
          const shade = 1 + (sx + sy) * 28 * relief;
          const k = shade < 0.6 ? 0.6 : shade > 1.45 ? 1.45 : shade;
          col = [col[0] * k, col[1] * k, col[2] * k];
        }
      }
      rgba[i * 4] = col[0]; rgba[i * 4 + 1] = col[1]; rgba[i * 4 + 2] = col[2]; rgba[i * 4 + 3] = 255;
    }
    if ((y & 63) === 0) await tick();
  }
  return rgba;
}

// Smooth-min 3D Voronoi (cellular) — TWC bakes this into clouds so they read as puffy
// cauliflower cells instead of flat wisps. Returns higher near cell centres.
function hash3(x, y, z) {
  const sx = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  const sy = Math.sin(x * 269.5 + y * 183.3 + z * 246.1) * 43758.5453123;
  const sz = Math.sin(x * 113.5 + y * 271.9 + z * 124.6) * 43758.5453123;
  return [sx - Math.floor(sx), sy - Math.floor(sy), sz - Math.floor(sz)];
}
function smoothVoronoi(px, py, pz, k) {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const fx = px - ix, fy = py - iy, fz = pz - iz;
  let res = 100;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const hsh = hash3(ix + a, iy + b, iz + c);
    const rx = a - fx + hsh[0], ry = b - fy + hsh[1], rz = c - fz + hsh[2];
    const dd = rx * rx + ry * ry + rz * rz;
    const hb = clamp01(0.5 + 0.5 * (res - dd) / k);
    res = mix(res, dd, hb) - k * hb * (1 - hb);
  }
  return 1 - res;
}

// Realistic cloud map (white RGB, density in ALPHA) for EVE: latitude storm-belts,
// humidity, domain-warped fBm, cyclonic spirals AND baked cauliflower puffs (TWC).
export async function buildTerrestrialClouds(field, w, h, cfg, tick = async () => {}) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const seaField = clamp01(cfg.seaLevel ?? 0.5);
  const { moist } = climateFields(field, w, h, cfg, seaField);
  const amt = cfg.cloudAmount ?? 0.5;
  const seed = cfg.seed | 0;
  const base = new Simplex3(seed + 8080), detail = new Simplex3(seed + 2020), warp = new Simplex3(seed + 3131);
  const rng = mulberry32(seed + 555);
  // Cyclone lows, biased to the mid-latitude storm tracks. Kept gentle & few so they
  // read as soft spirals, not hard discs.
  const storms = [];
  const nStorms = 3 + Math.round(amt * 4);
  for (let s = 0; s < nStorms; s++) {
    const midlat = (0.32 + rng() * 0.45) * (rng() < 0.5 ? -1 : 1);   // sin(lat)
    const slat = Math.asin(Math.max(-0.98, Math.min(0.98, midlat)));
    const slon = rng() * 2 * Math.PI;
    storms.push({
      ux: Math.cos(slat) * Math.cos(slon), uy: Math.sin(slat), uz: Math.cos(slat) * Math.sin(slon),
      rot: rng() < 0.5 ? -1 : 1, rad: 0.2 + rng() * 0.16, str: 0.35 + rng() * 0.4,
    });
  }
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const latDeg = Math.abs(lat * 180 / Math.PI);
    const cl = Math.cos(lat), sl = Math.sin(lat);
    // Cloud belts: wet ITCZ, mid-latitude storm tracks, clear subtropics & poles.
    const g = (c, s) => Math.exp(-((latDeg - c) * (latDeg - c)) / (2 * s * s));
    const belt = clamp01(0.85 * g(4, 9) + 0.7 * g(55, 18) - 0.5 * g(28, 8) - 0.3 * g(90, 16) + 0.15);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, lon = ((x + 0.5) / w) * 2 * Math.PI;
      let px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      // Cyclonic swirl: rotate the sample point about the vertical axis near each low.
      let swirl = 0;
      for (const st of storms) {
        const dot = px * st.ux + py * st.uy + pz * st.uz;
        const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (ang < st.rad) { const f = 1 - ang / st.rad; swirl += st.rot * f * f * f * 3.2 * st.str; }
      }
      if (swirl !== 0) { const ca = Math.cos(swirl), sa = Math.sin(swirl); const nx = px * ca - pz * sa; pz = px * sa + pz * ca; px = nx; }
      const wx = warp.fbm(px * 1.6, py * 1.6, pz * 1.6, { octaves: 2 }) * 0.8;
      const wz = warp.fbm(px * 1.6 + 5, py * 1.6, pz * 1.6 + 5, { octaves: 2 }) * 0.8;
      // Frontal systems (large) and cumulus texture (cellular), both domain-warped.
      const big = base.fbm(px * 2.2 + wx, py * 2.2, pz * 2.2 + wz, { octaves: 5, persistence: 0.5 }) * 0.5 + 0.5;
      const cell = detail.fbm(px * 6.5 + wx, py * 6.5, pz * 6.5, { octaves: 4, persistence: 0.55 }) * 0.5 + 0.5;
      const cirr = detail.fbm(px * 13 + wz, py * 13, pz * 13 + wx, { octaves: 3, persistence: 0.5 }) * 0.5 + 0.5;
      // How much cloud "belongs" here: mostly the latitude storm-belts, plus humidity,
      // plus a small baseline so land also gets weather. Scaled by coverage. Kept low
      // enough that there are genuine clear-blue gaps between the cloud masses.
      const want = clamp01((belt * 0.62 + (moist[i] || 0) * 0.3 + 0.05) * (0.45 + amt * 0.8));
      // Frontal shape must clear a threshold that DROPS where clouds want to be — but the
      // NOISE stays decisive so belts break into cloud masses with clear gaps between,
      // instead of solid latitude stripes.
      let d = big * (0.62 + want * 0.6) - (0.52 - want * 0.3);
      d = clamp01(d * 3);
      // Break the mass into fluffy cumulus cells + a faint cirrus veil.
      d *= (0.62 + 0.38 * smoothstep(0.34, 0.72, cell));
      d = clamp01(d + cirr * want * 0.2 * smoothstep(0.5, 0.78, cirr));
      // Bake TWC's cauliflower PUFFS into the density where clouds exist: two scales of
      // smooth-Voronoi carve the flat coverage into 3D-looking cumulus cells, so EVE's
      // lighting has real structure to shade instead of a flat sheet.
      if (d > 0.02) {
        // Larger cells than TWC's render-time value (its puffs are screen-space; a baked
        // equirectangular map needs bigger cells or they read as grain), two scales.
        const P = 15;
        const puff = smoothVoronoi(px * P + 5, py * P, pz * P + 5, 0.2) * 0.6
                   + smoothVoronoi(px * P * 2.3 + 9, py * P * 2.3, pz * P * 2.3, 0.2) * 0.4;
        d = clamp01(d * (0.72 + 0.45 * clamp01(puff)));
      }
      const a = Math.round(Math.pow(clamp01(d), 1.15) * 255);
      rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = a;
    }
    if ((y & 63) === 0) await tick();
  }
  return rgba;
}

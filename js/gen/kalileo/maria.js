// From Kalileo (C:/Users/ofici/Downloads/Kalileo/js/maria.js), vendored into Bean Space Program.
/* ============================================================================
   maria.js — lunar maria: dark basalt plains flooded into ancient impact basins.

   Modelled on how maria actually formed, because that is what makes them look
   right rather than like dark circles painted on:
     1. A few huge impact basins are excavated into the already-cratered crust —
        a broad flat-floored bowl, a raised main rim and, on big basins, faint
        outer rings (Orientale-style multi-ring structure).
     2. Much later, basalt floods each basin up to a LEVEL. The shoreline is
        therefore a CONTOUR of the pre-existing terrain: it embays into low ground,
        wraps around crater rims that poke out as islands, and spills over low
        points in the rim. Nothing is drawn — it all falls out of the flood.
     3. Craters that were already there are buried to "ghost craters": only a
        faint trace of their relief survives through the lava.
     4. The cooling plains contract into sinuous WRINKLE RIDGES, roughly
        concentric to the basin.
     5. After flooding, only a light population of fresh craters accumulates, so
        maria are visibly smoother and less cratered than the highlands.
     6. Mare basalt is compositionally dark (albedo ~0.07 vs ~0.12–0.16 for the
        highlands), with regional colour differences: titanium-rich flows are
        bluish, iron-rich ones browner.
   Real reference numbers: Imbrium ~1,150 km across on a 1,737 km-radius Moon,
   mare surfaces ~2–4 km below the highlands, basin rims (e.g. Montes Apenninus)
   up to ~5 km above the mare, maria cover ~31% of the near side but ~2% of the far.

   Pure JS (noise.js + craters.js) so it can be run and tuned under Node.
   Height fields here are Kalileo's normalised 0..1 over `deformity` metres;
   row 0 = north.
============================================================================ */

import { Simplex3, mulberry32, sphereFbmGrid, sampleSphereGrid } from './noise.js';
import { applyCraterLayer } from './craters.js';

const TAU = Math.PI * 2;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const sq = v => v * v;

export const MARIA_DEFAULTS = {
  enabled: false,
  seed: 7,
  count: 10,              // number of flooded basins
  minDiameter: 250,       // km
  maxDiameter: 1300,      // km (Imbrium ~1,150 km)
  depth: 3000,            // m, basin floor below the surrounding terrain
  rimHeight: 1400,        // m, main rim above the surroundings
  fill: 0.9,              // 0 = only the deepest floor floods … 1 = brim-full, spilling out
  irregularity: 0.2,      // lobate basin outlines + ragged shorelines
  oceanus: 0.6,           // size of one vast irregular flood plain (Oceanus Procellarum: ~10% of the Moon)
  hemisphereBias: 0.9,    // 0 = anywhere … 1 = crowded into one hemisphere (Moon's near side)
  biasLongitude: 0,       // deg, centre of that hemisphere
  ghostCraters: 0.18,     // how much buried crater relief shows through the lava
  wrinkleRidges: 0.65,    // strength of the contraction ridges
  freshCraters: 0.5,      // density of post-flood craters on the maria
  color: '#5d5d5c',       // basalt colour (~55-60% of typical highland brightness)
  colorVariation: 0.4,    // bluish Ti-rich vs brownish Fe-rich flows
  darkness: 0.92,         // how fully the basalt colour replaces the terrain colour
  edgeSoftness: 0.12,     // width of the soft dark fringe at the shoreline
  edgeDetail: 0.6,        // jagged, fractal shorelines: fingers, bays and islands at every scale
  interiorDetail: 0.6,    // tone variation and texture inside the maria
  isolatedFloods: 0.12,   // chance an outlying low crater floor has its own lava (like Plato, Grimaldi)
  scaleWithRadius: true,  // sizes are given for a Moon-sized body and shrink with the radius
  refRadius: 1737000,     // m, the body the km values above describe (the Moon)
};

/* ------------------------------------------------------------------ helpers */
function hexRGB(h) {
  h = String(h || '#4b4a49').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
function blur(f, w, h, rad) {
  if (rad < 1) return f;
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
const dir = (latRad, lonRad) => { const cl = Math.cos(latRad); return [cl * Math.cos(lonRad), Math.sin(latRad), cl * Math.sin(lonRad)]; };

/* Place basins: size-biased toward smaller ones, optionally crowded into one hemisphere. */
/* Size factor for the km/m values: 1 on a Moon-sized body. Without it a 1,300 km basin on a
   320 km body wrapped the whole sphere, and ten of them stacked their rims out of the height
   range (clipped into flat plateaus) and flooded ~45% of the surface. */
export function mariaScale(m, planetRadius) {
  return m.scaleWithRadius === false ? 1 : Math.max(0.01, planetRadius / (m.refRadius || 1737000));
}

function placeBasins(m, planetRadius, rng) {
  const out = [];
  const kR = mariaScale(m, planetRadius);
  const bias = clamp01(m.hemisphereBias ?? 0), bc = dir(0, (m.biasLongitude || 0) * Math.PI / 180);
  const n = Math.max(0, Math.round(m.count || 0));
  let guard = 0;
  while (out.length < n && guard++ < n * 200) {
    const z = rng() * 2 - 1, lon = rng() * TAU, r = Math.sqrt(1 - z * z);
    const c = [r * Math.cos(lon), z, r * Math.sin(lon)];
    const facing = (c[0] * bc[0] + c[1] * bc[1] + c[2] * bc[2] + 1) / 2;
    // facing^6: the Moon's maria are crowded into one face (31% of the near side vs 2%
    // of the far); a gentler falloff spread them almost evenly.
    const f2 = facing * facing;
    if (rng() > (1 - bias) + bias * f2 * f2 * f2) continue;
    const t = Math.pow(rng(), 1.7);
    const dRef = (m.minDiameter || 250) + t * Math.max(0, (m.maxDiameter || 1100) - (m.minDiameter || 250));
    const dKm = dRef * kR;
    const R = Math.min(0.8, (dKm * 1000 / 2) / Math.max(1, planetRadius));      // angular radius
    out.push({ c, R, dKm, dRef, lobe: rng() * TAU, lobes: 2 + Math.floor(rng() * 3), irr: 1, rings: true, depthMul: 1, rimMul: 1 });
  }
  // A vast, shapeless flood plain like Oceanus Procellarum. On the Moon it holds most of
  // the mare area and has no clear basin outline, so ten circular basins alone can't
  // reach realistic coverage (a 500 km basin is only ~0.5% of a Moon-sized sphere).
  // Placed toward the favoured hemisphere, offset west like the real one.
  const oc = clamp01(m.oceanus ?? 0);
  if (oc > 0.01) {
    const lon = ((m.biasLongitude || 0) - 35) * Math.PI / 180, lat = (rng() - 0.35) * 0.5;
    out.push({ c: dir(lat, lon), R: 0.22 + 0.62 * oc, dKm: 1e9, dRef: 1e9, lobe: rng() * TAU, lobes: 5,
      irr: 2.4, rings: false, depthMul: 0.55, rimMul: 0.15 });
  }
  return out.sort((a, b) => b.R - a.R);
}

/**
 * Carve the basins and flood them.
 * @param {Float32Array} field  height (0..1 over deformity), craters already stamped — modified in place
 * @param {Float32Array} base   the pre-crater terrain, so buried crater relief can survive as ghosts
 * @returns {{mask: Float32Array, relief: Float32Array}}
 *   mask   — 0..1, fraction of each pixel covered by basalt
 *   relief — the height relief the COLOUR should see inside the maria (faint ghost craters
 *            + fresh post-flood craters). The raw height change there is a whole basin's
 *            excavation and flood, which crater tinting would otherwise paint as one giant
 *            dark crater floor on top of the basalt.
 */
/* exposed for tests */
export { placeBasins as _placeBasins };

export function applyMaria(field, base, w, h, m, planetRadius, deformity) {
  const rng = mulberry32(((m.seed | 0) || 7) * 2654435761);
  const sim = new Simplex3((m.seed | 0) + 911);
  const basins = placeBasins(m, planetRadius, rng);
  const n = w * h, mask = new Float32Array(n), colorRelief = new Float32Array(n);
  if (!basins.length) return { mask, relief: colorRelief };

  const unit = 1 / Math.max(1, deformity);
  // Relief shrinks more slowly than size (sqrt), so maria on a small moon still read as
  // sunken plains. Then capped to a share of the height range: basins and rims that
  // overshoot 0..1 get clipped into perfectly flat floors and plateaus.
  const kZ = Math.sqrt(mariaScale(m, planetRadius));
  const Dm = Math.min((m.depth ?? 3000) * kZ, 0.25 * deformity);
  const RIMm = Math.min((m.rimHeight ?? 1400) * kZ, 0.12 * deformity);
  const D = Dm * unit, RIM = RIMm * unit;
  const irr = clamp01(m.irregularity ?? 0.5), fill = clamp01(m.fill ?? 0.7);

  // Buried relief: what the craters added on top of the base terrain.
  const relief = new Float32Array(n);
  for (let i = 0; i < n; i++) relief[i] = field[i] - base[i];

  // Per-pixel geometry, reused by every pass.
  const P = new Float32Array(n * 3), NIRR = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const la = (0.5 - (y + 0.5) / h) * Math.PI, cl = Math.cos(la), sl = Math.sin(la);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, lo = (x + 0.5) / w * TAU - Math.PI;
      const px = cl * Math.cos(lo), pz = cl * Math.sin(lo);
      P[i * 3] = px; P[i * 3 + 1] = sl; P[i * 3 + 2] = pz;
      NIRR[i] = sim.fbm(px * 2.6, sl * 2.6, pz * 2.6, { octaves: 5, persistence: 0.55 });
    }
  }

  // Normalised, lobate distance from a basin centre: big basins get low-order lobes
  // (Imbrium and Serenitatis are not circles), everything gets a ragged edge.
  const sOf = (b, i) => {
    const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
    const dot = px * b.c[0] + py * b.c[1] + pz * b.c[2];
    if (dot < Math.cos(Math.min(Math.PI, b.R * 3))) return 99;
    const d = Math.acos(Math.max(-1, Math.min(1, dot)));
    // bearing around the centre, for the lobes
    const ex = -b.c[2], ez = b.c[0], el = Math.hypot(ex, ez) || 1;
    const tx = px - b.c[0] * dot, ty = py - b.c[1] * dot, tz = pz - b.c[2] * dot;
    const nx = b.c[1] * (ez / el), ny = b.c[2] * (ex / el) - b.c[0] * (ez / el), nz = -b.c[1] * (ex / el);
    const bear = Math.atan2(tx * nx + ty * ny + tz * nz, (tx * ex + tz * ez) / el);
    const ir = Math.min(1, irr * b.irr);
    const lobe = 1 + ir * 0.22 * Math.sin(b.lobes * bear + b.lobe) + (b.irr > 1 ? ir * 0.12 * Math.sin(2 * bear + b.lobe * 1.7) : 0);
    return (d / b.R) / lobe * (1 + irr * b.irr * 0.28 * NIRR[i]);
  };

  // ---- 1. excavate the basins ----
  // Where basins overlap, the deepest excavation wins (a younger basin cuts into the older
  // one's floor, it doesn't dig a double-depth hole) and piled-up rims/ejecta saturate
  // softly instead of summing into a ridge taller than any single rim.
  const EXC = new Float32Array(n), UP = new Float32Array(n);
  for (const b of basins) {
    const big = b.rings ? sstep(250, 700, b.dRef) : 0;   // multi-ring structure on the big ones
    const Db = D * b.depthMul, RIMb = RIM * b.rimMul;
    for (let i = 0; i < n; i++) {
      const s = sOf(b, i);
      if (s > 2.8) continue;
      if (s < 1) { const e = -Db * (1 - s * s * s * s); if (e < EXC[i]) EXC[i] = e; } // broad flat floor, steepening to the wall
      let up = RIMb * Math.exp(-sq((s - 1) / 0.09));      // main rim
      up += RIMb * big * (0.42 * Math.exp(-sq((s - 1.55) / 0.07)) + 0.2 * Math.exp(-sq((s - 2.25) / 0.08)));
      if (s > 1) up += RIMb * 0.22 * Math.exp(-(s - 1) / 0.5); // ejecta blanket
      UP[i] += up;
    }
  }
  const upCap = Math.max(1e-6, RIM * 1.4);
  for (let i = 0; i < n; i++) field[i] += EXC[i] + upCap * Math.tanh(UP[i] / upCap);

  // ---- 2. flood level of each basin: a fraction of the way from floor to the surroundings ----
  // Measured from the basin's DESIGNED floor (surroundings - depth), not the lowest pixel:
  // a single deep crater inside the basin used to drag the level down so far that only
  // the pits flooded.
  for (const b of basins) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i += 3) {
      const s = sOf(b, i);
      if (s >= 1.18 && s <= 1.4) { sum += field[i]; cnt++; }
    }
    const ref = cnt ? sum / cnt : 0.5;
    b.level = ref - D * b.depthMul * (1 - (0.12 + 0.93 * fill)); // fill 1 slightly overtops the surroundings
  }

  // ---- 3. flood: every point within reach that lies below the highest nearby level ----
  const eps = Math.max(12, 40 * kZ) * unit;                // soft shoreline, ~40 m on the Moon
  // Fractal wobble of the flood level. The real shoreline is a contour of terrain that is
  // rough at every scale; this adds the scales finer than the stamped craters, so the edge
  // breaks into fingers, bays and islands instead of one smooth curve.
  const jagAmp = 320 * kZ * unit * clamp01(m.edgeDetail ?? 0.6);
  const ridgeH = 220 * kZ * unit * clamp01(m.wrinkleRidges ?? 0.5);
  // The flood surface is not one dead-flat level: the basalt load makes each basin sag toward
  // its centre (mascons: hundreds of metres to ~1-2 km on the Moon), and separate flows
  // leave broad swells. A single constant level read as a flat plate cut into the terrain.
  const undAmp = 0.05 * D;
  const ghost = clamp01(m.ghostCraters ?? 0.18);
  const levelAt = (i, bestOut) => {
    let level = -Infinity, sDom = 0, bDom = null;
    for (const b of basins) {
      const s = sOf(b, i);
      if (s < 1.3 && b.level > level) { level = b.level; sDom = s; bDom = b; }
    }
    if (!bDom || field[i] > level + eps + jagAmp + undAmp) return NaN;
    const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
    level -= 0.16 * D * bDom.depthMul * Math.max(0, 1 - sDom * sDom);          // sag
    level += undAmp * sim.fbm(px * 9 + 3, py * 9, pz * 9, { octaves: 3, persistence: 0.5 }); // swells
    if (jagAmp > 0) level += jagAmp * sim.fbm(px * 60 + 17, py * 60, pz * 60, { octaves: 6, persistence: 0.6 });
    if (bestOut) bestOut.s = sDom;
    return field[i] > level + eps ? NaN : level;
  };
  // Pass A: the local flood level wherever the ground lies below it (NaN elsewhere).
  const LEV = new Float32Array(n);
  const probe = { s: 0 };
  let seeds = 0;
  const FL = new Uint8Array(n);                            // 0 unvisited, 1 flooded, 2 dry, 3 in progress
  const queue = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    probe.s = 9;
    LEV[i] = levelAt(i, probe);
    if (!Number.isNaN(LEV[i]) && probe.s < 0.55) { FL[i] = 1; queue[seeds++] = i; }   // basin cores
  }
  // Pass B: lava reaches only ground CONNECTED to the basin it wells up in. Testing each pixel
  // against the level alone flooded every outlying crater floor below that height, which
  // peppered the highlands around each mare with dark round puddles.
  const grow = (len, mark) => {
    for (let head = 0; head < len; head++) {
      const i = queue[head], x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const j = yy * w + ((x + dx + w) % w);
          if (FL[j] || Number.isNaN(LEV[j])) continue;
          FL[j] = mark; queue[len++] = j;
        }
      }
    }
    return len;
  };
  grow(seeds, 1);
  // A few outlying low floors DO flood from their own vents (Plato, Grimaldi, Tsiolkovsky).
  // Decided per pocket from a coarse hash of where it is, so the choice survives a change
  // of resolution.
  const iso = clamp01(m.isolatedFloods ?? 0.12), salt = ((m.seed | 0) || 7) * 1103;
  for (let i0 = 0; i0 < n; i0++) {
    if (FL[i0] || Number.isNaN(LEV[i0])) continue;
    FL[i0] = 3; queue[0] = i0;
    const len = grow(1, 3);
    const x0 = i0 % w, y0 = (i0 - x0) / w;
    let hh = Math.imul((Math.floor(x0 / w * 96) * 73856093) ^ (Math.floor(y0 / h * 48) * 19349663) ^ salt, 0x5bd1e995);
    hh ^= hh >>> 15;
    const keep = (hh >>> 0) / 4294967296 < iso;
    for (let q = 0; q < len; q++) FL[queue[q]] = keep ? 1 : 2;
  }

  // Pass C: fill the flooded ground.
  for (let i = 0; i < n; i++) {
    if (FL[i] !== 1) continue;
    const level = LEV[i];
    let sDom = 0, lv = -Infinity;
    for (const b of basins) { const s = sOf(b, i); if (s < 1.3 && b.level > lv) { lv = b.level; sDom = s; } }
    const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
    const f = sstep(level + eps, level - eps, field[i]);
    // wrinkle ridges: thin, sinuous, roughly concentric to the basin
    const rn = sim.noise(sDom * 15 + NIRR[i] * 2.2, px * 1.3 + py * 0.7, pz * 1.3);
    const ridge = Math.pow(1 - Math.min(1, Math.abs(rn)), 14) * ridgeH;
    // Ghost craters are FAINT: soft-cap the surviving relief at ~180 m, however deep
    // the buried crater was.
    const gcap = 180 * kZ * unit, g = relief[i] * ghost;
    const ghostRelief = gcap * Math.tanh(g / gcap);
    const flooded = level + ghostRelief + ridge;
    field[i] += (flooded - field[i]) * f;
    mask[i] = f;
    colorRelief[i] = ghostRelief + ridge;
  }

  // ---- 4. fresh post-flood craters, only on the maria ----
  const density = m.freshCraters ?? 0.5;
  let mareFrac = 0; for (let i = 0; i < n; i++) mareFrac += mask[i]; mareFrac /= n;
  if (density > 0 && mareFrac > 0.002) {
    const before = Float32Array.from(field);
    const mw = Math.min(1024, w), mh = mw / 2, data = new Uint8ClampedArray(mw * mh * 4);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const v = mask[Math.floor(y * h / mh) * w + Math.floor(x * w / mw)] * 255, o = (y * mw + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
    }
    const kScale = planetRadius / 320000;                  // crater sizes scale like Kalileo's layers
    applyCraterLayer(field, w, h, {
      enabled: true, name: 'Mare craters', count: Math.round(density * 2600 * mareFrac / 0.16),
      minSize: 1.2 * kScale, maxSize: 11 * kScale, depthRatio: 0.11, rimHeightRatio: 0.035, rimWidth: 0.25,
      floorFlatness: 0.05, ejecta: 0.45, sizeBias: 2.4, seed: (m.seed | 0) + 5150, latMin: -90, latMax: 90,
      blend: 'carve', profile: 'simple', useMask: true, maskInvert: false,
    }, planetRadius, deformity, { data, w: mw, h: mh }, null);
    for (let i = 0; i < n; i++) if (mask[i] > 0) colorRelief[i] += field[i] - before[i];
  }
  return { mask, relief: colorRelief };
}

/**
 * Paint the basalt onto a colour map (RGBA, 0..255), in place. Keeps the underlying
 * shading (ghost craters, slopes, fresh crater bowls) by carrying the terrain colour's
 * RELATIVE brightness into the basalt colour, and adds regional Ti/Fe variation.
 */
export function applyMariaAlbedo(rgba, mask, w, h, m) {
  // (was w/700: at 1024 px that rounded to a 0-px blur, so the shoreline never softened and
  // thin crater-rim islands stayed as bright white lace)
  // Dilate first so hairline rim islands don't stay bright highland colour: they read as
  // cartoon outlines inside the maria, which no photo of the Moon shows.
  const dil = new Float32Array(w * h), rd = Math.max(1, Math.round(w / 2048));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let dy = -rd; dy <= rd; dy++) { const yy = Math.max(0, Math.min(h - 1, y + dy)); for (let dx = -rd; dx <= rd; dx++) { const q = mask[yy * w + ((x + dx + w) % w)]; if (q > v) v = q; } }
    dil[y * w + x] = v;
  }
  const soft = blur(dil, w, h, Math.max(1, Math.round((m.edgeSoftness ?? 0.25) * w / 256)));
  const sim = new Simplex3((m.seed | 0) + 4471);
  const base = hexRGB(m.color);
  const ti = [base[0] * 0.95, base[1] * 0.98, base[2] * 1.06];    // bluish, titanium-rich
  const fe = [base[0] * 1.05, base[1] * 1.0, base[2] * 0.93];     // browner, iron-rich
  const cv = clamp01(m.colorVariation ?? 0.4), dark = clamp01(m.darkness ?? 1);
  const edgeD = clamp01(m.edgeDetail ?? 0.6), intD = clamp01(m.interiorDetail ?? 0.6);

  // mean terrain luminance under the maria, so shading is carried relatively
  let lumSum = 0, wsum = 0;
  for (let i = 0; i < w * h; i++) {
    const k = mask[i]; if (k <= 0.5) continue;
    lumSum += (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) * k; wsum += k;
  }
  const meanLum = wsum > 0 ? lumSum / wsum : 128;

  // The tone layers are all far smoother than the map: bake them once on grids sized to the
  // noise, not to the texture, and read them back bilinearly (was up to five fBm per pixel).
  const guW = 256, gmW = 640, gtW = 1280, gfW = Math.min(w, 2048);
  const GU = sphereFbmGrid(sim, guW, guW >> 1, 3.2, { octaves: 3, persistence: 0.5 });
  const GM = sphereFbmGrid(sim, gmW, gmW >> 1, 11, { octaves: 4, persistence: 0.55 }, 7);
  const GT = sphereFbmGrid(sim, gtW, gtW >> 1, 34, { octaves: 4, persistence: 0.55 }, 11);
  const GF = sphereFbmGrid(sim, gfW, gfW >> 1, 140, { octaves: 3, persistence: 0.5 }, 29);
  for (let y = 0; y < h; y++) {
    const la = (0.5 - (y + 0.5) / h) * Math.PI, cl = Math.cos(la), sl = Math.sin(la);
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let k = soft[i];
      if (k <= 0.002 && edgeD <= 0) continue;
      const u = (x + 0.5) / w;
      const lo = u * TAU - Math.PI, px = cl * Math.cos(lo), pz = cl * Math.sin(lo);
      // Near the shoreline only: break the colour edge into jagged tongues of basalt and
      // stranded highland patches, rather than a smooth blurred gradient.
      const band = 4 * k * (1 - k);
      if (edgeD > 0 && band > 0.01) {
        const n = sim.fbm(px * 48 + 5, sl * 48, pz * 48, { octaves: 5, persistence: 0.62 });
        k = sstep(0.2, 0.8, k + n * edgeD * 0.9 * band);
      }
      if (k <= 0.002) continue;
      const o = i * 4;
      const lum = 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2];
      const detail = Math.max(0.55, Math.min(1.6, lum / Math.max(1, meanLum)));
      // regional flow units: broad patches, not fine noise
      const t = 0.5 + 0.5 * sampleSphereGrid(GU, guW, guW >> 1, u, v);
      const mix = cv * (sstep(0.3, 0.7, t) * 2 - 1);                    // -cv (Ti) .. +cv (Fe)
      // Real mare tone varies flow to flow by roughly ±15%: Ti-rich units darker, Fe-rich
      // ones lighter, plus finer mottling. A single flat tone read as painted-on.
      const mott = sampleSphereGrid(GM, gmW, gmW >> 1, u, v);
      let tone = 1 + cv * (0.35 * mix / Math.max(cv, 1e-3) * 0.4 + 0.12 * mott);
      // interior texture at finer scales: patchy flows, regolith variation, small fresh craters' halos
      if (intD > 0) tone *= 1 + intD * (0.09 * sampleSphereGrid(GT, gtW, gtW >> 1, u, v)
        + 0.06 * sampleSphereGrid(GF, gfW, gfW >> 1, u, v));
      const a = k * dark;
      for (let c = 0; c < 3; c++) {
        const col = (mix < 0 ? base[c] + (ti[c] - base[c]) * -mix : base[c] + (fe[c] - base[c]) * mix) * 255 * detail * tone;
        rgba[o + c] = rgba[o + c] + (col - rgba[o + c]) * a;
      }
    }
  }
}

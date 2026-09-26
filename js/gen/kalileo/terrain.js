// From Kalileo (C:/Users/ofici/Downloads/Kalileo/js/terrain.js), vendored into Bean Space Program.


import { Simplex3, mulberry32 } from './noise.js';

const tClamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const tSmooth = (e0, e1, x) => { const t = tClamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const tMix = (a, b, t) => a + (b - a) * t;

// Plate-tectonic continents: instead of thresholding fBm (which scatters noisy little
// islands everywhere), the surface is partitioned into a handful of PLATES. Each plate
// is continental (high) or oceanic (low), giving large coherent landmasses; convergent
// plate boundaries raise mountain belts (continent–continent), volcanic coastal arcs
// (ocean–continent) and island arcs (ocean–ocean). A domain warp wiggles the plate
// edges so coastlines look natural. This is what makes the result read like a real
// world (à la The World Crucible) rather than fractal speckle.
function buildTectonicPlates(w, h, a) {
  const seed = a.seed | 0;
  const rng = mulberry32(seed + 7000);
  const N = Math.max(5, Math.round(a.plates ?? 12));
  const landFrac = Math.max(0.05, Math.min(0.92, a.landAmount ?? 0.42));
  const mtn = a.mountainRanges ?? 0.6;
  if (false) console.log(`[Kalileo] terrain: PLATE TECTONICS — ${N} plates, land≈${(landFrac * 100) | 0}%`);
  // Continental plates sit WELL above the oceanic floor and vary little internally, so
  // a continent stays one coherent landmass instead of fragmenting into an archipelago
  // when the sea level is high.
  const P = [];
  for (let i = 0; i < N; i++) {
    let x, y, z, l;
    do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; l = x * x + y * y + z * z; } while (l < 1e-4 || l > 1);
    l = Math.sqrt(l); x /= l; y /= l; z /= l;
    const cont = rng() < landFrac;
    P.push({ x, y, z, cont, base: cont ? 0.66 + rng() * 0.06 : 0.18 + rng() * 0.06 });
  }
  const warp = new Simplex3(seed + 131), belt = new Simplex3(seed + 771), within = new Simplex3(seed + 909);
  const field = new Float32Array(w * h);
  const wa = 0.20;
  for (let yy = 0; yy < h; yy++) {
    const lat = (0.5 - (yy + 0.5) / h) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let xx = 0; xx < w; xx++) {
      const lon = (xx / w) * 2 * Math.PI;
      const ox = cl * Math.cos(lon), oy = sl, oz = cl * Math.sin(lon);
      // Warp the lookup direction so plate boundaries meander.
      let px = ox + warp.fbm(ox * 1.4, oy * 1.4, oz * 1.4, { octaves: 3 }) * wa;
      let py = oy + warp.fbm(ox * 1.4 + 9, oy * 1.4 + 9, oz * 1.4 + 9, { octaves: 3 }) * wa;
      let pz = oz + warp.fbm(ox * 1.4 - 9, oy * 1.4 - 9, oz * 1.4 - 9, { octaves: 3 }) * wa;
      const il = 1 / Math.hypot(px, py, pz); px *= il; py *= il; pz *= il;
      // Nearest two plates by angular distance (largest dot products).
      let d1 = -2, d2 = -2, p1 = 0, p2 = 0;
      for (let k = 0; k < N; k++) {
        const pl = P[k], dp = px * pl.x + py * pl.y + pz * pl.z;
        if (dp > d1) { d2 = d1; p2 = p1; d1 = dp; p1 = k; } else if (dp > d2) { d2 = dp; p2 = k; }
      }
      const A = P[p1], B = P[p2];
      const distB = (Math.acos(Math.max(-1, Math.min(1, d2))) - Math.acos(Math.max(-1, Math.min(1, d1)))) * 0.5;
      // Base height, smoothed toward the neighbour right at the coast (shelf).
      const coast = tSmooth(0.16, 0, distB);
      let hgt = tMix(A.base, (A.base + B.base) * 0.5, coast * 0.5);
      hgt += within.fbm(px * 3, py * 3, pz * 3, { octaves: 4, persistence: 0.5 }) * 0.03;
      // Convergent-boundary uplift.
      const near = tSmooth(0.11, 0, distB);
      if (near > 0) {
        const ridge = Math.pow(Math.max(0, belt.fbm(px * 8, py * 8, pz * 8, { octaves: 5, ridged: true }) * 0.5 + 0.5), 1.5);
        if (A.cont && B.cont) hgt += near * ridge * mtn * 0.55;                          // orogenic mountain belt
        else if (A.cont !== B.cont) hgt += near * ridge * mtn * 0.34 * (A.cont ? 1 : 0.6); // volcanic coastal arc
        else {                                                                            // island arc
          const arc = tSmooth(0.62, 0.86, belt.fbm(px * 10 + 3, py * 10, pz * 10 + 3, { octaves: 3 }) * 0.5 + 0.5);
          hgt += near * arc * 0.5;
        }
      }
      field[yy * w + xx] = hgt;
    }
  }
  return field;
}

function sampleField(f, w, h, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const xa = ((x0 % w) + w) % w, xb = (xa + 1) % w;
  const ya = Math.max(0, Math.min(h - 1, y0)), yb = Math.max(0, Math.min(h - 1, y0 + 1));
  return (f[ya * w + xa] * (1 - fx) + f[ya * w + xb] * fx) * (1 - fy) +
         (f[yb * w + xa] * (1 - fx) + f[yb * w + xb] * fx) * fy;
}

function buildTectonic(w, h, a) {
  if (a.tectonicPlates) return buildTectonicPlates(w, h, a);
  const field = new Float32Array(w * h);
  const cont = new Simplex3((a.seed | 0) + 11);
  const warp = new Simplex3((a.seed | 0) + 991);
  const ridge = new Simplex3((a.seed | 0) + 7717);
  const cs = Math.max(0.2, a.continentScale ?? 2);
  const wAmt = a.warp ?? 0.5;
  const mtn = a.mountainRanges ?? 0.6;
  const sharp = a.rangeSharpness ?? 0.7;

  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * 2 * Math.PI;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);

      let v = cont.fbm(px * cs, py * cs, pz * cs, { octaves: 5, persistence: 0.5 }) * 0.5 + 0.5;

      const wx = warp.fbm(px * cs * 1.7, py * cs * 1.7, pz * cs * 1.7, { octaves: 3, persistence: 0.5 }) * wAmt;
      const wy = warp.fbm(px * cs * 1.7 + 31, py * cs * 1.7 + 31, pz * cs * 1.7 + 31, { octaves: 3, persistence: 0.5 }) * wAmt;

      let r = ridge.fbm(px * cs * 3 + wx, py * cs * 3 + wy, pz * cs * 3 + wx, {
        octaves: 6, persistence: 0.5, ridged: true,
      });
      r = Math.pow(Math.max(0, r * 0.5 + 0.5), 1 + sharp * 2.5);

      const crust = Math.max(0, Math.min(1, (v - 0.42) * 3));
      field[y * w + x] = v * 0.62 + r * mtn * crust;
    }
  }
  return field;
}

function hydraulicErode(f, w, h, a, onProgress) {
  const strength = a.erosion ?? 0.5;
  if (strength <= 0) return;
  const rng = mulberry32((a.seed | 0) + 4242);
  const drops = Math.round((a.erosionIterations ?? 60) * 1000 * strength);
  const maxLife = 34;
  const inertia = 0.06, capacity = 5.5, erodeRate = 0.32, depositRate = 0.22;
  const evaporate = 0.02, gravity = 5, minSlope = 0.0009;

  for (let d = 0; d < drops; d++) {
    let px = rng() * w;
    let py = rng() * (h - 2) + 1;

    const latN = Math.abs((py / h) - 0.5) * 2;
    if (latN > 0.93) continue;

    let dx = 0, dy = 0, speed = 1, water = 1, sediment = 0;
    for (let life = 0; life < maxLife; life++) {
      const xi = Math.floor(px), yi = Math.floor(py);
      if (yi < 1 || yi >= h - 1) break;
      const u = px - xi, v = py - yi;
      const i00 = yi * w + (((xi % w) + w) % w);
      const i10 = yi * w + (((xi + 1) % w) + w) % w;
      const i01 = (yi + 1) * w + (((xi % w) + w) % w);
      const i11 = (yi + 1) * w + ((((xi + 1) % w) + w) % w);

      const hh = f[i00] * (1 - u) * (1 - v) + f[i10] * u * (1 - v) + f[i01] * (1 - u) * v + f[i11] * u * v;
      let gx = (f[i10] - f[i00]) * (1 - v) + (f[i11] - f[i01]) * v;
      let gy = (f[i01] - f[i00]) * (1 - u) + (f[i11] - f[i10]) * u;

      dx = dx * inertia - gx * (1 - inertia);
      dy = dy * inertia - gy * (1 - inertia);
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) break;
      dx /= len; dy /= len;
      px += dx; py += dy;
      if (py < 1 || py >= h - 1) break;

      const nxi = Math.floor(px), nyi = Math.floor(py);
      const ni = nyi * w + (((nxi % w) + w) % w);
      const newH = f[ni];
      const dh = newH - hh;

      const cap = Math.max(-dh, minSlope) * speed * water * capacity;
      if (sediment > cap || dh > 0) {

        const dep = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * depositRate;
        sediment -= dep;
        f[i00] += dep * (1 - u) * (1 - v);
        f[i10] += dep * u * (1 - v);
        f[i01] += dep * (1 - u) * v;
        f[i11] += dep * u * v;
      } else {

        const ero = Math.min((cap - sediment) * erodeRate, -dh);
        f[i00] -= ero * (1 - u) * (1 - v);
        f[i10] -= ero * u * (1 - v);
        f[i01] -= ero * (1 - u) * v;
        f[i11] -= ero * u * v;
        sediment += ero;
      }
      speed = Math.sqrt(Math.max(0, speed * speed + -dh * gravity));
      water *= (1 - evaporate);
      if (water < 0.01) break;
    }
    if ((d & 0xFFFF) === 0) onProgress?.(d / drops);
  }
}

function carveCanyons(f, w, h, a) {
  const amt = a.canyons ?? 0.4;
  if (amt <= 0) return;
  const n = w * h;
  const flow = new Float32Array(n).fill(1);
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  const heights = f;
  const idx = Array.from(order).sort((p, q) => heights[q] - heights[p]);

  const down = new Int32Array(n).fill(-1);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let best = -1, bestH = heights[i];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = ((x + ox) % w + w) % w, ny = y + oy;
          if (ny < 0 || ny >= h) continue;
          const j = ny * w + nx;
          if (heights[j] < bestH) { bestH = heights[j]; best = j; }
        }
      }
      down[i] = best;
    }
  }
  for (const i of idx) {
    const d = down[i];
    if (d >= 0) flow[d] += flow[i];
  }

  const width = 0.35 + (a.canyonWidth ?? 0.5) * 1.2;
  for (let i = 0; i < n; i++) {
    const fl = Math.log(1 + flow[i]) / Math.log(1 + n * 0.002);
    f[i] -= Math.min(0.42, Math.pow(Math.max(0, fl), width)) * amt * 0.4;
  }
}

function thermalErode(f, w, h, a, passes = 3) {
  const t = a.talus ?? 0.5;
  if (t <= 0) return;
  const maxSlope = 0.006 * (1.6 - t);       
  for (let p = 0; p < passes; p++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const hC = f[i];
        for (let k = 0; k < 4; k++) {
          const nx = k === 0 ? ((x + 1) % w) : k === 1 ? ((x - 1 + w) % w) : x;
          const ny = k === 2 ? y + 1 : k === 3 ? y - 1 : y;
          const j = ny * w + nx;
          const diff = hC - f[j];
          if (diff > maxSlope) {
            const move = (diff - maxSlope) * 0.25;
            f[i] -= move; f[j] += move;
          }
        }
      }
    }
  }
}

export async function buildAdvancedTerrain(w, h, a, progress = () => {}, tick = async () => {}) {

  const sw = Math.min(w, 2048);
  const sh = Math.max(2, Math.round(sw * h / w));

  progress('Raising continents & mountain ranges…', 0.05);
  await tick();
  const base = buildTectonic(sw, sh, a);

  const pristine = Float32Array.from(base);

  progress('Running hydraulic erosion (rivers & valleys)…', 0.15);
  await tick();
  hydraulicErode(base, sw, sh, a, () => {});

  progress('Carving canyons along drainage…', 0.45);
  await tick();
  carveCanyons(base, sw, sh, a);

  progress('Settling slopes (talus)…', 0.55);
  await tick();
  thermalErode(base, sw, sh, a);

  const delta = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) delta[i] = base[i] - pristine[i];

  progress('Rendering terrain at full resolution…', 0.62);
  await tick();
  const field = new Float32Array(w * h);
  const hiCont = buildTectonic(w, h, a);          
  const det = new Simplex3((a.seed | 0) + 5150);
  const detail = a.detail ?? 0.5;

  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) * sh / h - 0.5;
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const sx = (x + 0.5) * sw / w - 0.5;
      const i = y * w + x;
      let v = hiCont[i] + sampleField(delta, sw, sh, sx, sy);
      if (detail > 0) {
        const lon = (x / w) * 2 * Math.PI;
        const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);

        const rough = det.fbm(px * 42, py * 42, pz * 42, { octaves: 4, persistence: 0.5, ridged: true });
        // Gate the fine rock roughness to HIGH ground so plains/lowlands stay smooth and
        // only mountains carry craggy detail (plains-everywhere reads as noise).
        const mask = tSmooth(0.5, 0.78, v);
        v += rough * 0.03 * detail * mask;
      }
      field[i] = v;
    }
    if ((y & 63) === 0) { progress('Rendering terrain at full resolution…', 0.62 + 0.3 * (y / h)); await tick(); }
  }

  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < field.length; i++) { const v = field[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const span = Math.max(1e-6, mx - mn);
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - mn) / span;
  progress('Terrain ready.', 0.95);
  return field;
}

// BSP: expose the erosion stages so js/gen/worlds.js can run them on its own plate field.
export { hydraulicErode, carveCanyons, thermalErode, sampleField };

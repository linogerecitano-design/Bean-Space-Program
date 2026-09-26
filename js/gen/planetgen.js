// Surface generation: height (m) and albedo for any solid body, from its style description.
// Runs identically on the main thread (terrain chunks, collisions) and in workers (textures).
import { Noise3, h01 } from './noise.js';

const DEG = Math.PI / 180;
export function latLonToDir(latDeg, lonDeg) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}
export function dirToLatLon(x, y, z) { return [Math.asin(Math.max(-1, Math.min(1, y))) / DEG, Math.atan2(-z, x) / DEG]; }
const sstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

// Hand-placed real-world features ------------------------------------------------------------
export const REAL_FEATURES = {
  Earth: [
    { t: 'ridge', pts: [[35, 73], [30, 81], [27.8, 86.9], [27.5, 92], [28, 97]], h: 5200, w: 2.2 },
    { t: 'ridge', pts: [[35, 78], [34, 88], [33, 96]], h: 4200, w: 5 },
    { t: 'ridge', pts: [[36, 70], [39, 74], [42, 78], [43, 88]], h: 3800, w: 2 },
    { t: 'ridge', pts: [[10, -72], [0, -78], [-10, -76], [-18, -69], [-27, -68], [-33, -70], [-42, -72], [-50, -73], [-54, -70]], h: 4300, w: 2.2 },
    { t: 'ridge', pts: [[64, -140], [58, -130], [50, -117], [44, -110], [38, -106], [32, -106]], h: 2600, w: 4 },
    { t: 'ridge', pts: [[44, 6], [46, 8], [46.6, 10.5], [47, 14]], h: 2600, w: 1.3 },
    { t: 'ridge', pts: [[43.3, 40], [42.5, 45], [41, 49]], h: 3000, w: 1.2 },
    { t: 'ridge', pts: [[38, 44], [33, 48], [28, 56]], h: 1900, w: 2 },
    { t: 'ridge', pts: [[6, 37], [9, 38.5], [13, 38.5]], h: 2400, w: 3.5 },
    { t: 'ridge', pts: [[-3, 37.3], [-1, 36]], h: 2500, w: 1.6 },
    { t: 'ridge', pts: [[34, -84], [38, -80], [42, -75], [45, -70]], h: 900, w: 2 },
    { t: 'ridge', pts: [[67, 65], [60, 60], [52, 59]], h: 900, w: 1.5 },
    { t: 'ridge', pts: [[69, 18], [65, 14], [61, 8]], h: 1200, w: 2 },
    { t: 'ridge', pts: [[31, -8], [33, -3], [35.5, 4]], h: 2000, w: 1.4 },
    { t: 'ridge', pts: [[-15, 145], [-25, 151], [-33, 150], [-37, 148]], h: 900, w: 2 },
    { t: 'ridge', pts: [[46, -122], [40, -121], [36, -118]], h: 2200, w: 1.6 },
    { t: 'ridge', pts: [[-45, 168], [-43, 171]], h: 2200, w: 1 },
    { t: 'dome', lat: 72, lon: -40, r: 9, h: 3000 },
    { t: 'dome', lat: -82, lon: 45, r: 18, h: 3000 },
    { t: 'dome', lat: -80, lon: -110, r: 10, h: 1800 },
    { t: 'dome', lat: -16, lon: -46, r: 8, h: 900 },
    { t: 'dome', lat: 3, lon: 22, r: 12, h: 500 },
  ],
  Moon: [
    { t: 'basin', lat: 32.8, lon: -15.6, r: 18.5, depth: 3000, mare: 1 },
    { t: 'basin', lat: 28, lon: 17.5, r: 11.5, depth: 2500, mare: 1 },
    { t: 'basin', lat: 8.5, lon: 31.4, r: 14, depth: 2000, mare: 1 },
    { t: 'basin', lat: 17, lon: 59.1, r: 9.2, depth: 3500, mare: 1 },
    { t: 'basin', lat: -7.8, lon: 51.3, r: 13, depth: 1800, mare: 1 },
    { t: 'basin', lat: -21.3, lon: -16.6, r: 11, depth: 1500, mare: 1 },
    { t: 'basin', lat: 18.4, lon: -57.4, r: 36, depth: 1500, mare: 0.9 },
    { t: 'basin', lat: 56, lon: 1.4, r: 10, depth: 1200, mare: 0.9 },
    { t: 'basin', lat: 50, lon: -30, r: 10, depth: 1200, mare: 0.8 },
    { t: 'basin', lat: -15.2, lon: 35.5, r: 5.5, depth: 2500, mare: 1 },
    { t: 'basin', lat: -24.4, lon: -38.6, r: 6.2, depth: 2500, mare: 1 },
    { t: 'basin', lat: -19.4, lon: -92.8, r: 10, depth: 3500, mare: 0.4, ring: 1 },
    { t: 'basin', lat: -53, lon: -169, r: 40, depth: 6000, mare: 0 },
    { t: 'crater', lat: -43.3, lon: -11.2, r: 1.4, depth: 4800, rays: 1 },
    { t: 'crater', lat: 9.6, lon: -20.1, r: 1.55, depth: 3800, rays: 0.7 },
    { t: 'crater', lat: -8.9, lon: -15.5, r: 0.6, depth: 1500, rays: 0.5 },
  ],
  Mars: [
    { t: 'volcano', lat: 18.65, lon: -133.8, r: 5, h: 21900 },
    { t: 'volcano', lat: 11.8, lon: -104.5, r: 3, h: 18000 },
    { t: 'volcano', lat: 1.5, lon: -113, r: 3, h: 14000 },
    { t: 'volcano', lat: -8.3, lon: -120.1, r: 3.2, h: 17700 },
    { t: 'volcano', lat: 40.5, lon: -109.6, r: 10, h: 6800 },
    { t: 'volcano', lat: 25, lon: 147, r: 3, h: 12600 },
    { t: 'dome', lat: 0, lon: -110, r: 25, h: 6000 },
    { t: 'basin', lat: -42.4, lon: 70.5, r: 19, depth: 8000, mare: 0 },
    { t: 'basin', lat: -49.7, lon: -43.4, r: 15, depth: 5000, mare: 0 },
    { t: 'basin', lat: 24, lon: 60, r: 16, depth: 3000, mare: 0 },
    { t: 'canyon', pts: [[-6, -100], [-8, -85], [-11, -70], [-14, -55]], depth: 7000, w: 1.6 },
    { t: 'crater', lat: -5.4, lon: 137.8, r: 1.3, depth: 3000 },
  ],
  Mercury: [{ t: 'basin', lat: 30.5, lon: -170.2, r: 26, depth: 2000, mare: 0.3, ring: 1 }, { t: 'crater', lat: -12, lon: -30, r: 1.5, depth: 3000, rays: 1 }],
  Pluto: [{ t: 'basin', lat: 25, lon: 175, r: 17, depth: 3000, bright: [0.97, 0.94, 0.9] }, { t: 'region', lat: -10, lon: 120, r: 30, color: [0.28, 0.12, 0.07] }],
  Charon: [{ t: 'region', lat: 90, lon: 0, r: 22, color: [0.45, 0.22, 0.14] }],
  Ceres: [{ t: 'crater', lat: 19.8, lon: -120.7, r: 2.9, depth: 4000 }, { t: 'region', lat: 19.8, lon: -120.7, r: 0.6, color: [0.95, 0.95, 0.93] }, { t: 'volcano', lat: -10.5, lon: -44.3, r: 1.8, h: 4000 }],
  Mimas: [{ t: 'crater', lat: 1.4, lon: -112, r: 13, depth: 10000 }],
  Vesta: [{ t: 'basin', lat: -75, lon: 301, r: 60, depth: 20000 }],
  Enceladus: [{ t: 'region', lat: -85, lon: 0, r: 14, color: [0.55, 0.72, 0.85], stripes: 1 }],
  Io: [{ t: 'region', lat: -18, lon: -104, r: 6, color: [0.75, 0.3, 0.12] }, { t: 'region', lat: 30, lon: 20, r: 4, color: [0.3, 0.2, 0.15] }],
  Ganymede: [{ t: 'region', lat: 20, lon: -135, r: 30, color: [0.28, 0.25, 0.22] }],
  Titan: [{ t: 'region', lat: -10, lon: -100, r: 25, color: [0.75, 0.62, 0.42] }],
  Miranda: [{ t: 'canyon', pts: [[-20, 0], [-40, 40], [-60, 80]], depth: 10000, w: 2 }],
  Iapetus: [{ t: 'ridge', pts: [[0, -180], [0, -90], [0, 0], [0, 90]], h: 13000, w: 1 }],
};

// Launch site (Cape Canaveral LC-39A analogue) — flattened pad area
export const LAUNCH_SITE = { lat: 28.6082, lon: -80.6041, alt: 3 };

function sampleEq(m, lat, lon) {
  const u = ((lon + 180) / 360) * m.w - 0.5, v = ((90 - lat) / 180) * m.h - 0.5;
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, W = m.w, H = m.h, d = m.data;
  const X0 = ((x0 % W) + W) % W, X1 = (X0 + 1) % W, Y0 = Math.max(0, Math.min(H - 1, y0)), Y1 = Math.max(0, Math.min(H - 1, y0 + 1));
  const a = d[Y0 * W + X0], b = d[Y0 * W + X1], c = d[Y1 * W + X0], e = d[Y1 * W + X1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
}
function gcDist(d, c) { const dp = d[0] * c[0] + d[1] * c[1] + d[2] * c[2]; return Math.acos(Math.max(-1, Math.min(1, dp))); }
function segDist(d, a, b) { // angular distance from dir d to great-circle segment ab
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ad = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let t = (ad[0] * ab[0] + ad[1] * ab[1] + ad[2] * ab[2]) / (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] + 1e-12);
  t = Math.max(0, Math.min(1, t));
  const p = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]; const l = Math.hypot(p[0], p[1], p[2]);
  return gcDist(d, [p[0] / l, p[1] / l, p[2] / l]);
}

export class Surface {
  // body: {name, radius, style, seed}; opts.landMask: {w,h,data}
  constructor(body, opts = {}) {
    this.name = body.name; this.R = body.radius; this.style = body.style || {};
    const st = this.style;
    this.kind = st.kind || 'rocky';
    this.seed = (st.seed ?? 0) + hashName(body.name);
    this.n = new Noise3(this.seed); this.n2 = new Noise3(this.seed * 7 + 3);
    this.relief = st.relief ?? (this.kind === 'asteroid' ? this.R * 0.08 : 3000);
    if (this.kind !== 'asteroid') this.relief = Math.min(this.relief, this.R * 0.05);
    this.colors = st.colors || { low: [0.3, 0.3, 0.3], mid: [0.5, 0.5, 0.5], high: [0.7, 0.7, 0.7] };
    this.landMask = opts.landMask || null;
    this.maps = opts.maps || null; // real elevation / water maps (CPU copies)
    this.hmap = this.maps && this.maps.height;
    this.seaLevel = st.seaLevel ?? null;
    this.features = (st.features || REAL_FEATURES[body.name] || []).map(f => ({ ...f, c: f.lat !== undefined ? latLonToDir(f.lat, f.lon) : null, P: f.pts ? f.pts.map(p => latLonToDir(p[0], p[1])) : null }));
    this.isEarth = this.kind === 'earth' && body.name === 'Earth';
    this.site = this.isEarth ? latLonToDir(LAUNCH_SITE.lat, LAUNCH_SITE.lon) : null;
    if (this.site) { // local ENU basis at the launch site (x east, z south)
      const u = this.site, e = [u[2], 0, -u[0]]; const el = Math.hypot(e[0], e[2]); e[0] /= el; e[2] /= el;
      this.siteE = e; this.siteN = [u[1] * e[2] - u[2] * e[1], u[2] * e[0] - u[0] * e[2], u[0] * e[1] - u[1] * e[0]];
    }
    this.craterScales = [];
    const cd = st.craters ?? (this.kind === 'terra' || this.kind === 'earth' ? 0 : 0.3);
    if (cd > 0) {
      // crater frequencies in cells around the sphere; smaller body => relatively larger craters
      const base = Math.max(4, Math.min(20, 6 * Math.pow(this.R / 1e6, 0.25)));
      for (let k = 0; k < 5; k++) this.craterScales.push({ f: base * Math.pow(3.1, k), p: cd * (0.55 - k * 0.04), depth: 0.22 / Math.pow(2.3, k) });
    }
    this.out = [0, 0, 0];
    this.detailType = st.detail || (this.kind === 'icy' ? 'icy' : this.kind === 'terra' ? 'terra' : this.kind === 'earth' ? 'none' : st.dunes ? 'desert' : st.lava ? 'volcanic' : 'airless');
    // Small bodies can't pull themselves round: give every body under ~200 km a seeded lumpy shape
    // (and a gentle one up to ~400 km) unless the catalogue already describes its shape.
    if (!st.shape && !st.contactBinary && !st.spinningTop && this.kind !== 'gas' && this.kind !== 'earth' && this.R < 220e3) {
      const h = (k) => { const x = Math.sin((this.seed + k * 97.13) * 12.9898) * 43758.5453; return x - Math.floor(x); };
      const t = Math.max(0, Math.min(1, (220e3 - this.R) / 150e3)); // 0 at 220 km .. 1 below 70 km
      this.style = { ...st, shape: [1 + t * (0.15 + h(1) * 0.6), 1 - t * h(2) * 0.15, 1 - t * (0.05 + h(3) * 0.3)], irregular: Math.max(st.irregular || 0, 0.05 + t * 0.12) };
      if (this.R < 60e3 && h(4) < 0.12) this.style.contactBinary = true;
    }
  }
  // shape function for small irregular bodies (multiplier on radius)
  shapeMul(x, y, z) {
    const st = this.style;
    let r = 1;
    if (st.contactBinary) {
      const lobes = [[0.45, 0, 0, 0.62], [-0.55, 0.05, 0, 0.5]];
      let best = 0.3;
      for (const [cx, cy, cz, rr] of lobes) {
        const b = x * cx + y * cy + z * cz, c = cx * cx + cy * cy + cz * cz - rr * rr, disc = b * b - c;
        if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc));
      }
      r = best * 1.25;
    }
    if (st.shape) { const [a, b, c] = st.shape; r *= 1 / Math.sqrt((x / a) ** 2 + (y / c) ** 2 + (z / b) ** 2); }
    if (st.spinningTop) { const e = 1 - Math.abs(y); r *= 0.88 + 0.2 * e * e * e; }
    if (st.irregular) { const irr = Math.min(st.irregular, 0.22); r *= 1 + irr * (this.n2.fbm(x * 0.9, y * 0.9, z * 0.9, 3) + 0.3 * this.n2.fbm(x * 2.2, y * 2.2, z * 2.2, 2)); }
    return r;
  }
  landAt(lat, lon) {
    const m = this.landMask; if (!m) return 0;
    const u = ((lon + 180) / 360) * m.w - 0.5, v = ((90 - lat) / 180) * m.h - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const W = m.w, H = m.h, d = m.data;
    const X0 = ((x0 % W) + W) % W, X1 = (X0 + 1) % W, Y0 = Math.max(0, Math.min(H - 1, y0)), Y1 = Math.max(0, Math.min(H - 1, y0 + 1));
    return mix(mix(d[Y0 * W + X0], d[Y0 * W + X1], fx), mix(d[Y1 * W + X0], d[Y1 * W + X1], fx), fy);
  }
  craters(x, y, z, withRays) {
    let h = 0, ray = 0;
    for (const sc of this.craterScales) {
      const f = sc.f, px = x * f, py = y * f, pz = z * f;
      const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz;
        const s = this.seed & 0xffff;
        if (h01(cx, cy, cz, s) > sc.p) continue;
        const ox = cx + h01(cx, cy, cz, s + 1), oy = cy + h01(cx, cy, cz, s + 2), oz = cz + h01(cx, cy, cz, s + 3);
        const rad = 0.18 + 0.32 * h01(cx, cy, cz, s + 4);
        const ddx = px - ox, ddy = py - oy, ddz = pz - oz;
        const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) / rad;
        if (d < 1.6) {
          const depth = sc.depth * rad; // relative to crater radius
          let v;
          if (d < 1) v = (d * d - 1) * depth + depth * 0.25 * sstep(0.7, 1.0, d); else v = depth * 0.25 * (1 - sstep(1.0, 1.6, d));
          h += v * (f > 60 ? 1 : 1) / f;
          if (withRays && d < 1.6 && sc.f < 40 && h01(cx, cy, cz, s + 7) < 0.25) ray = Math.max(ray, 1 - sstep(0.3, 1.6, d));
        }
      }
    }
    this.lastRay = ray;
    return h; // in units of sphere radius (unit-dir space)
  }
  // Height above mean radius (m). dir must be unit length, body-fixed.
  // lod: smallest feature size (m) worth generating at this sample (terrain chunks pass their vertex
  // spacing; physics uses the finest level so contact matches the highest-detail mesh)
  height(x, y, z, lod = 0.6) {
    const st = this.style, n = this.n, R = this.R;
    let h = 0;
    if (this.hmap && !this.isEarth) {
      const [la, lo] = dirToLatLon(x, y, z);
      let hh = sampleEq(this.hmap, la, lo) * this.hmap.scale + this.hmap.offset;
      // everything smaller than the map's texels is synthesised procedurally
      hh += this.fineDetail(x, y, z, lod, 2 * Math.PI * R / this.hmap.w * 1.5, hh);
      if (st.shape || st.contactBinary || st.spinningTop) hh += R * (this.shapeMul(x, y, z) - 1); // baked maps keep the body's real shape (e.g. Haumea)
      return hh;
    }
    if (this.kind === 'asteroid') {
      h = R * (this.shapeMul(x, y, z) - 1);
      h += this.craters(x, y, z, false) * R * 1.4;
      h += R * 0.012 * n.fbm(x * 12, y * 12, z * 12, 4);
      h += this.fineDetail(x, y, z, lod, Math.max(50, R * 0.02), h);
      return h;
    }
    const relief = this.relief;
    if (this.isEarth) return this.earthHeight(x, y, z);

    if (this.kind === 'terra') return this.terraHeight(x, y, z);
    // continents / terrain
    const cont = n.warped(x * 1.4, y * 1.4, z * 1.4, 5, 0.7);
    const mountains = n.ridged(x * 3.5, y * 3.5, z * 3.5, 6);
    const mMask = sstep(-0.1, 0.4, n.fbm(x * 1.1 + 5, y * 1.1, z * 1.1, 3));
    h = relief * (0.5 * cont + 0.55 * (mountains - 0.35) * mMask);
    h += relief * 0.05 * n.fbm(x * 40, y * 40, z * 40, 4);
    if (st.shape || st.irregular) h += R * (this.shapeMul(x, y, z) - 1);
    if (st.dunes) h += relief * 0.02 * st.dunes * Math.sin((x * 400 + n.n(x * 20, y * 20, z * 20) * 30)) * (1 - Math.abs(y));
    if (st.cracks) h -= relief * 0.15 * st.cracks * Math.pow(n.ridged(x * 6, y * 6, z * 6, 3), 6);
    if (st.maria) { const m = sstep(0.05, 0.3, n2fbm(this, x, y, z)) * st.maria; h = mix(h, -relief * 0.35 + h * 0.15, m); }
    if (st.volcanic && !st.sulfur) h += relief * 0.6 * st.volcanic * Math.pow(Math.max(0, n.fbm(x * 2.2 + 11, y * 2.2, z * 2.2, 2)), 3);
    if (this.craterScales.length) h += this.craters(x, y, z, !!st.rays) * R * 0.6 * Math.min(1, 2e6 / R + 0.2);
    h += this.featureHeight(x, y, z);
    h += this.fineDetail(x, y, z, lod, R / 250, h);
    return h;
  }
  // Procedural detail below a cut-off scale: crater populations on airless worlds (fresh bowls,
  // degraded pits, flat floors, central peaks), eroded ridges on terrestrials, mesas and buttes on
  // deserts, fractures on icy crusts. More appears the closer the camera gets (via lod).
  fineDetail(x, y, z, lod, maxScale, base) {
    const R = this.R, n = this.n, t = this.detailType; if (t === 'none') return 0;
    const reliefK = Math.min(1, (this.relief || 3000) / 6000);
    let h = 0;
    // fade octaves in by size relative to the sampling LOD (wide ramp so neighbouring chunks at
    // different LODs agree on everything bigger than the coarser one's vertex spacing)
    const band = (scale) => sstep(lod * 0.5, lod * 2.5, scale) * sstep(maxScale, maxScale * 0.5, scale);
    for (let s = maxScale * 0.5, k = 0; s > lod * 0.5 && k < 14; s *= 0.5, k++) {
      const f = R / s, w = band(s);
      if (!w) continue;
      const amp = s * (t === 'terra' ? 0.05 : t === 'desert' ? 0.04 : t === 'icy' ? 0.025 : 0.035) * reliefK;
      h += w * amp * (t === 'terra' || t === 'desert' ? n.ridged(x * f, y * f, z * f, 1) - 0.4 : n.n(x * f, y * f, z * f));
    }
    if (t === 'airless' || t === 'icy') h += this.craterField(x, y, z, lod, maxScale, t === 'icy' ? 0.7 : 1);
    if (t === 'icy') { const f = R / Math.max(maxScale * 0.3, lod * 8); if (R / f > lod * 2) h -= 30 * reliefK * Math.pow(1 - Math.abs(this.n2.n(x * f, y * f, z * f)), 18); }
    if (t === 'desert' && (this.style.mesas ?? true)) {
      // terraced plateaus: caprock layers eroding into mesas, buttes and canyons
      const step = 60 + 90 * (0.5 + 0.5 * this.n2.n(x * 3, y * 3, z * 3)); const v = (base + h) / step;
      const fl = Math.floor(v), fr = v - fl; h += (fl + sstep(0.35, 0.65, fr) - v) * step * 0.85 * sstep(0, 0.3, this.n2.fbm(x * 40, y * 40, z * 40, 3) + 0.2);
    }
    return h;
  }
  // multi-octave impact craters whose radii span [lod, maxScale]
  craterField(x, y, z, lod, maxScale, density) {
    const R = this.R, sd = this.seed & 0xffff; let h = 0;
    const age = 0.5 + 0.5 * h01(sd, 1, 2, 3);
    for (let k = 0; k < 16; k++) {
      const cell = Math.min(maxScale * 3, R * 0.2) * Math.pow(0.42, k); // cell size (m); craters ~0.1-0.35 cell radius
      const rMax = cell * 0.35; if (rMax < lod * 0.3) break;
      const w = sstep(maxScale * 2.5, maxScale, cell) * sstep(lod * 0.3, lod * 1.5, rMax); if (!w) continue;
      const f = R / cell, px = x * f, py = y * f, pz = z * f;
      const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
      const s = sd + k * 131;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz;
        if (h01(cx, cy, cz, s) > 0.62 * density) continue;
        const ox = cx + h01(cx, cy, cz, s + 1), oy = cy + h01(cx, cy, cz, s + 2), oz = cz + h01(cx, cy, cz, s + 3);
        const rad = 0.1 + 0.25 * Math.pow(h01(cx, cy, cz, s + 4), 2);
        const ddx = px - ox, ddy = py - oy, ddz = pz - oz; const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
        if (d2 > rad * rad * 4) continue;
        const d = Math.sqrt(d2) / rad; const Rm = rad * cell; // crater radius in metres
        const fresh = h01(cx, cy, cz, s + 5) > age;               // fresh sharp bowl vs softened old pit
        const depth = Rm * (Rm > 8000 ? 0.12 : 0.4) * (fresh ? 1 : 0.45);
        // bowl inside, rim + ejecta outside, cross-faded over a few vertex spacings so the crest never
        // gets sharper than the mesh can hold (a sharp crest aliases into a sawtooth)
        const rf = fresh ? 1 : 0.5, wd = Math.min(0.3, Math.max(0.05, 2.5 * lod / Rm));
        const flat = Rm > 3000 ? 0.45 : 0.0;                      // complex craters have flat floors
        const inner = (dd) => { const q = Math.max(0, (dd - flat) / (1 - flat)); let u = -depth * (1 - q * q) + depth * 0.22 * rf * sstep(0.75, 1, dd); if (Rm > 8000 && dd < 0.15) u += depth * 0.5 * (1 - dd / 0.15); return u; };
        const outer = (dd) => depth * 0.22 * rf * Math.pow(Math.max(0, 2 - dd), 2);
        let v;
        if (d < 1 - wd) v = inner(d);
        else if (d > 1 + wd) v = outer(d);
        else { const b = sstep(1 - wd, 1 + wd, d); v = inner(Math.min(d, 1)) * (1 - b) + outer(Math.max(d, 1)) * b; }
        h += v * w;
      }
    }
    return h;
  }
  smallCraters(x, y, z) { // only the finest crater octaves (big ones are in the real maps)
    const keep = this.craterScales; this.craterScales = keep.filter(c => c.f > 400);
    if (!this.craterScales.length) { const b = keep[keep.length - 1]; this.craterScales = [{ f: b.f * 3.1, p: b.p, depth: b.depth / 2.3 }, { f: b.f * 9.6, p: b.p, depth: b.depth / 5.3 }]; }
    const h = this.craters(x, y, z, false); this._fine = this.craterScales; this.craterScales = keep; return h;
  }
  featureHeight(x, y, z) {
    let h = 0; const d = [x, y, z];
    for (const f of this.features) {
      if (f.t === 'ridge') {
        let a = 9; for (let i = 0; i < f.P.length - 1; i++) a = Math.min(a, segDist(d, f.P[i], f.P[i + 1]));
        const w = f.w * DEG; if (a < w * 2) { const k = 1 - sstep(0, w * 2, a); h += f.h * k * k * (0.55 + 0.9 * Math.max(0, this.n.ridged(x * 60, y * 60, z * 60, 4) - 0.2)); }
      } else if (f.t === 'dome') {
        const a = gcDist(d, f.c), r = f.r * DEG; if (a < r * 1.3) { const k = 1 - sstep(0, r * 1.3, a); h += f.h * Math.sqrt(k); }
      } else if (f.t === 'volcano') {
        const a = gcDist(d, f.c), r = f.r * DEG;
        if (a < r * 1.5) { const k = 1 - a / (r * 1.5); h += f.h * Math.pow(k, 1.6) - (a < r * 0.12 ? f.h * 0.15 * (1 - a / (r * 0.12)) : 0); }
      } else if (f.t === 'basin' || f.t === 'crater') {
        const a = gcDist(d, f.c), r = f.r * DEG;
        if (a < r * 1.5) {
          const q = a / r;
          const bowl = q < 1 ? -(1 - q * q) : 0; const rim = 0.18 * Math.exp(-((q - 1) * (q - 1)) / 0.02);
          h += f.depth * (bowl * (f.t === 'basin' ? 0.8 : 1) + rim);
          if (f.ring) h += f.depth * 0.15 * Math.exp(-((q - 0.65) ** 2) / 0.003);
        }
      } else if (f.t === 'canyon') {
        let a = 9; for (let i = 0; i < f.P.length - 1; i++) a = Math.min(a, segDist(d, f.P[i], f.P[i + 1]));
        const w = f.w * DEG * (0.8 + 0.4 * this.n.fbm(x * 30, y * 30, z * 30, 2)); if (a < w) h -= f.depth * (1 - sstep(0.4 * w, w, a));
      }
    }
    return h;
  }
  earthHeight(x, y, z) {
    const n = this.n;
    const [lat, lon] = dirToLatLon(x, y, z);
    if (this.maps && this.maps.water) {
      const wSharp = sampleEq(this.maps.water, lat, lon), wBlur = sampleEq({ ...this.maps.water, data: this.maps.waterBlur }, lat, lon);
      // the coarse water mask puts the Cape's facilities in the lagoons: grow the land around the site
      // along an irregular (noise-warped) outline instead of stamping a round island onto the sea
      const coast = (1 - wSharp) - 0.5 + 0.18 * n.fbm(x * 400, y * 400, z * 400, 4) * (1 - Math.abs(wSharp * 2 - 1) * 0.7) + this.siteLand(x, y, z);
      let h;
      if (coast > 0) {
        const topo = sampleEq(this.hmap, lat, lon);
        h = 4 + Math.pow(topo, 1.15) * this.hmap.scale * 1.05;
        h += (60 + topo * 900) * n.ridged(x * 700, y * 700, z * 700, 5) * Math.min(1, coast * 4);
        h += 25 * n.fbm(x * 5000, y * 5000, z * 5000, 3);
      } else {
        const depth = sstep(0, 0.6, wBlur - 0.35);
        h = -8 - 4800 * depth - 900 * depth * n.fbm(x * 30, y * 30, z * 30, 4);
      }
      return this.siteHeight(x, y, z, h);
    }
    const land = this.landAt(lat, lon); // 0..1 blurred
    const detail = n.fbm(x * 6, y * 6, z * 6, 5);
    const coast = land + 0.12 * detail + 0.05 * n.fbm(x * 60, y * 60, z * 60, 3) - 0.5;
    let h;
    if (coast > 0) {
      const inland = sstep(0, 0.5, coast);
      h = 10 + 450 * inland + 700 * inland * Math.max(0, n.fbm(x * 9, y * 9, z * 9, 5) + 0.2) + 180 * n.ridged(x * 30, y * 30, z * 30, 5) * inland;
      h += this.featureHeight(x, y, z);
    } else {
      const depth = sstep(0, 0.45, -coast);
      h = -30 - 5200 * depth - 800 * depth * n.fbm(x * 5, y * 5, z * 5, 4);
      h += 2000 * depth * Math.max(0, n.ridged(x * 3, y * 3, z * 3, 4) - 0.6); // ridges / seamounts
    }
    return this.siteHeight(x, y, z, h);
  }

  // Cape Canaveral area: flat coastal land around the space centre with the Atlantic beach to
  // the east, blended into the global elevation data further out.
  siteLand(x, y, z) {
    if (!this.site) return 0;
    const s = this.site; const dx = x - s[0], dy = y - s[1], dz = z - s[2];
    const dist = Math.hypot(dx, dy, dz) * this.R; if (dist > 40000) return 0;
    const n = this.n; const warp = 5500 * n.fbm(x * 900 + 11, y * 900, z * 900, 4) + 1500 * n.fbm(x * 4000, y * 4000 + 5, z * 4000, 3);
    return 1.2 * (1 - sstep(9000, 26000, dist + warp));
  }
  siteHeight(x, y, z, hGlobal) {
    const s = this.site; const dx = x - s[0], dy = y - s[1], dz = z - s[2];
    const R = this.R; const ex = (dx * this.siteE[0] + dy * this.siteE[1] + dz * this.siteE[2]) * R, no = (dx * this.siteN[0] + dy * this.siteN[1] + dz * this.siteN[2]) * R;
    const dist = Math.hypot(ex, no); if (dist > 45000) return hGlobal;
    const n = this.n;
    const coast = 2600 + 420 * Math.sin(no / 3100) + 160 * Math.sin(no / 870 + 1.3) + 90 * n.fbm(x * 3000, y * 3000, z * 3000, 3);
    const off = ex - coast; // + = seaward
    let h;
    if (off < -140) { // coastal plain: dead flat near the facilities, gentle swales further out
      const flat = 1 - sstep(5500, 9000, dist);
      const rough = 1.4 * n.fbm(x * 9000, y * 9000, z * 9000, 3) + 0.5 * n.fbm(x * 60000, y * 60000, z * 60000, 2);
      h = LAUNCH_SITE.alt + rough * (1 - flat) + 0.05 * rough * flat;
      h -= 1.5 * sstep(-900, -140, off) * (1 - flat * 0.6); // low dune slack behind the beach
    } else if (off < 60) { // beach and dune
      const t = (off + 140) / 200; h = mix(LAUNCH_SITE.alt - 1.2 + 2.2 * Math.exp(-((t - 0.25) ** 2) / 0.01), 0.4, sstep(0.3, 1, t));
    } else { // shelving sea floor that runs into the real bathymetry with distance from the beach (not from the pad)
      h = 0.4 - Math.min(18, off * 0.0065) - 6 * sstep(2000, 9000, off);
      if (hGlobal < h) h = mix(h, hGlobal, sstep(1500, 14000, off));
    }
    // sea and lagoons beyond the facilities keep the global (mask-following) shoreline; blending a flat
    // plain into deep water over a fixed radius drew a circular coast
    if (hGlobal < 0 && off < -140 && dist > 7000) return hGlobal;
    const k = sstep(25000, 45000, dist);
    return mix(h, hGlobal, k);
  }
  // Albedo at a point. Returns [r,g,b,water(0/1), emissive]
  color(x, y, z, h, slope = 0) {
    const st = this.style, c = this.colors, n = this.n, o = this.out;
    const R = this.R;
    let water = 0;
    if (this.kind === 'earth' || this.kind === 'terra') return this.earthColor(x, y, z, h, slope);
    const rel = this.kind === 'asteroid' ? h / (R * 0.1) : h / (this.relief || 1);
    const t = sstep(-0.6, 0.8, rel + 0.25 * n.fbm(x * 8 + 3, y * 8, z * 8, 3));
    if (t < 0.5) mix3(o, c.low, c.mid, t * 2); else mix3(o, c.mid, c.high, (t - 0.5) * 2);
    const v = 0.9 + 0.2 * n.fbm(x * 30, y * 30, z * 30, 3);
    o[0] *= v; o[1] *= v; o[2] *= v;
    if (st.maria) {
      const m = sstep(0.05, 0.3, n2fbm(this, x, y, z)) * st.maria;
      const mc = st.mariaColor || [c.low[0] * 0.6, c.low[1] * 0.6, c.low[2] * 0.6];
      mix3(o, o, mc, m * 0.8);
    }
    for (const f of this.features) {
      if (f.c && (f.mare || f.bright || f.color || f.rays)) {
        const a = gcDist([x, y, z], f.c), r = f.r * DEG;
        if (f.mare && a < r * 1.1) mix3(o, o, st.mariaColor || [0.2, 0.2, 0.21], f.mare * (1 - sstep(r * 0.75, r * 1.1, a)) * (0.85 + 0.15 * n.fbm(x * 20, y * 20, z * 20, 2)));
        if (f.bright && a < r) mix3(o, o, f.bright, 1 - sstep(r * 0.7, r, a));
        if (f.color && a < r) {
          let k = 1 - sstep(r * 0.5, r, a + 0.1 * r * n.fbm(x * 10, y * 10, z * 10, 3));
          if (f.stripes) k *= sstep(0.5, 0.9, Math.sin((x * 0.8 + z) * 40));
          mix3(o, o, f.color, k);
        }
        if (f.rays && a < r * 12) {
          const ang = Math.atan2(y - f.c[1], x - f.c[0] + z - f.c[2]);
          const ray = Math.pow(Math.max(0, n.n(ang * 8, f.c[0] * 10, 0.5)), 2) * (1 - sstep(r, r * 12, a));
          mix3(o, o, [0.8, 0.8, 0.78], Math.min(0.6, ray * 1.5) * f.rays);
        }
      }
    }
    if (st.rays && this.lastRay) mix3(o, o, [0.75, 0.75, 0.73], this.lastRay * 0.4 * st.rays);
    if (st.iceCaps) { const cap = sstep(st.iceCaps, st.iceCaps + 0.04, Math.abs(y) + 0.03 * n.fbm(x * 12, y * 12, z * 12, 3)); mix3(o, o, c.ice || [0.95, 0.95, 0.95], cap); }
    if (st.cracks) { const k = Math.pow(n.ridged(x * 6, y * 6, z * 6, 3), 6) * st.cracks; mix3(o, o, c.crack || [0.5, 0.35, 0.25], Math.min(1, k * 1.5)); }
    if (st.sulfur) {
      const spots = n.fbm(x * 9, y * 9, z * 9, 4);
      if (spots > 0.35) mix3(o, o, [0.15, 0.1, 0.08], sstep(0.35, 0.5, spots));
      const halo = n2fbm(this, x * 3, y * 3, z * 3);
      if (halo > 0.3) mix3(o, o, [0.85, 0.4, 0.15], sstep(0.3, 0.5, halo) * 0.6);
      if (halo < -0.35) mix3(o, o, [0.95, 0.95, 0.85], 0.5);
    }
    if (st.twoTone) { const lead = -z; mix3(o, o, [0.12, 0.08, 0.05], sstep(-0.1, 0.35, lead + 0.1 * n.fbm(x * 5, y * 5, z * 5, 3))); }
    if (st.polarRed) {}
    if (st.brightSpots) {}
    if (st.lava) {
      const cracks = Math.pow(n.ridged(x * 5, y * 5, z * 5, 4), 5);
      const e = sstep(0.25, 0.7, cracks) * st.lava;
      o[3] = 0; o[4] = e; // emissive
      mix3(o, o, [0.05, 0.04, 0.04], 0.6 * st.lava);
      return o;
    }
    if (this.seaLevel !== null && h < this.seaLevel) {
      const polar = st.lakesNorth ? sstep(0.6, 0.8, y) : 1;
      if (polar > 0.5) { const d = sstep(0, this.relief * 0.3, this.seaLevel - h); mix3(o, c.shallow || [0.05, 0.25, 0.35], c.ocean || [0.02, 0.07, 0.18], d); water = 1; }
    }
    if (slope > 0.5 && !water) mix3(o, o, [o[0] * 0.75, o[1] * 0.72, o[2] * 0.7], sstep(0.5, 0.9, slope));
    o[3] = water; o[4] = 0;
    return o;
  }
  terraHeight(x, y, z) {
    const n = this.n, st = this.style;
    const thr = (st.oceanFrac ?? 0.6) * 0.9 - 0.45; // fbm roughly in [-0.6,0.6]
    const c = n.warped(x * 1.3, y * 1.3, z * 1.3, 7, 0.8) - thr + 0.1;
    let h;
    if (c > 0) {
      const inland = sstep(0, 0.25, c);
      h = 10 + 800 * inland + 3500 * inland * Math.pow(n.ridged(x * 4, y * 4, z * 4, 6), 2) * sstep(-0.2, 0.3, n.fbm(x * 1.7 + 4, y * 1.7, z * 1.7, 3)) + 150 * n.fbm(x * 40, y * 40, z * 40, 4);
    } else {
      const depth = sstep(0, 0.2, -c);
      h = -30 - 5000 * depth - 600 * n.fbm(x * 6, y * 6, z * 6, 3) * depth;
    }
    return h;
  }
  earthColor(x, y, z, h, slope) {
    const n = this.n, c = this.colors, o = this.out;
    if (h < 0) {
      const d = sstep(0, 3000, -h);
      mix3(o, c.shallow, c.ocean, Math.sqrt(d));
      const ice = sstep(0.9, 0.95, Math.abs(y) + 0.03 * n.fbm(x * 10, y * 10, z * 10, 3));
      mix3(o, o, [0.85, 0.9, 0.95], ice);
      o[3] = ice > 0.5 ? 0 : 1; o[4] = 0; return o;
    }
    const lat = Math.abs(Math.asin(y)) / DEG;
    // temperature and moisture fields
    const temp = 1 - lat / 70 - h / 5000 + 0.08 * n.fbm(x * 4, y * 4, z * 4, 3);
    let moist = 0.55 + 0.45 * n.fbm(x * 3 + 7, y * 3, z * 3, 4);
    moist -= 0.55 * Math.exp(-((lat - 24) ** 2) / 90); // subtropical deserts
    moist += 0.3 * Math.exp(-(lat * lat) / 60); // tropical rainforest
    const [la, lo] = dirToLatLon(x, y, z);
    if (this.isEarth) {
    if (la > 15 && la < 32 && lo > -15 && lo < 60) moist -= 0.35; // Sahara/Arabia
    if (la < -18 && la > -32 && lo > 118 && lo < 145) moist -= 0.35; // Australia
    if (la > 36 && la < 48 && lo > 55 && lo < 115) moist -= 0.25; // Central Asia
    }
    const veg = c.vegetation || [0.1, 0.22, 0.06];
    const forest = [veg[0] * 0.7 + 0.03 * temp, veg[1] * 0.77 + 0.05 * temp, veg[2] * 0.8];
    const grass = [0.3, 0.33, 0.14];
    const tundra = [0.38, 0.36, 0.3];
    const desert = c.desert;
    const wet = sstep(0.15, 0.6, moist);
    mix3(o, desert, grass, wet);
    mix3(o, o, forest, sstep(0.45, 0.8, moist) * sstep(0.1, 0.4, temp));
    mix3(o, o, tundra, sstep(0.25, 0.0, temp));
    mix3(o, o, c.high, sstep(1800, 4000, h) * 0.8);
    mix3(o, o, [0.45, 0.42, 0.38], sstep(0.45, 0.8, slope) * 0.8);
    const snow = sstep(-0.05, -0.2, temp - 0.05 * n.fbm(x * 30, y * 30, z * 30, 2)) + sstep(4200, 5200, h + 600 * n.fbm(x * 40, y * 40, z * 40, 2));
    mix3(o, o, c.ice, Math.min(1, snow));
    const v = 0.9 + 0.2 * n.fbm(x * 80, y * 80, z * 80, 3); o[0] *= v; o[1] *= v; o[2] *= v;
    o[3] = 0; o[4] = 0;
    return o;
  }
}
function n2fbm(s, x, y, z) { return s.n2.fbm(x * 1.3, y * 1.3, z * 1.3, 4); }
export function hashName(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000003; }

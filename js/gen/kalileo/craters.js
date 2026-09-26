// From Kalileo (C:/Users/ofici/Downloads/Kalileo/js/craters.js), vendored into Bean Space Program.


import { mulberry32 } from './noise.js';

export function applyCraterLayer(height, w, h, layer, planetRadius, deformity, mask, rayField, onCrater) {
  const rng = mulberry32((layer.seed | 0) || 1);
  const latMin = Math.max(-90, Math.min(layer.latMin ?? -90, layer.latMax ?? 90));
  const latMax = Math.min(90, Math.max(layer.latMin ?? -90, layer.latMax ?? 90));
  const sinMin = Math.sin(latMin * Math.PI / 180), sinMax = Math.sin(latMax * Math.PI / 180);
  const planetRadiusKm = planetRadius / 1000;
  // 'voronoi' = even, cell-like coverage (like the Kopernicus VoronoiCraters PQSMod)
  // baked into the heightmap, so PQS and scaled space match exactly. Craters are
  // placed on a Fibonacci lattice (uniform on the sphere) then jittered within
  // their cell. 'random' (default) scatters them freely.
  const voronoi = layer.distribution === 'voronoi';
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const cellAng = (2 * Math.PI) / Math.sqrt(Math.max(1, layer.count));
  const jit = Math.max(0, Math.min(1, layer.jitter ?? 0.55));

  for (let c = 0; c < layer.count; c++) {

    let lat, lon;
    if (voronoi) {
      const y = sinMin + (c + 0.5) / layer.count * (sinMax - sinMin);
      lat = Math.asin(Math.max(-1, Math.min(1, y + (rng() - 0.5) * cellAng * jit * 0.6)));
      lon = (c * GOLDEN + (rng() - 0.5) * cellAng * jit) % (2 * Math.PI);
      if (lon < 0) lon += 2 * Math.PI;
    } else {
      lat = Math.asin(sinMin + rng() * (sinMax - sinMin));
      lon = rng() * 2 * Math.PI;
    }

    if (mask && layer.useMask) {
      const mx = Math.min(mask.w - 1, Math.floor((lon / (2 * Math.PI)) * mask.w));
      const my = Math.min(mask.h - 1, Math.floor((0.5 - lat / Math.PI) * mask.h));
      let p = mask.data[(my * mask.w + mx) * 4] / 255;
      if (layer.maskInvert) p = 1 - p;
      if (rng() > p) continue;
    }

    const t = Math.pow(rng(), Math.max(0.25, layer.sizeBias ?? 2));
    const diamKm = layer.minSize + t * (layer.maxSize - layer.minSize);

    const alpha = (diamKm / 2) / planetRadiusKm;
    if (alpha <= 0) continue;
    // whoever asked (the biome mask) gets told where this crater is and how big it came out
    onCrater?.(lat, lon, alpha, (diamKm - layer.minSize) / Math.max(1e-6, layer.maxSize - layer.minSize));

    const depthU = (diamKm * 1000 * layer.depthRatio) / deformity;
    const rimU = (diamKm * 1000 * layer.rimHeightRatio) / deformity;
    const variation = 0.75 + rng() * 0.5;

    const complex = layer.profile === 'complex' && diamKm > 25;

    let rays = null;
    if (layer.rays) {
      const n = Math.max(3, layer.rayCount | 0 || 9);
      const rnd = Math.max(0, Math.min(1, layer.rayRandomness ?? 0.6));  
      const lenMul = layer.rayLength ?? 1;
      rays = [];

      for (let k = 0; k < n; k++) {
        const evenAng = (k / n) * Math.PI * 2;
        rays.push({
          ang: evenAng + (rng() - 0.5) * Math.PI * 2 * rnd,
          width: (0.04 + rng() * 0.05) * (1 + rnd * (0.5 + rng() * 3)),   
          len: (1.2 + (rng() * (rnd < 0.5 ? 1 : rng())) * 2.6) * lenMul,  
          str: (0.6 + rng() * 0.4) * (1 - rnd * 0.3 * rng()),
        });
      }
    }

    const distortion = Math.max(0, layer.distortion ?? 0.04);
    const wob = distortion > 0 ? {
      a1: rng() * Math.PI * 2, a2: rng() * Math.PI * 2, a3: rng() * Math.PI * 2,
      m: distortion,
    } : null;

    stampCrater(height, w, h, {
      latC: lat, lonC: lon, alpha,
      depth: depthU * variation,
      rimH: rimU * variation,
      rimW: Math.max(0.05, layer.rimWidth ?? 0.3),
      floor: Math.min(0.95, Math.max(0, layer.floorFlatness ?? 0)),
      ejecta: Math.max(0, layer.ejecta ?? 0.5),
      carve: layer.blend === 'carve',
      peak: complex ? 0.55 + rng() * 0.3 : 0,       
      terrace: complex ? 0.5 + rng() * 0.5 : 0,     
      rays,
      raysColorOnly: layer.raysColorOnly !== false,  
      rayStrength: Math.max(0, layer.rayStrength ?? 1.6),
      rayField,
      floorRoughness: Math.max(0, layer.floorRoughness ?? 0.25),
      wob,
      seedSalt: (c * 7919) ^ (layer.seed | 0),
    });
  }
}

function hash2(x, y, salt) {
  let n = (x * 374761393 + y * 668265263 + salt * 971) | 0;
  n = (n ^ (n >> 13)) | 0;
  n = Math.imul(n, 1274126177) | 0;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

function sampleBilinear(f, w, h, x, y) {
  const x0 = Math.floor(x), y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const y1 = Math.max(0, Math.min(h - 1, y0 + 1));
  const fx = x - x0, fy = y - y0;
  const xa = ((x0 % w) + w) % w, xb = (xa + 1) % w;
  return (f[y0 * w + xa] * (1 - fx) + f[y0 * w + xb] * fx) * (1 - fy) +
         (f[y1 * w + xa] * (1 - fx) + f[y1 * w + xb] * fx) * fy;
}

export function stampCrater(f, w, h, p) {
  const { latC, lonC, alpha, depth, rimH, rimW, floor, ejecta, carve,
    peak = 0, terrace = 0, rays = null, raysColorOnly = true, rayStrength = 1.6, rayField = null,
    floorRoughness = 0, wob = null, seedSalt = 0 } = p;
  const maxRayLen = rays ? Math.max(...rays.map(rr => rr.len)) : 0;
  const extent = (1 + rimW * 3 + ejecta) + maxRayLen;
  const maxAng = Math.min(Math.PI, alpha * extent);

  const sinLatC = Math.sin(latC), cosLatC = Math.cos(latC);
  const cx = (lonC / (2 * Math.PI)) * w;
  const cy = (0.5 - latC / Math.PI) * h;
  const ref = sampleBilinear(f, w, h, cx, cy);
  const floorLevel = -depth * (1 - floor * 0.999);

  const y0 = Math.max(0, Math.ceil((0.5 - (latC + maxAng) / Math.PI) * h));
  const y1 = Math.min(h - 1, Math.floor((0.5 - (latC - maxAng) / Math.PI) * h));

  for (let y = y0; y <= y1; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    const sinDlat2 = Math.sin((lat - latC) / 2);

    const cosHalf = (Math.cos(maxAng) - sinLat * sinLatC) / Math.max(1e-9, cosLat * cosLatC);
    let halfLon;
    if (cosHalf <= -1) halfLon = Math.PI;
    else if (cosHalf >= 1) halfLon = 0;
    else halfLon = Math.acos(cosHalf);
    if (halfLon === 0) continue;

    const halfPx = Math.min(w / 2, (halfLon / (2 * Math.PI)) * w + 1);
    const xC = (lonC / (2 * Math.PI)) * w;
    const x0 = Math.ceil(xC - halfPx), x1 = Math.floor(xC + halfPx);
    const cosProd = cosLat * cosLatC;

    for (let x = x0; x <= x1; x++) {
      const lonP = ((x + 0.5) / w) * 2 * Math.PI;
      let dLon = lonP - lonC;
      if (dLon > Math.PI) dLon -= 2 * Math.PI;
      else if (dLon < -Math.PI) dLon += 2 * Math.PI;
      const sinDlon2 = Math.sin(dLon / 2);

      const a = sinDlat2 * sinDlat2 + cosProd * sinDlon2 * sinDlon2;
      const ang = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
      let d = ang / alpha;
      if (d > extent) continue;

      const brg = Math.atan2(lat - latC, dLon * cosLatC);

      if (wob) {
        d *= 1 + wob.m * (0.5 * Math.sin(brg * 3 + wob.a1)
          + 0.3 * Math.sin(brg * 5 + wob.a2)
          + 0.2 * Math.sin(brg * 8 + wob.a3));
        if (d > extent) continue;
      }

      const xi = ((x % w) + w) % w;
      const idx = y * w + xi;

      let bowl = 0, rim = 0;
      if (d < 1) {
        bowl = depth * (d * d - 1);                 
        if (bowl < floorLevel) bowl = floorLevel + (bowl - floorLevel) * 0.15; 

        if (peak > 0 && d < 0.3) {
          bowl += depth * peak * Math.exp(-(d * d) / 0.012);            
        }
        if (terrace > 0 && d > 0.45 && d < 0.92) {
          bowl += depth * 0.05 * terrace * Math.sin(d * 26);            
        }

        if (floorRoughness > 0) {
          const n1 = hash2(xi, y, seedSalt);
          const n2 = hash2(xi >> 1, y >> 1, seedSalt + 7);
          bowl += depth * floorRoughness * 0.12 * ((n1 * 0.6 + n2 * 0.4) - 0.5) * (1 - d * d);
        }
      }
      const dr = d - 1;
      rim = rimH * Math.exp(-(dr * dr) / (rimW * rimW * 0.5));
      if (d > 1 && ejecta > 0) rim += rimH * 0.35 * Math.exp(-dr / (ejecta * 0.8));

      if (rays && d > 1) {
        let rayVal = 0;
        for (const rr of rays) {
          let da = brg - rr.ang;
          if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
          if (Math.abs(da) > rr.width * 3) continue;
          const angMask = Math.exp(-(da * da) / (rr.width * rr.width));
          const lenMask = Math.exp(-dr / rr.len);
          const streak = 0.55 + 0.45 * hash2((brg * 57) | 0, (d * 23) | 0, seedSalt + 31);
          rayVal += rr.str * angMask * lenMask * streak;
        }
        if (rayVal > 0) {
          const v = Math.min(1.6, rayVal);
          if (raysColorOnly && rayField) {

            rayField[idx] += 0.05 * rayStrength * v;
          } else {
            rim += rimH * 0.9 * rayStrength * v;
          }
        }
      }

      if (carve && d < 1) {

        const target = ref + bowl;
        const blend = 1 - smooth(Math.max(0, (d - 0.85) / 0.15)); 
        const cut = Math.min(f[idx], target);
        f[idx] = f[idx] * (1 - blend) + cut * blend + rim;
      } else {
        f[idx] += bowl + rim;
      }
    }
  }
}

function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

// ── Exact VoronoiCraters bake ─────────────────────────────────────────────────
// A faithful JS port of Kopernicus/BurstPQS's PQSMod_VoronoiCraters (from BurstPQS's
// VoronoiCraters.cs + BurstVoronoi.cs + ValueNoiseBasis.cs). This BAKES the identical crater
// field into Kalileo's height/colour maps, so the exact look shows on the surface AND from orbit
// (incl. through Parallax's scaled shader, which reads the baked _HeightMap) — no runtime PQSMod.

// LibNoise integer value noise (ValueNoiseBasis.IntValueNoise), 32-bit wrapping via Math.imul.
function intValueNoise(x, y, z, seed) {
  let n = (Math.imul(1619, x) + Math.imul(31337, y) + Math.imul(6971, z) + Math.imul(1013, seed)) & 0x7fffffff;
  n = (n >> 13) ^ n;
  const inner = (Math.imul(Math.imul(n, n), 60493) + 19990303) | 0;
  const outer = (Math.imul(n, inner) + 1376312589) | 0;
  return outer & 0x7fffffff;
}
const valueNoise = (x, y, z, seed = 0) => 1.0 - intValueNoise(x, y, z, seed) / 1073741824.0;

const SQRT3 = Math.sqrt(3);
// BurstVoronoi.GetValue — nearest-feature-point cellular noise over a 5×5×5 cell search.
function voronoiValue(x, y, z, freq, seed, displacement, distanceEnabled) {
  x *= freq; y *= freq; z *= freq;
  const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
  let minD2 = 2147483647.0, nx = 0, ny = 0, nz = 0;
  for (let i = cz - 2; i <= cz + 2; i++)
    for (let j = cy - 2; j <= cy + 2; j++)
      for (let k = cx - 2; k <= cx + 2; k++) {
        const fx = k + valueNoise(k, j, i, seed);
        const fy = j + valueNoise(k, j, i, seed + 1);
        const fz = i + valueNoise(k, j, i, seed + 2);
        const dx = fx - x, dy = fy - y, dz = fz - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < minD2) { minD2 = d2; nx = fx; ny = fy; nz = fz; }
      }
  const val = distanceEnabled ? (Math.sqrt(minD2) * SQRT3 - 1.0) : 0.0;
  return val + displacement * valueNoise(Math.floor(nx), Math.floor(ny), Math.floor(nz), 0);
}

// Unity AnimationCurve (cubic Hermite) evaluator. keys: [time, value, inTangent, outTangent].
function evalCurve(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0; while (i < keys.length - 1 && keys[i + 1][0] < t) i++;
  const k0 = keys[i], k1 = keys[i + 1], dt = k1[0] - k0[0], u = (t - k0[0]) / dt;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k0[1] + (u3 - 2 * u2 + u) * dt * k0[3]
       + (-2 * u3 + 3 * u2) * k1[1] + (u3 - u2) * dt * k1[2];
}

// Stock Mun VoronoiCraters curves (Kopernicus defaults) — shape of the crater bowl vs the noise.
const CRATER_CURVE = [
  [-0.9982381, -0.7411783, -0.06500059, -0.06500059], [-0.9332262, -0.7678316, -0.2176399, -0.2176399],
  [-0.8990405, -0.7433339, -2.560626, -2.560626], [-0.7445966, -0.8581167, 0.4436148, 0.4436148],
  [-0.4499771, -0.1392395, 5.289535, 5.289535], [-0.4015177, 0.2551735, 9.069458, 9.069458],
  [-0.2297457, 0.002857953, -0.4453675, -0.4453675], [0.2724952, 0.00423781, -0.01884932, -0.01884932],
  [0.9998434, -0.004090764, 0.01397126, 0.01397126],
];
const JITTER_CURVE = [
  [-1.000701, 0.4278412, 0.1577609, 0.1577609], [-0.7838338, 0.09487452, -0.7963928, -0.7963928],
  [-0.3541833, 0.1223815, 0.03462957, 0.03462957], [0.2934077, 0.02292995, 0.01280576, 0.01280576],
  [0.9987468, 0.5691082, 0.9263617, 0.9263617],
];

/** Bake the exact VoronoiCraters look into the 0..1 height field (and optionally tint the colour
 *  RGBA). `deformity` converts the mod's metre deformation into normalised field units.
 *  p = { deformation, frequency, seed, displacement, jitter, jitterHeight, simplex(Simplex3), colorOpacity, craterColor:[r,g,b] } */
export function bakeVoronoiCraters(field, w, h, deformity, p, colorRGBA) {
  const scaleH = (p.deformation || 400) / Math.max(1, deformity);
  const cc = p.craterColor || [0.5, 0.5, 0.5];
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;           // row 0 = north
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * 2 * Math.PI;
      const dx = cl * Math.cos(lon), dy = sl, dz = cl * Math.sin(lon);   // unit direction from centre
      const vorH = voronoiValue(dx, dy, dz, p.frequency || 22, p.seed | 0, p.displacement || 0, true);
      const sf = p.simplexFrequency || 120;
      const spxH = p.simplex
        ? p.simplex.fbm(dx * sf, dy * sf, dz * sf, { octaves: p.simplexOctaves || 3, persistence: p.simplexPersistence ?? 0.5 })
        : 0;
      const jtt = spxH * (p.jitter ?? 0.1) * evalCurve(JITTER_CURVE, vorH);
      const r = vorH + jtt;
      const hgt = evalCurve(CRATER_CURVE, r);
      const i = y * w + x;
      field[i] += (hgt + (p.jitterHeight ?? 3) * jtt * hgt) * scaleH;
      if (colorRGBA) {
        const rr = r * (p.rFactor ?? 1) + (p.rOffset ?? 1);
        const mix = Math.max(0, Math.min(1, (1 - rr) * (p.colorOpacity ?? 0.7)));
        const o = i * 4;
        colorRGBA[o] = colorRGBA[o] * (1 - mix) + cc[0] * 255 * mix;
        colorRGBA[o + 1] = colorRGBA[o + 1] * (1 - mix) + cc[1] * 255 * mix;
        colorRGBA[o + 2] = colorRGBA[o + 2] * (1 - mix) + cc[2] * 255 * mix;
      }
    }
  }
}

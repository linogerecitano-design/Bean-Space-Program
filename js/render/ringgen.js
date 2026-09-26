// Ring strip generator (ported from Kalileo's buildRingStrip): a 1-D radial RGBA profile, inner
// edge at u=0 and outer edge at u=1. 'dense' = Saturn-like zones with gaps and fine ringlets,
// 'dust' = diffuse dusty rings, 'faint' = one broad smooth dust band, 'ringlets' = explicit narrow
// rings (Uranus, Neptune, Chariklo...).
function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function valueNoise1D(seed) {
  const rng = mulberry32(seed); const grid = new Float32Array(4096);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  return (x, octaves = 4, persistence = 0.55) => {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const xf = x * freq; const i0 = Math.floor(xf) & 4095, i1 = (i0 + 1) & 4095; const t = xf - Math.floor(xf); const s = t * t * (3 - 2 * t);
      sum += (grid[i0] + (grid[i1] - grid[i0]) * s) * amp; norm += amp; amp *= persistence; freq *= 2.13;
    }
    return sum / norm;
  };
}

// ring: { style, colors: [[r,g,b],...], bands, seed, opacity, ringlets: [{u, width, opacity}], faintWidth }
export function buildRingStrip(ring, w = 4096) {
  const out = new Uint8Array(w * 4);
  const seed = (ring.seed | 0) || 5;
  const noise = valueNoise1D(seed * 7919 + 13), cNoise = valueNoise1D(seed * 104729 + 71);
  const palette = ring.colors && ring.colors.length >= 2 ? ring.colors : [ring.colors?.[0] || [0.79, 0.71, 0.6], [0.54, 0.44, 0.31]];
  const paletteAt = (t) => { const n = palette.length - 1; const f = Math.max(0, Math.min(0.9999, t)) * n; const i0 = Math.floor(f), fr = f - i0; const a = palette[i0], b = palette[Math.min(n, i0 + 1)]; return [a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr, a[2] + (b[2] - a[2]) * fr]; };
  const put = (x, c, a) => { out[x * 4] = Math.min(255, c[0] * 255); out[x * 4 + 1] = Math.min(255, c[1] * 255); out[x * 4 + 2] = Math.min(255, c[2] * 255); out[x * 4 + 3] = Math.max(0, Math.min(255, a * 255)); };
  const rng = mulberry32(seed + 991);

  if (ring.style === 'ringlets') {
    // explicit narrow rings (plus an optional faint dusty sheet)
    for (let x = 0; x < w; x++) {
      const u = x / w; let a = 0, ct = 0.5;
      for (const r of ring.ringlets) { const wd = Math.max(r.width, 1.5 / w); const k = Math.exp(-((u - r.u) ** 2) / (wd * wd)); if (k * r.opacity > a) { a = k * r.opacity; ct = r.tone ?? 0.5; } }
      if (ring.sheet) a = Math.max(a, ring.sheet * (0.6 + 0.4 * noise(u * 60, 3)));
      put(x, paletteAt(ct).map(v => v * (0.9 + 0.2 * noise(u * w * 0.3 + 40, 2))), a);
    }
    return out;
  }
  if (ring.style === 'faint') {
    const col = paletteAt(0.5), width = Math.max(0.08, Math.min(0.48, ring.faintWidth ?? 0.3)), op = ring.opacity ?? 0.22;
    for (let x = 0; x < w; x++) { const u = x / w; put(x, col, Math.exp(-((u - 0.5) ** 2) / (2 * width * width)) * op * (0.8 + 0.4 * noise(u * 40, 3))); }
    return out;
  }
  const zoneCount = Math.max(4, Math.min(16, (ring.bands | 0) || 10));
  const weights = []; let wSum = 0;
  for (let i = 0; i < zoneCount; i++) { const wt = 0.3 + rng() * 1.4; weights.push(wt); wSum += wt; }
  const zones = []; let zPos = 0;
  for (let i = 0; i < zoneCount; i++) {
    const z1 = zPos + weights[i] / wSum;
    zones.push({ u0: zPos, u1: z1, dens: rng() < 0.22 ? 0.06 + rng() * 0.2 : 0.35 + rng() * 0.65, palT: Math.max(0, Math.min(1, i / Math.max(1, zoneCount - 1) + (rng() - 0.5) * 0.3)), bright: 0.82 + rng() * 0.36, fine: 0.35 + rng() * 0.65 });
    zPos = z1;
  }
  const zoneOf = new Float32Array(w);
  { let zi = 0; for (let x = 0; x < w; x++) { const u = x / w; while (zi < zones.length - 1 && u >= zones[zi].u1) zi++; zoneOf[x] = zi; } }
  const gaps = [];
  const majors = 2 + Math.round(rng() * 3);
  for (let g = 0; g < majors; g++) gaps.push({ pos: 0.12 + rng() * 0.8, width: 0.005 + rng() * 0.016 });
  const minors = 24 + Math.round(rng() * 40);
  for (let g = 0; g < minors; g++) gaps.push({ pos: 0.05 + rng() * 0.92, width: 0.0004 + rng() * 0.0016 });
  for (let x = 0; x < w; x++) {
    const u = x / w; const z = zones[zoneOf[x]];
    const edgeDist = Math.min(u - z.u0, z.u1 - u) * w;
    let dens = z.dens * Math.min(1, edgeDist / 2 + 0.15);
    dens *= 0.72 + 0.56 * noise(u * 140 + 50, 3, 0.55);
    const f = noise(u * w * 0.42, 2, 0.5);
    dens *= 1 - z.fine * Math.max(0, 0.72 - f);
    dens += z.fine * 0.5 * Math.max(0, f - 0.8) * 4 * z.dens;
    for (const g of gaps) dens *= 1 - Math.exp(-((u - g.pos) ** 2) / (g.width * g.width));
    const fadeIn = Math.min(1, u / 0.05), fadeOut = Math.min(1, (1 - u) / 0.06);
    dens *= Math.pow(fadeIn * fadeOut, 0.7); dens = Math.max(0, Math.min(1, dens));
    const ct = Math.max(0, Math.min(1, z.palT + (cNoise(u * 24, 3, 0.6) - 0.5) * 0.28 + (f - 0.5) * 0.06));
    const bright = z.bright * (0.88 + 0.24 * noise(u * w * 0.18 + 900, 2, 0.5));
    const dustD = ring.style === 'dust' ? Math.pow(dens, 0.45) * 0.7 : Math.pow(dens, 0.9);
    put(x, paletteAt(ct).map(v => v * bright), dustD * (ring.opacity ?? 0.9));
  }
  return out;
}

// Ring specs for real bodies (radii in planet radii); everything else derives from style.rings
const REAL_RINGS = {
  // Uranus: nine narrow main rings (6,5,4,alpha,beta,eta,gamma,delta) + the bright epsilon ring, dark material
  Uranus: { inner: 1.6, outer: 2.05, spec: { style: 'ringlets', colors: [[0.33, 0.34, 0.36], [0.42, 0.43, 0.46]], ringlets: [1.637, 1.652, 1.666, 1.751, 1.786, 1.834, 1.863, 1.900, 2.001].map((r, i) => ({ u: (r - 1.6) / 0.45, width: i === 8 ? 0.012 : 0.0035, opacity: i === 8 ? 0.95 : 0.6, tone: i === 8 ? 1 : 0.4 })), sheet: 0 } },
  // Neptune: faint broad Galle and Lassell, narrow Le Verrier and the clumpy Adams ring
  Neptune: { inner: 1.65, outer: 2.6, spec: { style: 'ringlets', colors: [[0.32, 0.31, 0.3], [0.45, 0.43, 0.4]], ringlets: [{ u: (1.71 - 1.65) / 0.95, width: 0.02, opacity: 0.08 }, { u: (2.148 - 1.65) / 0.95, width: 0.004, opacity: 0.5, tone: 0.8 }, { u: (2.25 - 1.65) / 0.95, width: 0.07, opacity: 0.05 }, { u: (2.54 - 1.65) / 0.95, width: 0.005, opacity: 0.6, tone: 1 }] } },
};
export function ringSpecFor(body) {
  const r = body.style.rings;
  if (body.sys.real && REAL_RINGS[body.name]) return REAL_RINGS[body.name];
  const seed = r.seed || body.seed || 7;
  const c = r.color || [0.8, 0.74, 0.64];
  const colors = [c.map(v => Math.min(1, v * 1.08)), c.map(v => v * 0.72), c.map((v, i) => Math.min(1, v * (i === 0 ? 1.0 : 0.9)))];
  if (r.profile === 'saturn') return { inner: r.inner, outer: r.outer, spec: { style: 'dense', colors, bands: 8 + (seed % 8), seed, opacity: 0.92 } };
  if (r.profile === 'uranus') {
    const n = 5 + (seed % 7); const rng = mulberry32(seed); const ringlets = [];
    for (let i = 0; i < n; i++) ringlets.push({ u: rng(), width: 0.002 + rng() * 0.006, opacity: 0.35 + rng() * 0.55, tone: rng() });
    return { inner: r.inner, outer: r.outer, spec: { style: 'ringlets', colors: [c.map(v => v * 0.6), c], ringlets } };
  }
  // narrow single ringlets (Chariklo, Haumea, Quaoar) and dusty sheets
  if (r.outer - r.inner < 0.3) return { inner: r.inner, outer: r.outer, spec: { style: 'ringlets', colors: [c, c], ringlets: [{ u: 0.35, width: 0.12, opacity: 0.6 }, { u: 0.75, width: 0.08, opacity: 0.35 }] } };
  return { inner: r.inner, outer: r.outer, spec: { style: 'faint', colors: [c, c], opacity: 0.18, faintWidth: 0.25, seed } };
}

// From Kalileo (C:/Users/ofici/Downloads/Kalileo/js/noise.js), vendored into Bean Space Program.


export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

export class Simplex3 {
  constructor(seed = 0) {
    const rng = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise(xin, yin, zin) {
    const { perm, permMod12 } = this;
    const F3 = 1 / 3, G3 = 1 / 6;
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0; else {
      const g = GRAD3[permMod12[ii + perm[jj + perm[kk]]]];
      t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0; else {
      const g = GRAD3[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]];
      t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0; else {
      const g = GRAD3[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]];
      t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0; else {
      const g = GRAD3[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]];
      t3 *= t3; n3 = t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3);
    }
    return 32 * (n0 + n1 + n2 + n3); 
  }

  fbm(x, y, z, { octaves = 4, persistence = 0.5, lacunarity = 2, ridged = false } = {}) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      let v = this.noise(x * freq, y * freq, z * freq);
      if (ridged) {

        v = 1 - Math.abs(v);
        v = v * v * 2 - 1;
      }
      sum += v * amp;
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

/** Sample a spherical fBm onto a COARSE equirectangular grid, to be read back with
    sampleSphereGrid(). The noise these maps use for mottling and tinting is far smoother than
    the map it is painted on, so evaluating it per pixel means tens of millions of noise calls
    for detail that is not there: a grid a few times finer than the noise itself, bilinearly
    interpolated, is visually identical and one to two orders of magnitude cheaper. */
export function sphereFbmGrid(sim, gw, gh, scale, opts = {}, offset = 0) {
  const g = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    const la = (0.5 - (y + 0.5) / gh) * Math.PI, cl = Math.cos(la), sl = Math.sin(la);
    for (let x = 0; x < gw; x++) {
      const lo = (x + 0.5) / gw * Math.PI * 2;
      g[y * gw + x] = sim.fbm(cl * Math.cos(lo) * scale + offset, sl * scale, cl * Math.sin(lo) * scale, opts);
    }
  }
  return g;
}

/** Bilinear read from such a grid; u wraps around the planet, v clamps at the poles. */
export function sampleSphereGrid(g, gw, gh, u, v) {
  const fx = u * gw - 0.5, fy = v * gh - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const xa = ((x0 % gw) + gw) % gw, xb = ((x0 + 1) % gw + gw) % gw;
  const ya = Math.min(gh - 1, Math.max(0, y0)), yb = Math.min(gh - 1, Math.max(0, y0 + 1));
  const a = g[ya * gw + xa], b = g[ya * gw + xb], c = g[yb * gw + xa], d = g[yb * gw + xb];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

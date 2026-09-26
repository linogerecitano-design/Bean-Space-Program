// Seeded 3D simplex noise (after Gustavson) plus fractal helpers. Pure JS so it can run in workers.
const F3 = 1 / 3, G3 = 1 / 6;
const GRAD = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);

export class Noise3 {
  constructor(seed = 1) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = (seed >>> 0) || 1;
    for (let i = 255; i > 0; i--) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const j = s % (i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512); this.pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.pm12[i] = (this.perm[i] % 12) * 3; }
  }
  n(xin, yin, zin) {
    const perm = this.perm, pm = this.pm12;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0, t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) { const g = pm[ii + perm[jj + perm[kk]]]; t0 *= t0; n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0 + GRAD[g + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) { const g = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]; t1 *= t1; n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1 + GRAD[g + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) { const g = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]; t2 *= t2; n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2 + GRAD[g + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) { const g = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]; t3 *= t3; n += t3 * t3 * (GRAD[g] * x3 + GRAD[g + 1] * y3 + GRAD[g + 2] * z3); }
    return 32 * n; // ~[-1,1]
  }
  fbm(x, y, z, oct = 6, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * this.n(x * f + o * 17.1, y * f - o * 9.3, z * f + o * 3.7); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  ridged(x, y, z, oct = 6, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(this.n(x * f + o * 11.3, y * f + o * 5.1, z * f - o * 7.7));
      v *= v; v *= w; w = Math.min(1, v * 2);
      s += a * v; norm += a; a *= gain; f *= lac;
    }
    return s / norm;
  }
  // domain-warped fbm for organic continents
  warped(x, y, z, oct = 6, warp = 0.6) {
    const qx = this.fbm(x + 1.7, y + 9.2, z + 5.1, 3), qy = this.fbm(x + 8.3, y + 2.8, z - 3.3, 3), qz = this.fbm(x - 4.4, y + 6.6, z + 1.1, 3);
    return this.fbm(x + warp * qx, y + warp * qy, z + warp * qz, oct);
  }
}

// integer hash -> [0,1)
export function h01(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
}

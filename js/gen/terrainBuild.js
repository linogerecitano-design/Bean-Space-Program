// Terrain chunk geometry generation, shared by the terrain workers and the main-thread fallback.
// Pure math: no THREE, no DOM. Output arrays are transferable.

export const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];
export function cubeToSphere(x, y, z, out) {
  const x2 = x * x, y2 = y * y, z2 = z * z;
  out[0] = x * Math.sqrt(1 - y2 / 2 - z2 / 2 + y2 * z2 / 3);
  out[1] = y * Math.sqrt(1 - z2 / 2 - x2 / 2 + z2 * x2 / 3);
  out[2] = z * Math.sqrt(1 - x2 / 2 - y2 / 2 + x2 * y2 / 3);
  return out;
}
export function faceDir(f, a, b, out) { // a,b in [-1,1]
  const F = FACES[f];
  cubeToSphere(F.n[0] + F.u[0] * a + F.v[0] * b, F.n[1] + F.u[1] * a + F.v[1] * b, F.n[2] + F.u[2] * a + F.v[2] * b, out);
  const l = Math.hypot(out[0], out[1], out[2]); out[0] /= l; out[1] /= l; out[2] /= l; return out;
}
// ring of edge vertex indices (grid order) used for skirts; identical to the index builder
export function edgeRing(n) {
  const edge = [];
  for (let i = 0; i < n; i++) edge.push(i);
  for (let j = 1; j < n; j++) edge.push(j * n + n - 1);
  for (let i = n - 2; i >= 0; i--) edge.push((n - 1) * n + i);
  for (let j = n - 2; j > 0; j--) edge.push(j * n);
  return edge;
}

// job: {face, a0, b0, size, n, R, sea, dir:[x,y,z], edge}
export function buildChunk(S, job) {
  const { face, a0, b0, size, n, R, sea } = job;
  const nv = n * n + (n - 1) * 4;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), water = new Float32Array(nv);
  const ext = n + 2;
  const P = new Float64Array(ext * ext * 3);
  const wet = new Float32Array(ext * ext);
  const d = [0, 0, 0];
  const step = size / (n - 1);
  const lod = Math.max(0.5, step * R * 0.8 * 1.2); // vertex spacing (m): finer features would alias
  let hsum = 0;
  for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) {
    faceDir(face, a0 + i * step, b0 + j * step, d);
    let h = S ? S.height(d[0], d[1], d[2], lod) : 0;
    const k = (j + 1) * ext + (i + 1);
    if (sea !== null && sea !== undefined && h < sea) { wet[k] = 0.5 + 0.5 * Math.min(1, (sea - h) / 60); h = sea; }
    const r = R + h;
    P[k * 3] = d[0] * r; P[k * 3 + 1] = d[1] * r; P[k * 3 + 2] = d[2] * r;
    if (i >= 0 && j >= 0 && i < n && j < n) hsum += h;
  }
  const hAvg = hsum / (n * n);
  const dir = job.dir;
  const ncx = dir[0] * (R + hAvg), ncy = dir[1] * (R + hAvg), ncz = dir[2] * (R + hAvg);
  let maxR2 = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j + 1) * ext + (i + 1), o = (j * n + i) * 3;
    pos[o] = P[k * 3] - ncx; pos[o + 1] = P[k * 3 + 1] - ncy; pos[o + 2] = P[k * 3 + 2] - ncz;
    const r2 = pos[o] ** 2 + pos[o + 1] ** 2 + pos[o + 2] ** 2; if (r2 > maxR2) maxR2 = r2;
    const kl = k - 1, kr = k + 1, kd = k - ext, ku = k + ext;
    const ax = P[kr * 3] - P[kl * 3], ay = P[kr * 3 + 1] - P[kl * 3 + 1], az = P[kr * 3 + 2] - P[kl * 3 + 2];
    const bx = P[ku * 3] - P[kd * 3], by = P[ku * 3 + 1] - P[kd * 3 + 1], bz = P[ku * 3 + 2] - P[kd * 3 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nx * P[k * 3] + ny * P[k * 3 + 1] + nz * P[k * 3 + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
    water[j * n + i] = wet[k];
  }
  // skirts
  const edge = edgeRing(n);
  const skirt = Math.max(2, job.edge * 0.03);
  for (let e = 0; e < edge.length; e++) {
    const src = edge[e], o = (n * n + e) * 3, so = src * 3;
    const px = pos[so] + ncx, py = pos[so + 1] + ncy, pz = pos[so + 2] + ncz; const l = Math.hypot(px, py, pz);
    pos[o] = pos[so] - px / l * skirt; pos[o + 1] = pos[so + 1] - py / l * skirt; pos[o + 2] = pos[so + 2] - pz / l * skirt;
    nor[o] = nor[so]; nor[o + 1] = nor[so + 1]; nor[o + 2] = nor[so + 2]; water[n * n + e] = water[src];
  }
  const T1 = 64, T2 = 296;
  const m1 = [((ncx % T1) + T1) % T1, ((ncy % T1) + T1) % T1, ((ncz % T1) + T1) % T1];
  const m2 = [((ncx % T2) + T2) % T2, ((ncy % T2) + T2) % T2, ((ncz % T2) + T2) % T2];
  const aDir = new Float32Array(nv * 3), aT1 = new Float32Array(nv * 3), aT2 = new Float32Array(nv * 3);
  for (let k = 0; k < nv; k++) {
    const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
    const wx = x + ncx, wy = y + ncy, wz = z + ncz, l = Math.hypot(wx, wy, wz);
    aDir[k * 3] = wx / l; aDir[k * 3 + 1] = wy / l; aDir[k * 3 + 2] = wz / l;
    aT1[k * 3] = m1[0] + x; aT1[k * 3 + 1] = m1[1] + y; aT1[k * 3 + 2] = m1[2] + z;
    aT2[k * 3] = m2[0] + x; aT2[k * 3 + 1] = m2[1] + y; aT2[k * 3 + 2] = m2[2] + z;
  }
  return { pos, nor, water, aDir, aT1, aT2, center: [ncx, ncy, ncz], radius: Math.sqrt(maxR2) + skirt };
}

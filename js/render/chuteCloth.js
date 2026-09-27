// Parachute canopy as cloth: a dome of point masses joined by distance constraints (Verlet), hung from
// the vessel on risers. The airflow presses on each panel along its normal, which inflates the canopy
// and streams it away from the direction of travel; when the air stops (after touchdown) it deflates,
// falls over and drapes on the ground. Simulated in world axes with the origin at the vessel's centre of
// mass (the frame moves with the vessel, so the vessel's own acceleration appears as a fictitious force).
import * as THREE from 'three';

const RINGS = 6, SPOKES = 18;

export class ClothChute {
  constructor(area, color = 0xff7a1a) {
    const r = Math.sqrt(area / Math.PI);
    this.r = r; this.riser = r * 1.9;
    // rest shape: a spherical cap (apex up), skirt ring at the bottom
    const cap = 0.42 * Math.PI, R = r / Math.sin(cap);
    const P = [[0, R, 0]];
    for (let i = 1; i <= RINGS; i++) { const th = cap * i / RINGS; for (let j = 0; j < SPOKES; j++) { const a = j / SPOKES * Math.PI * 2; P.push([Math.sin(th) * R * Math.cos(a), Math.cos(th) * R, Math.sin(th) * R * Math.sin(a)]); } }
    const yLow = Math.cos(cap) * R; // skirt height in the rest frame
    this.rest = P.map(p => new THREE.Vector3(p[0], p[1] - yLow, p[2])); // skirt at y = 0
    const n = P.length; this.n = n;
    this.pos = new Float32Array(n * 3); this.prev = new Float32Array(n * 3);
    const idx = (i, j) => 1 + (i - 1) * SPOKES + ((j % SPOKES) + SPOKES) % SPOKES;
    this.skirt = []; for (let j = 0; j < SPOKES; j++) this.skirt.push(idx(RINGS, j));
    // constraints: rings, spokes, shear, and a few long "bending" links that hold the dome's shape
    const C = [];
    const link = (a, b, k = 1) => C.push([a, b, this.rest[a].distanceTo(this.rest[b]), k]);
    for (let j = 0; j < SPOKES; j++) link(0, idx(1, j));
    for (let i = 1; i <= RINGS; i++) for (let j = 0; j < SPOKES; j++) {
      link(idx(i, j), idx(i, j + 1));
      if (i < RINGS) { link(idx(i, j), idx(i + 1, j)); link(idx(i, j), idx(i + 1, j + 1), 0.5); }
      if (i + 2 <= RINGS) link(idx(i, j), idx(i + 2, j), 0.3);
    }
    for (let j = 0; j < SPOKES / 2; j++) { link(idx(RINGS - 2, j), idx(RINGS - 2, j + SPOKES / 2), 0.3); link(idx(RINGS, j), idx(RINGS, j + SPOKES / 2), 0.3); } // keeps it round when inflated
    this.C = C;
    // mesh
    const tri = [];
    for (let j = 0; j < SPOKES; j++) tri.push(0, idx(1, j + 1), idx(1, j));
    for (let i = 1; i < RINGS; i++) for (let j = 0; j < SPOKES; j++) { const a = idx(i, j), b = idx(i, j + 1), c = idx(i + 1, j), d = idx(i + 1, j + 1); tri.push(a, b, d, a, d, c); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setIndex(tri);
    // gore colours: alternating orange and white panels
    const col = new Float32Array(n * 3); const cA = new THREE.Color(color), cB = new THREE.Color(0xf4f4f0);
    for (let k = 0; k < n; k++) { const j = k === 0 ? 0 : (k - 1) % SPOKES; const c = (j >> 1) % 2 ? cB : cA; col.set([c.r, c.g, c.b], k * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }));
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xd8d8d0 }));
    this.lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPOKES * 2 * 3), 3)); this.lines.frustumCulled = false;
    this.group = new THREE.Group(); this.group.add(this.mesh, this.lines);
    this.nrm = new Float32Array(n * 3); this.started = false;
  }
  // place the folded pack at the attachment point, streaming along `dir`
  start(anchor, dir) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    for (let k = 0; k < this.n; k++) {
      const p = this.rest[k].clone().multiplyScalar(0.06).add(new THREE.Vector3(0, 0.5, 0)).applyQuaternion(q).add(anchor);
      this.pos.set([p.x, p.y, p.z], k * 3); this.prev.set([p.x, p.y, p.z], k * 3);
    }
    this.started = true;
  }
  // one frame. anchor: attachment point (world axes, COM-relative); air: air velocity relative to the vessel
  // (i.e. minus its airspeed vector); gEff: gravity minus the vessel's acceleration; rho: air density;
  // open: 0..1 unfolding; ground: { up, h } plane (points keep p.up >= h), or null
  step(dt, anchor, air, gEff, rho, open, ground) {
    if (!this.started) this.start(anchor, air.lengthSq() > 1 ? air.clone().normalize() : new THREE.Vector3(0, 1, 0));
    const n = this.n, P = this.pos, Q = this.prev, N = this.nrm;
    const sub = Math.min(8, Math.max(2, Math.ceil(dt / 0.012))); const h = Math.min(dt, 0.1) / sub;
    const scale = Math.max(0.06, open);
    const al = air.length(), aw = al > 1e-3 ? air.clone().divideScalar(al) : new THREE.Vector3();
    const q = Math.min(35, 0.25 * rho * al * al * open); // how hard the air fills it (m/s², capped)
    for (let s = 0; s < sub; s++) {
      this.normals();
      // a filling canopy: air rams into the mouth, driving the crown downstream and pushing the skirt open
      let cx = 0, cy = 0, cz = 0; for (const k of this.skirt) { cx += P[k * 3]; cy += P[k * 3 + 1]; cz += P[k * 3 + 2]; } cx /= SPOKES; cy /= SPOKES; cz /= SPOKES;
      for (let k = 0; k < n; k++) {
        const ri = k === 0 ? 0 : Math.floor((k - 1) / SPOKES) + 1, o = k * 3;
        const crown = Math.pow(1 - ri / RINGS, 1.5) * q * 0.9 * h * h;
        P[o] += aw.x * crown; P[o + 1] += aw.y * crown; P[o + 2] += aw.z * crown;
        if (ri >= RINGS - 1) { let rx = P[o] - cx, ry = P[o + 1] - cy, rz = P[o + 2] - cz; const along = rx * aw.x + ry * aw.y + rz * aw.z; rx -= aw.x * along; ry -= aw.y * along; rz -= aw.z * along;
          const rl = Math.hypot(rx, ry, rz) || 1; const m = q * 0.6 * h * h / rl; P[o] += rx * m; P[o + 1] += ry * m; P[o + 2] += rz * m; }
      }
      for (let k = 0; k < n; k++) {
        const o = k * 3; const x = P[o], y = P[o + 1], z = P[o + 2];
        let vx = (x - Q[o]) / h, vy = (y - Q[o + 1]) / h, vz = (z - Q[o + 2]) / h;
        // air relative to this panel, pressing along its normal (inflates, and drags the canopy downstream)
        const wx = air.x - vx, wy = air.y - vy, wz = air.z - vz;
        const wn = wx * N[o] + wy * N[o + 1] + wz * N[o + 2];
        const wl = Math.hypot(wx, wy, wz);
        let ax = gEff.x, ay = gEff.y, az = gEff.z;
        const kA = 0.3 * rho * open, kD = 0.05 * rho;
        let fx = kA * wl * wn * N[o] + kD * wl * wx, fy = kA * wl * wn * N[o + 1] + kD * wl * wy, fz = kA * wl * wn * N[o + 2] + kD * wl * wz;
        const fl = Math.hypot(fx, fy, fz), cap = 30; if (fl > cap) { fx *= cap / fl; fy *= cap / fl; fz *= cap / fl; } // stays stable at high speed
        ax += fx; ay += fy; az += fz;
        const damp = 0.992; // (Verlet: next = x + v·h·damping + a·h²)
        Q[o] = x; Q[o + 1] = y; Q[o + 2] = z;
        P[o] = x + vx * h * damp + ax * h * h; P[o + 1] = y + vy * h * damp + ay * h * h; P[o + 2] = z + vz * h * damp + az * h * h;
      }
      // constraints (cloth, then risers as ropes to the anchor, then the ground)
      // the dome only holds its shape while air fills it: with no airflow the stiffening links let go
      const infl = Math.min(1, Math.max(0, (air.length() - 1) / 4));
      for (let it = 0; it < 10; it++) {
        for (const [a, b, L0, k0] of this.C) {
          const k = k0 >= 1 ? 1 : k0 * infl;
          if (k <= 0) continue;
          const oa = a * 3, ob = b * 3; const dx = P[ob] - P[oa], dy = P[ob + 1] - P[oa + 1], dz = P[ob + 2] - P[oa + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-6; const L = L0 * scale; const c = (d - L) / d * 0.5 * k;
          P[oa] += dx * c; P[oa + 1] += dy * c; P[oa + 2] += dz * c; P[ob] -= dx * c; P[ob + 1] -= dy * c; P[ob + 2] -= dz * c;
        }
        const Lr = this.riser * scale;
        for (const k of this.skirt) {
          const o = k * 3; const dx = P[o] - anchor.x, dy = P[o + 1] - anchor.y, dz = P[o + 2] - anchor.z; const d = Math.hypot(dx, dy, dz);
          if (d > Lr) { const f = Lr / d; P[o] = anchor.x + dx * f; P[o + 1] = anchor.y + dy * f; P[o + 2] = anchor.z + dz * f; }
        }
        if (ground) for (let k = 0; k < n; k++) {
          const o = k * 3; const d = P[o] * ground.up.x + P[o + 1] * ground.up.y + P[o + 2] * ground.up.z;
          if (d < ground.h) { const e = ground.h - d; P[o] += ground.up.x * e; P[o + 1] += ground.up.y * e; P[o + 2] += ground.up.z * e;
            // friction: kill most of the sliding velocity on the ground
            Q[o] += (P[o] - Q[o]) * 0.3; Q[o + 1] += (P[o + 1] - Q[o + 1]) * 0.3; Q[o + 2] += (P[o + 2] - Q[o + 2]) * 0.3; }
        }
      }
    }
    // upload
    const pa = this.mesh.geometry.attributes.position; pa.array.set(P); pa.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals(); this.mesh.geometry.computeBoundingSphere();
    const la = this.lines.geometry.attributes.position.array;
    this.skirt.forEach((k, i) => { la.set([anchor.x, anchor.y, anchor.z, P[k * 3], P[k * 3 + 1], P[k * 3 + 2]], i * 6); });
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
  // outward normals per point (from the triangle fan around it), pointing out of the dome
  normals() {
    const P = this.pos, N = this.nrm; N.fill(0);
    const I = this.mesh.geometry.index.array;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    for (let o = 0; o < N.length; o += 3) { const l = Math.hypot(N[o], N[o + 1], N[o + 2]) || 1; N[o] /= l; N[o + 1] /= l; N[o + 2] /= l; }
  }
  // (re)centre the simulation when the vessel frame jumps (teleport, SOI change)
  shift(dx, dy, dz) { for (let o = 0; o < this.pos.length; o += 3) { this.pos[o] += dx; this.pos[o + 1] += dy; this.pos[o + 2] += dz; this.prev[o] += dx; this.prev[o + 1] += dy; this.prev[o + 2] += dz; } }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.lines.geometry.dispose(); this.lines.material.dispose(); }
}

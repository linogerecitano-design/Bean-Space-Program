// Visible lightning bolts in a gas giant's cloud deck, near the camera. Each bolt is a jagged, branching
// ribbon (built camera-facing every frame) that lives for a fraction of a second, flickering through a
// main stroke and restrikes. While it is lit, its position and brightness are handed to the cloud shader
// so the surrounding clouds glow with it.
import * as THREE from 'three';

const MAX_BOLTS = 3, MAX_SEG = 90;
const rnd = (a, b) => a + Math.random() * (b - a);

export class Bolts {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.82, 1.0).multiplyScalar(6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_BOLTS * MAX_SEG * 6 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.visible = false;
    scene.add(this.mesh);
    this.bolts = []; this.wait = 0.5;
    this.flash = { pos: new THREE.Vector3(), I: 0, R: 1 };
  }
  // one bolt: a trunk from low in the deck up past the tops, with a few forks; points in the body frame
  spawn(t, g, sub, fwdB) {
    const up = sub.clone();
    // somewhere ahead of the camera, within a few deck-thicknesses
    const range = Math.min(Math.max(g.alt * 1.5, g.thick * 0.6), g.thick * 4);
    const e = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)); if (e.lengthSq() < 1e-6) e.set(1, 0, 0); e.normalize();
    const n = new THREE.Vector3().crossVectors(up, e);
    const ahead = fwdB.clone().addScaledVector(up, -fwdB.dot(up)); if (ahead.lengthSq() > 1e-6) ahead.normalize();
    const off = ahead.multiplyScalar(range * rnd(0.3, 1.0)).addScaledVector(e, range * rnd(-0.6, 0.6)).addScaledVector(n, range * rnd(-0.6, 0.6));
    const dir = up.clone().multiplyScalar(g.Rb).add(off).normalize();
    const h0 = g.Rb + g.thick * rnd(0.12, 0.3), len = g.thick * rnd(0.25, 0.5);
    const strands = [];
    const walk = (from, heading, L, segs, depth) => {
      const pts = [from.clone()]; let p = from.clone(); const step = L / segs;
      for (let i = 0; i < segs; i++) {
        const h = heading.clone().add(new THREE.Vector3(rnd(-0.55, 0.55), rnd(-0.55, 0.55), rnd(-0.55, 0.55))).normalize();
        p = p.clone().addScaledVector(h, step); pts.push(p);
        if (depth < 2 && Math.random() < (depth ? 0.08 : 0.16)) walk(p, heading.clone().add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1))).normalize(), L * rnd(0.2, 0.45), Math.max(3, segs >> 1), depth + 1);
      }
      strands.push({ pts, w: depth ? 0.5 : 1 });
    };
    walk(dir.clone().multiplyScalar(h0), dir.clone(), len, 18, 0);
    // flicker: main stroke, dark gap, 0-3 restrikes
    const pulses = [[0, 0.06]]; let tt = 0.06; const k = Math.floor(rnd(0, 4));
    for (let i = 0; i < k; i++) { tt += rnd(0.03, 0.09); const d = rnd(0.02, 0.05); pulses.push([tt, tt + d]); tt += d; }
    this.bolts.push({ t0: t, end: t + tt + 0.12, pulses, strands, mid: dir.clone().multiplyScalar(h0 + len * 0.5), len });
  }
  // g: { C: camera-relative planet centre (Vector3), b2w: Matrix3 body->world, Rb, thick, alt } or null; camFwd: world
  update(t, dt, g, camFwd, fovTan, viewH) {
    this.flash.I = 0;
    if (!g) { this.bolts.length = 0; this.mesh.visible = false; return; }
    const w2b = g.b2w.clone().transpose();
    const sub = g.C.clone().negate().applyMatrix3(w2b).normalize(); // camera direction from the centre, body frame
    const fwdB = camFwd.clone().applyMatrix3(w2b);
    // storms are busy: a bolt every second or so while the camera is near the deck
    if (g.alt < g.thick * 12 && (this.wait -= dt) <= 0) { if (this.bolts.length < MAX_BOLTS) this.spawn(t, g, sub, fwdB); this.wait = rnd(0.25, 1.6); }
    this.bolts = this.bolts.filter(b => t < b.end);
    let nv = 0; const P = this.pos; const a = new THREE.Vector3(), b2 = new THREE.Vector3(), side = new THREE.Vector3(), seg = new THREE.Vector3(), mid = new THREE.Vector3();
    const toWorld = (p, out) => out.copy(p).applyMatrix3(g.b2w).add(g.C);
    for (const bolt of this.bolts) {
      const lt = t - bolt.t0; let on = 0;
      for (const [p0, p1] of bolt.pulses) if (lt >= p0 && lt <= p1) on = 1;
      const glowK = on ? 1 : Math.max(0, 1 - (lt - bolt.pulses[bolt.pulses.length - 1][1]) / 0.12) * 0.25; // afterglow
      if (glowK > this.flash.I) { this.flash.I = glowK; toWorld(bolt.mid, this.flash.pos); this.flash.R = bolt.len * 0.9; }
      if (!on) continue;
      for (const s of bolt.strands) for (let i = 0; i + 1 < s.pts.length && nv + 6 <= MAX_BOLTS * MAX_SEG * 6; i++) {
        toWorld(s.pts[i], a); toWorld(s.pts[i + 1], b2);
        seg.subVectors(b2, a); mid.addVectors(a, b2).multiplyScalar(0.5);
        const dist = mid.length(); const w = Math.max(dist * fovTan * 2 / viewH * 2.2, 40) * s.w; // ~2 px wide, never thinner than 40 m
        side.crossVectors(seg, mid).normalize().multiplyScalar(w);
        const v = [a.x - side.x, a.y - side.y, a.z - side.z, a.x + side.x, a.y + side.y, a.z + side.z, b2.x + side.x, b2.y + side.y, b2.z + side.z,
          a.x - side.x, a.y - side.y, a.z - side.z, b2.x + side.x, b2.y + side.y, b2.z + side.z, b2.x - side.x, b2.y - side.y, b2.z - side.z];
        P.set(v, nv * 3); nv += 6;
      }
    }
    this.geo.setDrawRange(0, nv); this.geo.attributes.position.needsUpdate = true; this.mesh.visible = nv > 0;
  }
}

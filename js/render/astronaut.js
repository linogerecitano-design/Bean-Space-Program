// Bean astronauts: the supplied (unrigged) toon mesh is auto-rigged at load time, dressed in a
// spacesuit generated from the body's own surface, and animated procedurally.
import * as THREE from 'three';
import { makeGLTFLoader } from './gltf.js';
import { mat } from './partMesh.js';

let base = null; // { head: BufferGeometry, suit: BufferGeometry, headMat, bones template }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// joint positions in the normalized frame (feet at y=0, facing +Z, height 1.83)
const J = {
  hips: [0, 0.33, 0], spine: [0, 0.5, 0], chest: [0, 0.66, 0], neck: [0, 0.8, 0],
  shL: [0.16, 0.69, 0], elL: [0.34, 0.5, 0], haL: [0.5, 0.3, 0],
  shR: [-0.16, 0.69, 0], elR: [-0.34, 0.5, 0], haR: [-0.5, 0.3, 0],
  hipL: [0.075, 0.31, 0], knL: [0.075, 0.16, 0], ftL: [0.075, 0.02, 0.05],
  hipR: [-0.075, 0.31, 0], knR: [-0.075, 0.16, 0], ftR: [-0.075, 0.02, 0.05],
};
const BONES = ['hips', 'spine', 'chest', 'neck', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR'];
const PARENT = { spine: 'hips', chest: 'spine', neck: 'chest', shL: 'chest', elL: 'shL', shR: 'chest', elR: 'shR', hipL: 'hips', knL: 'hipL', hipR: 'hips', knR: 'hipR' };

function weightsFor(x, y, z) {
  const w = {};
  const ax = Math.abs(x), side = x >= 0 ? 'L' : 'R';
  // arms
  let arm = sstep(0.14, 0.21, ax) * (1 - sstep(0.76, 0.8, y)) * sstep(0.2, 0.26, y);
  if (arm > 0) {
    const s = J['sh' + side], e = J['ha' + side];
    const dx = e[0] - s[0], dy = e[1] - s[1]; const t = ((x - s[0]) * dx + (y - s[1]) * dy) / (dx * dx + dy * dy);
    const fore = sstep(0.4, 0.58, t);
    w['sh' + side] = arm * (1 - fore); w['el' + side] = arm * fore;
  }
  const rest = 1 - arm;
  if (rest > 0) {
    const head = sstep(0.74, 0.82, y);
    const leg = (1 - head) * sstep(0.37, 0.28, y);
    const torso = 1 - head - leg;
    if (head > 0) w.neck = rest * head;
    if (leg > 0) { const shin = sstep(0.21, 0.13, y); const L = x >= 0 ? 'L' : 'R'; const c = sstep(-0.03, 0.03, Math.abs(x)); // near midline blend both legs
      const legW = rest * leg; w['hip' + L] = (w['hip' + L] || 0) + legW * (1 - shin) * (0.5 + 0.5 * c); w['kn' + L] = (w['kn' + L] || 0) + legW * shin * (0.5 + 0.5 * c);
      const O = L === 'L' ? 'R' : 'L'; w['hip' + O] = (w['hip' + O] || 0) + legW * (1 - shin) * (0.5 - 0.5 * c); w['kn' + O] = (w['kn' + O] || 0) + legW * shin * (0.5 - 0.5 * c); }
    if (torso > 0) { const up = sstep(0.45, 0.66, y); const lo = sstep(0.42, 0.3, y); w.chest = rest * torso * up; w.spine = rest * torso * (1 - up) * (1 - lo); w.hips = rest * torso * lo; }
  }
  const list = Object.entries(w).filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = list.reduce((s, [, v]) => s + v, 0) || 1;
  return list.map(([k, v]) => [BONES.indexOf(k), v / sum]);
}

export async function loadAstronautBase() {
  if (base) return base;
  const gltf = await makeGLTFLoader().loadAsync('assets/bean.glb');
  let mesh = null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  const geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld);
  geo.rotateY(-Math.PI / 2); // face +Z
  geo.computeBoundingBox(); const bb = geo.boundingBox; geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const g = geo.index ? geo.toNonIndexed() : geo; // split to filter triangles
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const headTris = [], suitTris = [];
  for (let i = 0; i < pos.count; i += 3) {
    const ys = [pos.getY(i), pos.getY(i + 1), pos.getY(i + 2)];
    if (Math.max(...ys) > 0.77) headTris.push(i);
    if (Math.min(...ys) < 0.81) suitTris.push(i);
  }
  const build = (tris, suit) => {
    const n = tris.length * 3; const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), C = new Float32Array(n * 3);
    let k = 0;
    for (const t of tris) for (let j = 0; j < 3; j++) {
      const i = t + j; let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      if (suit) {
        // puff the suit out: more around the torso, snug at wrists/ankles, big boots and gloves
        const hand = sstep(0.4, 0.46, Math.abs(x)) * (y < 0.45 ? 1 : 0), foot = sstep(0.09, 0.05, y);
        const off = 0.022 + 0.012 * sstep(0.35, 0.6, y) * (1 - sstep(0.14, 0.2, Math.abs(x))) + 0.008 * hand + 0.012 * foot;
        x += nx * off; y += ny * off; z += nz * off;
        // colours: white suit, grey gloves/boots, orange stripe on upper arms, blue lower legs band
        let c = [0.93, 0.93, 0.9];
        if (hand > 0.5) c = [0.55, 0.56, 0.58];
        if (foot > 0.5) c = [0.35, 0.36, 0.38];
        const arm = sstep(0.14, 0.21, Math.abs(x)) && y > 0.5 && y < 0.62; if (arm) c = [0.95, 0.45, 0.1];
        if (y > 0.1 && y < 0.13) c = [0.2, 0.35, 0.8];
        if (y > 0.33 && y < 0.36 && Math.abs(x) < 0.2) c = [0.55, 0.56, 0.58]; // belt
        C[k * 3] = c[0]; C[k * 3 + 1] = c[1]; C[k * 3 + 2] = c[2];
      }
      P[k * 3] = x; P[k * 3 + 1] = y; P[k * 3 + 2] = z; N[k * 3] = nx; N[k * 3 + 1] = ny; N[k * 3 + 2] = nz;
      if (uv) { U[k * 2] = uv.getX(i); U[k * 2 + 1] = uv.getY(i); }
      const w = weightsFor(pos.getX(i), pos.getY(i), pos.getZ(i));
      for (let q = 0; q < 4; q++) { SI[k * 4 + q] = w[q] ? w[q][0] : 0; SW[k * 4 + q] = w[q] ? w[q][1] : 0; }
      k++;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(P, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); bg.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    bg.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); bg.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    if (suit) bg.setAttribute('color', new THREE.BufferAttribute(C, 3));
    return bg;
  };
  const headMat = mesh.material.clone(); headMat.roughness = 0.6; headMat.metalness = 0;
  const suitMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: null, roughness: 0.85, metalness: 0.0 });
  const fab = mat('fabric', 0xffffff); suitMat.map = fab.map;
  base = { head: build(headTris, false), suit: build(suitTris, true), body: build(suitTris, false), headMat, suitMat };
  return base;
}

function makeSkeleton() {
  const bones = {}; const list = [];
  for (const name of BONES) {
    const b = new THREE.Bone(); b.name = name; bones[name] = b; list.push(b);
    const p = J[name], pp = PARENT[name] ? J[PARENT[name]] : [0, 0, 0];
    b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
  }
  for (const name of BONES) if (PARENT[name]) bones[PARENT[name]].add(bones[name]);
  return { bones, list, root: bones.hips };
}

export class Astronaut {
  constructor(opts = {}) {
    if (!base) throw new Error('call loadAstronautBase() first');
    this.group = new THREE.Group(); this.group.name = 'astronaut';
    const sk = makeSkeleton(); this.bones = sk.bones;
    const skeleton = new THREE.Skeleton(sk.list);
    this.head = new THREE.SkinnedMesh(base.head, base.headMat); this.suit = new THREE.SkinnedMesh(base.suit, base.suitMat.clone());
    this.body = new THREE.SkinnedMesh(base.body, base.headMat); this.body.visible = false; // everyday clothes (no spacesuit)
    if (opts.suitColor) this.suit.material.color.set(opts.suitColor);
    for (const m of [this.head, this.suit, this.body]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    this.suit.add(sk.root);
    this.head.bind(skeleton); this.suit.bind(skeleton); this.body.bind(skeleton);
    this.group.add(this.head, this.suit, this.body);
    // helmet bubble (KSP-style fishbowl) + neck ring, attached to neck bone
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.66, 48, 32), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, envMapIntensity: 2.0 }));
    helmet.position.set(0, 0.46, 0.02); helmet.renderOrder = 3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3 }));
    ring.position.set(0, -0.01, 0);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), mat('emissive', 0xfff2d8)); lamp.position.set(0.28, 0.02, 0.22);
    this.bones.neck.add(helmet, ring, lamp);
    this.helmet = helmet; this.gear = [helmet, ring, lamp];
    // life-support backpack with jetpack nozzles
    const pack = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.2), mat('paint', 0xeeeeee)); pack.add(box);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.22), mat('metal', 0xa0a4a8)); top.position.y = 0.26; pack.add(top);
    for (const s of [-1, 1]) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 16), mat('metal', 0xc0c0c0)); tank.position.set(s * 0.12, 0, -0.13); pack.add(tank);
      const noz = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 10), mat('dark')); noz.position.set(s * 0.12, -0.24, -0.13); noz.rotation.x = Math.PI; pack.add(noz); }
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), mat('logo')); patch.position.set(0, 0.05, -0.101); patch.rotation.y = Math.PI; pack.add(patch);
    pack.position.set(0, -0.08, -0.2);
    this.bones.chest.add(pack); this.gear.push(pack);
    // joint bellows rings at elbows and knees
    for (const b of ['elL', 'elR', 'knL', 'knR']) { const rr = new THREE.Mesh(new THREE.TorusGeometry(b.startsWith('kn') ? 0.075 : 0.06, 0.012, 8, 24).rotateX(Math.PI / 2), mat('metal', 0xb0b4b8)); this.bones[b].add(rr); this.gear.push(rr); }
    // chest control box
    const dcm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.08), mat('paint', 0xd8d8d8)); dcm.position.set(0, -0.05, 0.17); this.bones.chest.add(dcm); this.gear.push(dcm);
    this.suited = true;
    this.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.t = Math.random() * 10; this.state = opts.state || 'idle'; this.phase = 0;
    this.rest = {}; for (const n of BONES) this.rest[n] = this.bones[n].quaternion.clone();
    this.speed = 0; this.gravity = 9.8;
  }
  set(name, x, y, z) { const b = this.bones[name]; b.rotation.set(x, y, z); }
  // spacesuit on/off (off = helmet, pack and suit removed, showing the Bean's own clothes)
  setSuit(on) { this.suited = on; this.suit.visible = on; this.body.visible = !on; for (const g of this.gear) g.visible = on; }
  update(dt) {
    this.t += dt; const t = this.t; const B = this.bones;
    for (const n of BONES) B[n].rotation.set(0, 0, 0);
    B.hips.position.set(...J.hips); B.chest.position.set(0, J.chest[1] - J.spine[1], 0); this.hatLift = 0;
    // the source mesh is modelled in a T-pose: bring the arms down to the sides
    const relax = 0.82;
    this.set('shL', 0, 0, -relax); this.set('shR', 0, 0, relax);
    B.elL.rotation.x = -0.15; B.elR.rotation.x = -0.15;
    const s = this.state; const seed = this.seed ?? (this.seed = Math.random() * 100);
    if (s === 'idle') {
      // breathing, a slow weight shift from foot to foot, glancing around, fidgeting hands
      const br = Math.sin(t * 1.6) * 0.025, sway = Math.sin(t * 0.35 + seed) * 0.05;
      B.chest.rotation.x = br; B.hips.rotation.z = sway; B.spine.rotation.z = -sway * 0.8;
      B.hipL.rotation.z = -sway; B.hipR.rotation.z = -sway; B.knL.rotation.x = Math.max(0, sway) * 1.5; B.knR.rotation.x = Math.max(0, -sway) * 1.5;
      const look = Math.sin(t * 0.23 + seed * 3) + 0.5 * Math.sin(t * 0.61 + seed);
      B.neck.rotation.y = look * 0.35; B.neck.rotation.x = Math.sin(t * 0.47 + seed) * 0.08 + 0.04;
      B.shL.rotation.z = -relax - Math.sin(t * 0.9 + seed) * 0.04; B.shR.rotation.z = relax + Math.sin(t * 0.8 + seed * 2) * 0.04;
      B.shL.rotation.x = Math.sin(t * 0.5 + seed) * 0.06; B.shR.rotation.x = Math.sin(t * 0.55 + seed * 1.7) * 0.06;
      B.elL.rotation.x = -0.2 - 0.1 * Math.max(0, Math.sin(t * 0.3 + seed)); B.elR.rotation.x = -0.2 - 0.1 * Math.max(0, Math.sin(t * 0.33 + seed * 2));
      B.hips.position.y = J.hips[1] + br * 0.2 - Math.abs(sway) * 0.02;
      // every so often, check the wrist computer
      const chk = Math.max(0, Math.sin(t * 0.13 + seed * 5) - 0.85) / 0.15;
      if (chk > 0) { B.shL.rotation.z = -relax * (1 - chk * 0.5); B.shL.rotation.x = -0.9 * chk; B.elL.rotation.x = -1.4 * chk; B.neck.rotation.x = 0.35 * chk; B.neck.rotation.y = 0.3 * chk; }
    } else if (s === 'walk' || s === 'hop') {
      const low = this.gravity < 4;
      const rate = low ? 3.2 : 6 + this.speed * 1.5; this.phase += dt * rate;
      const p = this.phase; const amp = Math.min(1, 0.4 + this.speed * 0.25);
      if (low) { // lunar bunny hop
        const hop = Math.abs(Math.sin(p)); B.hips.position.y = J.hips[1] + hop * 0.25;
        B.hipL.rotation.x = -0.4 - hop * 0.3; B.hipR.rotation.x = -0.4 - hop * 0.3; B.knL.rotation.x = 0.7 * (1 - hop); B.knR.rotation.x = 0.7 * (1 - hop);
        B.shL.rotation.z = -0.7; B.shR.rotation.z = 0.7; B.spine.rotation.x = 0.15;
      } else {
        B.hipL.rotation.x = Math.sin(p) * 0.6 * amp; B.hipR.rotation.x = -Math.sin(p) * 0.6 * amp;
        B.knL.rotation.x = Math.max(0, -Math.cos(p)) * 0.9 * amp; B.knR.rotation.x = Math.max(0, Math.cos(p)) * 0.9 * amp;
        B.shL.rotation.x = -Math.sin(p) * 0.45 * amp; B.shR.rotation.x = Math.sin(p) * 0.45 * amp;
        B.elL.rotation.x = -0.4; B.elR.rotation.x = -0.4;
        B.hips.position.y = J.hips[1] + Math.abs(Math.sin(p)) * 0.03; B.hips.rotation.y = Math.sin(p) * 0.08; B.chest.rotation.y = -Math.sin(p) * 0.12;
      }
    } else if (s === 'wave') {
      B.shR.rotation.z = -2.0 + Math.sin(t * 2) * 0.05; B.elR.rotation.z = -0.3 + Math.sin(t * 7) * 0.45; B.neck.rotation.y = -0.2; B.chest.rotation.z = 0.05;
      B.elL.rotation.x = -0.3;
    } else if (s === 'float') {
      B.hipL.rotation.x = -0.35 + Math.sin(t * 0.8) * 0.1; B.hipR.rotation.x = -0.25 + Math.sin(t * 0.8 + 1) * 0.1; B.knL.rotation.x = 0.6; B.knR.rotation.x = 0.45;
      B.shL.rotation.z = -0.7 - Math.sin(t * 0.6) * 0.1; B.shR.rotation.z = 0.7 + Math.sin(t * 0.6) * 0.1; B.elL.rotation.x = -0.6; B.elR.rotation.x = -0.6;
      B.neck.rotation.y = Math.sin(t * 0.3) * 0.5;
    } else if (s === 'grab') { // holding the capsule's handrail
      B.shL.rotation.set(-1.25, 0, -0.25); B.shR.rotation.set(-1.35, 0, 0.25); B.elL.rotation.x = -0.35; B.elR.rotation.x = -0.25;
      B.hipL.rotation.x = -0.25 + Math.sin(t * 0.7) * 0.08; B.hipR.rotation.x = -0.1 + Math.sin(t * 0.7 + 1.3) * 0.08; B.knL.rotation.x = 0.35; B.knR.rotation.x = 0.2;
      B.neck.rotation.y = Math.sin(t * 0.25) * 0.4; B.spine.rotation.x = 0.1;
    } else if (s === 'sit') {
      B.hipL.rotation.x = -1.5; B.hipR.rotation.x = -1.5; B.knL.rotation.x = 1.5; B.knR.rotation.x = 1.5; B.hips.position.y = J.hips[1] - 0.12;
      B.elL.rotation.x = -0.8; B.elR.rotation.x = -0.8; B.neck.rotation.y = Math.sin(t * 0.5) * 0.3;
    } else if (s === 'plant') { // planting a flag
      B.shR.rotation.set(-1.2, 0, 0.4); B.elR.rotation.x = -0.5; B.shL.rotation.set(-1.1, 0, -0.4); B.elL.rotation.x = -0.6; B.spine.rotation.x = 0.3; B.neck.rotation.x = 0.2;
    } else this.gesture(s, t, B, relax, seed);
    if (this.hat) { // hats follow the tip-hat gesture
      const h = this.hat; h.position.copy(h.userData.rest); h.rotation.set(0, 0, 0);
      if (this.hatLift) { h.position.y += this.hatLift * 0.14; h.position.x -= this.hatLift * 0.08; h.rotation.z = this.hatLift * 0.35; h.rotation.x = -this.hatLift * 0.2; }
    }
  }
  // character gestures used by the contract givers in Mission Control
  gesture(s, t, B, relax, seed) {
    const breathe = () => { const br = Math.sin(t * 1.6) * 0.025; B.chest.rotation.x = br; B.hips.position.y = J.hips[1] + br * 0.2; };
    const pulse = (period, on) => { const ph = ((t + seed) % period) / period; return ph < on ? Math.sin(ph / on * Math.PI) : 0; }; // 0..1..0 once per period
    this.hatLift = 0;
    breathe();
    if (s === 'tiphat') { // a gentlemanly tip of the top hat every few seconds
      const k = pulse(5, 0.45); const kk = Math.min(1, k * 1.6);
      B.shR.rotation.set(-0.4 * kk, 0, relax - 2.5 * kk); B.elR.rotation.set(0, 0, -1.3 * kk); B.neck.rotation.x = 0.18 * k; B.neck.rotation.y = -0.1 * k;
      B.chest.rotation.x += 0.12 * k; this.hatLift = Math.max(0, (k - 0.55) / 0.45);
      B.shL.rotation.set(0.1, 0, -relax + 0.25); B.elL.rotation.set(-0.4, 0, 0.6); // hand on hip
    } else if (s === 'think') { // hand on chin, head tilted, the other arm folded, occasional "aha!"
      const aha = pulse(7, 0.18);
      B.shR.rotation.set(-1.0 - 0.3 * aha, 0.2, relax * 0.6 - 1.4 * aha); B.elR.rotation.set(0, 0.2, -1.9 + 1.2 * aha);
      B.shL.rotation.set(-0.7, 0, -relax * 0.7); B.elL.rotation.set(0, -1.3, 0);
      B.neck.rotation.z = 0.18 * (1 - aha) + Math.sin(t * 0.7 + seed) * 0.04; B.neck.rotation.x = 0.1 - 0.25 * aha; B.neck.rotation.y = Math.sin(t * 0.3 + seed) * 0.15;
    } else if (s === 'salute') { // snaps a salute every few seconds, otherwise stands to attention
      const k = Math.min(1, pulse(5, 0.5) * 2.2);
      B.shR.rotation.set(-0.35 * k, -0.55 * k, relax - 1.05 * k); B.elR.rotation.set(0, 0, -2.25 * k);
      B.shL.rotation.z = -relax - 0.02; B.hipL.rotation.z = 0; B.hipR.rotation.z = 0; B.neck.rotation.x = -0.05; B.chest.rotation.x -= 0.05;
    } else if (s === 'point') { // points up at the sky, then back at you
      const k = Math.min(1, pulse(6, 0.4) * 1.8);
      B.shR.rotation.set(-0.6 * k, 0, relax - 2.7 * k); B.elR.rotation.set(0, 0, -0.1);
      B.neck.rotation.x = -0.35 * k; B.neck.rotation.y = -0.2 * k;
      B.shL.rotation.set(-0.3, 0, -relax + 0.2); B.elL.rotation.set(-0.8, 0, 0);
    } else if (s === 'talk') { // animated chatter with both hands
      const a = Math.sin(t * 3.1 + seed), b = Math.sin(t * 2.3 + seed * 2);
      B.shR.rotation.set(-0.7 + 0.2 * a, 0, relax - 0.3 + 0.15 * b); B.elR.rotation.set(-0.6 + 0.3 * b, 0, -0.2);
      B.shL.rotation.set(-0.7 + 0.2 * b, 0, -relax + 0.3 - 0.15 * a); B.elL.rotation.set(-0.6 + 0.3 * a, 0, 0.2);
      B.neck.rotation.x = 0.05 + Math.abs(Math.sin(t * 5.2)) * 0.06; B.neck.rotation.y = Math.sin(t * 0.9 + seed) * 0.25; B.chest.rotation.y = a * 0.05;
    } else if (s === 'cheer') { // both arms up, bouncing
      const b = Math.abs(Math.sin(t * 6)); B.hips.position.y = J.hips[1] + b * 0.06;
      B.shR.rotation.set(0, 0, relax - 2.9 + 0.2 * b); B.shL.rotation.set(0, 0, -relax + 2.9 - 0.2 * b); B.elR.rotation.z = -0.3 * b; B.elL.rotation.z = 0.3 * b;
      B.neck.rotation.x = -0.2; B.knL.rotation.x = 0.3 * (1 - b); B.knR.rotation.x = 0.3 * (1 - b); B.hipL.rotation.x = -0.15 * (1 - b); B.hipR.rotation.x = -0.15 * (1 - b);
    } else if (s === 'shrug') {
      const k = Math.min(1, pulse(2.2, 0.6) * 1.6);
      B.shR.rotation.set(-0.3 * k, 0, relax - 0.5 * k); B.shL.rotation.set(-0.3 * k, 0, -relax + 0.5 * k); B.elR.rotation.set(-1.2 * k, 0, 0); B.elL.rotation.set(-1.2 * k, 0, 0);
      B.chest.position.y = J.chest[1] - J.spine[1] + 0.02 * k; B.neck.rotation.z = 0.15 * k;
    } else { // unknown: fall back to a relaxed stand
      B.neck.rotation.y = Math.sin(t * 0.3 + seed) * 0.3;
    }
  }
  // Everyday clothes for the non-astronaut Beans (contract givers): recoloured body + hats & props
  dress(outfit) {
    const O = OUTFITS[outfit]; if (!O) return this;
    // keep the suit mesh (it parents the skeleton, and the props hang off its bones) but draw nothing
    this.setSuit(false); this.suit.visible = true; this.suit.material.visible = false; this.suit.castShadow = false;
    this.body.geometry = outfitGeometry(outfit);
    this.body.material = base.suitMat.clone(); this.body.material.color.set(0xffffff);
    const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const N = this.bones.neck, C = this.bones.chest; const add = (bone, mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; bone.add(mesh); return mesh; };
    const hat = new THREE.Group(); let hasHat = true;
    const cyl = (r1, r2, h, c, y, seg = 32) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), c); m.position.y = y; m.castShadow = true; hat.add(m); return m; };
    const HY = 0.86; // crown of the head, neck-bone frame
    switch (O.hat) {
      case 'tophat': { const k = M(0x121214, 0.5); cyl(0.46, 0.46, 0.03, k, 0); cyl(0.27, 0.29, 0.5, k, 0.26); cyl(0.295, 0.295, 0.08, M(0x7a1020), 0.06); break; }
      case 'cap': { const o = M(0x4b5320, 0.8); cyl(0.36, 0.34, 0.16, o, 0.06); cyl(0.46, 0.4, 0.08, o, 0.17); const v = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 24, 1, false, -Math.PI / 2, Math.PI), M(0x0c0c0c, 0.3)); v.position.set(0, 0.0, 0.18); v.rotation.x = 0.25; hat.add(v); const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), M(0xd4a017, 0.3, 0.8)); b.position.set(0, 0.13, 0.36); hat.add(b); break; }
      case 'straw': { const st = M(0xd8b86a, 0.95); cyl(0.72, 0.72, 0.025, st, 0); cyl(0.33, 0.37, 0.22, st, 0.11); cyl(0.375, 0.375, 0.06, M(0x8a2a1a), 0.04); break; }
      case 'toque': { const w = M(0xfafafa, 0.9); cyl(0.36, 0.34, 0.34, w, 0.14); const p = new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 16), w); p.scale.set(1, 0.55, 1); p.position.y = 0.36; hat.add(p); break; }
      case 'mortar': { const k = M(0x16161a, 0.6); cyl(0.36, 0.34, 0.14, k, 0.05); const bd = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.85), k); bd.position.y = 0.13; bd.rotation.y = Math.PI / 4; hat.add(bd);
        const ts = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.3, 6), M(0xd4a017, 0.5, 0.4)); ts.position.set(0.42, -0.02, 0.1); hat.add(ts); break; }
      case 'bun': { const hr = M(0x5a3a22, 0.9); const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), hr); b.position.set(0, 0.04, -0.2); hat.add(b); break; }
      default: hasHat = false;
    }
    if (hasHat) { hat.position.set(0, HY, O.hatZ ?? -0.03); hat.userData.rest = hat.position.clone(); N.add(hat); this.hat = hat; }
    const FZ = 0.395, EY = 0.6; // face front and eye height (neck frame)
    if (O.glasses) { const g = M(O.glasses, 0.3, 0.6); for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 24), g); r.position.set(sx * 0.14, EY, FZ); N.add(r); } const br = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.018), g); br.position.set(0, EY + 0.02, FZ + 0.01); N.add(br); }
    if (O.monocle) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 24), M(0xd4a017, 0.3, 0.9)); r.position.set(-0.14, EY, FZ + 0.01); N.add(r); const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.45, 4), M(0xd4a017, 0.3, 0.9)); ch.position.set(-0.2, EY - 0.24, FZ - 0.02); ch.rotation.z = 0.25; N.add(ch); }
    if (O.tache) { const tm = M(O.tache, 0.9); const tg = new THREE.Group(); for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), tm); m.scale.set(1.25, 0.4, 0.5); m.position.set(sx * 0.1, 0, 0); m.rotation.z = sx * (O.tacheCurl ? -0.35 : -0.15); tg.add(m); } tg.position.set(0, 0.3, 0.45); N.add(tg); }
    if (O.bowtie) { const bt = M(O.bowtie, 0.6); for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.07, 4), bt); w.rotation.z = sx * Math.PI / 2; w.position.set(sx * 0.035, 0, 0); add(C, w, sx * 0.035, 0.07, 0.075); } add(C, new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), bt), 0, 0.07, 0.085); }
    if (O.scarf) { const sc = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 20), M(O.scarf, 0.9)); sc.rotation.x = Math.PI / 2; add(C, sc, 0, 0.1, 0.0); const k = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), M(O.scarf, 0.9)); k.rotation.x = Math.PI; add(C, k, 0.02, 0.03, 0.085); }
    if (O.medals) O.medals.forEach((c, i) => { add(C, new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), M(c, 0.5)), 0.05 + i * 0.035, 0.01, 0.07); add(C, new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 10).rotateX(Math.PI / 2), M(0xd4a017, 0.3, 0.9)), 0.05 + i * 0.035, -0.02, 0.072); });
    if (O.epaulettes) for (const sx of [-1, 1]) add(C, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.07), M(0xd4a017, 0.4, 0.7)), sx * 0.15, 0.04, -0.01);
    if (O.clipboard) { const cb = new THREE.Group(); const bd = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.012), M(0x8a6a3a, 0.8)); cb.add(bd); const pp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.004), M(0xf4f4ee, 0.9)); pp.position.z = 0.008; cb.add(pp); cb.position.set(0.18, -0.22, 0.05); cb.rotation.set(0.2, 0, 0.3); this.bones.elL.add(cb); }
    if (O.buttons) for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) add(C, new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M(O.buttons, 0.4)), sx * 0.05, 0.02 - i * 0.065, 0.068);
    this.outfit = outfit;
    return this;
  }
}

// ---------------------------------------------------------------- outfits
// region colours for everyday clothes (y: feet 0 .. neck 0.8; body faces +Z)
const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // sRGB hex -> linear vertex colour
const OUTFITS = {
  tycoon: { jacket: 0x17171c, shirt: 0xf4f4f0, legs: 0x3a3a40, stripe: 0x6a6a70, shoes: 0x0a0a0a, gloves: 0xf4f4f0, hat: 'tophat', monocle: true, bowtie: 0xa01020, tache: 0xb8b8b8, tacheCurl: true },
  scientist: { jacket: 0xf2f4f6, coat: true, shirt: 0x7ab0e0, legs: 0x34445a, shoes: 0x3a2a20, gloves: 0x8ec8f0, glasses: 0x202020, hat: 'bun', clipboard: true },
  general: { jacket: 0x4b5320, shirt: 0x4b5320, legs: 0x3f461c, stripe: 0x9a2020, shoes: 0x0e0e0e, gloves: 0xf0f0ea, belt: 0x5a3a18, hat: 'cap', medals: [0xc02020, 0x2050c0, 0xe0c020], epaulettes: true, tache: 0x3a2a1a },
  farmer: { jacket: 0xb02a22, check: 0x6a1410, overalls: 0x3a5a9a, legs: 0x3a5a9a, shoes: 0x5a3a1a, gloves: 0x9a7040, hat: 'straw' },
  professor: { jacket: 0x7a5a3a, tweed: true, patches: 0x4a3420, shirt: 0xf0ece0, legs: 0x3e4a38, shoes: 0x3a2412, gloves: 0xc8a070, glasses: 0x8a6a2a, hat: 'mortar', bowtie: 0x2a5a2a, tache: 0xe8e8e0 },
  aviator: { jacket: 0x6a4424, shirt: 0xf0e8d8, legs: 0x5a5040, shoes: 0x2a1a10, gloves: 0x4a3018, belt: 0x2a1a10, hat: 'cap', scarf: 0xf4f4f0, glasses: 0x303a40 },
  chef: { jacket: 0xfbfbf8, shirt: 0xfbfbf8, legs: 0x202020, check: 0xe8e8e8, shoes: 0x1a1a1a, gloves: 0xfbfbf8, hat: 'toque', scarf: 0xc0202a, buttons: 0x202020, tache: 0x1a1210, tacheCurl: true },
};
export const OUTFIT_NAMES = Object.keys(OUTFITS);
const outfitCache = {};
function outfitGeometry(name) {
  if (outfitCache[name]) return outfitCache[name];
  const O = OUTFITS[name]; const g = base.body.clone(); const P = g.attributes.position, Nn = g.attributes.normal;
  const C = new Float32Array(P.count * 3);
  const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ax = Math.abs(x);
    const hand = ax > 0.4 && y < 0.45, foot = y < 0.07, leg = y < 0.33, arm = ax > 0.17 && y > 0.2 && !leg;
    let c = rgb(O.jacket);
    if (leg) { c = rgb(O.coat && y > 0.17 ? O.jacket : O.legs); if (O.stripe && !O.coat && (Math.abs(ax - 0.12) < 0.008)) c = rgb(O.stripe);
      if (O.check && !O.overalls && ((Math.floor(x * 28) + Math.floor(y * 28)) & 1)) c = rgb(O.check); }
    else if (!arm) { // torso
      if (O.shirt !== undefined && z > 0.02 && ax < (O.coat ? 0.06 : 0.045) && y > 0.5) c = rgb(O.shirt);
      if (O.overalls && (y < 0.62 || (ax > 0.05 && ax < 0.09))) c = rgb(O.overalls);
      else if (O.check && O.overalls && ((Math.floor(x * 30) + Math.floor(y * 30)) & 1)) c = rgb(O.check);
      if (O.belt && y > 0.33 && y < 0.37) c = rgb(O.belt);
    } else { // sleeves
      if (O.check && O.overalls && ((Math.floor(x * 30) + Math.floor(y * 30)) & 1)) c = rgb(O.check);
      if (O.patches && ax > 0.3 && ax < 0.38 && y > 0.44 && y < 0.54 && z < 0) c = rgb(O.patches);
      if (O.stripe && name === 'general' && ax > 0.4 && ax < 0.43) c = rgb(0xd4a017); // cuff braid
    }
    if (O.tweed) { const n = hash(Math.floor(x * 90), Math.floor(y * 90)) * 0.16 - 0.08; c = c.map(v => Math.max(0, v + n)); }
    if (hand) c = rgb(O.gloves); if (foot) c = rgb(O.shoes);
    C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2];
    // a hair's breadth outward so the coloured clothes cover the neck seam of the head mesh
    const k = 0.006; P.setXYZ(i, x + Nn.getX(i) * k, y + Nn.getY(i) * k, z + Nn.getZ(i) * k);
  }
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return (outfitCache[name] = g);
}

// Planted flag with BSP banner
export function makeFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 8), mat('metal', 0xd0d0d0)); pole.position.y = 1.1; g.add(pole);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g2 = c.getContext('2d');
  g2.fillStyle = '#f4f4f0'; g2.fillRect(0, 0, 512, 256); g2.fillStyle = '#12306b'; g2.fillRect(0, 0, 512, 40); g2.fillRect(0, 216, 512, 40);
  g2.drawImage(mat('logo').map.image, 0, 0, 512, 256);
  const ft = new THREE.CanvasTexture(c); ft.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6, 12, 4), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.9 }));
  cloth.position.set(0.52, 1.85, 0); g.add(cloth);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.05, 6).rotateZ(Math.PI / 2), mat('metal')); bar.position.set(0.52, 2.15, 0); g.add(bar);
  g.userData.cloth = cloth;
  return g;
}

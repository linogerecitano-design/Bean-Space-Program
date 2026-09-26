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
    B.hips.position.set(...J.hips);
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
    }
  }
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

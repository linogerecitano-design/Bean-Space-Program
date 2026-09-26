// VAB interiors. Level 1: the Bean Space Centre's high bay (steel columns and roof trusses, catwalk
// tiers, an overhead bridge crane, a hazard-striped work cell, the huge bay door, BSP banners, high-bay
// lamps, parked kit). Level 0: the Bean Field tin barn (corrugated arch, bare bulbs, workbenches, hay
// bales, a tractor, a hand-painted sign). Static geometry is merged by material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tl = new THREE.TextureLoader();
function groundTex(n, rep, nor) { const t = tl.load(`assets/ground/${n}_${nor ? 'nor' : 'diff'}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (!nor) t.colorSpace = THREE.SRGBColorSpace; return t; }
function canvasTex(w, h, draw, rep) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; }
const std = (o) => new THREE.MeshStandardMaterial(o);
const glow = (c, k) => std({ color: 0x000000, emissive: c, emissiveIntensity: k });

// collects meshes, then merges them per material
class Builder {
  constructor() { this.g = new THREE.Group(); this.dyn = new THREE.Group(); }
  add(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.userData.shadow = shadow; this.g.add(m); return m; }
  box(w, h, d, mat, x, y, z, ry = 0) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry); }
  cyl(r1, r2, h, mat, x, y, z, seg = 16) { return this.add(new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y, z); }
  // straight beam between two points
  beam(a, b, t, mat) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b); const d = B.clone().sub(A); const m = new THREE.Mesh(new THREE.BoxGeometry(t, d.length(), t), mat); m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.userData.shadow = true; this.g.add(m); }
  // I-beam column
  ibeam(x, z, h, w, mat, ry = 0) { this.box(w, h, w * 0.12, mat, x, h / 2, z, ry); const f = (s) => { const o = this.box(w * 0.12, h, w * 0.9, mat, x, h / 2, z, ry); o.translateX(s * w / 2); }; f(-1); f(1); }
  finish() {
    this.g.updateMatrixWorld(true);
    const buckets = new Map();
    this.g.traverse(o => { if (!o.isMesh) return; let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); g.applyMatrix4(o.matrixWorld); const key = o.material.uuid + (o.userData.shadow ? 's' : 'n'); if (!buckets.has(key)) buckets.set(key, [o.material, o.userData.shadow, []]); buckets.get(key)[2].push(g); });
    const out = new THREE.Group();
    for (const [, [mat, sh, geos]] of buckets) { const g = mergeGeometries(geos, false); if (!g) continue; g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.castShadow = sh; m.receiveShadow = true; out.add(m); }
    out.add(this.dyn); return out;
  }
}

function logoTex() {
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#12306b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d02020'; g.fillRect(0, 0, w, 40); g.fillRect(0, h - 40, w, 40);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, 380, 170, 0, 7); g.fill(); g.fillStyle = '#12306b'; g.beginPath(); g.arc(w / 2, 380, 150, 0, 7); g.fill();
    g.strokeStyle = '#d02020'; g.lineWidth = 22; g.beginPath(); g.ellipse(w / 2, 380, 200, 70, -0.5, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.fillText('BSP', w / 2, 418);
    for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(Math.random() * w, 120 + Math.random() * 520, 2.5, 0, 7); g.fill(); }
    g.font = 'bold 64px Arial'; g.fillText('BEAN', w / 2, 720); g.fillText('SPACE', w / 2, 800); g.fillText('PROGRAM', w / 2, 880);
  });
}
function hazardTex() { return canvasTex(256, 32, (g, w, h) => { g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); g.fillStyle = '#161616'; for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.fill(); } }, [1, 1]); }

// ---------------------------------------------------------------- level 1: the high bay
function bigHall() {
  const B = new Builder();
  const steel = std({ color: 0x6f7780, metalness: 0.75, roughness: 0.38 }), blue = std({ color: 0x1f4f8f, metalness: 0.5, roughness: 0.45 });
  const yellow = std({ color: 0xe0b020, metalness: 0.3, roughness: 0.5 }), dark = std({ color: 0x1a1c20, roughness: 0.6, metalness: 0.4 }), white = std({ color: 0xe8e8e4, roughness: 0.6 });
  // floor: polished concrete with painted walkways, a hazard-striped work cell and a floor logo
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), std({ map: groundTex('concrete_floor_02', 22), normalMap: groundTex('concrete_floor_02', 14, true), roughness: 0.28, metalness: 0.0, color: 0x9a9a96, envMapIntensity: 1.0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; B.dyn.add(floor);
  const paint = canvasTex(1024, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h); const s = w / 320; // 1 px = 0.3125 m
    g.strokeStyle = 'rgba(242,194,48,0.85)'; g.lineWidth = 1.2 * s; // walkways
    for (const x of [-60, -48, 48, 60]) { g.beginPath(); g.moveTo((x + 160) * s, 0); g.lineTo((x + 160) * s, h); g.stroke(); }
    for (const z of [-60, -48, 48, 60]) { g.beginPath(); g.moveTo(0, (z + 160) * s); g.lineTo(w, (z + 160) * s); g.stroke(); }
    g.fillStyle = 'rgba(242,194,48,0.9)'; g.font = `bold ${5 * s}px Arial`; g.textAlign = 'center'; g.fillText('KEEP CLEAR · ASSEMBLY CELL', 160 * s, 104 * s + 3 * s);
    // logo roundel on the floor behind the rocket
    g.save(); g.translate(160 * s, 205 * s); g.fillStyle = 'rgba(18,48,107,0.75)'; g.beginPath(); g.arc(0, 0, 16 * s, 0, 7); g.fill(); g.strokeStyle = 'rgba(208,32,32,0.85)'; g.lineWidth = 2.2 * s; g.beginPath(); g.ellipse(0, 0, 20 * s, 7 * s, -0.5, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = `bold ${10 * s}px Arial`; g.fillText('BSP', 0, 3.5 * s); g.restore();
  });
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ map: paint, transparent: true, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
  decal.rotation.x = -Math.PI / 2; decal.position.y = 0.02; B.dyn.add(decal);
  const hz = std({ map: hazardTex(), roughness: 0.6 });
  for (const [x, z, ry] of [[0, -24, 0], [0, 24, 0], [-24, 0, Math.PI / 2], [24, 0, Math.PI / 2]]) { const m = B.box(49.2, 0.05, 1.2, hz, x, 0.03, z, ry); const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 6); }
  // walls: ribbed cladding
  const wt = canvasTex(256, 256, (g) => { g.fillStyle = '#56606c'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, 0, 3, 256); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 3, 0, 2, 256); } for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(30,30,30,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1, 10 + Math.random() * 40); } }, [20, 12]);
  const room = new THREE.Mesh(new THREE.BoxGeometry(320, 242, 320), std({ map: wt, roughness: 0.8, metalness: 0.25, side: THREE.BackSide })); room.position.y = 120; room.receiveShadow = true; B.dyn.add(room);
  // columns every 40 m around the walls, with X-bracing between them
  for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) {
    B.ibeam(i * 40, s * 158, 240, 2.4, blue); B.ibeam(s * 158, i * 40, 240, 2.4, blue, Math.PI / 2);
    if (i < 3) for (let y = 0; y < 220; y += 40) { B.beam([i * 40, y, s * 157], [(i + 1) * 40, y + 40, s * 157], 0.5, steel); B.beam([(i + 1) * 40, y, s * 157], [i * 40, y + 40, s * 157], 0.5, steel); }
  }
  // roof trusses spanning x
  for (let z = -140; z <= 140; z += 40) {
    B.box(316, 1.6, 1.2, steel, 0, 232, z); B.box(316, 1.2, 1.0, steel, 0, 222, z);
    for (let x = -150; x < 150; x += 12) B.beam([x, 222, z], [x + 12, 232, z], 0.45, steel);
  }
  // catwalk tiers along the side walls with railings and stair-like ladders
  for (let y = 24; y < 220; y += 28) for (const x of [-152, 152]) {
    B.box(10, 0.6, 300, steel, x, y, 0); B.box(0.15, 0.15, 300, yellow, x - Math.sign(x) * 5, y + 1.1, 0); B.box(0.15, 0.15, 300, yellow, x - Math.sign(x) * 5, y + 0.55, 0);
    for (let z = -140; z <= 140; z += 10) B.box(0.15, 1.1, 0.15, yellow, x - Math.sign(x) * 5, y + 0.55, z);
  }
  // service platforms that fold out towards the rocket (retracted, one pair per tier)
  for (let y = 24; y < 200; y += 28) for (const s of [-1, 1]) { B.box(30, 0.5, 8, steel, s * 132, y, -30); B.box(30, 0.14, 0.14, yellow, s * 132, y + 1.1, -26); }
  // the bay door: tall panelled door with a hazard frame and a glowing gap to daylight
  const doorM = std({ color: 0x8b949e, metalness: 0.55, roughness: 0.45 });
  for (let i = 0; i < 12; i++) B.box(60, 18, 1.2, doorM, 0, 9 + i * 18.5, -158);
  for (let i = 0; i < 12; i++) B.box(60.5, 0.4, 1.5, dark, 0, 18.2 + i * 18.5, -158);
  B.box(4, 226, 2, hz, -32, 113, -157.5); B.box(4, 226, 2, hz, 32, 113, -157.5); B.box(68, 4, 2, hz, 0, 226, -157.5);
  { const gap = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 222), glow(0xfff6e0, 3)); gap.position.set(0, 111, -157.3); B.dyn.add(gap); }
  // big BSP banners hanging on the side walls
  const logo = std({ map: logoTex(), roughness: 0.85, side: THREE.DoubleSide });
  for (const [x, z, ry] of [[-150, -60, Math.PI / 2], [-150, 60, Math.PI / 2], [150, -60, -Math.PI / 2], [150, 60, -Math.PI / 2]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(24, 48), logo); b.position.set(x, 150, z); b.rotation.y = ry; B.dyn.add(b); B.box(0.6, 0.6, 26, steel, x, 174.5, z); }
  const title = canvasTex(2048, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#e8e8e4'; g.font = 'bold 180px Arial'; g.textAlign = 'center'; g.fillText('BEAN SPACE PROGRAM', w / 2, 190); });
  const tt = new THREE.Mesh(new THREE.PlaneGeometry(150, 18.75), new THREE.MeshStandardMaterial({ map: title, transparent: true, roughness: 0.7 })); tt.position.set(0, 200, 158.8); tt.rotation.y = Math.PI; B.dyn.add(tt);
  // overhead bridge crane: girder across the hall on wall rails, trolley, hook block over the cell
  for (const s of [-1, 1]) B.box(3, 3, 310, yellow, s * 150, 190, 0);
  B.box(304, 5, 4, yellow, 0, 186, 6); B.box(304, 5, 4, yellow, 0, 186, -6); for (let x = -145; x <= 145; x += 10) B.box(0.4, 5, 12, yellow, x, 186, 0);
  B.box(14, 5, 16, dark, 0, 181, 0); // trolley
  for (const dx of [-1.2, 1.2]) B.cyl(0.12, 0.12, 30, steel, dx, 164, 0, 6);
  B.box(4, 3, 2.5, yellow, 0, 148, 0); B.add(new THREE.TorusGeometry(1.1, 0.35, 8, 16, Math.PI * 1.4), steel, 0, 145.4, 0, 0, 0, Math.PI * 0.8);
  // high-bay lamps between the trusses
  const lampM = glow(0xfff4e2, 5), hood = std({ color: 0x30343a, metalness: 0.6, roughness: 0.5 });
  for (let x = -120; x <= 120; x += 40) for (let z = -120; z <= 120; z += 40) { if (Math.abs(x) < 30 && Math.abs(z) < 30) continue; B.add(new THREE.CylinderGeometry(1.6, 2.6, 1.6, 16, 1, true), hood, x, 216, z, 0, 0, 0, false); const l = new THREE.Mesh(new THREE.CircleGeometry(2.4, 16), lampM); l.rotation.x = Math.PI / 2; l.position.set(x, 215.3, z); B.dyn.add(l); }
  // parked kit: tool chests, part crates, a forklift, gas bottles, a scissor lift
  const red = std({ color: 0xb02020, metalness: 0.4, roughness: 0.45 }), wood = std({ color: 0x9a7a4a, roughness: 0.9 });
  for (let i = 0; i < 4; i++) { B.box(1.6, 1.1, 0.7, red, -40 + i * 2, 0.55, 40); B.box(1.6, 0.4, 0.7, dark, -40 + i * 2, 1.3, 40); }
  for (const [x, z, s] of [[45, 42, 3], [49, 42, 2.2], [45, 46, 2.5], [-46, -40, 3], [-50, -44, 2]]) B.box(s, s, s, wood, x, s / 2, z, 0.2);
  B.box(3, 1.8, 5, std({ color: 0xe0a020, roughness: 0.5, metalness: 0.3 }), 40, 1.3, -44); B.box(2.6, 2.4, 0.2, dark, 40, 3.3, -46.2); B.box(0.2, 5, 0.2, steel, 39, 2.5, -46.8); B.box(0.2, 5, 0.2, steel, 41, 2.5, -46.8); B.box(2, 0.1, 2.5, steel, 40, 0.4, -48.2);
  for (let i = 0; i < 5; i++) B.cyl(0.25, 0.25, 1.6, i % 2 ? white : std({ color: 0x3060a0, roughness: 0.4, metalness: 0.5 }), -44 + i * 0.6, 0.8, 44, 12);
  B.box(3, 0.5, 5, blue, 30, 0.5, 30); for (let k = 0; k < 4; k++) { B.beam([29, 0.8 + k * 1.6, 28], [31, 2.4 + k * 1.6, 32], 0.15, steel); B.beam([31, 0.8 + k * 1.6, 28], [29, 2.4 + k * 1.6, 32], 0.15, steel); } B.box(3.4, 0.3, 5.4, steel, 30, 7.3, 30);
  return B.finish();
}

// ---------------------------------------------------------------- level 0: the tin barn
function barn() {
  const B = new Builder();
  const R = 62, L = 150; // arch radius and length (tall enough for Bean Field's 45 m limit)
  const tin = canvasTex(256, 256, (g, w, h) => { for (let x = 0; x < w; x += 8) { const k = 0.5 + 0.5 * Math.sin(x / 8 * Math.PI); g.fillStyle = `rgb(${110 + k * 50},${114 + k * 50},${118 + k * 48})`; g.fillRect(x, 0, 8, h); } for (let i = 0; i < 180; i++) { g.fillStyle = `rgba(${120 + Math.random() * 50},${60 + Math.random() * 30},20,${Math.random() * 0.3})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 8 + Math.random() * 50); } }, [30, 8]);
  const archGeo = new THREE.CylinderGeometry(R, R, L, 48, 1, true, Math.PI / 2, Math.PI); archGeo.rotateX(Math.PI / 2); // axis along z, upper half
  const arch = new THREE.Mesh(archGeo, std({ map: tin, roughness: 0.5, metalness: 0.7, side: THREE.BackSide })); arch.receiveShadow = true; B.dyn.add(arch);
  const endM = std({ color: 0x7a6040, roughness: 0.9, side: THREE.DoubleSide, map: canvasTex(256, 256, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = `hsl(30, 30%, ${28 + Math.random() * 10}%)`; g.fillRect(x, 0, 16, h); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x, 0, 1.5, h); } }, [12, 4]) });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CircleGeometry(R, 48, 0, Math.PI), endM); e.position.z = s * L / 2; B.dyn.add(e); }
  // big doors (closed) on the back wall with cross bracing
  const plank = std({ color: 0x8a5a2a, roughness: 0.9 });
  B.box(36, 40, 0.6, plank, 0, 20, -L / 2 + 0.6); for (const s of [-1, 1]) { B.beam([s * 18, 1, -L / 2 + 1], [0, 39, -L / 2 + 1], 0.8, plank); }
  // floor: dusty concrete with a painted pad square
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, L), std({ map: groundTex('concrete_floor_02', 10), normalMap: groundTex('concrete_floor_02', 8, true), roughness: 0.85, color: 0x9a9080 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; B.dyn.add(floor);
  const hz = std({ map: hazardTex(), roughness: 0.7 });
  for (const [x, z, ry] of [[0, -12, 0], [0, 12, 0], [-12, 0, Math.PI / 2], [12, 0, Math.PI / 2]]) { const m = B.box(24.8, 0.05, 0.8, hz, x, 0.03, z, ry); const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3); }
  // arched ribs
  const rib = std({ color: 0x5a5e62, metalness: 0.7, roughness: 0.5 });
  for (let z = -L / 2 + 10; z < L / 2; z += 12) for (let k = 0; k < 24; k++) { const a1 = k / 24 * Math.PI, a2 = (k + 1) / 24 * Math.PI; B.beam([Math.cos(a1) * (R - 0.6), Math.sin(a1) * (R - 0.6), z], [Math.cos(a2) * (R - 0.6), Math.sin(a2) * (R - 0.6), z], 0.6, rib); }
  // bare bulbs on cables
  const bulb = glow(0xffd9a0, 8), cable = std({ color: 0x111111 });
  for (let z = -40; z <= 40; z += 20) for (const x of [-16, 16]) { const top = Math.sqrt(R * R - x * x); B.cyl(0.03, 0.03, top - 22, cable, x, 22 + (top - 22) / 2, z, 4); const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), bulb); b.position.set(x, 21.8, z); B.dyn.add(b); B.add(new THREE.ConeGeometry(0.9, 0.6, 16, 1, true), std({ color: 0x2a4a2a, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }), x, 22.3, z); }
  // workbenches with tools, hay bales, oil drums, a little tractor, a ladder
  const wood = std({ color: 0x8a6a42, roughness: 0.9 }), metal = std({ color: 0x8a9096, metalness: 0.7, roughness: 0.4 }), red = std({ color: 0xa82a1a, roughness: 0.6, metalness: 0.2 });
  for (const [x, z] of [[-30, -20], [-30, -8]]) { B.box(3, 0.15, 8, wood, x, 1, z); for (const dz of [-3.6, 3.6]) for (const dx of [-1.3, 1.3]) B.box(0.15, 1, 0.15, wood, x + dx, 0.5, z + dz); B.box(0.8, 0.5, 1.4, red, x, 1.33, z - 2); B.cyl(0.25, 0.25, 0.9, metal, x + 0.6, 1.5, z + 2, 10); }
  const hay = std({ color: 0xd4b464, roughness: 1 });
  for (const [x, z, y] of [[28, 20, 0.6], [28, 23.2, 0.6], [30.8, 21.6, 0.6], [28.6, 21.6, 1.8]]) B.box(2.6, 1.2, 3, hay, x, y, z, 0.1);
  for (let i = 0; i < 4; i++) B.cyl(0.6, 0.6, 1.8, i % 2 ? std({ color: 0x2a5a9a, metalness: 0.5, roughness: 0.5 }) : red, 26 + i * 1.3, 0.9, -24, 16);
  const tr = std({ color: 0x2a7a2a, metalness: 0.3, roughness: 0.5 }), tyre = std({ color: 0x151515, roughness: 0.9 });
  B.box(2, 1.4, 4, tr, 25, 1.6, -8); B.box(1.8, 1.8, 1.6, tr, 25, 3, -9.2); B.cyl(0.08, 0.08, 1.4, metal, 25.5, 3.2, -7.2, 6);
  for (const [dx, dz, r] of [[1.3, -9.5, 1.1], [-1.3, -9.5, 1.1], [1.2, -6.4, 0.6], [-1.2, -6.4, 0.6]]) B.add(new THREE.CylinderGeometry(r, r, 0.6, 20), tyre, 25 + dx, r, dz, 0, 0, Math.PI / 2);
  for (const s of [-0.6, 0.6]) B.box(0.15, 14, 0.15, wood, -24 + s, 7, 26, 0); for (let y = 1; y < 14; y += 1) B.box(1.2, 0.1, 0.1, wood, -24, y, 26);
  const sign = canvasTex(1024, 256, (g, w, h) => { g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a2a18'; g.font = 'bold 120px Georgia, serif'; g.textAlign = 'center'; g.fillText('BEAN FIELD WORKS', w / 2, 150); g.fillStyle = '#2a5a2a'; g.font = 'italic 44px Georgia, serif'; g.fillText('rockets built by hand · mind the turnips', w / 2, 215); });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), std({ map: sign, roughness: 0.9 })); sg.position.set(0, 30, -L / 2 + 1); B.dyn.add(sg);
  return B.finish();
}

const cache = {};
export function vabHall(level) { return cache[level] || (cache[level] = level >= 1 ? bigHall() : barn()); }
export const HALL_LIMITS = [{ maxDist: 80, height: 50 }, { maxDist: 145, height: 240 }];

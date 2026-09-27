// Bean Space Centre: procedural buildings in a local ENU frame (x east, y up, z south).
// Everything static is merged per material at the end, so the whole centre costs a few
// dozen draw calls. Windows, lamps and pad floodlights glow at night (setNight()).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mat } from './partMesh.js';

const texLoader = new THREE.TextureLoader();
function groundTex(name, repeat, normal = false) {
  const t = texLoader.load(`assets/ground/${name}_${normal ? 'nor.webp' : 'diff.webp'}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8; t.colorSpace = normal ? THREE.NoColorSpace : THREE.SRGBColorSpace; return t;
}
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
}
function speckle(g, w, h, base, amp) {
  const img = g.createImageData(w, h), d = img.data, c = new THREE.Color(base);
  for (let i = 0; i < w * h; i++) { const n = (Math.random() - 0.5) * amp; d[i * 4] = c.r * 255 + n; d[i * 4 + 1] = c.g * 255 + n; d[i * 4 + 2] = c.b * 255 + n; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
}

let M = null;
const NIGHT = { value: 0 }; // shared uniform: 0 day .. 1 night
export function setNight(k) { NIGHT.value = k; }
function nightEmissive(m, color, strength) {
  m.emissive = new THREE.Color(color); m.emissiveIntensity = 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance = emissive * ${strength.toFixed(2)} * uNight;`);
  };
  m.customProgramCacheKey = () => 'night' + strength + color;
  return m;
}
function mats() {
  if (M) return M;
  M = {
    concrete: new THREE.MeshStandardMaterial({ map: groundTex('concrete_floor_02', 20), normalMap: groundTex('concrete_floor_02', 20, true), roughness: 0.9, color: 0xdedad2 }),
    gravel: new THREE.MeshStandardMaterial({ map: groundTex('gravel_ground_01', 1), normalMap: groundTex('gravel_ground_01', 1, true), roughness: 1, color: 0xcfc8bd }),
    steelRed: new THREE.MeshStandardMaterial({ color: 0x9c2b1c, roughness: 0.55, metalness: 0.5 }),
    steelGrey: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.5, metalness: 0.7 }),
    white: mat('paint', 0xf0f0ec), dark: mat('dark', 0x2a2a2a), panelGrey: mat('paint', 0xcfd0d2),
    tank: new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.35, metalness: 0.2 }),
    fence: new THREE.MeshStandardMaterial({ color: 0x9a9fa4, roughness: 0.6, metalness: 0.6, transparent: true, opacity: 0.55, depthWrite: false }),
  };
  // road ribbon: asphalt with a dashed yellow centre line and white edges (u across, v along)
  const road = canvasTex(128, 512, (g, w, h) => {
    speckle(g, w, h, 0x3b3c3e, 28);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 30, 4 + Math.random() * 60); }
    g.fillStyle = '#e8e6de'; g.fillRect(6, 0, 4, h); g.fillRect(w - 10, 0, 4, h);
    g.fillStyle = '#d8b030'; for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 2, y, 4, 70);
  });
  M.road = new THREE.MeshStandardMaterial({ map: road, roughness: 0.92 });
  const crawler = canvasTex(256, 256, (g, w, h) => { speckle(g, w, h, 0xbdb7aa, 70); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${90 + Math.random() * 80},${85 + Math.random() * 70},${70 + Math.random() * 60},0.8)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 0, 7); g.fill(); } });
  M.crawler = new THREE.MeshStandardMaterial({ map: crawler, roughness: 1 });
  const lot = canvasTex(256, 256, (g, w, h) => { speckle(g, w, h, 0x444547, 26); g.fillStyle = '#dcdcd4'; for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h * 0.42), g.fillRect(x, h * 0.58, 3, h * 0.42); });
  M.lot = new THREE.MeshStandardMaterial({ map: lot, roughness: 0.95 });
  const runway = canvasTex(256, 1024, (g, w, h) => {
    speckle(g, w, h, 0x7d7b76, 30);
    g.fillStyle = '#f2f2ee'; g.fillRect(8, 0, 6, h); g.fillRect(w - 14, 0, 6, h);
    for (let y = 0; y < h; y += 96) g.fillRect(w / 2 - 3, y, 6, 50);
  });
  M.runway = new THREE.MeshStandardMaterial({ map: runway, roughness: 0.9 });
  // office facade: window bands that light up at night
  const facade = canvasTex(512, 256, (g, w, h) => {
    speckle(g, w, h, 0xe8e7e2, 10);
    for (let y = 24; y < h; y += 64) for (let x = 8; x < w; x += 32) { g.fillStyle = '#20303c'; g.fillRect(x, y, 24, 30); }
  });
  const facadeGlow = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let y = 24; y < h; y += 64) for (let x = 8; x < w; x += 32) if (Math.random() < 0.55) { const warm = Math.random() < 0.7; g.fillStyle = warm ? '#ffd9a0' : '#d8ecff'; g.fillRect(x, y, 24, 30); }
  });
  M.office = nightEmissive(new THREE.MeshStandardMaterial({ map: facade, roughness: 0.6 }), 0xffffff, 1.4);
  M.office.emissiveMap = facadeGlow;
  // VAB facade: ribbed white panels
  const vab = canvasTex(1024, 1024, (g) => {
    g.fillStyle = '#e8e8e4'; g.fillRect(0, 0, 1024, 1024);
    for (let x = 0; x < 1024; x += 16) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x, 0, 3, 1024); }
    for (let y = 0; y < 1024; y += 64) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, 1024, 2); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(90,80,60,${Math.random() * 0.05})`; g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 20 + Math.random() * 60); }
  });
  M.vab = new THREE.MeshStandardMaterial({ map: vab, roughness: 0.75 });
  const logo = canvasTex(1024, 512, (g2) => {
    g2.fillStyle = '#12306b'; g2.beginPath(); g2.ellipse(260, 256, 220, 220, 0, 0, Math.PI * 2); g2.fill();
    g2.strokeStyle = '#d02020'; g2.lineWidth = 34; g2.beginPath(); g2.ellipse(260, 256, 190, 70, -0.5, 0, Math.PI * 2); g2.stroke();
    g2.fillStyle = '#fff'; g2.font = 'bold 150px Arial'; g2.fillText('BSP', 120, 310);
    for (let i = 0; i < 40; i++) { g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(80 + Math.random() * 360, 60 + Math.random() * 390, 3, 0, 7); g2.fill(); }
    g2.fillStyle = '#1a1a1a'; g2.font = 'bold 120px Arial'; g2.fillText('BEAN SPACE', 520, 230); g2.font = 'bold 96px Arial'; g2.fillText('CENTRE', 540, 340);
  });
  M.logo = new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4 });
  M.lampHead = nightEmissive(new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4 }), 0xffe2b0, 30);
  M.floodHead = nightEmissive(new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 }), 0xf4f6ff, 60);
  M.beacon = nightEmissive(new THREE.MeshStandardMaterial({ color: 0x551111, roughness: 0.4 }), 0xff2010, 40);
  return M;
}

const _m4 = new THREE.Matrix4();
function box(g, w, h, d, m, x, y, z, ry = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; }
function cyl(g, r1, r2, h, m, x, y, z, seg = 24) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y, z); g.add(o); return o; }
// flat ribbon between two points with UVs running along its length (texture repeats every `rep` m)
function ribbon(g, x1, z1, x2, z2, w, m, y = 0.12, rep = 40) {
  const L = Math.hypot(x2 - x1, z2 - z1); const geo = new THREE.BoxGeometry(w, 0.24, L);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * L / rep);
  const o = new THREE.Mesh(geo, m); o.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); o.rotation.y = Math.atan2(x2 - x1, z2 - z1); g.add(o); return o;
}
// Lattice tower from thin beams (merged later)
function lattice(g, w, h, levels, m, ox, oy, oz) {
  const lv = h / levels; const a = new THREE.Vector3(), b = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const beam = (p1, p2, t) => { a.set(...p1); b.set(...p2); const d = b.clone().sub(a); const L = d.length(); const o = new THREE.Mesh(new THREE.BoxGeometry(t, L, t), m); o.position.copy(a).add(b).multiplyScalar(0.5).add(new THREE.Vector3(ox, oy, oz)); o.quaternion.setFromUnitVectors(Y, d.normalize()); g.add(o); };
  const sq = [[-w, -w, w, -w], [w, -w, w, w], [w, w, -w, w], [-w, w, -w, -w]];
  for (let i = 0; i <= levels; i++) {
    const y = i * lv;
    for (const [x1, z1, x2, z2] of sq) beam([x1, y, z1], [x2, y, z2], 0.35);
    if (i < levels) {
      for (const [x, z] of [[-w, -w], [w, -w], [w, w], [-w, w]]) beam([x, y, z], [x, y + lv, z], 0.6);
      for (const [x1, z1, x2, z2] of sq) beam([x1, y, z1], [x2, y + lv, z2], 0.25);
    }
  }
}
const HALOS = []; // [x,y,z,size,r,g,b]
function lamp(g, x, z, h = 12, head = 'lamp') {
  const m = mats(); HALOS.push([x + 0.5, h - 0.3, z, head === 'flood' ? 16 : 9, 1.0, 0.8, 0.55]);
  cyl(g, 0.12, 0.18, h, m.steelGrey, x, h / 2, z, 6);
  box(g, 1.4, 0.25, 0.5, head === 'flood' ? m.floodHead : m.lampHead, x + 0.5, h, z);
}
// Office / technical building with a lit facade
function building(g, x, z, w, h, d, ry = 0) {
  const m = mats(); const o = box(g, w, h, d, m.office, x, h / 2, z, ry);
  const uv = o.geometry.attributes.uv; const n = o.geometry.attributes.normal;
  for (let i = 0; i < uv.count; i++) { const side = Math.abs(n.getX(i)) > 0.5 ? d : w; uv.setXY(i, uv.getX(i) * side / 40, uv.getY(i) * h / 20); }
  box(g, w + 0.6, 0.8, d + 0.6, m.panelGrey, x, h + 0.4, z, ry); // parapet
  box(g, w * 0.2, 2.5, d * 0.2, m.steelGrey, x + w * 0.2, h + 1.6, z, ry); // HVAC
  return o;
}

export const PAD_HEIGHT = 12; // top of the hardstand above local ground (m)

// Footprints to keep free of trees and rocks (local ENU coordinates)
export const SITE_CLEAR = {
  circles: [[0, 0, 330], [-1500, 900, 200], [-1200, 1250, 140], [-2300, 400, 110], [-2600, -700, 170], [-3100, 300, 60], [-1900, -300, 110], [-170, 60, 40], [150, 90, 40], [160, -120, 40], [-600, 600, 130], [-3000, -1200, 150]],
  segments: [],
};
const VAB_POS = [-1500, 900];
export const RUNWAY = { x: -3800, z: 1500, len: 3000, ang: 0.35 }; // site-local centre, length (m), heading from south
const ROADS = [[-1200, 1250, -1500, 1000, 10], [-1500, 1000, -2300, 400, 10], [-2300, 400, -2600, -700, 10], [-2300, 400, -3100, 300, 10], [-1900, -300, -2300, 400, 10],
  [-1200, 1250, -600, 600, 12], [-600, 600, -40, 180, 12], [-1900, -300, -3000, -1200, 10], [-600, 600, -1900, -300, 10]];
for (const [x1, z1, x2, z2, w] of ROADS) SITE_CLEAR.segments.push([x1, z1, x2, z2, w / 2 + 12]);
{ const d = Math.hypot(...VAB_POS); SITE_CLEAR.segments.push([VAB_POS[0] / d * 250, VAB_POS[1] / d * 250, VAB_POS[0], VAB_POS[1], 40]); }
{ const sx = Math.sin(RUNWAY.ang) * RUNWAY.len / 2, sz = Math.cos(RUNWAY.ang) * RUNWAY.len / 2; SITE_CLEAR.segments.push([RUNWAY.x - sx, RUNWAY.z - sz, RUNWAY.x + sx, RUNWAY.z + sz, 80]); }

export function buildSpaceCenter() {
  const m = mats();
  HALOS.length = 0;
  const root = new THREE.Group(); root.name = 'spaceCenter';
  const S = new THREE.Group(); // static parts to be merged
  // ---------------- Launch pad (at origin)
  const oct = new THREE.Mesh(new THREE.CylinderGeometry(95, 125, PAD_HEIGHT, 8), m.concrete); oct.position.y = PAD_HEIGHT / 2 - 0.5; oct.rotation.y = Math.PI / 8; S.add(oct);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(40, PAD_HEIGHT, 180), m.concrete); ramp.position.set(0, PAD_HEIGHT / 2 - 0.5 - 3, 150); ramp.rotation.x = -Math.atan(PAD_HEIGHT / 180); S.add(ramp);
  box(S, 18, 1.2, 150, m.dark, 0, PAD_HEIGHT - 0.4, -60); // flame trench
  box(S, 16, 6, 12, m.steelGrey, 0, PAD_HEIGHT - 3.5, 0); // deflector
  box(S, 24, 3, 24, m.steelGrey, 0, PAD_HEIGHT + 1.5, 0); // launch mount
  for (const [x, z] of [[-9, -9], [9, -9], [9, 9], [-9, 9]]) box(S, 2.2, 5, 2.2, m.steelGrey, x, PAD_HEIGHT + 5.5, z);
  lattice(S, 6, 110, 22, m.steelRed, -30, PAD_HEIGHT, 0); // fixed service structure
  box(S, 13, 0.6, 13, m.steelGrey, -30, PAD_HEIGHT + 110, 0);
  box(S, 20, 3, 3, m.steelRed, -14, PAD_HEIGHT + 70, 0); box(S, 4, 3.2, 3.4, m.white, -4, PAD_HEIGHT + 70, 0); // crew access arm
  for (let i = 0; i < 5; i++) box(S, 12, 1.2, 1.2, m.steelGrey, -18, PAD_HEIGHT + 25 + i * 16, 0);
  box(S, 3, 1.5, 1.5, m.beacon, -30, PAD_HEIGHT + 111.5, 0);
  // lightning masts with catenary wires
  const masts = [[-110, -110], [110, -110], [-110, 110], [110, 110]];
  for (const [x, z] of masts) { cyl(S, 0.8, 1.4, 150, m.steelGrey, x, 75, z, 8); box(S, 1.2, 1.2, 1.2, m.beacon, x, 150.6, z); HALOS.push([x, 150.6, z, 12, 1.0, 0.15, 0.1]); }
  for (let i = 0; i < 4; i++) { const [x1, z1] = masts[i], [x2, z2] = masts[(i + 1) % 4]; const L = Math.hypot(x2 - x1, z2 - z1); const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, L, 4), m.dark); w.position.set((x1 + x2) / 2, 142, (z1 + z2) / 2); w.rotation.set(Math.PI / 2, 0, 0); w.rotation.y = Math.atan2(x2 - x1, z2 - z1); w.rotateX(0); S.add(w); }
  // pad floodlight towers
  for (const [x, z] of [[-150, 0], [150, 0], [0, -150], [0, 170]]) { cyl(S, 0.5, 0.7, 30, m.steelGrey, x, 15, z, 6); for (let k = 0; k < 3; k++) box(S, 1.6, 1.2, 0.6, m.floodHead, x + (k - 1) * 1.8, 30.5, z); HALOS.push([x, 30.5, z, 30, 0.95, 0.97, 1.0]); }
  // sound-suppression water tower
  for (const [x, z] of [[-6, -6], [6, -6], [6, 6], [-6, 6]]) cyl(S, 0.6, 0.8, 60, m.steelGrey, 160 + x, 30, -120 + z, 8);
  const sph = new THREE.Mesh(new THREE.SphereGeometry(12, 32, 20), m.tank); sph.position.set(160, 70, -120); S.add(sph);
  // LOX / LH2 spheres with legs and piping
  for (const [x, z, r] of [[-170, 60, 14], [150, 90, 16]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), m.tank); s.position.set(x, r + 4, z); S.add(s);
    for (let k = 0; k < 8; k++) cyl(S, 0.5, 0.5, r + 4, m.steelGrey, x + Math.cos(k / 8 * 6.283) * r * 0.8, (r + 4) / 2, z + Math.sin(k / 8 * 6.283) * r * 0.8, 6);
    ribbon(S, x, z, 0, 0, 1.2, m.steelGrey, 1.2, 10);
  }
  // perimeter fence
  for (let k = 0; k < 16; k++) { const a1 = k / 16 * Math.PI * 2, a2 = (k + 1) / 16 * Math.PI * 2; const R = 290; const x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R, x2 = Math.cos(a2) * R, z2 = Math.sin(a2) * R; const f = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(x2 - x1, z2 - z1), 3), m.fence); f.position.set((x1 + x2) / 2, 1.5, (z1 + z2) / 2); f.rotation.y = -Math.atan2(z2 - z1, x2 - x1); root.add(f); }
  // ---------------- crawlerway to the VAB (two gravel lanes)
  const VAB = new THREE.Vector3(VAB_POS[0], 0, VAB_POS[1]);
  const dir = VAB.clone().setY(0).normalize();
  for (const off of [-14, 14]) ribbon(S, dir.x * 250 + dir.z * off, dir.z * 250 - dir.x * off, VAB.x + dir.z * off - dir.x * 120, VAB.z - dir.x * off - dir.z * 120, 12, m.crawler, 0.15, 12);
  // ---------------- VAB
  const vab = new THREE.Group(); vab.position.copy(VAB); vab.rotation.y = Math.atan2(dir.x, dir.z); S.add(vab);
  box(vab, 218, 160, 158, m.vab, 0, 80, 0);
  box(vab, 120, 65, 150, m.vab, 169, 32.5, 0);
  for (const s of [-1, 1]) for (const x of [-60, 0, 60]) { box(vab, 40, 139, 1, m.panelGrey, x, 70, s * 79.2); for (let y = 10; y < 139; y += 12) box(vab, 40.5, 0.5, 1.2, m.steelGrey, x, y, s * 79.2); }
  for (const [x, z] of [[-109, -79], [109, -79], [-109, 79], [109, 79]]) box(vab, 1.5, 1.5, 1.5, m.beacon, x, 161, z);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(90, 45), m.logo); banner.position.set(60, 110, 79.8); vab.add(banner);
  const banner2 = banner.clone(); banner2.position.set(-60, 110, -79.8); banner2.rotation.y = Math.PI; vab.add(banner2);
  // ---------------- Mission control (LCC), astronaut complex, R&D, operations
  building(S, -1200, 1250, 110, 22, 55); building(S, -1130, 1250, 50, 10, 40);
  building(S, -2300, 400, 80, 14, 40); building(S, -2255, 405, 30, 20, 30);
  building(S, -1900, -300, 60, 18, 40); building(S, -1840, -290, 40, 26, 30);
  building(S, -600, 600, 120, 16, 70, 0.3); building(S, -3000, -1200, 90, 12, 60, -0.2);
  // ---------------- Tracking station dishes
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, side: THREE.DoubleSide });
  for (const [x, z, s] of [[0, 0, 34], [90, 40, 18], [-70, 60, 18], [40, -80, 12]]) {
    const X = -2600 + x, Z = -700 + z;
    cyl(S, s * 0.2, s * 0.25, s * 0.8, m.white, X, s * 0.4, Z, 12);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(s * 0.6, 32, 10, 0, Math.PI * 2, 0, 0.9), dishMat);
    dish.scale.set(1, 0.45, 1); dish.rotation.x = Math.PI - 0.8; dish.position.set(X, s * 0.95, Z); S.add(dish);
    cyl(S, 0.2, 0.2, s * 0.5, m.steelGrey, X, s * 1.2, Z + s * 0.18, 6);
  }
  // ---------------- Observatory
  cyl(S, 16, 16, 18, m.white, -3100, 9, 300, 32);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(16.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('metal', 0xd8dadd)); dome.position.set(-3100, 18, 300); S.add(dome);
  box(S, 4, 12, 1, m.dark, -3100, 24, 316);
  // ---------------- roads, parking, runway
  for (const [x1, z1, x2, z2, w] of ROADS) ribbon(S, x1, z1, x2, z2, w, m.road, 0.12, 40);
  ribbon(S, -1030, 1330, -1170, 1330, 60, m.lot, 0.14, 50); ribbon(S, -2360, 470, -2240, 470, 40, m.lot, 0.14, 50);
  const rw = new THREE.Mesh(new THREE.BoxGeometry(60, 0.3, RUNWAY.len), m.runway); rw.position.set(RUNWAY.x, 0.16, RUNWAY.z); rw.rotation.y = RUNWAY.ang;
  { const uv = rw.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 12); }
  S.add(rw);
  // street lamps along the main roads
  const lampRow = (x1, z1, x2, z2, every = 60) => { const L = Math.hypot(x2 - x1, z2 - z1); const n = Math.floor(L / every); for (let i = 0; i <= n; i++) { const t = i / Math.max(1, n); const nx = -(z2 - z1) / L, nz = (x2 - x1) / L; lamp(S, x1 + (x2 - x1) * t + nx * 9, z1 + (z2 - z1) * t + nz * 9); } };
  lampRow(-1200, 1250, -600, 600); lampRow(-600, 600, -40, 180); lampRow(-1200, 1250, -1500, 1000); lampRow(-1500, 1000, -2300, 400); lampRow(-1900, -300, -2300, 400);
  for (let i = 0; i < 6; i++) lamp(S, -1060 - i * 20, 1300); for (let i = 0; i < 4; i++) lamp(S, -2340 + i * 30, 500);
  // ---------------- merge everything static by material
  root.add(mergeByMaterial(S));
  root.add(makeHalos(HALOS));
  root.traverse(o => { if (o.isMesh) { o.castShadow = o.material !== m.fence; o.receiveShadow = true; } });
  root.userData.vabPos = VAB;
  return root;
}

// Night glow around lamps: additive camera-facing sprites sized in metres
function makeHalos(list) {
  const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3), size = new Float32Array(list.length);
  list.forEach(([x, y, z, sz, r, g, b], i) => { pos.set([x, y, z], i * 3); col.set([r, g, b], i * 3); size[i] = sz; });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: NIGHT, uScale: { value: 900 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * uScale / -mv.z, 2.0, 160.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uNight; varying vec3 vC;
      void main(){
      #include <logdepthbuf_fragment>
      vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = (exp(-r * r * 6.0) + 0.6 * exp(-r * 18.0)) * (1.0 - smoothstep(0.55, 1.0, r)); // exactly zero at the sprite edge
      gl_FragColor = vec4(vC * a * uNight * 6.0, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 4; pts.name = 'halos';
  return pts;
}
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(_m4.multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
  });
  const out = new THREE.Group(); out.name = 'static';
  for (const [material, geos] of buckets) {
    const g = mergeGeometries(geos, false); if (!g) continue;
    g.computeBoundingSphere();
    out.add(new THREE.Mesh(g, material));
  }
  return out;
}

// ---------------------------------------------------------------- career starter site
// "Bean Field": a gravel launch mound with a short service tower, an arched tin hangar, portakabin
// offices, a caravan for the crew, a second-hand tracking dish and a garden-shed observatory, all
// within a few hundred metres of the pad (same pad height and launch mount as Pad 39B, so launch
// physics are identical).
export const STARTER_SPOTS = { pad: [0, 40, 0], rnd: [-22, 10, 180], vab: [-170, 26, 120], mission: [-115, 12, 215], astronauts: [-215, 8, 205], tracking: [-80, 18, 290], observatory: [-270, 14, 280] };
export const FULL_SPOTS = { pad: [0, 60, 0], vab: [-1500, 90, 900], mission: [-1200, 20, 1250], rnd: [-1900, 32, -300], astronauts: [-2300, 20, 400], tracking: [-2600, 40, -700], observatory: [-3100, 30, 300] };
export const PAD_RADIUS = [30, 100]; // hardstand radius per facility level (contact physics)
let STARTER_M = null;
function starterMats() {
  if (STARTER_M) return STARTER_M;
  const tin = canvasTex(256, 256, (g, w, h) => {
    for (let x = 0; x < w; x += 8) { const k = 0.5 + 0.5 * Math.sin(x / 8 * Math.PI); g.fillStyle = `rgb(${120 + k * 40},${124 + k * 40},${126 + k * 38})`; g.fillRect(x, 0, 8, h); }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${110 + Math.random() * 40},${60 + Math.random() * 30},20,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 6 + Math.random() * 40); } // rust streaks
  });
  const sign = canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#f2ecd8'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a2a18'; g.font = 'bold 72px Arial'; g.fillText('BEAN FIELD', 40, 88); g.fillStyle = '#2a5a2a'; g.font = 'bold 22px Arial'; g.fillText('LAUNCH SITE · EST. YESTERDAY', 60, 118); });
  const cabin = canvasTex(256, 128, (g, w, h) => { speckle(g, w, h, 0xe6e2d6, 12); g.fillStyle = '#2a3a48'; for (let x = 20; x < w; x += 70) g.fillRect(x, 36, 44, 36); g.fillStyle = '#3a6ea8'; g.fillRect(0, h - 18, w, 6); });
  STARTER_M = {
    tin: new THREE.MeshStandardMaterial({ map: tin, roughness: 0.55, metalness: 0.65, side: THREE.DoubleSide }),
    sign: new THREE.MeshStandardMaterial({ map: sign, roughness: 0.8 }),
    cabin: new THREE.MeshStandardMaterial({ map: cabin, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 }),
    tarmac: new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.95 }),
    sock: new THREE.MeshStandardMaterial({ color: 0xff6a10, roughness: 0.8, side: THREE.DoubleSide }),
  };
  return STARTER_M;
}
export function buildStarterSite() {
  const m = mats(), s = starterMats();
  HALOS.length = 0;
  const root = new THREE.Group(); root.name = 'starterSite';
  const S = new THREE.Group();
  // launch mound: gravel apron, concrete top, ramp to the south-west
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(26, 34, PAD_HEIGHT, 8), m.gravel); mound.position.y = PAD_HEIGHT / 2 - 0.5; mound.rotation.y = Math.PI / 8; S.add(mound);
  cyl(S, 22, 22, 0.4, m.concrete, 0, PAD_HEIGHT - 0.3, 0, 8);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(12, PAD_HEIGHT, 70), m.gravel); ramp.position.set(-8, PAD_HEIGHT / 2 - 3.5, 58); ramp.rotation.x = -Math.atan(PAD_HEIGHT / 70); S.add(ramp);
  box(S, 24, 3, 24, m.steelGrey, 0, PAD_HEIGHT + 1.5, 0); // launch mount (same as the big pad)
  box(S, 8, 1.2, 30, m.dark, 0, PAD_HEIGHT - 0.2, -24); // flame trench
  for (const [x, z] of [[-9, -9], [9, -9], [9, 9], [-9, 9]]) box(S, 1.6, 4, 1.6, m.steelGrey, x, PAD_HEIGHT + 5, z);
  lattice(S, 2.2, 42, 10, m.steelRed, -17, PAD_HEIGHT, 0);
  box(S, 5, 0.4, 5, m.steelGrey, -17, PAD_HEIGHT + 42, 0); box(S, 9, 1.2, 1.2, m.steelRed, -11.5, PAD_HEIGHT + 30, 0);
  box(S, 1.2, 1.2, 1.2, m.beacon, -17, PAD_HEIGHT + 43, 0); HALOS.push([-17, PAD_HEIGHT + 43, 0, 6, 1, 0.15, 0.1]);
  // fuel bowsers parked by the mound
  for (const [x, z] of [[34, 18], [36, 32]]) { box(S, 3, 2.2, 3, m.white, x, 1.4, z - 6.5); const t = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 9, 16), m.tank); t.rotation.x = Math.PI / 2; t.position.set(x, 2.2, z + 1); S.add(t); box(S, 2.4, 0.6, 12, m.dark, x, 0.6, z - 1); }
  // floodlight poles and a chain-link fence
  for (const [x, z] of [[-40, -30], [40, -30], [-40, 40]]) { cyl(S, 0.25, 0.35, 18, m.steelGrey, x, 9, z, 6); box(S, 2.4, 0.9, 0.5, m.floodHead, x, 18, z); HALOS.push([x, 18, z, 10, 1, 0.9, 0.7]); }
  for (let k = 0; k < 12; k++) { const a1 = k / 12 * Math.PI * 2, a2 = (k + 1) / 12 * Math.PI * 2, R = 62; if (k === 3) continue; const x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R, x2 = Math.cos(a2) * R, z2 = Math.sin(a2) * R;
    const L = Math.hypot(x2 - x1, z2 - z1); const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.4, L), m.fence); f.position.set((x1 + x2) / 2, 1.2, (z1 + z2) / 2); f.rotation.y = Math.atan2(x2 - x1, z2 - z1); S.add(f); cyl(S, 0.06, 0.06, 2.6, m.steelGrey, x1, 1.3, z1, 5); }
  // mown grass airstrip where the big runway will one day be, with a windsock
  { const strip = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, RUNWAY.len), new THREE.MeshStandardMaterial({ color: 0x7d8a52, roughness: 1 })); strip.position.set(RUNWAY.x, 0.12, RUNWAY.z); strip.rotation.y = RUNWAY.ang; S.add(strip);
    const dx = Math.sin(RUNWAY.ang), dz = Math.cos(RUNWAY.ang);
    for (let k = -14; k <= 14; k++) for (const sd of [-1, 1]) box(S, 1.2, 0.35, 3, m.white, RUNWAY.x + dx * k * 100 + dz * sd * 21, 0.2, RUNWAY.z + dz * k * 100 - dx * sd * 21, RUNWAY.ang);
    cyl(S, 0.08, 0.1, 6, m.steelGrey, RUNWAY.x + dz * 40, 3, RUNWAY.z - dx * 40, 6); }
  // arched tin hangar (the "VAB")
  const hx = -170, hz = 120;
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 44, 32, 1, true, 0, Math.PI), s.tin); arch.rotation.z = Math.PI / 2; arch.rotation.y = 0.2; arch.position.set(hx, 0, hz); S.add(arch);
  for (const e of [-1, 1]) { const end = new THREE.Mesh(new THREE.CircleGeometry(16, 32, 0, Math.PI), s.tin); end.position.set(hx + e * 22 * Math.cos(0.2), 0, hz - e * 22 * Math.sin(0.2)); end.rotation.y = 0.2 + Math.PI / 2; S.add(end); }
  box(S, 0.6, 11, 16, m.dark, hx + 22.3 * Math.cos(0.2), 5.5, hz - 22.3 * Math.sin(0.2), 0.2); // big doors
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), s.sign); signM.position.set(hx + 22.6 * Math.cos(0.2), 13, hz - 22.6 * Math.sin(0.2)); signM.rotation.y = 0.2 + Math.PI / 2; S.add(signM);
  // portakabin mission control (two stacked cabins + antenna mast), crew caravan
  const cab = (x, z, y, ry) => { const c = box(S, 12, 3.2, 3.6, s.cabin, x, y + 1.6, z, ry); return c; };
  cab(-115, 215, 0, 0.1); cab(-115, 215, 3.2, 0.1); box(S, 1, 0.3, 3, m.steelGrey, -121, 3.2, 215, 0.1);
  cab(-25, 180, 0, -0.35); box(S, 4, 2.4, 4, s.wood, -14, 1.2, 176, -0.35); // R&D: a cabin and a shed
  cyl(S, 0.12, 0.12, 14, m.steelGrey, -106, 7, 214, 5); box(S, 3, 0.1, 0.1, m.steelGrey, -106, 13.5, 214);
  box(S, 8, 2.8, 2.6, m.white, -215, 1.9, 205, 0.5); box(S, 8.05, 0.4, 2.65, m.steelRed, -215, 2.2, 205, 0.5); box(S, 6, 0.9, 2.3, m.dark, -215, 0.45, 205, 0.5); // crew caravan
  // second-hand tracking dish
  { const X = -80, Z = 290, sz = 10; cyl(S, 1.2, 1.6, 7, m.white, X, 3.5, Z, 10);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(sz * 0.6, 24, 8, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, side: THREE.DoubleSide }));
    dish.scale.set(1, 0.45, 1); dish.rotation.x = Math.PI - 0.8; dish.position.set(X, 9, Z); S.add(dish); }
  // garden-shed observatory
  box(S, 7, 4, 7, s.wood, -270, 2, 280); const dome = new THREE.Mesh(new THREE.SphereGeometry(3.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('metal', 0xd0d2d6)); dome.position.set(-270, 4, 280); S.add(dome);
  // farm water tower, windsock, site sign, tracks
  for (const [dx, dz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) cyl(S, 0.2, 0.2, 14, s.wood, -60 + dx, 7, 150 + dz, 5);
  cyl(S, 3.5, 3.5, 5, m.tank, -60, 16.5, 150, 16);
  cyl(S, 0.08, 0.08, 9, m.steelGrey, 50, 4.5, -50, 5); { const sock = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 12, 1, true), s.sock); sock.rotation.z = Math.PI / 2; sock.position.set(51.5, 8.6, -50); S.add(sock); }
  box(S, 0.3, 4, 0.3, s.wood, -40, 2, 105); box(S, 0.3, 4, 0.3, s.wood, -26, 2, 105); const sg = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), s.sign); sg.position.set(-33, 4.5, 105.2); S.add(sg);
  for (const [x1, z1, x2, z2] of [[-8, 95, -150, 140], [-150, 140, -115, 205], [-115, 205, -215, 205], [-115, 205, -80, 285], [-215, 205, -270, 275]]) ribbon(S, x1, z1, x2, z2, 7, m.crawler, 0.12, 12);
  lamp(S, -130, 190, 8); lamp(S, -200, 190, 8);
  root.add(mergeByMaterial(S));
  root.add(makeHalos(HALOS));
  root.traverse(o => { if (o.isMesh) { o.castShadow = o.material !== m.fence; o.receiveShadow = true; } });
  return root;
}
// the launch site model for a facility level (cached; 0 = starter site, 1 = full space centre)
const SITES = {};
export function siteModel(level) { return SITES[level] || (SITES[level] = level === 0 ? buildStarterSite() : buildSpaceCenter()); }

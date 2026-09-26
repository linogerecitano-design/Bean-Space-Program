// Procedural 3D models for every part. Convention: part top at y=0, body extends to y=-h.
// Radial parts: attach point at origin, extending along +X.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- generated textures
function canvasTex(w, h, draw, srgb = true, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
}
function noiseFill(g, w, h, base, amp, blotch = 0) {
  const img = g.createImageData(w, h); const d = img.data;
  const c = new THREE.Color(base);
  for (let i = 0; i < w * h; i++) { const n = (Math.random() - 0.5) * amp; d[i * 4] = Math.max(0, Math.min(255, c.r * 255 + n)); d[i * 4 + 1] = Math.max(0, Math.min(255, c.g * 255 + n)); d[i * 4 + 2] = Math.max(0, Math.min(255, c.b * 255 + n)); d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < blotch; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, Math.random() * w * 0.2, Math.random() * h * 0.1, 0, 0, Math.PI * 2); g.fill(); }
}
const TEX = {};
function tex(name) {
  if (TEX[name]) return TEX[name];
  let t;
  switch (name) {
    case 'panel': t = canvasTex(512, 512, (g, w, h) => { noiseFill(g, w, h, 0xffffff, 10, 30); g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; for (let x = 0; x < w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 170) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < w; x += 128) for (let y = 0; y < h; y += 16) g.fillRect(x + 4, y, 2, 2); }); break;
    case 'foam': t = canvasTex(512, 512, (g, w, h) => { noiseFill(g, w, h, 0xffffff, 60, 80); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(80,30,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6); } g.strokeStyle = 'rgba(60,20,0,0.25)'; for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }); break;
    case 'steel': t = canvasTex(512, 512, (g, w, h) => { noiseFill(g, w, h, 0xffffff, 18); g.globalAlpha = 0.08; for (let y = 0; y < h; y++) { g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; g.fillRect(0, y, w, 1); } g.globalAlpha = 1; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; for (let y = 0; y < h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      // heat-shield tiles on one half
      g.fillStyle = '#1b1b1d'; g.fillRect(0, 0, w / 2, h); g.strokeStyle = 'rgba(80,80,85,0.9)'; g.lineWidth = 1.5; const s = 16;
      for (let y = 0; y < h + s; y += s * 0.86) for (let x = ((y / (s * 0.86)) % 2) * s / 2; x < w / 2; x += s) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; g.lineTo(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55); } g.closePath(); g.stroke(); }
    }); break;
    case 'carbon': t = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, 0x303030, 14); g.strokeStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); } }); break;
    case 'mli': t = canvasTex(512, 512, (g, w, h) => { noiseFill(g, w, h, 0xd4a64a, 40); for (let i = 0; i < 300; i++) { const x = Math.random() * w, y = Math.random() * h; const gr = g.createLinearGradient(x, y, x + 40, y + 30); gr.addColorStop(0, 'rgba(255,240,180,0.35)'); gr.addColorStop(1, 'rgba(90,60,10,0.35)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + Math.random() * 40, y + Math.random() * 30); g.lineTo(x + Math.random() * 30, y + 20 + Math.random() * 40); g.fill(); } }); break;
    case 'solar': t = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#0b1636'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { const gr = g.createLinearGradient(x, y, x + 32, y + 32); gr.addColorStop(0, '#1b2f6e'); gr.addColorStop(1, '#0a1433'); g.fillStyle = gr; g.fillRect(x + 1, y + 1, 30, 30); } g.strokeStyle = 'rgba(200,200,220,0.35)'; for (let y = 0; y < h; y += 256) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }); break;
    case 'nozzle': t = canvasTex(64, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6b4a33'); gr.addColorStop(0.3, '#3a2c24'); gr.addColorStop(1, '#1b1714'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.35)'; for (let x = 0; x < w; x += 2) g.fillRect(x, 0, 1, h); }); break;
    case 'tile': t = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, 0x141414, 20); g.strokeStyle = 'rgba(90,90,90,0.8)'; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }); break;
    case 'ablator': t = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, 0x6b5a45, 50, 40); g.strokeStyle = 'rgba(30,20,10,0.4)'; for (let i = 0; i < w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } }); break;
    case 'logo': t = canvasTex(512, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#12306b'; g.beginPath(); g.ellipse(w * 0.2, h / 2, h * 0.38, h * 0.38, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#d02020'; g.lineWidth = 10; g.beginPath(); g.ellipse(w * 0.2, h / 2, h * 0.3, h * 0.12, -0.5, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 44px Arial'; g.fillText('BSP', w * 0.2 - 44, h / 2 + 16); g.fillStyle = '#1a1a1a'; g.font = 'bold 72px Arial'; g.fillText('BEAN', w * 0.42, h / 2 - 4); g.font = '36px Arial'; g.fillText('SPACE PROGRAM', w * 0.42, h / 2 + 44); }); break;
    case 'fabric': t = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, 0xe9e5dc, 16); g.strokeStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i < w; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); } }); break;
  }
  TEX[name] = t; return t;
}
const MAT = {};
export function mat(name, color) {
  const key = name + ':' + (color ?? '');
  if (MAT[key]) return MAT[key];
  let m;
  switch (name) {
    case 'paint': m = new THREE.MeshStandardMaterial({ color: color ?? 0xf2f2f2, map: tex('panel'), roughness: 0.5, metalness: 0.05 }); break;
    case 'foam': m = new THREE.MeshStandardMaterial({ color: color ?? 0xc86a26, map: tex('foam'), roughness: 0.9 }); break;
    case 'steel': m = new THREE.MeshStandardMaterial({ color: 0xd8dadd, map: tex('steel'), roughness: 0.3, metalness: 0.9 }); break;
    case 'carbon': m = new THREE.MeshStandardMaterial({ color: color ?? 0x2a2a2a, map: tex('carbon'), roughness: 0.55, metalness: 0.2 }); break;
    case 'metal': m = new THREE.MeshStandardMaterial({ color: color ?? 0x888a8c, roughness: 0.35, metalness: 0.85 }); break;
    case 'dark': m = new THREE.MeshStandardMaterial({ color: color ?? 0x2a2a2a, roughness: 0.6, metalness: 0.5 }); break;
    case 'nozzle': m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex('nozzle'), roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide }); break;
    case 'niobium': m = new THREE.MeshStandardMaterial({ color: 0x5a5f6a, roughness: 0.3, metalness: 1.0, side: THREE.DoubleSide }); break;
    case 'mli': m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex('mli'), roughness: 0.25, metalness: 0.9 }); break;
    case 'mliSilver': m = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, map: tex('mli'), roughness: 0.25, metalness: 0.95 }); m.map = tex('mli'); m.color.set(0xb8bcc4); break;
    case 'solar': m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex('solar'), roughness: 0.2, metalness: 0.6, side: THREE.DoubleSide }); break;
    case 'glass': m = new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.9 }); break;
    case 'tile': m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex('tile'), roughness: 0.8 }); break;
    case 'ablator': m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex('ablator'), roughness: 0.95 }); break;
    case 'fabric': m = new THREE.MeshStandardMaterial({ color: color ?? 0xffffff, map: tex('fabric'), roughness: 0.95, side: THREE.DoubleSide }); break;
    case 'emissive': m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color ?? 0x88ccff, emissiveIntensity: 4 }); break;
    case 'logo': m = new THREE.MeshStandardMaterial({ map: tex('logo'), transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); break;
    case 'plain': default: m = new THREE.MeshStandardMaterial({ color: color ?? 0xcccccc, roughness: 0.5, metalness: 0.2 });
  }
  MAT[key] = m; return m;
}
function tankMaterial(p) {
  const pt = p.mesh.prop || p.prop?.type; const c = p.mesh.color;
  if (/Starship|starship/.test(p.id + p.name) || c === 0xbfc2c4) return mat('steel');
  if (c === 0xc86a26) return mat('foam', 0xc86a26);
  if (c === 0x1a1a1a || c === 0x1b1b1b || c === 0x2d2f33) return mat('carbon', c);
  if (pt === 'hydrolox' && c === 0xd87a2a) return mat('foam', c);
  return mat('paint', c ?? 0xf2f2f2);
}

// ---------------------------------------------------------------- geometry helpers
const SEG = 48;
const cyl = (rTop, rBot, h, seg = SEG, open = false) => { const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open); g.translate(0, -h / 2, 0); return g; };
function lathe(points, seg = SEG) { // points [ [r, y], ... ] top to bottom
  // LatheGeometry winds its faces outward only for profiles running bottom to top: fed top to bottom
  // (as every builder here does) capsules, nose cones and fairings rendered inside out
  const pts = points.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  if (pts.length > 1 && pts[0].y > pts[pts.length - 1].y) pts.reverse();
  const g = new THREE.LatheGeometry(pts, seg); return g;
}
function add(group, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
}
function bell(throat, exit, len, chamberR, chamberLen) {
  const pts = [[chamberR * 0.9, 0], [chamberR, -chamberLen * 0.2], [chamberR, -chamberLen * 0.8], [throat, -chamberLen]];
  for (let i = 1; i <= 16; i++) { const t = i / 16; const r = throat + (exit - throat) * (1 - Math.pow(1 - t, 1.9)); pts.push([r, -chamberLen - len * t]); }
  return lathe(pts, 40);
}

// ---------------------------------------------------------------- builders
export function buildPartMesh(p) {
  const g = new THREE.Group(); g.name = p.id;
  const m = p.mesh || {}; const r = (p.d || 1) / 2, r2 = ((p.d2 ?? p.d) || 1) / 2, h = p.h || 1;
  switch (m.t) {
    case 'tank': {
      const M = tankMaterial(p);
      add(g, cyl(r, r, h), M);
      // ring stringers at the ends
      // end rings are open tubes slightly proud of the skin (log depth can't polygon-offset)
      const rh = Math.min(0.15, h * 0.05), rr = r * 1.012 + 0.004;
      add(g, cyl(rr, rr, rh, SEG, true), mat('metal', 0x9a9a9a), 0, -0.002);
      add(g, cyl(rr, rr, rh, SEG, true), mat('metal', 0x9a9a9a), 0, -h + rh + 0.002);
      if (h > 3 && M !== mat('steel')) { const logo = new THREE.CylinderGeometry(r * 1.004 + 0.006, r * 1.004 + 0.006, r * 0.8, 24, 1, true, -0.55, 1.1); logo.translate(0, 0, 0); add(g, logo, mat('logo'), 0, -h * 0.35, 0); }
      if (h > 6 && r > 1) add(g, new THREE.BoxGeometry(0.25, h * 0.9, 0.25), mat('paint', 0xdddddd), r + 0.1, -h * 0.5, 0); // cable raceway
      break;
    }
    case 'spheretank': add(g, new THREE.SphereGeometry(r, 32, 24).translate(0, -h / 2, 0), mat('metal', m.color)); add(g, cyl(r * 0.7, r * 0.7, 0.05), mat('dark')); break;
    case 'multitank': for (let i = 0; i < 4; i++) add(g, new THREE.SphereGeometry(r * 0.42, 24, 16), mat('metal', m.color), Math.cos(i * Math.PI / 2) * r * 0.5, -h / 2, Math.sin(i * Math.PI / 2) * r * 0.5); add(g, cyl(r, r, 0.1), mat('dark')); add(g, cyl(r, r, 0.1), mat('dark'), 0, -h + 0.1); break;
    case 'radialtank': add(g, new THREE.CapsuleGeometry(r, h - 2 * r, 8, 20), mat('metal', m.color), r, 0, 0); break;
    case 'trap': add(g, cyl(r, r, h), mat('dark', 0x2b2f44)); for (let i = 0; i < 5; i++) add(g, new THREE.TorusGeometry(r * 1.02, 0.06, 8, 40).rotateX(Math.PI / 2), mat('metal', 0xb87333), 0, -h * (i + 0.5) / 5); add(g, cyl(r * 0.2, r * 0.2, h * 1.02), mat('emissive', 0x9955ff)); break;
    case 'engine': {
      const nz = m.nozzles || 1, noz = m.noz || 1;
      const plate = cyl(r, r * 0.95, Math.min(0.4, h * 0.15));
      add(g, plate, mat('dark', 0x333333));
      const vac = noz > r * 1.3 || /Vac|vacuum|Upper|Extended/i.test(p.name);
      const count = nz;
      const positions = [];
      if (count === 1) positions.push([0, 0]);
      else if (count <= 4) for (let i = 0; i < count; i++) positions.push([Math.cos(i / count * Math.PI * 2 + Math.PI / 4) * r * 0.5, Math.sin(i / count * Math.PI * 2 + Math.PI / 4) * r * 0.5]);
      else if (count === 9) { positions.push([0, 0]); for (let i = 0; i < 8; i++) positions.push([Math.cos(i / 8 * Math.PI * 2) * r * 0.66, Math.sin(i / 8 * Math.PI * 2) * r * 0.66]); }
      else { const rings = count >= 30 ? [[3, 0.15], [10, 0.5], [20, 0.85]] : [[1, 0], [count - 1, 0.66]]; for (const [n, rr] of rings) for (let i = 0; i < n; i++) positions.push(n === 1 ? [0, 0] : [Math.cos(i / n * Math.PI * 2) * r * rr, Math.sin(i / n * Math.PI * 2) * r * rr]); }
      const nr = count === 1 ? noz / 2 : Math.min(noz / 2, r / Math.sqrt(count) * 0.95);
      const len = (h - 0.4) * (vac ? 0.8 : 0.6);
      const bellGeo = bell(nr * 0.28, nr, len, nr * 0.42, Math.max(0.2, (h - 0.4) * 0.3));
      const chamber = cyl(nr * 0.35, nr * 0.35, 0.3);
      for (const [x, z] of positions) {
        const b = add(g, bellGeo, vac ? mat('niobium') : mat('nozzle'), x, -Math.min(0.4, h * 0.15), z);
        if (count <= 9) { add(g, new THREE.BoxGeometry(nr * 0.5, nr * 0.6, nr * 0.4), mat('metal', 0x9c9c9c), x + nr * 0.5, -0.3 - nr * 0.3, z); add(g, new THREE.TorusGeometry(nr * 0.3, nr * 0.05, 6, 16), mat('metal', 0xc0a060), x, -0.35, z); }
      }
      if (count === 1 && !vac) add(g, cyl(nr * 0.05, nr * 0.05, h * 0.3), mat('metal', 0xb8b8b8), nr * 0.6, -0.2, nr * 0.3);
      g.userData.nozzleExit = -h; g.userData.nozzles = positions.map(([x, z]) => [x, z, nr]);
      break;
    }
    case 'srb': {
      add(g, cyl(r, r, h * 0.92), mat('paint', m.color ?? 0xeeeeee));
      for (let i = 1; i < 5; i++) add(g, cyl(r * 1.015 + 0.004, r * 1.015 + 0.004, 0.2, SEG, true), mat('paint', 0xdddddd), 0, -h * 0.92 * i / 5);
      add(g, lathe([[r, -h * 0.92], [r * 0.9, -h * 0.95], [r * 0.45, -h * 0.96], [r * 0.6, -h]], 32), mat('nozzle'));
      g.userData.nozzles = [[0, 0, r * 0.6]];
      break;
    }
    case 'pod': buildPod(g, p, m.style); break;
    case 'nose': add(g, lathe(Array.from({ length: 14 }, (_, i) => { const t = i / 13; const y = -h * t; const rr = r2 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - t, 2))); return [rr, y]; })), mat('paint', 0xf0f0f0)); break;
    case 'fairing': {
      const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; const y = -h * t; const rr = t < 0.4 ? r2 * Math.sin(t / 0.4 * Math.PI / 2) : r2; pts.push([rr, y]); }
      add(g, lathe(pts, 48), mat('paint', 0xf4f4f4)); add(g, new THREE.CylinderGeometry(r2 * 1.004 + 0.006, r2 * 1.004 + 0.006, r2 * 0.8, 24, 1, true, -0.55, 1.1), mat('logo'), 0, -h * 0.6, 0);
      break;
    }
    case 'adapter': add(g, cyl(r, r2, h), mat('paint', 0xe8e8e8)); break;
    case 'decoupler': add(g, cyl(r, r, h), mat('dark', 0x3a3a3a)); add(g, cyl(r * 1.02 + 0.004, r * 1.02 + 0.004, h * 0.3, SEG, true), mat('metal', 0xd0b050), 0, -h * 0.35); break;
    case 'interstage': add(g, cyl(r, r, h, 48, true), mat('steel')); for (let i = 0; i < 24; i++) add(g, new THREE.BoxGeometry(0.3, h * 0.6, 0.1), mat('dark', 0x111111), Math.cos(i / 24 * Math.PI * 2) * r * 1.001, -h / 2, Math.sin(i / 24 * Math.PI * 2) * r * 1.001, 0, -i / 24 * Math.PI * 2 + Math.PI / 2); break;
    case 'radialdec': add(g, new THREE.BoxGeometry(0.4, h, 0.3), mat('dark', 0x444444), 0.2, 0, 0); add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8).rotateZ(Math.PI / 2), mat('metal'), 0.45, h * 0.3, 0); break;
    case 'truss': { const n = 4; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.PI / 4; add(g, cyl(0.05 * r, 0.05 * r, h, 6), mat('metal', 0xc8c8c8), Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7); } for (let k = 0; k <= 4; k++) add(g, new THREE.TorusGeometry(r * 0.7, 0.04 * r, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4), mat('metal', 0xc8c8c8), 0, -h * k / 4); break; }
    case 'fin': { const shape = new THREE.Shape(); const L = m.big ? 2.5 : 0.9; shape.moveTo(0, 0); shape.lineTo(L, -h * 0.5); shape.lineTo(L, -h * 0.85); shape.lineTo(0, -h); shape.closePath(); const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }); geo.translate(0, h / 2, -0.03); add(g, geo, mat('paint', m.big ? 0x222222 : 0xf0f0f0)); break; }
    case 'gridfin': { const W = 1.2; add(g, new THREE.BoxGeometry(0.2, 0.2, 0.3), mat('dark'), 0.1, 0, 0); for (let i = 0; i <= 8; i++) { add(g, new THREE.BoxGeometry(0.02, W, 0.25), mat('metal', 0x6a6a6a), 0.2 + i * W / 8, 0, 0); add(g, new THREE.BoxGeometry(W, 0.02, 0.25), mat('metal', 0x6a6a6a), 0.2 + W / 2, -W / 2 + i * W / 8, 0); } break; }
    case 'flap': add(g, new THREE.BoxGeometry(2.5, h, 0.25).translate(1.25, 0, 0), mat('tile')); break;
    case 'rcs': add(g, new THREE.BoxGeometry(0.2, 0.3, 0.3), mat('paint', 0xd0d0d0), 0.1, 0, 0); for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) add(g, new THREE.ConeGeometry(0.04, 0.1, 8).rotateZ(-Math.PI / 2 * dx + (dy < 0 ? Math.PI : 0)).rotateX(dz * Math.PI / 2), mat('dark'), 0.2 + dx * 0.05, dy * 0.15, dz * 0.15); break;
    case 'ring': add(g, cyl(r, r, h), mat(m.color === 0xdedede ? 'paint' : 'metal', m.color)); for (let i = 0; i < 8; i++) add(g, new THREE.BoxGeometry(r * 0.25, h * 0.6, 0.05), mat('dark'), Math.cos(i / 8 * Math.PI * 2) * r, -h / 2, Math.sin(i / 8 * Math.PI * 2) * r, 0, -i / 8 * Math.PI * 2); break;
    case 'octo': add(g, cyl(r, r, h, 8), mat('mli')); add(g, cyl(r * 0.8, r * 0.8, h * 1.05, 8), mat('dark')); break;
    case 'sphere': add(g, new THREE.SphereGeometry(r, 32, 24).translate(0, -h / 2, 0), mat('metal', 0xd8d8d8)); for (let i = 0; i < (m.antennas || 0); i++) add(g, cyl(0.01, 0.01, 2.4, 4).rotateX(-0.6).rotateY(i / m.antennas * Math.PI * 2), mat('metal'), 0, -h / 2, 0); break;
    case 'box': add(g, new THREE.BoxGeometry(m.w || 0.3, h, m.w || 0.3), mat(m.panels ? 'solar' : 'plain', m.color), (m.w || 0.3) / 2 * (p.radial ? 1 : 0), -h / 2 * (p.radial ? 0 : 1), 0); break;
    case 'bus': { add(g, cyl(r, r, h, 10), mat('mli')); const dish = new THREE.SphereGeometry(m.dish / 2, 32, 12, 0, Math.PI * 2, 0, 0.5); dish.scale(1, 0.5, 1); add(g, dish, mat('paint', 0xf0f0f0), 0, m.dish * 0.15, 0, Math.PI); if (m.rtg) add(g, cyl(0.2, 0.2, 1.1, 8).rotateZ(Math.PI / 2), mat('dark'), r + 1.2, -h / 2, 0); add(g, cyl(0.02, 0.02, 6, 4).rotateZ(Math.PI / 2), mat('metal'), -r - 3, -h / 2, 0); break; }
    case 'ion': add(g, cyl(r * 0.8, r, h * 0.4), mat('dark', 0x303030)); add(g, cyl(r * 0.95, r * 0.95, h * 0.1), mat('metal', 0x8080a0), 0, -h * 0.4); add(g, new THREE.CircleGeometry(r * 0.9, 32).rotateX(Math.PI / 2), mat('emissive', 0x4488ff), 0, -h * 0.5 - 0.001); g.userData.nozzles = [[0, 0, r * 0.9]]; break;
    case 'hall': add(g, cyl(r, r, h * 0.5), mat('metal', 0x9a9a9a)); add(g, new THREE.RingGeometry(r * 0.4, r * 0.8, 32).rotateX(Math.PI / 2), mat('emissive', 0x6688ff), 0, -h * 0.5 - 0.001); if (m.panels) for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(12, 0.05, 3), mat('solar'), s * (6 + r), -h * 0.2, 0); g.userData.nozzles = [[0, 0, r * 0.8]]; break;
    case 'vasimr': add(g, cyl(r * 0.6, r * 0.6, h * 0.7), mat('metal', 0xb0b0b0)); for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(r * 0.75, r * 0.12, 8, 24).rotateX(Math.PI / 2), mat('metal', 0xb87333), 0, -h * (0.15 + i * 0.17)); add(g, lathe([[r * 0.3, -h * 0.7], [r, -h]]), mat('niobium')); g.userData.nozzles = [[0, 0, r]]; break;
    case 'ntr': { add(g, cyl(r * 0.8, r * 0.8, h * 0.45), mat('metal', 0x9a9a9a)); add(g, cyl(r * 0.9, r * 0.9, h * 0.1), mat('dark'), 0, -h * 0.05); add(g, new THREE.BoxGeometry(r * 0.3, h * 0.3, r * 0.3), mat('paint', 0xe0c000), r * 0.7, -h * 0.2, 0); const nr = (m.noz || r * 1.2) / 2; add(g, bell(nr * 0.3, nr, h * 0.45, r * 0.6, 0.1), mat('niobium'), 0, -h * 0.45); g.userData.nozzles = [[0, 0, nr]]; break; }
    case 'pusher': { const R = r; add(g, cyl(R, R * 0.95, 1.2), mat('metal', 0x7a7a7a), 0, -h + 1.2); add(g, cyl(R * 0.2, R * 0.2, h - 1.2, 16), mat('metal', 0xaaaaaa)); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, cyl(R * 0.08, R * 0.08, h * 0.6, 12), mat('paint', 0xdddddd), Math.cos(a) * R * 0.45, -h * 0.25, Math.sin(a) * R * 0.45); } add(g, cyl(R * 0.7, R * 0.7, h * 0.15), mat('dark'), 0, 0); g.userData.nozzles = [[0, 0, R]]; g.userData.pulse = true; break; }
    case 'fusion': { const s = m.size || 1, R = r; add(g, new THREE.SphereGeometry(R * 0.45, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(0, -h * 0.55, 0), mat('metal', 0x8a8f96)); for (let i = 0; i < 5; i++) add(g, new THREE.TorusGeometry(R * (0.35 + i * 0.12), R * 0.03, 8, 48).rotateX(Math.PI / 2), mat('metal', 0xb87333), 0, -h * (0.5 + i * 0.1)); add(g, cyl(R * 0.3, R * 0.3, h * 0.45, 24), mat('mliSilver')); for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.2 * R, h * 0.4, 1.2).translate(0, 0, 0), mat('dark'), Math.cos(i * Math.PI / 2) * R * 0.35, -h * 0.25, Math.sin(i * Math.PI / 2) * R * 0.35); if (m.beam) add(g, cyl(R * 0.05, R * 0.05, h, 8), mat('emissive', 0xaa66ff)); g.userData.nozzles = [[0, 0, R * 0.9]]; g.userData.fusion = true; break; }
    case 'scoop': add(g, new THREE.TorusGeometry(r, r * 0.02, 8, 96), mat('metal', 0x9aaab8), 0, -h * 0.2, 0, Math.PI / 2); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(g, cyl(0.2, 0.2, r * 1.05, 6).rotateZ(Math.PI / 2).rotateY(a), mat('metal'), Math.cos(a) * r / 2, -h * 0.2, -Math.sin(a) * r / 2); } add(g, cyl(2, 2, h, 16), mat('metal', 0x888888)); break;
    case 'sail': { const S = m.size; add(g, cyl(r, r, h), mat('mli')); const sail = new THREE.PlaneGeometry(S, S, 1, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4); add(g, sail, new THREE.MeshStandardMaterial({ color: m.laser ? 0xe8e0ff : 0xdcdcdc, metalness: 1, roughness: 0.15, side: THREE.DoubleSide }), 0, 0.05, 0); g.userData.sail = true; break; }
    case 'magsail': add(g, cyl(r, r, h), mat('metal')); add(g, new THREE.TorusGeometry(40, 0.3, 8, 128).rotateX(Math.PI / 2), mat('metal', 0xb87333), 0, -h / 2); break;
    case 'warp': { add(g, cyl(r * 0.25, r * 0.25, h, 24), mat('dark', 0x202030)); const ring = new THREE.TorusGeometry(r, r * 0.08, 16, 96).rotateX(Math.PI / 2); add(g, ring, mat('metal', 0x5060a0), 0, -h / 2); add(g, new THREE.TorusGeometry(r * 0.96, r * 0.02, 8, 96).rotateX(Math.PI / 2), mat('emissive', 0x66aaff), 0, -h / 2); for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(r, 0.4, 0.4), mat('dark'), Math.cos(i * Math.PI / 2) * r / 2, -h / 2, Math.sin(i * Math.PI / 2) * r / 2, 0, -i * Math.PI / 2); break; }
    case 'hab': { add(g, cyl(r, r, h, 32), mat('fabric', m.color ?? 0xe8e8e0)); for (let i = 1; i < 4; i++) add(g, cyl(r * 1.01 + 0.004, r * 1.01 + 0.004, 0.08, SEG, true), mat('metal', 0xbbbbbb), 0, -h * i / 4); if (m.windows !== 0) for (let i = 0; i < 2; i++) add(g, new THREE.CircleGeometry(0.25, 16), mat('glass'), 0, -h * (0.3 + i * 0.4), r * 1.005); if (m.node) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) add(g, cyl(1, 1, 0.6).rotateZ(Math.PI / 2).rotateY(a), mat('metal', 0xbbbbbb), Math.cos(a) * r, -h / 2, -Math.sin(a) * r); break; }
    case 'inflatable': add(g, lathe([[r * 0.5, 0], [r * 0.9, -h * 0.1], [r, -h * 0.3], [r, -h * 0.7], [r * 0.9, -h * 0.9], [r * 0.5, -h]], 40), mat('fabric', 0xf0ece0)); break;
    case 'cupola': add(g, cyl(r * 0.6, r, h * 0.7, 7), mat('metal', 0xcfcfcf)); add(g, new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.05, 32).translate(0, 0.01, 0), mat('glass')); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, new THREE.PlaneGeometry(r * 0.5, h * 0.4), mat('glass'), Math.cos(a) * r * 0.82, -h * 0.35, Math.sin(a) * r * 0.82, -0.35, -a + Math.PI / 2, 0); } break;
    case 'dock': add(g, cyl(r, r, h * 0.6), mat('metal', 0xbbbbbb)); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; add(g, new THREE.BoxGeometry(0.2, 0.3, 0.1), mat('dark'), Math.cos(a) * r * 0.8, 0.1, Math.sin(a) * r * 0.8, 0, -a); } break;
    case 'chute': add(g, cyl(r * 0.85, r, h), mat('fabric', 0xd06020)); add(g, new THREE.SphereGeometry(r * 0.85, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('fabric', 0xd06020)); g.userData.chute = true; break;
    case 'leg': { const L = h; if (m.f9) { add(g, new THREE.BoxGeometry(0.25, L, 0.6).translate(0.12, -L / 2, 0), mat('carbon', 0x222222)); } else { add(g, cyl(0.05, 0.05, L, 8).rotateZ(0.35), mat('metal', m.lm ? 0xd4a64a : 0xa0a0a0), 0.3, -L * 0.1, 0); add(g, cyl(0.2, 0.25, 0.08, 16), mat('metal'), 0.6, -L * 0.95, 0); } g.userData.leg = true; break; }
    case 'heatshield': if (m.hiad) { add(g, cyl(r, r, h), mat('dark')); } else { add(g, lathe([[r * 0.98, 0], [r, -h * 0.4], [r * 0.7, -h * 0.9], [0.01, -h]], 48), mat('ablator')); } break;
    case 'clamp': add(g, new THREE.BoxGeometry(0.8, h * 3, 0.8), mat('paint', 0xb04020), 1.2, -h * 1.2, 0); add(g, new THREE.BoxGeometry(1.2, 0.3, 0.3), mat('metal'), 0.6, 0, 0); break;
    case 'les': add(g, lathe([[0.01, 0], [0.35, -1.2], [0.4, -3.0], [0.25, -3.4]], 24), mat('paint', 0xe8e8e8)); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; add(g, cyl(0.05, 0.05, h - 3.4, 4), mat('paint', 0xd04020), Math.cos(a) * 0.5, -3.4, Math.sin(a) * 0.5); } add(g, cyl(r2 * 0.8, r2, 0.8), mat('paint', 0xe8e8e8), 0, -h + 0.8); break;
    case 'panel': {
      const W = m.w, L = m.l; add(g, new THREE.BoxGeometry(0.2, 0.3, 0.2), mat('metal'), 0.1, 0, 0);
      // deployable wings live in a 'wing' group that the flight scene folds/unfolds along X
      const wing = new THREE.Group(); wing.name = 'wing'; wing.position.x = 0.2; g.add(wing);
      if (m.rosa) { add(wing, new THREE.BoxGeometry(L, 0.03, W).translate(L / 2, 0, 0), mat('solar')); add(wing, cyl(0.12, 0.12, W, 12).rotateX(Math.PI / 2), mat('metal'), L, 0, 0); }
      else { const panels = Math.max(1, Math.round(L / W)); for (let i = 0; i < panels; i++) add(wing, new THREE.BoxGeometry(L / panels * 0.97, 0.03, W), mat('solar'), (i + 0.5) * L / panels, 0, 0); add(wing, cyl(0.04, 0.04, L, 6).rotateZ(Math.PI / 2), mat('metal'), L / 2, 0.03, 0); }
      if (m.deploy) wing.userData.deployable = true;
      g.userData.solar = true; break; }
    case 'rtg': add(g, cyl(0.2, 0.2, h, 16).rotateZ(Math.PI / 2), mat('dark', 0x333333), h / 2, 0, 0); for (let i = 0; i < 8; i++) add(g, new THREE.BoxGeometry(h * 0.9, 0.02, 0.28).rotateX(i / 8 * Math.PI), mat('dark', 0x2a2a2a), h / 2, 0, 0); break;
    case 'reactor': add(g, cyl(r * 0.4, r * 0.6, h * 0.25), mat('metal', 0x999999)); add(g, cyl(r * 0.15, r * 0.15, h * 0.5), mat('metal', 0xaaaaaa), 0, -h * 0.25); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(g, new THREE.BoxGeometry(0.05, h * 0.55, r * 0.9).translate(0, 0, r * 0.45), mat(m.fusion ? 'metal' : 'dark', 0x303030), 0, -h * 0.45, 0, 0, a); } if (m.fusion) add(g, new THREE.TorusGeometry(r * 0.5, r * 0.1, 12, 32).rotateX(Math.PI / 2), mat('emissive', 0xff66cc), 0, -h * 0.12); break;
    case 'radiator': add(g, new THREE.BoxGeometry(m.small ? 1.2 : 4, h, 0.06).translate(m.small ? 0.6 : 2, 0, 0), mat('paint', 0xf4f4f4)); break;
    case 'whip': add(g, cyl(0.01, 0.015, h, 6).rotateZ(-0.3), mat('metal'), 0.15, h / 2, 0); break;
    case 'dish': { const S = m.size; add(g, cyl(0.05, 0.05, S * 0.3, 6).rotateZ(Math.PI / 2), mat('metal'), S * 0.15, 0, 0); const dish = new THREE.SphereGeometry(S / 2, 32, 8, 0, Math.PI * 2, 0, 0.55); dish.scale(1, 0.4, 1); dish.rotateZ(-Math.PI / 2); add(g, dish, mat('paint', 0xf0f0f0), S * 0.3 + S * 0.2, 0, 0); add(g, cyl(0.01, 0.01, S * 0.35, 4).rotateZ(Math.PI / 2), mat('metal'), S * 0.45, 0, 0); break; }
    case 'laser': add(g, cyl(0.12, 0.15, 0.4, 16).rotateZ(Math.PI / 2), mat('dark'), 0.2, 0, 0); add(g, new THREE.CircleGeometry(0.1, 16).rotateY(Math.PI / 2), mat('emissive', 0x55ff99), 0.401, 0, 0); break;
    case 'science': add(g, new THREE.BoxGeometry(0.3, 0.3, 0.3), mat(['magnetic', 'spectra'].includes(m.kind) ? 'mli' : 'paint', 0xd8d8d8), 0.15, 0, 0); if (m.kind === 'magnetic') add(g, cyl(0.02, 0.02, 3, 4).rotateZ(Math.PI / 2), mat('metal'), 1.8, 0, 0); if (m.kind === 'imaging') add(g, cyl(0.12, 0.12, 0.3, 16).rotateZ(Math.PI / 2), mat('dark'), 0.4, 0, 0); break;
    case 'telescope': add(g, cyl(r, r, h, 32), mat('mliSilver')); add(g, cyl(r * 1.02, r * 1.02, h * 0.1), mat('dark'), 0, 0); add(g, new THREE.CircleGeometry(r * 0.95, 32).rotateX(-Math.PI / 2), mat('dark', 0x050505), 0, 0.01); for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.05, h * 0.9, 2.6), mat('solar'), s * (r + 0.2), -h * 0.5, 0); break;
    case 'jwst': { for (let l = 0; l < 5; l++) add(g, new THREE.BoxGeometry(14 - l * 0.4, 0.02, 7 - l * 0.2), mat('mliSilver'), 0, -h * 0.7 + l * 0.25, 0); for (let i = 0; i < 18; i++) { const q = i < 6 ? i : i - 6; const ring = i < 6 ? 1 : 2; const a = q / (ring === 1 ? 6 : 12) * Math.PI * 2; const d = ring === 1 ? 1.32 : 2.5; add(g, new THREE.CylinderGeometry(0.66, 0.66, 0.05, 6), mat('metal', 0xd4af37), Math.cos(a) * d, 1.5 + Math.sin(a) * d * 0, Math.sin(a) * d, Math.PI / 2 - 0.2); } add(g, new THREE.BoxGeometry(1.5, 1.2, 1.5), mat('mli'), 0, -h * 0.85, 0); break; }
    case 'torus': { const R = m.r; add(g, new THREE.TorusGeometry(R, h * 0.35, 20, 96).rotateX(Math.PI / 2), mat('fabric', 0xe6e6e6), 0, -h / 2); for (let i = 0; i < 6; i++) add(g, cyl(0.6, 0.6, R, 8).rotateZ(Math.PI / 2).rotateY(i / 6 * Math.PI * 2), mat('metal'), Math.cos(i / 6 * Math.PI * 2) * R / 2, -h / 2, -Math.sin(i / 6 * Math.PI * 2) * R / 2); add(g, cyl(3, 3, h, 24), mat('metal', 0xb0b0b0)); g.userData.spin = true; break; }
    case 'shield': add(g, cyl(r, r, h, 64), mat('metal', 0x9a9a8a)); break;
    case 'ladder': for (let i = 0; i < 10; i++) add(g, cyl(0.015, 0.015, 0.4, 4).rotateX(Math.PI / 2), mat('metal'), 0.15, h / 2 - i * h / 10, 0); for (const s of [-1, 1]) add(g, cyl(0.02, 0.02, h, 4), mat('metal'), 0.15, h / 2, s * 0.2); break;
    case 'light': add(g, new THREE.BoxGeometry(0.15, 0.15, 0.15), mat('dark'), 0.075, 0, 0); add(g, new THREE.CircleGeometry(0.06, 12).rotateY(Math.PI / 2), mat('emissive', 0xfff4dd), 0.151, 0, 0); g.userData.light = true; break;
    default: add(g, cyl(r, r2, h), mat('plain'));
  }
  return g;
}

function buildPod(g, p, style) {
  const r = p.d / 2, rt = p.dTop / 2, h = p.h;
  const blackTile = mat('tile'), white = mat('paint', 0xf2f2f2);
  switch (style) {
    case 'mercury': add(g, lathe([[0.01, 0], [rt * 0.6, -0.05], [rt, -0.6], [rt * 1.1, -0.9], [r, -h * 0.95], [r, -h]]), mat('dark', 0x1e1e20)); add(g, new THREE.PlaneGeometry(0.3, 0.3), mat('glass'), 0, -h * 0.6, r * 0.62, -0.35); add(g, cyl(r, r * 0.97, 0.15), mat('ablator'), 0, -h); break;
    case 'gemini': add(g, lathe([[0.01, 0], [rt, -0.1], [rt, -0.9], [r * 0.9, -h * 0.9], [r, -h]]), mat('dark', 0x1c1c1e)); for (const s of [-1, 1]) add(g, new THREE.PlaneGeometry(0.35, 0.3), mat('glass'), s * 0.35, -h * 0.55, r * 0.55, -0.5); add(g, cyl(r, r * 0.97, 0.15), mat('ablator'), 0, -h); break;
    case 'apollo': case 'orion': case 'starliner': case 'dragon': case 'src': {
      const M = style === 'dragon' ? mat('paint', 0xf0f0f0) : style === 'starliner' ? mat('paint', 0xe6e8ea) : style === 'src' ? mat('paint', 0xe8e8e8) : mat('mliSilver');
      const top = style === 'dragon' ? [[rt * 0.9, 0], [rt, -0.3]] : [[rt * 0.8, 0], [rt, -0.2]];
      add(g, lathe([...top, [r * 0.97, -h * 0.92], [r, -h * 0.97]]), M);
      add(g, lathe([[r, -h * 0.97], [r * 0.8, -h * 1.0], [0.01, -h * 1.02]], 48), mat('ablator'));
      if (style !== 'src') for (let i = 0; i < (style === 'dragon' ? 4 : 2); i++) { const a = i / (style === 'dragon' ? 4 : 2) * Math.PI - Math.PI / 4; const y = -h * 0.55, rr = (rt + (r - rt) * 0.55) * 1.0; add(g, new THREE.CircleGeometry(0.2, 16), mat('glass'), Math.sin(a) * rr, y, Math.cos(a) * rr, -0.45, a, 0); }
      if (style === 'dragon') { add(g, lathe([[0.01, 0.9], [rt * 0.7, 0.7], [rt, 0.2], [rt, 0]]), mat('paint', 0xf4f4f4)); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; add(g, new THREE.BoxGeometry(0.5, 0.8, 0.2), mat('dark'), Math.sin(a) * r * 0.8, -h * 0.75, Math.cos(a) * r * 0.8, -0.35, a, 0); } }
      if (style === 'starliner') add(g, new THREE.TorusGeometry(r * 0.72, 0.08, 8, 48).rotateX(Math.PI / 2), mat('paint', 0x1a4aa0), 0, -h * 0.6);
      break;
    }
    case 'soyuz': add(g, lathe([[rt, 0], [rt * 1.2, -0.3], [r * 0.95, -h * 0.8], [r, -h]]), mat('paint', 0x6f7266)); add(g, new THREE.CircleGeometry(0.15, 16), mat('glass'), 0, -h * 0.5, r * 0.75, -0.4); add(g, cyl(r, r * 0.95, 0.1), mat('ablator'), 0, -h); break;
    case 'lm': { add(g, new THREE.DodecahedronGeometry(r * 0.55, 0).translate(0, -h * 0.5, 0), mat('mliSilver')); add(g, new THREE.BoxGeometry(r * 0.8, h * 0.5, r * 0.6), mat('mli'), 0, -h * 0.55, r * 0.15); add(g, new THREE.PlaneGeometry(0.4, 0.3), mat('glass'), -0.35, -h * 0.35, r * 0.46, 0, 0.2); add(g, new THREE.PlaneGeometry(0.4, 0.3), mat('glass'), 0.35, -h * 0.35, r * 0.46, 0, -0.2); add(g, cyl(0.4, 0.4, 0.3), mat('metal'), 0, 0); break; }
    case 'starship': {
      const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([r * Math.sqrt(1 - Math.pow(1 - Math.min(1, t / 0.45), 2)) || 0.01, -h * t]); }
      add(g, lathe(pts, 64), mat('steel'));
      for (let i = 0; i < 12; i++) add(g, new THREE.PlaneGeometry(0.6, 0.4), mat('glass'), Math.sin(i * 0.25 - 1.4) * r * 0.86, -h * 0.35, Math.cos(i * 0.25 - 1.4) * r * 0.86, -0.3, i * 0.25 - 1.4, 0);
      for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.25, h * 0.2, 2.5).translate(0, 0, 1.25), mat('tile'), s * r * 0.7, -h * 0.35, 0, 0, s * Math.PI / 2, 0);
      break;
    }
  }
}

// Exhaust plume: layered cone with a noise shader; expands in vacuum, Mach diamonds at sea level
export function makePlume(nozzleR, color = [1.0, 0.62, 0.3], kind = 'chem') {
  const U = { uTime: { value: 0 }, uThrottle: { value: 0 }, uPressure: { value: 1 }, uColor: { value: new THREE.Vector3(...color) }, uKind: { value: kind === 'ion' ? 1 : kind === 'solid' ? 2 : kind === 'hydrolox' ? 3 : kind === 'fusion' ? 4 : kind === 'methalox' ? 5 : 0 } };
  const L = nozzleR * 28;
  const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 32, true); geo.translate(0, -0.5, 0);
  const matl = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uThrottle, uPressure; varying float vT; varying vec3 vN; varying vec3 vV; varying float vR;
      void main(){ float t = -position.y; vT = t; float exp1 = mix(2.8, 0.75, clamp(uPressure, 0.0, 1.0));
        float rr = 1.0 + t * (exp1 - 1.0) * 1.6 + 0.15 * sin(t * 25.0) * uPressure;
        vec3 p = vec3(position.x * rr, position.y * ${L.toFixed(2)} * (0.4 + 0.6 * uThrottle) * mix(1.6, 1.0, clamp(uPressure,0.0,1.0)), position.z * rr) * vec3(${nozzleR.toFixed(3)}, 1.0, ${nozzleR.toFixed(3)});
        vR = rr; vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime, uThrottle, uPressure, uKind; uniform vec3 uColor; varying float vT; varying vec3 vN; varying vec3 vV; varying float vR;
      float h(float x){ return fract(sin(x) * 43758.5453); }
      void main(){
        #include <logdepthbuf_fragment>
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float fall = exp(-vT * mix(1.5, 3.5, clamp(uPressure,0.0,1.0)));
        float flick = 0.85 + 0.15 * sin(uTime * 60.0 + vT * 30.0) * h(floor(uTime * 30.0));
        float diamonds = uPressure > 0.3 ? 0.5 + 0.5 * pow(abs(sin(vT * 14.0)), 8.0) : 1.0;
        vec3 c = uColor;
        if (uKind == 3.0) c = mix(vec3(0.6, 0.7, 1.0), vec3(1.0, 0.8, 0.9), vT) * 0.6;   // hydrolox: pale blue, nearly transparent
        if (uKind == 5.0) c = mix(vec3(0.5, 0.6, 1.0), vec3(1.0, 0.55, 0.4), vT);        // methalox: blue core
        if (uKind == 1.0) c = vec3(0.35, 0.55, 1.0);
        if (uKind == 4.0) c = vec3(0.8, 0.6, 1.0);
        vec3 core = vec3(1.0, 0.95, 0.85) * exp(-vT * 8.0) * 2.0;
        vec3 col = (c * 1.5 + core) * fall * edge * flick * diamonds * uThrottle;
        if (uKind == 2.0) col += vec3(0.6, 0.55, 0.5) * exp(-vT * 1.2) * 0.3 * uThrottle * uPressure; // smoky solid
        gl_FragColor = vec4(col * 5.0, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, matl); m.frustumCulled = false; m.renderOrder = 5; m.userData.U = U;
  return m;
}

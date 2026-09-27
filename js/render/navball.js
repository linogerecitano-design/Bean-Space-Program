// Navball: attitude sphere rendered into its own small canvas-backed WebGL view.
import * as THREE from 'three';

function navTexture() {
  const W = 1024, H = 512; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H / 2); sky.addColorStop(0, '#1d5fb8'); sky.addColorStop(1, '#4f95e6');
  g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
  const gr = g.createLinearGradient(0, H / 2, 0, H); gr.addColorStop(0, '#b86a2a'); gr.addColorStop(1, '#6b3812');
  g.fillStyle = gr; g.fillRect(0, H / 2, W, H / 2);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center';
  for (let lat = -80; lat <= 80; lat += 10) { const y = H / 2 - lat / 180 * H; g.lineWidth = lat === 0 ? 4 : 1.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); if (lat) for (let k = 0; k < 4; k++) g.fillText(Math.abs(lat), (k + 0.5) * W / 4, y - 3); }
  for (let lon = 0; lon < 360; lon += 30) { const x = lon / 360 * W; g.lineWidth = lon % 90 === 0 ? 3 : 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  g.font = 'bold 28px sans-serif'; ['N', 'W', 'S', 'E'].forEach((d, i) => { g.fillText(d, i * W / 4 + 2, H / 2 - 8); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function markerTexture(kind) {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.lineWidth = 5; g.translate(S / 2, S / 2);
  const col = { pro: '#e6f25a', retro: '#e6f25a', normal: '#d05be0', anti: '#d05be0', radial: '#4fd0f0', aradial: '#4fd0f0', target: '#f07acc', node: '#3d8cff' }[kind];
  g.strokeStyle = col; g.fillStyle = col;
  if (kind === 'pro') { g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke(); g.fillRect(-2, -2, 4, 4); for (const a of [0, Math.PI / 2, Math.PI]) { g.save(); g.rotate(a - Math.PI / 2); g.fillRect(-2, -28, 4, 13); g.restore(); } }
  else if (kind === 'retro') { g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke(); g.beginPath(); g.moveTo(-10, -10); g.lineTo(10, 10); g.moveTo(10, -10); g.lineTo(-10, 10); g.stroke(); }
  else if (kind === 'normal' || kind === 'anti') { g.beginPath(); g.moveTo(0, -16); g.lineTo(14, 10); g.lineTo(-14, 10); g.closePath(); g.stroke(); if (kind === 'anti') { g.beginPath(); g.moveTo(0, 20); g.lineTo(0, 10); g.stroke(); } }
  else if (kind === 'radial' || kind === 'aradial') { g.beginPath(); g.arc(0, 0, 14, 0, 7); g.stroke(); for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * Math.PI / 2 + Math.PI / 4); g.fillRect(-2, kind === 'radial' ? -26 : -14, 4, 11); g.restore(); } }
  else { g.beginPath(); g.arc(0, 0, 16, 0, 7); g.stroke(); g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Navball {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.r.setPixelRatio(Math.min(2, devicePixelRatio)); this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 10); this.cam.position.set(0, 0, 5);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({ map: navTexture() }));
    this.scene.add(this.ball);
    this.markers = {};
    for (const k of ['pro', 'retro', 'normal', 'anti', 'radial', 'aradial', 'target', 'node']) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(k), depthTest: false })); s.scale.setScalar(0.32); this.scene.add(s); this.markers[k] = s; }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.05, 64), new THREE.MeshBasicMaterial({ color: 0x2a2f38 })); ring.position.z = 1.5; this.scene.add(ring);
    const cross = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 3), new THREE.MeshBasicMaterial({ color: 0xffa500 })); cross.position.z = 1.6; cross.rotation.z = Math.PI / 2; this.scene.add(cross);
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.03), new THREE.MeshBasicMaterial({ color: 0xffa500 })); wing.position.z = 1.6; this.scene.add(wing);
    this.resize();
  }
  resize() { const c = this.r.domElement; this.r.setSize(c.clientWidth || 190, c.clientHeight || 190, false); }
  // vesselQ: world orientation of vessel (nose = +Y). up/north/east: local horizon basis (world). vectors: {pro:Vector3,...}
  update(vesselQ, up, north, vecs) {
    // view looks along the vessel nose; screen-up is vessel +Z (the top of a plane: canopy and tail fin; gear go on -Z)
    const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(vesselQ);
    const top = new THREE.Vector3(0, 0, 1).applyQuaternion(vesselQ);
    const right = new THREE.Vector3().crossVectors(top, nose);
    // world -> navball-view: x=right, y=top, z=nose (the nose direction faces the viewer)
    const M = new THREE.Matrix4().makeBasis(right, top, nose).transpose();
    // ball local frame: y = up (horizon), x/z by heading (texture: u=0 north). Sphere uv: u around y from -x.
    const east = new THREE.Vector3().crossVectors(north, up);
    const B = new THREE.Matrix4().makeBasis(north.clone().negate(), up, east.clone().negate());
    const R = new THREE.Matrix4().multiplyMatrices(M, B);
    this.ball.quaternion.setFromRotationMatrix(R);
    for (const k in this.markers) {
      const v = vecs[k]; const m = this.markers[k];
      if (!v) { m.visible = false; continue; }
      const p = v.clone().normalize().applyMatrix4(M);
      m.visible = p.z > -0.05; m.position.set(p.x, p.y, 2);
    }
    this.r.render(this.scene, this.cam);
  }
}

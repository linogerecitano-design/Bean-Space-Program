// Part catalogue icons: each part's 3D model rendered once into a small image (cached).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildPartMesh } from './partMesh.js';

const S = 96;
let R = null; const cache = new Map();
function setup(renderer) {
  if (R) return R;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x404040, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); scene.add(key);
  const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 5000);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  R = { scene, rt, cam, canvas, g: canvas.getContext('2d'), px: new Uint8Array(S * S * 4) };
  return R;
}
export function partIcon(renderer, part) {
  if (cache.has(part.id)) return cache.get(part.id);
  const r = setup(renderer);
  const mesh = buildPartMesh(part);
  r.scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh); const c = box.getCenter(new THREE.Vector3()); const sz = box.getSize(new THREE.Vector3());
  const rad = Math.max(0.05, sz.length() / 2);
  const dir = new THREE.Vector3(1, 0.55, 1.35).normalize();
  const dist = rad / Math.sin(r.cam.fov * Math.PI / 360) * 1.02;
  r.cam.position.copy(c).addScaledVector(dir, dist); r.cam.near = dist / 100; r.cam.far = dist * 4; r.cam.updateProjectionMatrix(); r.cam.lookAt(c);
  const prevT = renderer.getRenderTarget(); const cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(r.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(r.scene, r.cam);
  renderer.readRenderTargetPixels(r.rt, 0, 0, S, S, r.px);
  renderer.setRenderTarget(prevT); renderer.setClearColor(cc, ca); renderer.shadowMap.enabled = prevShadow;
  r.scene.remove(mesh); mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  const img = r.g.createImageData(S, S);
  for (let y = 0; y < S; y++) img.data.set(r.px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4); // flip rows
  r.g.putImageData(img, 0, 0);
  const url = r.canvas.toDataURL('image/png');
  cache.set(part.id, url);
  return url;
}

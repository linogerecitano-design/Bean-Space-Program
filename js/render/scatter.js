// Surface scatter (rocks, trees, shrubs, grass, flowers) from Poly Haven CC0 models.
// Placement is deterministic per terrain chunk and follows biome rules; instances are gathered
// around the camera into one InstancedMesh per model (+ impostor billboards for far trees).
import * as THREE from 'three';
import { makeGLTFLoader } from './gltf.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cpuAlbedo, sampleRGB, IS_MOBILE } from './textures.js';
import { bakedAlbedo } from '../gen/baker.js';
import { siteFrame } from '../scenes/site.js';
import { SITE_CLEAR } from './spaceCenter.js';
import { settings } from '../game/settings.js';

// kind: rock | tree | shrub | grass | debris ; biomes: which surfaces allow it
export const SCATTER_TYPES = [
  // airless / regolith rocks
  ...[1, 2, 3, 4, 5, 6, 7].map(i => ({ id: `moon_rock_0${i}`, kind: 'rock', biomes: ['regolith', 'icy', 'asteroid', 'volcanic'], size: [0.2, 2.2], density: 0.012 })),
  { id: 'rock_07', kind: 'rock', biomes: ['temperate', 'tundra', 'mars', 'arid', 'alpine'], size: [0.3, 1.8], density: 0.004 },
  { id: 'rock_09', kind: 'rock', biomes: ['temperate', 'tundra', 'mars', 'arid', 'alpine'], size: [0.3, 1.8], density: 0.004 },
  { id: 'stone_01', kind: 'rock', biomes: ['temperate', 'tundra', 'alpine', 'beach'], size: [0.5, 1.5], density: 0.003 },
  { id: 'namaqualand_boulder_02', kind: 'rock', biomes: ['arid', 'mars', 'alpine', 'volcanic'], size: [0.6, 2.5], density: 0.0025 },
  { id: 'namaqualand_boulder_03', kind: 'rock', biomes: ['arid', 'mars', 'alpine'], size: [0.6, 2.5], density: 0.0025 },
  { id: 'namaqualand_boulder_04', kind: 'rock', biomes: ['arid', 'mars', 'tundra'], size: [0.6, 2.5], density: 0.0025 },
  { id: 'namaqualand_boulder_05', kind: 'rock', biomes: ['arid', 'mars', 'volcanic'], size: [0.6, 2.5], density: 0.0025 },
  { id: 'namaqualand_boulder_06', kind: 'rock', biomes: ['arid', 'mars', 'alpine'], size: [0.6, 3.0], density: 0.002 },
  { id: 'namaqualand_stones_01', kind: 'rock', biomes: ['arid', 'mars', 'regolith', 'beach'], size: [0.8, 1.2], density: 0.004 },
  { id: 'rock_moss_set_01', kind: 'rock', biomes: ['temperate', 'boreal', 'tropical'], size: [0.8, 1.4], density: 0.002 },
  { id: 'rock_moss_set_02', kind: 'rock', biomes: ['temperate', 'boreal'], size: [0.8, 1.4], density: 0.002 },
  { id: 'rock_face_01', kind: 'rock', biomes: ['alpine', 'mars', 'arid', 'tundra'], size: [0.5, 1.6], density: 0.0015, slope: true },
  { id: 'boulder_01', kind: 'rock', biomes: ['alpine', 'temperate'], size: [0.8, 1.2], density: 0.0004 },
  // trees
  { id: 'fir_sapling', kind: 'tree', biomes: ['boreal', 'alpine', 'temperate'], size: [2.5, 6.0], density: 0.0035 },
  { id: 'pine_sapling_small', kind: 'tree', biomes: ['boreal', 'temperate'], size: [2.5, 5.5], density: 0.003 },
  { id: 'tree_small_02', kind: 'tree', biomes: ['temperate'], size: [0.8, 1.3], density: 0.0025 },
  { id: 'jacaranda_tree', kind: 'tree', biomes: ['tropical', 'savanna'], size: [0.8, 1.2], density: 0.0012 },
  { id: 'island_tree_02', kind: 'tree', biomes: ['tropical', 'beach'], size: [0.8, 1.2], density: 0.002 },
  { id: 'searsia_lucida', kind: 'tree', biomes: ['savanna', 'arid', 'temperate'], size: [0.8, 1.3], density: 0.0015 },
  { id: 'searsia_burchellii', kind: 'tree', biomes: ['savanna', 'arid'], size: [0.8, 1.3], density: 0.0015 },
  { id: 'quiver_tree_01', kind: 'tree', biomes: ['arid'], size: [0.8, 1.3], density: 0.0008 },
  { id: 'quiver_tree_02', kind: 'tree', biomes: ['arid'], size: [0.8, 1.3], density: 0.0008 },
  { id: 'othonna_cerarioides', kind: 'shrub', biomes: ['arid'], size: [0.8, 1.3], density: 0.002 },
  { id: 'dead_tree_trunk_02', kind: 'debris', biomes: ['boreal', 'temperate'], size: [0.8, 1.2], density: 0.0006 },
  { id: 'dead_quiver_trunk', kind: 'debris', biomes: ['arid', 'savanna'], size: [0.8, 1.2], density: 0.0005 },
  { id: 'tree_stump_01', kind: 'debris', biomes: ['boreal', 'temperate'], size: [0.8, 1.3], density: 0.0008 },
  // shrubs & ground plants
  ...['shrub_01', 'shrub_02', 'shrub_03', 'shrub_04'].map(id => ({ id, kind: 'shrub', biomes: ['temperate', 'savanna', 'tropical', 'boreal'], size: [0.7, 1.4], density: 0.006 })),
  { id: 'fern_02', kind: 'shrub', biomes: ['temperate', 'tropical', 'boreal'], size: [0.8, 1.4], density: 0.008 },
  { id: 'wild_rooibos_bush', kind: 'shrub', biomes: ['arid', 'savanna'], size: [0.7, 1.3], density: 0.005 },
  { id: 'cheiridopsis_succulent', kind: 'grass', biomes: ['arid'], size: [0.8, 1.5], density: 0.02 },
  { id: 'dry_branches_medium_01', kind: 'debris', biomes: ['savanna', 'arid', 'boreal'], size: [0.8, 1.2], density: 0.003 },
  { id: 'moss_01', kind: 'grass', biomes: ['boreal', 'tundra'], size: [0.8, 1.5], density: 0.03 },
  { id: 'grass_medium_01', kind: 'grass', biomes: ['temperate', 'savanna', 'tropical'], size: [0.8, 1.3], density: 0.25 },
  { id: 'grass_medium_02', kind: 'grass', biomes: ['temperate', 'boreal', 'tundra'], size: [0.8, 1.3], density: 0.2 },
  { id: 'grass_bermuda_01', kind: 'grass', biomes: ['temperate', 'tropical', 'beach', 'savanna'], size: [0.8, 1.4], density: 0.3 },
  { id: 'flower_gazania', kind: 'grass', biomes: ['savanna', 'arid', 'temperate'], size: [0.8, 1.3], density: 0.03 },
  { id: 'flower_ursinia', kind: 'grass', biomes: ['savanna', 'temperate'], size: [0.8, 1.3], density: 0.03 },
  { id: 'dandelion_01', kind: 'grass', biomes: ['temperate'], size: [0.8, 1.3], density: 0.03 },
  { id: 'celandine_01', kind: 'grass', biomes: ['temperate', 'boreal'], size: [0.8, 1.3], density: 0.03 },
];
const RANGE = { rock: IS_MOBILE ? 140 : 280, tree: IS_MOBILE ? 180 : 320, treeFar: IS_MOBILE ? 1500 : 3500, shrub: IS_MOBILE ? 90 : 170, grass: IS_MOBILE ? 35 : 70, debris: IS_MOBILE ? 90 : 180 };
const CAP = { rock: IS_MOBILE ? 150 : 500, tree: IS_MOBILE ? 120 : 400, treeFar: IS_MOBILE ? 2500 : 9000, shrub: IS_MOBILE ? 250 : 800, grass: IS_MOBILE ? 800 : 3500, debris: IS_MOBILE ? 60 : 200 };

// ---------------------------------------------------------------- model library
const loader = makeGLTFLoader();
const lib = new Map();
let libPromise = null;
const windUniforms = { uTime: { value: 0 } };
export function scatterTime(t) { windUniforms.uTime.value = t; }

function addWind(mat, strength) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sway = sin(uTime * 1.7 + ip.x * 0.37 + ip.z * 0.21) + 0.4 * sin(uTime * 3.1 + ip.y * 0.5);
        float hk = max(position.y, 0.0);
        transformed.x += sway * ${strength.toFixed(3)} * hk * hk;
        transformed.z += cos(uTime * 1.3 + ip.x * 0.2) * ${(strength * 0.6).toFixed(3)} * hk * hk;`);
  };
  mat.customProgramCacheKey = () => 'wind' + strength;
}

async function loadModel(t) {
  const gltf = await loader.loadAsync(`assets/scatter/${t.id}.glb`);
  const groups = new Map(); // material -> geometries
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    const m = o.material; if (!groups.has(m)) groups.set(m, []); groups.get(m).push(g);
  });
  const parts = [];
  const box = new THREE.Box3();
  for (const [m, geos] of groups) {
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    geo.computeBoundingBox(); box.union(geo.boundingBox);
    const mat = m.clone();
    const foliage = t.kind !== 'rock' && (m.alphaTest > 0 || m.transparent || m.map && /leaf|leaves|grass|fol|needle|petal|flower/i.test(m.name + (m.map?.name || '')));
    if (t.kind !== 'rock') { mat.side = THREE.DoubleSide; mat.alphaTest = Math.max(0.4, m.alphaTest || 0); mat.transparent = false; }
    if (t.kind !== 'rock' && t.kind !== 'debris') addWind(mat, t.kind === 'tree' ? 0.0025 : t.kind === 'grass' ? 0.06 : 0.02);
    mat.envMapIntensity = 0.4;
    parts.push({ geo, mat, foliage });
  }
  const size = new THREE.Vector3(); box.getSize(size);
  lib.set(t.id, { type: t, parts, height: size.y, radius: Math.max(size.x, size.z) / 2, box });
}
export function loadScatterLibrary(onProgress) {
  if (libPromise) return libPromise;
  let done = 0;
  libPromise = Promise.all(SCATTER_TYPES.map(t => loadModel(t).catch(e => console.warn('scatter', t.id, e)).finally(() => onProgress && onProgress(++done / SCATTER_TYPES.length))));
  return libPromise;
}

// Impostor texture for trees: an orthographic side render, used on camera-facing quads far away
function bakeImpostor(renderer, entry) {
  const S = 256;
  const rt = new THREE.WebGLRenderTarget(S, S, { samples: 0 });
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(1, 2, 2); scene.add(dl);
  const g = new THREE.Group(); for (const p of entry.parts) { const m = p.mat.clone(); m.onBeforeCompile = () => {}; g.add(new THREE.Mesh(p.geo, m)); } scene.add(g);
  const b = entry.box; const h = b.max.y - b.min.y, w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, h);
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, b.min.y + w, b.min.y, 0.01, 1000);
  cam.position.set((b.min.x + b.max.x) / 2, 0, 100); cam.lookAt((b.min.x + b.max.x) / 2, 0, 0);
  const prevT = renderer.getRenderTarget(); const cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
  renderer.setRenderTarget(prevT); renderer.setClearColor(cc, ca);
  entry.impostor = { tex: rt.texture, w, baseY: b.min.y };
}

// ---------------------------------------------------------------- biome classification
const _c = [0, 0, 0];
const _lv = new THREE.Vector3();
export function bodyBiomeFamily(body) {
  const n = body.name, st = body.style || {};
  if (n === 'Earth' || st.kind === 'terra') return 'earth';
  if (n === 'Mars' || body.class === 'desert') return 'mars';
  if (st.kind === 'icy') return 'icy';
  if (st.kind === 'asteroid') return 'asteroid';
  if (n === 'Io' || n === 'Venus' || st.lava || body.class === 'lava' || body.class === 'venus') return 'volcanic';
  if (n === 'Titan' || body.class === 'titan') return 'arid';
  return 'regolith';
}
// returns a biome name at a point (earth-like bodies use the real albedo map)
function biomeAt(family, body, lat, lon, h, slope, noise) {
  if (family !== 'earth') {
    if (family === 'mars') return slope > 0.35 ? 'alpine' : 'mars';
    return family;
  }
  if (h < 1) return 'none';
  if (body.name === 'Earth' && Math.abs(lat - 28.6) < 0.08 && Math.abs(lon + 80.6) < 0.09) return noise > 0.3 ? 'tropical' : 'temperate';
  const alb = body.sys.real ? cpuAlbedo(body.name) : null;
  let r = 0.3, g = 0.35, b = 0.2;
  if (alb) { sampleRGB(alb, lat, lon, _c); r = _c[0]; g = _c[1]; b = _c[2]; }
  else if (body.baked && bakedAlbedo(body, lat, lon, _c)) { r = _c[0]; g = _c[1]; b = _c[2]; }
  const bright = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const alat = Math.abs(lat);
  if (Math.min(r, g, b) > 0.6 || h > 4200 + noise * 400) return 'none'; // snow / ice
  if (slope > 0.45) return 'alpine';
  if (h > 2600) return 'alpine';
  const green = g - Math.max(r, b) * 0.92;
  if (h < 8 && bright > 0.3) return 'beach';
  if (green > 0.01) {
    if (alat < 20) return 'tropical';
    if (alat > 52) return 'boreal';
    return bright < 0.12 ? 'boreal' : 'temperate';
  }
  if (bright > 0.4) return 'arid';
  if (alat > 60) return 'tundra';
  return 'savanna';
}

// ---------------------------------------------------------------- per-chunk placement
function hash(a, b, c) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

export class Scatter {
  constructor(renderer, body, terrain) {
    this.renderer = renderer; this.body = body; this.terrain = terrain;
    this.family = bodyBiomeFamily(body);
    this.group = new THREE.Group(); this.group.name = 'scatter';
    this.meshes = new Map(); // id -> {near: InstancedMesh[], far: InstancedMesh}
    this.chunks = new Set();
    this.dirty = true; this.origin = null;
    this.enabled = true;
    this.site = null; // body-fixed launch pad position to keep clear
    this.types = SCATTER_TYPES.filter(t => lib.has(t.id) && this.allowed(t)); this.libSize = lib.size;
    this.noise = (x, y) => Math.sin(x * 0.0013 + Math.sin(y * 0.0021) * 2.0) * Math.cos(y * 0.0017 + Math.sin(x * 0.0009) * 1.7);
    if (this.family === 'earth' && body.sys.real) cpuAlbedo(body.name);
    if (body.name === 'Earth' && body.sys.real) { const f = siteFrame(body); this.siteF = { bf: f.bf, qi: f.q.clone().invert() }; }
    terrain.onChunkReady = (node) => { if (node.edge < 900) { this.populate(node); this.chunks.add(node); this.dirty = true; } };
    terrain.onChunkDrop = (node) => { if (this.chunks.delete(node)) this.dirty = true; };
  }
  allowed(t) {
    const fam = this.family;
    const map = { earth: ['temperate', 'boreal', 'tropical', 'savanna', 'arid', 'alpine', 'tundra', 'beach'], mars: ['mars', 'alpine'], icy: ['icy'], asteroid: ['asteroid'], volcanic: ['volcanic'], arid: ['arid'], regolith: ['regolith'] };
    const ok = map[fam] || ['regolith'];
    if (fam === 'mars' || fam === 'icy' || fam === 'regolith' || fam === 'asteroid' || fam === 'volcanic' || (fam === 'arid' && !this.body.atmo)) if (t.kind !== 'rock') return false;
    return t.biomes.some(b => ok.includes(b));
  }
  populate(node) {
    const mesh = node.mesh; if (!mesh) return;
    const pos = mesh.geometry.attributes.position.array, nor = mesh.geometry.attributes.normal.array;
    const n = Math.round(Math.sqrt(mesh.geometry.attributes.aWater.count - 0)) || 33;
    const N = Math.round(Math.sqrt(pos.length / 3 - 0)); // includes skirt; recompute grid size below
    let G = 1; while ((G + 1) * (G + 1) + G * 4 <= pos.length / 3) G++; // grid resolution from vertex count
    const water = mesh.geometry.attributes.aWater.array;
    const c = node.center, area = node.edge * node.edge;
    const out = [];
    const seedBase = Math.floor(node.a0 * 1e6) ^ Math.floor(node.b0 * 1e6 * 7) ^ (node.face << 24) ^ (node.level << 19);
    const R = this.body.radius;
    for (let ti = 0; ti < this.types.length; ti++) {
      const t = this.types[ti];
      const rangeLimit = t.kind === 'tree' ? RANGE.treeFar : RANGE[t.kind];
      if (node.edge > rangeLimit * 1.5 && node.level < this.terrain.maxLevel - 1) continue;
      let count = Math.min(t.kind === 'grass' ? 2500 : 600, Math.floor(area * t.density * (this.family === 'earth' ? 1 : 1.6) * settings.q.scatter));
      for (let k = 0; k < count; k++) {
        const u = hash(seedBase, ti, k * 3), v = hash(seedBase, ti, k * 3 + 1), w = hash(seedBase, ti, k * 3 + 2);
        const fi = u * (G - 1), fj = v * (G - 1); const i0 = Math.floor(fi), j0 = Math.floor(fj), fx = fi - i0, fy = fj - j0;
        const idx = (a, b) => (b * G + a);
        const a00 = idx(i0, j0), a10 = idx(i0 + 1, j0), a01 = idx(i0, j0 + 1), a11 = idx(i0 + 1, j0 + 1);
        if (water[a00] + water[a10] + water[a01] + water[a11] > 0) continue;
        const L = (arr, o) => (arr[a00 * 3 + o] * (1 - fx) + arr[a10 * 3 + o] * fx) * (1 - fy) + (arr[a01 * 3 + o] * (1 - fx) + arr[a11 * 3 + o] * fx) * fy;
        const px = L(pos, 0) + c[0], py = L(pos, 1) + c[1], pz = L(pos, 2) + c[2];
        const nx = L(nor, 0), ny = L(nor, 1), nz = L(nor, 2);
        const rl = Math.hypot(px, py, pz); const ux = px / rl, uy = py / rl, uz = pz / rl;
        const slope = 1 - (nx * ux + ny * uy + nz * uz) / (Math.hypot(nx, ny, nz) || 1);
        if (t.kind !== 'rock' && slope > 0.4) continue;
        if (t.slope && slope < 0.15) continue;
        if (this.siteF && this.cleared(px, py, pz, t.kind)) continue;
        const lat = Math.asin(uy) * 57.29578, lon = Math.atan2(-uz, ux) * 57.29578;
        const h = rl - R;
        const nz2 = this.noise(px + ti * 1000, pz - ti * 777);
        const biome = biomeAt(this.family, this.body, lat, lon, h, slope, nz2);
        if (!t.biomes.includes(biome)) continue;
        // clumping: forests and meadows in patches
        const clump = t.kind === 'tree' ? 0.15 : t.kind === 'grass' ? -0.2 : 0.0;
        if (nz2 < clump && w < 0.7) continue;
        const s = t.size[0] + (t.size[1] - t.size[0]) * Math.pow(hash(seedBase, ti, k * 7 + 5), t.kind === 'rock' ? 3 : 1);
        out.push({ ti, x: px, y: py, z: pz, ux, uy, uz, s, rot: w * Math.PI * 2, tilt: t.kind === 'rock' ? hash(seedBase, ti, k * 5) : 0 });
      }
    }
    node.scatter = out;
  }
  // true inside a space-centre footprint (pad, buildings, roads, runway)
  cleared(px, py, pz, kind) {
    const f = this.siteF; const dx = px - f.bf[0], dy = py - f.bf[1], dz = pz - f.bf[2];
    if (dx * dx + dy * dy + dz * dz > 6000 * 6000) return false;
    const l = _lv.set(dx, dy, dz).applyQuaternion(f.qi); const x = l.x, z = l.z;
    const pad = kind === 'grass' ? 0 : kind === 'tree' ? 25 : 10;
    for (const [cx, cz, r] of SITE_CLEAR.circles) if ((x - cx) ** 2 + (z - cz) ** 2 < (r + pad) ** 2) return true;
    for (const [x1, z1, x2, z2, w] of SITE_CLEAR.segments) {
      const ax = x2 - x1, az = z2 - z1; const t = Math.max(0, Math.min(1, ((x - x1) * ax + (z - z1) * az) / (ax * ax + az * az)));
      if ((x - x1 - ax * t) ** 2 + (z - z1 - az * t) ** 2 < (w + pad * 0.5) ** 2) return true;
    }
    return false;
  }
  // camBF: camera in body-fixed coords. Rebuild instance buffers when chunks change or camera moved.
  update(camBF) {
    if (!this.enabled) { this.group.visible = false; return; } this.group.visible = true;
    if (lib.size !== this.libSize) { // models finished loading after this body appeared
      this.libSize = lib.size; this.types = SCATTER_TYPES.filter(t => lib.has(t.id) && this.allowed(t));
      for (const n of this.chunks) this.populate(n); this.dirty = true;
    }
    const o = this.origin;
    const moved = !o || Math.hypot(camBF[0] - o[0], camBF[1] - o[1], camBF[2] - o[2]) > 40;
    if (!this.dirty && !moved) return;
    this.dirty = false;
    this.origin = [camBF[0], camBF[1], camBF[2]];
    this.group.position.set(camBF[0], camBF[1], camBF[2]); // instances are stored relative to this origin
    const buckets = new Map();
    const push = (key, inst, d) => { let b = buckets.get(key); if (!b) buckets.set(key, b = []); b.push(inst); inst.d = d; };
    for (const node of this.chunks) {
      if (!node.scatter) continue;
      for (const s of node.scatter) {
        const t = this.types[s.ti];
        const d = Math.hypot(s.x - camBF[0], s.y - camBF[1], s.z - camBF[2]);
        if (t.kind === 'tree') { if (d < RANGE.tree) push(t.id, s, d); else if (d < RANGE.treeFar) push(t.id + ':far', s, d); }
        else if (d < RANGE[t.kind]) push(t.id, s, d);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), up = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const used = new Set();
    for (const [key, list] of buckets) {
      const far = key.endsWith(':far');
      const id = far ? key.slice(0, -4) : key;
      const entry = lib.get(id); if (!entry) continue;
      const kind = entry.type.kind;
      const cap = far ? CAP.treeFar : CAP[kind];
      if (list.length > cap) { list.sort((a, b) => a.d - b.d); list.length = cap; }
      let rec = this.meshes.get(key);
      if (!rec || rec.cap < list.length) {
        if (rec) for (const m of rec.meshes) { this.group.remove(m); m.dispose(); }
        const cap2 = Math.max(16, Math.ceil(list.length * 1.5));
        const meshes = [];
        if (far) {
          if (!entry.impostor) bakeImpostor(this.renderer, entry);
          const mat = new THREE.MeshStandardMaterial({ map: entry.impostor.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
          const g = new THREE.PlaneGeometry(entry.impostor.w, entry.impostor.w); g.translate(0, entry.impostor.w / 2 + entry.impostor.baseY, 0);
          const g2 = g.clone().rotateY(Math.PI / 2); const cross = mergeGeometries([g, g2]);
          const im = new THREE.InstancedMesh(cross, mat, cap2); meshes.push(im);
        } else {
          for (const part of entry.parts) { const im = new THREE.InstancedMesh(part.geo, part.mat, cap2); im.castShadow = kind === 'tree' || kind === 'rock'; im.receiveShadow = true; meshes.push(im); }
        }
        for (const m of meshes) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
        rec = { meshes, cap: cap2 }; this.meshes.set(key, rec);
      }
      used.add(key);
      const baseScale = kind === 'rock' && entry.height > 0 ? 1 / Math.max(entry.height, entry.radius) : 1;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        up.set(s.ux, s.uy, s.uz);
        q.setFromUnitVectors(Y, up); q2.setFromAxisAngle(Y, s.rot); q.multiply(q2);
        if (s.tilt) { q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.tilt * 0.6); q.multiply(q2); }
        const k = s.s * baseScale; sc.set(k, k, k);
        const sink = kind === 'rock' ? -0.25 * k * entry.height : -0.05;
        p.set(s.x - this.origin[0] + s.ux * sink, s.y - this.origin[1] + s.uy * sink, s.z - this.origin[2] + s.uz * sink);
        m4.compose(p, q, sc);
        for (const m of rec.meshes) m.setMatrixAt(i, m4);
      }
      for (const m of rec.meshes) { m.count = list.length; m.instanceMatrix.needsUpdate = true; }
    }
    for (const [key, rec] of this.meshes) if (!used.has(key)) for (const m of rec.meshes) m.count = 0;
  }
  dispose() { for (const [, rec] of this.meshes) for (const m of rec.meshes) m.dispose(); this.meshes.clear(); }
}

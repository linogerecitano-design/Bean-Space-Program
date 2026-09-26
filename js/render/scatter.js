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
// instance lists are rebuilt per kind once the camera has moved this far (a fraction of the kind's range)
const REBUILD = { rock: 30, tree: 30, treeFar: 180, shrub: 16, grass: 7, debris: 20 };
// always drawn regardless of view direction (shadows and objects right next to the camera)
const NEAR_KEEP = { rock: 25, tree: 40, shrub: 12, grass: 6, debris: 12 };
const KINDS = ['grass', 'shrub', 'rock', 'tree', 'treeFar', 'debris'];

// ---------------------------------------------------------------- model library
const loader = makeGLTFLoader();
const lib = new Map();
let libPromise = null;
const windUniforms = { uTime: { value: 0 } };
export function scatterTime(t) { windUniforms.uTime.value = t; }

// Alpha-to-coverage (smooth, MSAA-resolved foliage edges) is only valid when the scene target is multisampled
let foliageAA = false;
const foliageMats = new Set();
export function setFoliageAA(on) {
  if (foliageAA === on) return; foliageAA = on;
  for (const m of foliageMats) { m.alphaToCoverage = on; m.needsUpdate = true; }
}
// Foliage: optional wind sway, and alpha that is boosted with the texture's mip level so leaf cards keep
// their coverage at a distance instead of thinning into sparkling noise.
function patchFoliage(mat, strength) {
  mat.onBeforeCompile = (sh) => {
    if (strength) {
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
    }
    sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
      #ifdef USE_MAP
      { vec2 tp = vMapUv * vec2(textureSize(map, 0)); vec2 ddx = dFdx(tp), ddy = dFdy(tp);
        float lod = 0.5 * log2(max(max(dot(ddx, ddx), dot(ddy, ddy)), 1e-8));
        diffuseColor.a *= 1.0 + max(lod, 0.0) * 0.35; }
      #endif
      #include <alphatest_fragment>`);
  };
  mat.customProgramCacheKey = () => 'foliage' + strength;
  mat.alphaToCoverage = foliageAA; foliageMats.add(mat);
}
// does this texture carry a real alpha channel? (an earlier asset pass stripped it from some models)
function hasAlpha(tex) {
  const img = tex && tex.image; if (!img || !img.width) return true;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 32, 32); const d = g.getImageData(0, 0, 32, 32).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  } catch (e) { return true; }
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
  const box = new THREE.Box3(); let broken = false;
  for (const [m, geos] of groups) {
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    geo.computeBoundingBox(); box.union(geo.boundingBox);
    const mat = m.clone();
    const foliage = t.kind !== 'rock' && (m.alphaTest > 0 || m.transparent || m.map && /leaf|leaves|grass|fol|needle|petal|flower/i.test(m.name + (m.map?.name || '')));
    // cut-out card without any alpha: it would draw as a solid quad, so the model is left out
    if (foliage && (m.alphaTest > 0 || m.transparent) && m.map && !hasAlpha(m.map)) broken = true;
    if (t.kind !== 'rock') { mat.side = THREE.DoubleSide; mat.alphaTest = Math.max(0.4, m.alphaTest || 0); mat.transparent = false; }
    if (t.kind !== 'rock' && t.kind !== 'debris') patchFoliage(mat, t.kind === 'tree' ? 0.0025 : t.kind === 'grass' ? 0.06 : 0.02);
    else if (foliage) patchFoliage(mat, 0);
    mat.envMapIntensity = 0.4;
    parts.push({ geo, mat, foliage });
  }
  if (broken) console.warn(`scatter: ${t.id} has foliage textures without alpha; skipped (run tools/fix_foliage_alpha.mjs --fetch)`);
  const size = new THREE.Vector3(); box.getSize(size);
  lib.set(t.id, { type: t, parts, height: size.y, radius: Math.max(size.x, size.z) / 2, box, broken });
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
  // mipmapped: without it thousands of distant trees alias into shimmering noise
  const rt = new THREE.WebGLRenderTarget(S, S, { samples: 0, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(1, 2, 2); scene.add(dl);
  const g = new THREE.Group(); for (const p of entry.parts) { const m = p.mat.clone(); m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => 'impostor-bake'; m.alphaToCoverage = false; g.add(new THREE.Mesh(p.geo, m)); } scene.add(g);
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
    this.types = this.usableTypes(); this.libSize = lib.size;
    this.kindState = {}; for (const k of KINDS) this.kindState[k] = { origin: null, fwd: null, dirty: true };
    this.kindGroups = {}; for (const k of KINDS) { const g = new THREE.Group(); g.name = 'scatter:' + k; this.kindGroups[k] = g; this.group.add(g); }
    this.rr = 0; // round-robin cursor: at most one kind is rebuilt per frame
    this.noise = (x, y) => Math.sin(x * 0.0013 + Math.sin(y * 0.0021) * 2.0) * Math.cos(y * 0.0017 + Math.sin(x * 0.0009) * 1.7);
    if (this.family === 'earth' && body.sys.real) cpuAlbedo(body.name);
    if (body.name === 'Earth' && body.sys.real) { const f = siteFrame(body); this.siteF = { bf: f.bf, qi: f.q.clone().invert() }; }
    terrain.onChunkReady = (node) => { if (node.edge < 900) { this.populate(node); this.chunks.add(node); this.markDirty(node); } };
    terrain.onChunkDrop = (node) => { if (this.chunks.delete(node)) this.markDirty(node); };
  }
  usableTypes() { return SCATTER_TYPES.filter(t => lib.has(t.id) && !lib.get(t.id).broken && this.allowed(t)); }
  // a chunk appeared/vanished: only kinds that actually have instances in it need a rebuild
  markDirty(node) {
    this.dirty = true;
    const by = node.scatterBy; if (!by) { for (const k of KINDS) this.kindState[k].dirty = true; return; }
    for (const k in by) if (by[k].length) { this.kindState[k].dirty = true; if (k === 'tree') this.kindState.treeFar.dirty = true; }
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
        out.push({ ti, kind: t.kind, x: px, y: py, z: pz, ux, uy, uz, s, rot: w * Math.PI * 2, tilt: t.kind === 'rock' ? hash(seedBase, ti, k * 5) : 0, lod: hash(seedBase, ti, k * 11 + 3), d: 0 });
      }
    }
    node.scatter = out;
    const by = {}; for (const k of KINDS) by[k] = [];
    for (const o of out) by[o.kind].push(o);
    node.scatterBy = by;
    // bounding sphere of the chunk (body-fixed), so whole chunks are skipped cheaply
    node.scatterR = node.edge * 0.75 + 50;
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
  // camBF: camera in body-fixed coords; view (optional): { fwd: [x,y,z] body-fixed unit vector, cos } is
  // the camera's viewing cone. Each kind keeps its own origin and is rebuilt only after the camera has moved a
  // fraction of that kind's range or turned away; at most one kind is rebuilt per frame.
  update(camBF, view) {
    if (!this.enabled) { this.group.visible = false; return; } this.group.visible = true;
    if (lib.size !== this.libSize) { // models finished loading after this body appeared
      this.libSize = lib.size; this.types = this.usableTypes();
      for (const n of this.chunks) this.populate(n); for (const k of KINDS) this.kindState[k].dirty = true;
    }
    this.dirty = false;
    // pick the kind that most needs a rebuild (dirty first, then furthest out of date)
    let best = null, bestScore = 0;
    for (let i = 0; i < KINDS.length; i++) {
      const k = KINDS[(this.rr + i) % KINDS.length], st = this.kindState[k];
      let score = 0;
      if (!st.origin) score = 3;
      else {
        const moved = Math.hypot(camBF[0] - st.origin[0], camBF[1] - st.origin[1], camBF[2] - st.origin[2]) / REBUILD[k];
        let turned = 0;
        if (view && st.fwd && k !== 'treeFar') turned = (1 - (view.fwd[0] * st.fwd[0] + view.fwd[1] * st.fwd[1] + view.fwd[2] * st.fwd[2])) / 0.03; // ~14 degrees
        score = Math.max(moved, turned, st.dirty ? 1.01 : 0);
      }
      if (score >= 1 && score > bestScore) { bestScore = score; best = k; }
    }
    if (!best) return;
    this.rr = (KINDS.indexOf(best) + 1) % KINDS.length;
    this.rebuildKind(best, camBF, view);
  }
  rebuildKind(kind, camBF, view) {
    const st = this.kindState[kind]; st.dirty = false;
    st.origin = [camBF[0], camBF[1], camBF[2]]; st.fwd = view ? view.fwd.slice() : null;
    const far = kind === 'treeFar', srcKind = far ? 'tree' : kind;
    const rMin = far ? RANGE.tree : 0, rMax = far ? RANGE.treeFar : RANGE[kind];
    const cx = camBF[0], cy = camBF[1], cz = camBF[2];
    const cull = view && !far, fx = cull ? view.fwd[0] : 0, fy = cull ? view.fwd[1] : 0, fz = cull ? view.fwd[2] : 0, cc = cull ? view.cos : -1;
    const keep = NEAR_KEEP[kind] || 0;
    const thin = kind === 'grass' || kind === 'shrub' || kind === 'debris' || far; // distance thinning of small stuff
    const buckets = new Map();
    for (const node of this.chunks) {
      const list = node.scatterBy && node.scatterBy[srcKind]; if (!list || !list.length) continue;
      const c = node.center; const dc = Math.hypot(c[0] - cx, c[1] - cy, c[2] - cz);
      if (dc - node.scatterR > rMax) continue;
      for (const s of list) {
        const dx = s.x - cx, dy = s.y - cy, dz = s.z - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= rMax || d < rMin) continue;
        if (thin) { const f = (d / rMax - 0.45) / 0.55; if (f > 0 && s.lod < f * 0.65) continue; } // up to 65% fewer toward the edge
        if (cull && d > keep && dx * fx + dy * fy + dz * fz < cc * d) continue;
        s.d = d;
        const t = this.types[s.ti]; if (!t) continue;
        let b = buckets.get(t.id); if (!b) buckets.set(t.id, b = []); b.push(s);
      }
    }
    const group = this.kindGroups[kind];
    group.position.set(cx, cy, cz); // instances are stored relative to this origin
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), up = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const used = new Set();
    for (const [id, list] of buckets) {
      const key = far ? id + ':far' : id;
      const entry = lib.get(id); if (!entry) continue;
      const cap = far ? CAP.treeFar : CAP[kind];
      if (list.length > cap) { list.sort((a, b) => a.d - b.d); list.length = cap; }
      let rec = this.meshes.get(key);
      if (!rec || rec.cap < list.length) {
        if (rec) for (const m of rec.meshes) { group.remove(m); m.dispose(); }
        const cap2 = Math.max(16, Math.ceil(list.length * 1.5));
        const meshes = [];
        if (far) {
          if (!entry.impostor) bakeImpostor(this.renderer, entry);
          if (!entry.impostorMat) { entry.impostorMat = new THREE.MeshStandardMaterial({ map: entry.impostor.tex, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 }); patchFoliage(entry.impostorMat, 0); }
          const g = new THREE.PlaneGeometry(entry.impostor.w, entry.impostor.w); g.translate(0, entry.impostor.w / 2 + entry.impostor.baseY, 0);
          const g2 = g.clone().rotateY(Math.PI / 2); const cross = mergeGeometries([g, g2]);
          meshes.push(new THREE.InstancedMesh(cross, entry.impostorMat, cap2));
        } else {
          for (const part of entry.parts) { const im = new THREE.InstancedMesh(part.geo, part.mat, cap2); im.castShadow = kind === 'tree' || kind === 'rock'; im.receiveShadow = true; meshes.push(im); }
        }
        for (const m of meshes) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); }
        rec = { meshes, cap: cap2, kind }; this.meshes.set(key, rec);
      }
      used.add(key);
      const baseScale = kind === 'rock' && entry.height > 0 ? 1 / Math.max(entry.height, entry.radius) : 1;
      const arr = rec.meshes[0].instanceMatrix.array;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        up.set(s.ux, s.uy, s.uz);
        q.setFromUnitVectors(Y, up); q2.setFromAxisAngle(Y, s.rot); q.multiply(q2);
        if (s.tilt) { q2.setFromAxisAngle(X, s.tilt * 0.6); q.multiply(q2); }
        // grow in over the outer 15% of the range instead of popping
        const fade = Math.min(1, (1 - s.d / rMax) / 0.15);
        const k = s.s * baseScale * (0.35 + 0.65 * fade); sc.set(k, k, k);
        const sink = kind === 'rock' ? -0.25 * k * entry.height : -0.05;
        p.set(s.x - cx + s.ux * sink, s.y - cy + s.uy * sink, s.z - cz + s.uz * sink);
        m4.compose(p, q, sc); m4.toArray(arr, i * 16);
      }
      for (let j = 0; j < rec.meshes.length; j++) {
        const m = rec.meshes[j];
        if (j > 0) m.instanceMatrix.array.set(arr.subarray(0, list.length * 16));
        m.count = list.length;
        m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, list.length * 16); m.instanceMatrix.needsUpdate = true;
      }
    }
    for (const [key, rec] of this.meshes) if (rec.kind === kind && !used.has(key)) for (const m of rec.meshes) m.count = 0;
  }
  dispose() { for (const [, rec] of this.meshes) for (const m of rec.meshes) m.dispose(); this.meshes.clear(); }
}

// Loads real planet maps, elevation data and the tiled ground-material array (Parallax-style).
import * as THREE from 'three';

export const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);

// body name -> planet texture file (equirectangular, lon 0 at centre)
export const PLANET_MAPS = {
  Sun: 'sun', Mercury: 'mercury', Venus: 'venus_surface', Earth: 'earth_day', Moon: 'moon', Mars: 'mars', Jupiter: 'jupiter', Saturn: 'saturn',
  Uranus: 'uranus', Neptune: 'neptune', Io: 'io', Europa: 'europa', Ganymede: 'ganymede', Callisto: 'callisto', Mimas: 'mimas', Enceladus: 'enceladus',
  Tethys: 'tethys', Dione: 'dione', Rhea: 'rhea', Titan: 'titan', Iapetus: 'iapetus', Phoebe: 'phoebe', Miranda: 'miranda', Ariel: 'ariel',
  Umbriel: 'umbriel', Titania: 'titania', Oberon: 'oberon', Triton: 'triton', Pluto: 'pluto', Charon: 'charon', Ceres: 'ceres', Vesta: 'vesta',
};
export const PLANET_EXTRA = { Venus: { clouds: 'venus_atmosphere' }, Earth: { night: 'earth_night', clouds: 'earth_clouds', normal: 'earth_normal', specular: 'earth_specular' }, Saturn: { ring: 'saturn_ring' } };

// Ground material layers (Poly Haven CC0), index = layer in the texture array
export const GROUND_LAYERS = ['grass_path_3', 'forest_leaves_02', 'rocky_terrain_02', 'rock_face_03', 'snow_02', 'coast_sand_01', 'sand_01', 'dry_ground_rocks',
  'red_laterite_soil_stones', 'red_sand', 'moon_01', 'moon_dusted_02', 'moon_meteor_01', 'gravel_ground_01', 'concrete_floor_02', 'asphalt_02',
  'dark_rock', 'snow_field_aerial', 'mud_cracked_dry_03', 'brown_mud_02', 'aerial_grass_rock', 'forrest_ground_01', 'lichen_rock', 'burned_ground_01'];
export const GL = Object.fromEntries(GROUND_LAYERS.map((n, i) => [n, i]));

const loader = new THREE.TextureLoader();
const cache = new Map();
export function planetTexture(name, srgb = true) {
  const key = name + srgb;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(`assets/planets/${name}.webp`);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, t);
  return t;
}
export function hasPlanetMap(bodyName) { return !!PLANET_MAPS[bodyName]; }

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
async function imagePixels(src, w, h) {
  const im = await loadImage(src);
  const c = document.createElement('canvas'); c.width = w || im.width; c.height = h || im.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, c.width, c.height);
  return { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
}

// ---------- CPU-side maps (heights + coarse albedo for biome / scatter decisions) -----------
export const CPU_MAPS = {};
export async function loadCpuMaps() {
  const jobs = [];
  // Earth: topology + water mask
  jobs.push((async () => {
    const [topo, water] = await Promise.all([imagePixels('assets/planets/earth_height.webp'), imagePixels('assets/planets/earth_water.webp', 2048, 1024)]);
    const W = topo.w, H = topo.h, hm = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) hm[i] = topo.data[i * 4] / 255;
    // water: white = water; blur for smooth coastlines/bathymetry
    const WW = water.w, WH = water.h, wm = new Float32Array(WW * WH);
    for (let i = 0; i < WW * WH; i++) wm[i] = water.data[i * 4] / 255;
    CPU_MAPS.Earth = { height: { w: W, h: H, data: hm, scale: 7800, offset: 0 }, water: { w: WW, h: WH, data: wm }, waterBlur: blur(wm, WW, WH, 6) };
  })().catch(e => console.warn('earth maps', e)));
  jobs.push((async () => {
    const meta = await (await fetch('assets/planets/moon_height16.json')).json();
    const px = await imagePixels('assets/planets/moon_height16.png');
    const n = px.w * px.h, hm = new Float32Array(n);
    for (let i = 0; i < n; i++) hm[i] = (px.data[i * 4] * 256 + px.data[i * 4 + 1]) / 65535;
    CPU_MAPS.Moon = { height: { w: px.w, h: px.h, data: hm, scale: meta.max - meta.min, offset: meta.min - 1737 * 0 } };
  })().catch(e => console.warn('moon maps', e)));
  await Promise.all(jobs);
}
// coarse albedo maps are loaded lazily per body (for biome/scatter)
const albedoPending = new Map();
export function cpuAlbedo(bodyName) {
  const m = CPU_MAPS[bodyName] || (CPU_MAPS[bodyName] = {});
  if (m.albedo) return m.albedo;
  if (!PLANET_MAPS[bodyName] || albedoPending.has(bodyName)) return null;
  albedoPending.set(bodyName, imagePixels(`assets/planets/${PLANET_MAPS[bodyName]}.webp`, 2048, 1024).then(px => { m.albedo = px; }).catch(() => {}));
  return null;
}
export async function ensureAlbedo(bodyName) { cpuAlbedo(bodyName); await albedoPending.get(bodyName); return CPU_MAPS[bodyName]?.albedo; }

function blur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * W + ((x + W) % W)]; for (let x = 0; x < W; x++) { tmp[y * W + x] = s / (2 * r + 1); s += src[y * W + ((x + r + 1) % W)] - src[y * W + ((x - r + W) % W)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.max(0, Math.min(H - 1, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / (2 * r + 1); s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}
export function sampleMap(m, lat, lon) { // bilinear, equirect lon0 centre
  const u = ((lon + 180) / 360) * m.w - 0.5, v = ((90 - lat) / 180) * m.h - 0.5;
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, W = m.w, H = m.h, d = m.data;
  const X0 = ((x0 % W) + W) % W, X1 = (X0 + 1) % W, Y0 = Math.max(0, Math.min(H - 1, y0)), Y1 = Math.max(0, Math.min(H - 1, y0 + 1));
  const a = d[Y0 * W + X0], b = d[Y0 * W + X1], c = d[Y1 * W + X0], e = d[Y1 * W + X1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
}
export function sampleRGB(px, lat, lon, out) {
  const x = Math.floor(((lon + 180) / 360) * px.w) % px.w, y = Math.max(0, Math.min(px.h - 1, Math.floor(((90 - lat) / 180) * px.h)));
  const i = (y * px.w + ((x + px.w) % px.w)) * 4; out[0] = px.data[i] / 255; out[1] = px.data[i + 1] / 255; out[2] = px.data[i + 2] / 255; return out;
}

// ---------- ground texture arrays ----------------------------------------------------------
let groundArrays = null;
export async function loadGroundArrays() {
  if (groundArrays) return groundArrays;
  const S = 512;
  const N = GROUND_LAYERS.length;
  const alb = new Uint8Array(S * S * 4 * N), nrm = new Uint8Array(S * S * 4 * N);
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  await Promise.all(GROUND_LAYERS.map(async (name, i) => {
    try {
      const [d, n] = await Promise.all([loadImage(`assets/ground/${name}_diff.webp`), loadImage(`assets/ground/${name}_nor.webp`)]);
      return { i, d, n };
    } catch (e) { return { i }; }
  })).then(list => {
    for (const { i, d, n } of list) {
      if (!d) continue;
      g.clearRect(0, 0, S, S); g.drawImage(d, 0, 0, S, S); alb.set(g.getImageData(0, 0, S, S).data, i * S * S * 4);
      g.clearRect(0, 0, S, S); g.drawImage(n, 0, 0, S, S); nrm.set(g.getImageData(0, 0, S, S).data, i * S * S * 4);
    }
  });
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, S, S, N);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; return t;
  };
  groundArrays = { albedo: mk(alb, true), normal: mk(nrm, false), size: S };
  return groundArrays;
}
export const getGroundArrays = () => groundArrays;

// Per-body ground palette: [flat, flat2, steep/cliff, special(snow/ice/dust), beach/lowland]
export function groundPalette(body) {
  const n = body.name, st = body.style || {};
  const P = (a, b, c, d, e) => [GL[a], GL[b], GL[c], GL[d], GL[e]];
  if (n === 'Earth' || st.kind === 'terra' || st.kind === 'earth') return P('grass_path_3', 'forrest_ground_01', 'rock_face_03', 'snow_02', 'coast_sand_01');
  if (n === 'Moon' || n === 'Mercury' || n === 'Callisto' || n === 'Ceres') return P('moon_01', 'moon_dusted_02', 'dark_rock', 'moon_meteor_01', 'moon_dusted_02');
  if (n === 'Mars' || /desert/.test(body.class || '')) return P('red_sand', 'red_laterite_soil_stones', 'rock_face_03', 'dry_ground_rocks', 'red_sand');
  if (n === 'Venus' || st.lava) return P('dark_rock', 'burned_ground_01', 'rock_face_03', 'mud_cracked_dry_03', 'dark_rock');
  if (n === 'Io') return P('mud_cracked_dry_03', 'sand_01', 'dark_rock', 'burned_ground_01', 'sand_01');
  if (n === 'Titan' || body.class === 'titan') return P('sand_01', 'brown_mud_02', 'gravel_ground_01', 'mud_cracked_dry_03', 'brown_mud_02');
  if (st.kind === 'icy') return P('snow_field_aerial', 'snow_02', 'lichen_rock', 'moon_dusted_02', 'snow_02');
  if (st.kind === 'asteroid') return P('moon_dusted_02', 'gravel_ground_01', 'dark_rock', 'moon_meteor_01', 'moon_01');
  return P('moon_01', 'gravel_ground_01', 'rocky_terrain_02', 'moon_meteor_01', 'dry_ground_rocks');
}

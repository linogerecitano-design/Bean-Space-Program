// Main-thread scheduler for world bakes: worker pool, priorities, IndexedDB cache, and applying
// the finished maps to a body (terrain height map, albedo texture, cloud coverage).
import * as THREE from 'three';
import { recipeFor, BAKE_VERSION } from './worlds.js';
export { recipeFor };
import { IS_MOBILE } from '../render/textures.js';

const NW = IS_MOBILE ? 1 : Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 4) - 2));
const workers = [];
const busy = new Set();
const queue = []; // {body, prio, resolve}
const pending = new Map(); // key -> promise
let jobId = 1;
const jobs = new Map();
export const bakeListeners = new Set();
export const bakeStatus = { active: 0, queued: 0, current: '' };

function worker(i) {
  if (!workers[i]) {
    const w = new Worker(new URL('../workers/bakeWorker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { const j = jobs.get(e.data.id); if (!j) return; if (e.data.progress !== undefined) { j.progress = e.data.progress; bakeStatus.current = `${j.body.name}: ${e.data.msg}`; return; } jobs.delete(e.data.id); j.done(e.data); };
    workers[i] = w;
  }
  return workers[i];
}

// ---------------------------------------------------------------- IndexedDB cache
let dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise((res) => {
    try {
      const r = indexedDB.open('bsp-bakes', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('maps');
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbP;
}
async function cacheGet(key) { const d = await db(); if (!d) return null; return new Promise((res) => { try { const t = d.transaction('maps', 'readonly').objectStore('maps').get(key); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); } catch (e) { res(null); } }); }
async function cachePut(key, val) { const d = await db(); if (!d) return; try { d.transaction('maps', 'readwrite').objectStore('maps').put(val, key); } catch (e) {} }

function sizeFor(body, recipe) {
  const big = body.radius > 2000e3;
  if (recipe === 'vesta') return 1024;
  if (IS_MOBILE) return big ? 1024 : 512;
  return big ? 2048 : 1024;
}
export function bakeKey(body, kind = 'surface') { return kind === 'clouds' ? `${body.sys.starId}/${body.name}/clouds/v${BAKE_VERSION}/${IS_MOBILE ? 1024 : 2048}` : `${body.sys.starId}/${body.name}/v${BAKE_VERSION}/${sizeFor(body, recipeFor(body))}`; }
const REAL_CLOUD_PRESET = { Earth: 'earth', Mars: 'mars', Venus: 'venus' };
export function requestCloudBake(body, prio = 1) {
  const preset = body.sys.real && REAL_CLOUD_PRESET[body.name]; if (!preset || body.cloudStack) return null;
  const key = bakeKey(body, 'clouds');
  if (pending.has(key)) return pending.get(key);
  const w = IS_MOBILE ? 1024 : 2048;
  const p = new Promise((resolve) => queue.push({ body, prio, resolve, key, params: { recipe: 'clouds', cloudPreset: preset, w, h: w / 2, seed: body.seed } }));
  pending.set(key, p); pump(); return p;
}

function paramsFor(body, recipe) {
  const st = body.style || {}; const c = st.colors || {};
  const w = sizeFor(body, recipe);
  const icyPolar = recipe === 'icy' ? null : (st.iceCaps ? [0.94, 0.94, 0.95] : null);
  return {
    recipe, w, h: w / 2, seed: (body.seed ^ ((st.seed || 0) * 2654435761)) >>> 0, R: body.radius, colors: c.low ? { low: c.low, mid: c.mid, high: c.high } : null,
    crackColor: c.crack, polar: icyPolar, iceCaps: st.iceCaps, Teq: body.Teq, starTemp: body.sys.star.temp || 5772, locked: !!body.locked,
    gravity: body.mu / body.radius ** 2, oceanFrac: st.oceanFrac, clouds: !!st.clouds, cloudAmount: st.clouds ? st.clouds.coverage : 0, ocean: c.ocean,
    faculae: st.faculae || 0, icePatches: st.icePatches || 0, scarps: !!st.scarps, forming: !!st.forming, cls: body.class || null,
    craters: st.craters ?? null, volcanic: st.volcanic || 0, cracks: st.cracks || 0, grooves: st.grooves || 0,
  };
}

export function needsBake(body) {
  if (body.baked || body._bakeFailed) return false;
  const r = recipeFor(body); if (!r) return false;
  // real bodies with genuine imagery keep it
  if (body.sys.real && body.hasRealMap) return false;
  return true;
}

export function requestBake(body, prio = 0) {
  if (!needsBake(body)) return null;
  const key = bakeKey(body);
  if (pending.has(key)) { const q = queue.find((j) => j.body === body); if (q) q.prio = Math.max(q.prio, prio); return pending.get(key); }
  const p = new Promise((resolve) => queue.push({ body, prio, resolve, key }));
  pending.set(key, p);
  pump();
  return p;
}

async function pump() {
  bakeStatus.queued = queue.length;
  for (let i = 0; i < NW; i++) {
    if (busy.has(i) || !queue.length) continue;
    queue.sort((a, b) => b.prio - a.prio);
    const job = queue.shift(); busy.add(i); bakeStatus.active = busy.size;
    (async () => {
      const { body, key } = job;
      let res = await cacheGet(key);
      if (!res) {
        const params = job.params || paramsFor(body, recipeFor(body));
        res = await new Promise((done) => { const id = jobId++; jobs.set(id, { body, done }); worker(i).postMessage({ id, params }); });
        if (res.error) { console.warn('bake failed', body.name, res.error); body._bakeFailed = true; busy.delete(i); job.resolve(null); pump(); return; }
        res = res.result;
        cachePut(key, res);
      }
      if (res.cloudsOnly) applyClouds(body, res.clouds); else applyBake(body, res);
      busy.delete(i); bakeStatus.active = busy.size;
      job.resolve(body);
      for (const f of bakeListeners) try { f(body, res.cloudsOnly ? 'clouds' : 'surface'); } catch (e) { console.error(e); }
      pump();
    })();
  }
}

function cloudTexture(c) {
  const t = new THREE.DataTexture(c.data, c.w, c.h, THREE.RGBAFormat); t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
export function applyClouds(body, c) { if (!c) return; body.cloudStack = { tex: cloudTexture(c), preset: c.stack || 'earth' }; delete body._clouds; }
export function applyBake(body, r) {
  const tex = new THREE.DataTexture(r.color, r.w, r.h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 8; tex.needsUpdate = true;
  let cloudTex = null;
  if (r.clouds) { applyClouds(body, r.clouds); cloudTex = body.cloudStack.tex; }
  body.baked = { colorTex: tex, cloudTex, hmap: { w: r.w, h: r.h, data: r.height, scale: 1, offset: 0 }, color: r.color, w: r.w, h: r.h, features: r.features || [], seaLevel: r.seaLevel, relief: r.relief };
  if (r.seaLevel === 0 && body.style) body.style = { ...body.style, seaLevel: 0 };
  body._surface = null; body.bakeGen = (body.bakeGen || 0) + 1;
  body.features = r.features;
}
// Sample the baked albedo (rows are stored bottom-up for the GPU)
export function bakedAlbedo(body, lat, lon, out) {
  const b = body.baked; if (!b) return null;
  const x = Math.floor(((lon + 180) / 360) * b.w) % b.w, yN = Math.max(0, Math.min(b.h - 1, Math.floor(((90 - lat) / 180) * b.h)));
  const i = ((b.h - 1 - yN) * b.w + ((x + b.w) % b.w)) * 4;
  out[0] = b.color[i] / 255; out[1] = b.color[i + 1] / 255; out[2] = b.color[i + 2] / 255; return out;
}
export function prefetchSystem(sys) {
  for (const b of sys.bodies) requestCloudBake(b, b.name === 'Earth' ? 6 : 2);
  for (const b of sys.bodies) if (needsBake(b)) requestBake(b, b.type === 'planet' ? 2 : b.type === 'dwarf' ? 1 : 0);
}

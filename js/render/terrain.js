// Cube-sphere quadtree terrain for every solid body. Root level doubles as the "far" planet
// mesh; the macro texture is the real map (or a worker-generated procedural map). Close to the
// ground, tiled Poly Haven materials are blended in (biplanar, normal mapped, parallax offset).
import * as THREE from 'three';
import { planetTexture, PLANET_MAPS, PLANET_EXTRA, getGroundArrays, groundPalette, IS_MOBILE, CPU_MAPS } from './textures.js';
import { FACES, faceDir, edgeRing, buildChunk } from '../gen/terrainBuild.js';
import { settings } from '../game/settings.js';

const N = IS_MOBILE ? 25 : 33; // vertices per chunk edge

// ------------------------------------------------------------------ worker pool
// Chunk geometry is generated in workers so flying fast over a planet never stalls a frame.
const NW = typeof Worker === 'undefined' ? 0 : IS_MOBILE ? 2 : Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
const pool = { workers: [], registered: [], jobs: new Map(), nextId: 1, rr: 0, local: NW === 0 };
// main-thread fallback, for hosts that refuse module workers (some sandboxes / CSPs)
function localBuild(terrain, job, done) {
  setTimeout(() => { let res; try { res = { r: buildChunk(terrain.body.surface, job) }; } catch (err) { res = { error: String(err) }; } done(res); }, 0);
}
function workersFailed() {
  if (pool.local) return; pool.local = true; console.warn('terrain workers unavailable; building chunks on the main thread');
  for (const [id, j] of pool.jobs) localBuild(j.terrain, j.job, j.done);
  pool.jobs.clear(); pool.workers.forEach(w => w && w.terminate());
}
function poolWorker(i) {
  if (!pool.workers[i]) {
    let w;
    try { w = new Worker(new URL('../workers/terrainWorker.js', import.meta.url), { type: 'module' }); } catch (e) { workersFailed(); return null; }
    w.onmessage = (e) => { const j = pool.jobs.get(e.data.id); if (!j) return; pool.jobs.delete(e.data.id); j.done(e.data); };
    w.onerror = () => workersFailed();
    pool.workers[i] = w; pool.registered[i] = new Set();
  }
  return pool.workers[i];
}
function surfaceMaps(body) {
  if (body.baked) return { height: body.baked.hmap };
  const m = body.sys.real ? CPU_MAPS[body.name] : null;
  if (!m) return null;
  const out = {};
  if (m.height) out.height = m.height;
  if (m.water) { out.water = m.water; out.waterBlur = m.waterBlur; }
  return Object.keys(out).length ? out : null;
}
function submitChunk(terrain, job, done) {
  if (pool.local) return localBuild(terrain, job, done);
  const i = pool.rr++ % NW; const w = poolWorker(i);
  if (!w) return localBuild(terrain, job, done);
  if (!pool.registered[i].has(terrain.key)) {
    const b = terrain.body;
    w.postMessage({ type: 'body', key: terrain.key, def: { name: b.name, radius: b.radius, style: b.style }, maps: surfaceMaps(b) });
    pool.registered[i].add(terrain.key);
  }
  const id = pool.nextId++; pool.jobs.set(id, { done, terrain, job });
  w.postMessage({ type: 'build', id, key: terrain.key, job });
}

// shared index buffer (grid + skirt)
let INDEX = null;
function gridIndex() {
  if (INDEX) return INDEX;
  const idx = [];
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  // skirt: ring of N*4 extra vertices appended after grid
  const base = N * N;
  const edge = edgeRing(N);
  for (let k = 0; k < edge.length; k++) {
    const a = edge[k], b = edge[(k + 1) % edge.length], sa = base + k, sb = base + (k + 1) % edge.length;
    idx.push(a, sa, b, b, sa, sb);
  }
  INDEX = { index: new THREE.BufferAttribute(new Uint32Array(idx), 1), edge };
  return INDEX;
}

// ------------------------------------------------------------------ material
const macroWorker = typeof Worker !== 'undefined' ? new Worker(new URL('../workers/macroWorker.js', import.meta.url), { type: 'module' }) : null;
const macroJobs = new Map(); let macroId = 1;
if (macroWorker) macroWorker.onmessage = (e) => { const j = macroJobs.get(e.data.id); macroJobs.delete(e.data.id); j && j(e.data); };
const proceduralMacro = new Map();
export function macroTextureFor(body) {
  if (body.baked) return { tex: body.baked.colorTex, real: true, baked: true };
  if (PLANET_MAPS[body.name] && body.sys.real) return { tex: planetTexture(PLANET_MAPS[body.name]), real: true };
  let m = proceduralMacro.get(body);
  if (m) return m;
  const big = body.radius > 1.5e6;
  const w = IS_MOBILE ? (big ? 512 : 256) : (big ? 1024 : 512), h = w / 2;
  const data = new Uint8Array(w * h * 4); const c = body.style?.colors?.mid || [0.5, 0.5, 0.5];
  for (let i = 0; i < w * h; i++) { data[i * 4] = Math.pow(c[0], 1 / 2.2) * 255; data[i * 4 + 1] = Math.pow(c[1], 1 / 2.2) * 255; data[i * 4 + 2] = Math.pow(c[2], 1 / 2.2) * 255; data[i * 4 + 3] = 128; }
  const tex = new THREE.DataTexture(data, w, h); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.flipY = true;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  m = { tex, real: false, heightRange: 1 }; proceduralMacro.set(body, m);
  if (macroWorker) {
    const id = macroId++;
    macroJobs.set(id, (r) => { tex.image = { data: r.data, width: r.w, height: r.h }; tex.needsUpdate = true; m.heightRange = r.hmax - r.hmin; m.ready = true; });
    macroWorker.postMessage({ id, w, h, body: { name: body.name, radius: body.radius, style: body.style } });
  }
  return m;
}

const blankTex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); blankTex.needsUpdate = true;
// Height map as a half-float texture (km), rows flipped so v=1 is north like the colour maps.
// The terrain shader derives lighting normals from it, so craters and ranges are lit by the real
// sun at any distance instead of by the coarse far-LOD vertex normals.
function heightSource(body) {
  if (body.baked) return body.baked.hmap;
  if (body.sys.real && body.name !== 'Earth' && CPU_MAPS[body.name] && CPU_MAPS[body.name].height) return CPU_MAPS[body.name].height;
  return null;
}
export function heightTexture(body) {
  const hm = heightSource(body); if (!hm) return null;
  if (body._hTex && body._hTex.userData.src === hm) return body._hTex;
  const { w, h, data } = hm; const sc = hm.scale ?? 1, off = hm.offset ?? 0;
  const out = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) { const src = y * w, dst = (h - 1 - y) * w; for (let x = 0; x < w; x++) out[dst + x] = THREE.DataUtils.toHalfFloat((data[src + x] * sc + off) / 1000); }
  const t = new THREE.DataTexture(out, w, h, THREE.RedFormat, THREE.HalfFloatType);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  t.userData.src = hm; body._hTex = t; return t;
}

export function makeTerrainMaterial(body) {
  const macro = macroTextureFor(body);
  const ga = getGroundArrays();
  const pal = groundPalette(body);
  const extra = (body.sys.real && PLANET_EXTRA[body.name]) || {};
  const earthLike = body.name === 'Earth' || body.style?.kind === 'terra';
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.0 });
  const U = {
    uMacro: { value: macro.tex }, uMacroReal: { value: macro.real ? 1 : 0 }, uHeightRange: { value: 1 },
    uGroundA: { value: ga ? ga.albedo : null }, uGroundN: { value: ga ? ga.normal : null }, uHasGround: { value: ga ? 1 : 0 },
    uPal: { value: new THREE.Vector4(pal[0], pal[1], pal[2], pal[3]) }, uPal4: { value: pal[4] },
    uBFtoView: { value: new THREE.Matrix3() }, uSunBF: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 },
    uNight: { value: extra.night ? planetTexture(extra.night) : blankTex }, uHasNight: { value: extra.night ? 1 : 0 },
    uClouds: { value: extra.clouds && body.name === 'Earth' ? planetTexture(extra.clouds, false) : body.cloudStack ? body.cloudStack.tex : blankTex }, uHasClouds: { value: (extra.clouds && body.name === 'Earth') || body.cloudStack ? 1 : 0 },
    uCloudRot: { value: 0 }, uEarthLike: { value: earthLike ? 1 : 0 }, uRadius: { value: body.radius }, uLava: { value: body.style?.lava || 0 },
    uDetailFade: { value: IS_MOBILE ? 3000 : 7000 }, uSiteDir: { value: new THREE.Vector3(0, 0, 0) }, uSiteR: { value: 0 }, uLonOff: { value: macro.real && body.name === 'Pluto' ? 0.5 : 0 }, uSunI: { value: 3 }, uCrater: { value: (['airless', 'icy'].includes(body.surface?.detailType) ? 1 : 0) ? Math.max(0.15, Math.min(1, body.style?.craters ?? 0.5)) : 0 }, uHeightTex: { value: blankTex }, uHasHeight: { value: 0 }, uHTexel: { value: new THREE.Vector2(1, 1) },
  };
  const ht = heightTexture(body); if (ht) { U.uHeightTex.value = ht; U.uHasHeight.value = 1; U.uHTexel.value.set(1 / ht.image.width, 1 / ht.image.height); }
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aWater; attribute vec3 aDir; attribute vec3 aT1; attribute vec3 aT2;
        varying vec3 vDir; varying vec3 vT1; varying vec3 vT2; varying vec3 vNBF; varying float vWater; varying float vCamDist;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDir = aDir; vT1 = aT1; vT2 = aT2; vNBF = normal; vWater = aWater;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vCamDist = length(mvPosition.xyz);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2D uMacro, uNight, uClouds, uHeightTex; uniform float uHasHeight; uniform vec2 uHTexel; uniform vec3 uSiteDir; uniform float uSiteR; uniform float uSunI; uniform float uCrater; uniform float uMacroReal, uHeightRange, uHasGround, uHasNight, uHasClouds, uCloudRot, uEarthLike, uRadius, uLava, uTime, uDetailFade;
        uniform sampler2DArray uGroundA, uGroundN; uniform vec4 uPal; uniform float uPal4;
        uniform vec3 uSunBF; uniform mat3 uBFtoView;
        varying vec3 vDir; varying vec3 vT1; varying vec3 vT2; varying vec3 vNBF; varying float vWater; varying float vCamDist;
        vec2 eqUV(vec3 d){ return vec2(atan(-d.z, d.x) * 0.15915494 + 0.5, 0.5 + asin(clamp(d.y,-1.0,1.0)) * 0.31830988); }
        uniform float uLonOff;
        vec4 sampleEq(sampler2D t, vec3 d){
          vec2 uv = eqUV(d); uv.x += uLonOff; vec2 dx = dFdx(uv), dy = dFdy(uv);
          if (abs(dx.x) > 0.5) dx.x -= sign(dx.x); if (abs(dy.x) > 0.5) dy.x -= sign(dy.x);
          return textureGrad(t, uv, dx, dy);
        }
        // biplanar sampling of a ground layer (two dominant projection planes)
        void groundSample(float layer, vec3 p, vec3 n, float scale, out vec4 alb, out vec4 nrm, vec3 viewBF, float parallax){
          vec3 a = abs(n);
          ivec3 ma = (a.x>a.y && a.x>a.z) ? ivec3(0,1,2) : (a.y>a.z) ? ivec3(1,2,0) : ivec3(2,0,1);
          ivec3 mi = (a.x<a.y && a.x<a.z) ? ivec3(0,1,2) : (a.y<a.z) ? ivec3(1,2,0) : ivec3(2,0,1);
          ivec3 me = ivec3(3) - mi - ma;
          vec2 uvA = vec2(p[ma.y], p[ma.z]) / scale, uvB = vec2(p[me.y], p[me.z]) / scale;
          if (parallax > 0.0) {
            // parallax occlusion mapping on the main plane: march the view ray down through the height
            // field (stored in the normal map's alpha) so pebbles, cracks and clods read as real relief
            vec2 gx = dFdx(uvA), gy = dFdy(uvA);
            float vz = max(viewBF[ma.x] * sign(n[ma.x]), 0.22);
            vec2 dir = vec2(viewBF[ma.y], viewBF[ma.z]) / vz;
            const int PSTEPS = ${IS_MOBILE ? 6 : 10};
            vec2 duv = -dir * (0.075 * parallax) / float(PSTEPS);
            float dl = 1.0 / float(PSTEPS), d = 0.0; vec2 uv = uvA;
            float depth = 1.0 - textureGrad(uGroundN, vec3(uv, layer), gx, gy).a;
            for (int i = 0; i < PSTEPS; i++) { if (d >= depth) break; uv += duv; d += dl; depth = 1.0 - textureGrad(uGroundN, vec3(uv, layer), gx, gy).a; }
            vec2 prev = uv - duv; float after = depth - d, before = (1.0 - textureGrad(uGroundN, vec3(prev, layer), gx, gy).a) - (d - dl);
            uvA = mix(uv, prev, clamp(after / (after - before + 1e-5), 0.0, 1.0));
          }
          vec2 w = vec2(a[ma.x], a[me.x]); w = clamp((w - 0.5773) / (1.0 - 0.5773), 0.0, 1.0); w = pow(w, vec2(4.0)); w /= (w.x + w.y + 1e-5);
          alb = texture(uGroundA, vec3(uvA, layer)) * w.x + texture(uGroundA, vec3(uvB, layer)) * w.y;
          vec4 nA = texture(uGroundN, vec3(uvA, layer)), nB = texture(uGroundN, vec3(uvB, layer));
          // tangent-space -> body-fixed (whiteout-ish along the projection axes)
          vec3 tA = vec3(0.0); tA[ma.y] = nA.x*2.0-1.0; tA[ma.z] = nA.y*2.0-1.0;
          vec3 tB = vec3(0.0); tB[me.y] = nB.x*2.0-1.0; tB[me.z] = nB.y*2.0-1.0;
          nrm = vec4(tA * w.x + tB * w.y, nA.a * w.x + nB.a * w.y);
          alb.rgb *= mix(0.8, 1.04, nrm.a); // crevices between stones and clods catch less light
        }
        float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
        float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
        // slope of one small crater per jittered cell (bowl + raised rim). Craters stay inside
        // their own cell, so only the home cell needs testing.
        vec3 craterGrad(vec3 q){
          vec3 c = floor(q); float h = h31(c + 17.0);
          if (h > 0.12 + 0.3 * uCrater) return vec3(0.0); // fewer small craters on younger surfaces
          vec3 ctr = c + 0.5 + (vec3(h31(c + 3.1), h31(c + 7.7), h31(c + 11.3)) - 0.5) * 0.46;
          float rad = 0.06 + 0.2 * h31(c + 5.9) * h31(c + 9.4);
          vec3 d = q - ctr; float r = length(d) / rad; if (r > 1.0) return vec3(0.0);
          float fresh = 0.35 + 0.65 * h31(c + 2.3); float A = 0.45 * fresh;
          float dh = r < 0.7 ? 2.0 * A * r : A * 0.12 * 10.47 * cos(3.14159 * (r - 0.7) / 0.3);
          return normalize(d + 1e-6) * dh;
        }`)
      .replace('#include <map_fragment>', `
        vec3 dirBF = normalize(vDir);
        vec3 bf = vT2;
        vec4 macro = sampleEq(uMacro, dirBF);
        vec3 macroCol = macro.rgb;
        if (uSiteR > 0.0 && vWater < 0.25) {
          float sa = acos(clamp(dot(dirBF, uSiteDir), -1.0, 1.0));
          // coastal scrub: patches of lush and dry grass, sandy clearings (noise in metres around the site)
          vec3 sp = (dirBF - uSiteDir) * uRadius;
          float n1 = vnoise(sp / 140.0) * 0.6 + vnoise(sp / 37.0) * 0.4, n2 = vnoise(sp / 600.0 + 7.3);
          vec3 site = mix(vec3(0.075, 0.11, 0.04), vec3(0.14, 0.14, 0.07), smoothstep(0.35, 0.75, n1));
          site = mix(site, vec3(0.2, 0.18, 0.12), smoothstep(0.7, 0.85, n2) * 0.7);
          site *= 0.85 + 0.3 * vnoise(sp / 9.0);
          macroCol = mix(macroCol, site, 1.0 - smoothstep(uSiteR * 0.5, uSiteR * (1.6 + 0.5 * n2), sa));
          // land built where the coarse satellite image shows lagoon/sea: paint it as coastal scrub, not blue
          float wl = smoothstep(0.015, 0.06, macroCol.b - max(macroCol.r, macroCol.g * 0.8)) * (1.0 - smoothstep(0.18, 0.32, lum(macroCol)));
          macroCol = mix(macroCol, site, wl * (1.0 - smoothstep(uSiteR * 5.0, uSiteR * 7.0, sa)));
        }
        vec3 nGeo = normalize(vNBF);
        if (uHasHeight > 0.5) {
          // lighting normal from the height map (finite differences over one texel)
          vec2 huv = eqUV(dirBF); huv.x += uLonOff;
          float hlat = asin(clamp(dirBF.y, -1.0, 1.0));
          float hE = texture(uHeightTex, huv + vec2(uHTexel.x, 0.0)).r, hW = texture(uHeightTex, huv - vec2(uHTexel.x, 0.0)).r;
          float hN = texture(uHeightTex, huv + vec2(0.0, uHTexel.y)).r, hS = texture(uHeightTex, huv - vec2(0.0, uHTexel.y)).r;
          float mE = 12.5663706 * uRadius * uHTexel.x * max(cos(hlat), 0.03), mN = 6.2831853 * uRadius * uHTexel.y;
          vec3 east = normalize(vec3(dirBF.z, 0.0, -dirBF.x) + vec3(1e-6)); vec3 north = cross(dirBF, east);
          vec3 nH = normalize(dirBF - east * ((hE - hW) * 1000.0 / mE) - north * ((hN - hS) * 1000.0 / mN));
          float texelM = 6.2831853 * uRadius * uHTexel.x;
          float farK = smoothstep(texelM * 6.0, texelM * 30.0, vCamDist);
          nGeo = normalize(mix(nGeo, nH, farK));
        }
        // screen-scale relief: two octaves of noise bumps sized to ~1% of the view distance and
        // cross-faded by log2(distance), so fresh detail keeps appearing as you approach
        if (vWater < 0.25) {
          float feat = max(vCamDist * 0.012, 25.0); float lg = log2(feat); float o0 = floor(lg); float fb = lg - o0;
          vec3 bp = dirBF * uRadius; vec3 g = vec3(0.0);
          for (int k = 0; k < 2; k++) {
            float sc = exp2(o0 + float(k)); vec3 q = bp / sc; float e = 0.35;
            float n0 = vnoise(q); vec3 gg = vec3(vnoise(q + vec3(e, 0.0, 0.0)) - n0, vnoise(q + vec3(0.0, e, 0.0)) - n0, vnoise(q + vec3(0.0, 0.0, e)) - n0) / e;
            g += gg * (k == 0 ? 1.0 - fb : fb);
          }
          g -= dirBF * dot(g, dirBF);
          float bumpK = (uEarthLike > 0.5 ? 0.12 : mix(0.16, 0.08, uCrater)) * smoothstep(uDetailFade * 0.5, uDetailFade * 1.5, vCamDist);
          vec3 cg = vec3(0.0);
          if (uCrater > 0.01) {
            // craters from ~feature size up to 8x that, so new ones keep resolving as you descend. Each
            // octave's pattern is keyed to its absolute size (o0 + k), not its slot, so craters stay put
            // as octaves shift while zooming (keying by slot made them jump to new positions).
            for (int k = 0; k < 4; k++) {
              float oct = o0 + float(k);
              float sc = exp2(oct) * 2.0; float wk = k == 0 ? 1.0 - fb : k == 3 ? fb : 1.0;
              vec3 off = fract(vec3(0.37, 0.71, 0.13) * oct + vec3(0.11, 0.53, 0.29) * oct * oct * 0.01) * 97.0;
              cg += craterGrad(bp / sc + off) * wk;
            }
            cg -= dirBF * dot(cg, dirBF);
          }
          nGeo = normalize(nGeo - g * bumpK - cg * 0.9 * uCrater);
        }
        float slope = 1.0 - dot(nGeo, dirBF);
        vec3 nBF = nGeo;
        float detailK = (1.0 - smoothstep(uDetailFade * 0.35, uDetailFade, vCamDist)) * uHasGround;
        float isWater = step(0.25, vWater);
        if (detailK > 0.001 && isWater < 0.5) {
          // choose two ground layers from the palette by slope + macro colour
          float cliff = smoothstep(0.18, 0.42, slope);
          float bright = lum(macroCol);
          float snow = uEarthLike > 0.5 ? smoothstep(0.55, 0.75, min(macroCol.r, min(macroCol.g, macroCol.b))) : smoothstep(0.7, 0.9, bright) * 0.6;
          float green = uEarthLike > 0.5 ? smoothstep(0.0, 0.05, macroCol.g - max(macroCol.r, macroCol.b) * 0.92) : 0.0;
          float sandy = uEarthLike > 0.5 ? smoothstep(0.28, 0.45, bright) * (1.0 - green) : 0.0;
          float n1 = texture(uGroundN, vec3(vT2.xz / 296.0, uPal.x)).a;
          float l1 = uPal.x, l2 = uPal.y, m = 0.0;
          if (uEarthLike > 0.5) { l1 = green > 0.5 ? (bright < 0.13 ? uPal.y : uPal.x) : (sandy > 0.5 ? uPal4 : uPal.z); l2 = cliff > 0.5 ? uPal.z : (snow > 0.3 ? uPal.w : uPal.y); m = max(cliff, snow); if (green > 0.5 && cliff < 0.5 && snow < 0.3) { l2 = uPal.y; m = smoothstep(0.2, 0.1, bright) ; } }
          else { l1 = uPal.x; l2 = cliff > 0.3 ? uPal.z : (snow > 0.3 ? uPal.w : uPal.y); m = max(cliff, max(snow, smoothstep(0.35, 0.65, n1) * 0.7)); }
          vec3 viewBF = normalize(transpose(uBFtoView) * vec3(0.0, 0.0, 1.0));
          float par = 1.0 - smoothstep(25.0, 70.0, vCamDist);
          vec4 a1, n1v, a2, n2v, a3, n3v, a4, n4v;
          groundSample(l1, vT1, nGeo, 4.0, a1, n1v, viewBF, par);
          groundSample(l2, vT1, nGeo, 4.0, a2, n2v, viewBF, par);
          groundSample(l1, vT2, nGeo, 37.0, a3, n3v, viewBF, 0.0);
          groundSample(l2, vT2, nGeo, 37.0, a4, n4v, viewBF, 0.0);
          // height-based blend between layers
          float hb = clamp((m - 0.5) * 2.0 + (n2v.a - n1v.a) * 1.5 + 0.5, 0.0, 1.0);
          float far = smoothstep(25.0, 250.0, vCamDist);
          vec4 A = mix(mix(a1, a2, hb), mix(a3, a4, hb), far * 0.7);
          vec4 NN = mix(mix(n1v, n2v, hb), mix(n3v, n4v, hb), far * 0.7);
          vec3 avg = mix(textureLod(uGroundA, vec3(0.5, 0.5, l1), 12.0).rgb, textureLod(uGroundA, vec3(0.5, 0.5, l2), 12.0).rgb, hb);
          vec3 ratio = A.rgb / max(avg, vec3(0.03));
          vec3 detailCol = mix(macroCol * ratio, A.rgb * (lum(macroCol) / max(lum(avg), 0.03)), (1.0 - far) * 0.55);
          macroCol = mix(macroCol, detailCol, detailK);
          nBF = normalize(nGeo + NN.xyz * detailK * 1.2);
        }
        vec3 waterSky = vec3(0.0);
        if (isWater > 0.5) {
          float dk = clamp((vWater - 0.5) * 2.0, 0.0, 1.0);
          // waves: sums of sines whose wavevectors are integer multiples of 2pi/T so they tile
          // seamlessly across chunks (vT1 wraps every 64 m, vT2 every 296 m)
          float fade = 1.0 - smoothstep(800.0, 40000.0, vCamDist), fineFade = 1.0 - smoothstep(60.0, 1500.0, vCamDist);
          vec3 g = vec3(0.0);
          const float K2 = 6.2831853 / 296.0, K1 = 6.2831853 / 64.0;
          vec3 w1 = vec3(3.0, 1.0, 2.0) * K2, w2 = vec3(-2.0, 3.0, 5.0) * K2, w3 = vec3(5.0, -4.0, 1.0) * K2, w4 = vec3(1.0, 6.0, -3.0) * K2;
          g += w1 * cos(dot(vT2, w1) - uTime * 0.9) * 0.9 + w2 * cos(dot(vT2, w2) - uTime * 1.1) * 0.7 + w3 * cos(dot(vT2, w3) - uTime * 1.3) * 0.5 + w4 * cos(dot(vT2, w4) - uTime * 1.2) * 0.45;
          vec3 f1 = vec3(4.0, 1.0, 3.0) * K1, f2 = vec3(-3.0, 5.0, 2.0) * K1, f3 = vec3(2.0, -3.0, 6.0) * K1, f4 = vec3(7.0, 2.0, -1.0) * K1;
          g += (f1 * cos(dot(vT1, f1) - uTime * 2.1) + f2 * cos(dot(vT1, f2) - uTime * 2.6) + f3 * cos(dot(vT1, f3) - uTime * 2.3) + f4 * cos(dot(vT1, f4) - uTime * 3.0)) * 0.012 * fineFade;
          g -= dirBF * dot(g, dirBF);
          nBF = normalize(dirBF - g * 0.9 * fade * mix(0.3, 1.0, dk));
          vec3 deep = vec3(0.004, 0.018, 0.04), shallow = vec3(0.03, 0.14, 0.14);
          vec3 wcol = mix(shallow, deep, sqrt(dk));
          float nearW = 1.0 - smoothstep(20000.0, 200000.0, vCamDist); // satellite colours from afar, modelled water up close
          macroCol = uMacroReal > 0.5 ? mix(macroCol, wcol, nearW) : mix(macroCol, wcol, 0.5 * nearW);
          // surf where the sea meets land
          float foam = (1.0 - smoothstep(0.0, 0.03, dk)) * (0.5 + 0.5 * sin(dot(vT2, w1) * 3.0 - uTime * 1.5)) * fineFade;
          macroCol = mix(macroCol, vec3(0.85), foam * 0.7);
          // sky reflection (Fresnel); the sun glint comes from the standard specular term
          vec3 Vbf = normalize(transpose(uBFtoView) * normalize(vViewPosition));
          float cosV = clamp(dot(nBF, Vbf), 0.0, 1.0);
          float fr = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
          vec3 Rbf = reflect(-Vbf, nBF); float up = clamp(dot(Rbf, dirBF), 0.0, 1.0);
          float day = clamp(dot(dirBF, uSunBF) * 4.0 + 0.15, 0.0, 1.0);
          vec3 sky = mix(vec3(0.75, 0.82, 0.9), vec3(0.22, 0.42, 0.8), pow(up, 0.5)) * day * uSunI * 0.35;
          waterSky = sky * fr * mix(0.25, 1.0, nearW);
        }
        // cloud shadows (Earth)
        if (uHasClouds > 0.5) {
          vec3 cd = normalize(dirBF + uSunBF * 0.0012);
          float ca = cos(uCloudRot), sa = sin(uCloudRot);
          cd = vec3(ca * cd.x - sa * cd.z, cd.y, sa * cd.x + ca * cd.z);
          float cl = sampleEq(uClouds, cd).r;
          macroCol *= 1.0 - 0.55 * smoothstep(0.2, 0.8, cl);
        }
        diffuseColor.rgb *= macroCol;`)
      .replace('#include <normal_fragment_maps>', `normal = normalize(uBFtoView * nBF);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = isWater > 0.5 ? 0.07 : roughness;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float sunUp = dot(dirBF, uSunBF);
        totalEmissiveRadiance += waterSky;
        if (uHasNight > 0.5) { vec3 nl = sampleEq(uNight, dirBF).rgb; totalEmissiveRadiance += nl * nl * 1.6 * smoothstep(0.05, -0.15, sunUp) * smoothstep(4000.0, 40000.0, vCamDist) * (1.0 - isWater); }
        if (uLava > 0.0) { float lh = macro.a; totalEmissiveRadiance += vec3(1.6, 0.45, 0.08) * uLava * smoothstep(0.25, 0.05, lh) * 2.0; }`);
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
  return mat;
}

// ------------------------------------------------------------------ quadtree
class Node {
  constructor(t, face, level, a0, b0, size, parent) {
    this.t = t; this.face = face; this.level = level; this.a0 = a0; this.b0 = b0; this.size = size; this.parent = parent;
    this.children = null; this.mesh = null; this.state = 0; // 0 none, 1 queued, 2 ready
    const d = faceDir(face, a0 + size / 2, b0 + size / 2, [0, 0, 0]);
    this.dir = d;
    this.center = [d[0] * t.R, d[1] * t.R, d[2] * t.R];
    this.edge = size * t.R * 0.8; // approx world edge length
    this.lastUsed = 0;
  }
}

export class Terrain {
  constructor(body, renderCtx) {
    this.body = body; this.R = body.radius; this.ctx = renderCtx;
    this.surface = body.surface;
    this.group = new THREE.Group(); this.group.name = 'terrain:' + body.name;
    this.material = makeTerrainMaterial(body);
    this.roots = FACES.map((_, f) => new Node(this, f, 0, -1, -1, 2, null));
    this.queue = []; this.frame = 0; this.inFlight = 0;
    this.key = `${body.sys.starId}/${body.name}/${body.baked ? 'b' + (body.bakeGen || 0) : 'r'}/${body.radius}`;
    const faceEdge = Math.PI / 2 * this.R;
    this.maxLevel = Math.max(0, Math.min(22, Math.ceil(Math.log2(faceEdge / ((N - 1) * (IS_MOBILE ? 1.6 : 1.0))))));
    this.splitK = IS_MOBILE ? 1.5 : 2.2;
    this.visible = new Set();
    this.onChunkReady = null; this.onChunkDrop = null;
    this.seaLevel = (body.style && body.style.seaLevel !== undefined && body.style.seaLevel !== null) ? body.style.seaLevel : (body.name === 'Earth' ? 0 : null);
    this.macro = macroTextureFor(body);
    if (body.name === 'Earth' && body.sys.real) { const la = 28.6082 * Math.PI / 180, lo = -80.6041 * Math.PI / 180; this.material.userData.U.uSiteDir.value.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)); this.material.userData.U.uSiteR.value = 9000 / body.radius; }
  }
  jobFor(node) { return { face: node.face, a0: node.a0, b0: node.b0, size: node.size, n: N, R: this.R, sea: this.seaLevel, dir: node.dir, edge: node.edge }; }
  // Turn generated arrays into a chunk mesh (cheap: just buffer uploads)
  finish(node, r) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('aDir', new THREE.BufferAttribute(r.aDir, 3)); g.setAttribute('aT1', new THREE.BufferAttribute(r.aT1, 3)); g.setAttribute('aT2', new THREE.BufferAttribute(r.aT2, 3));
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3));
    g.setAttribute('aWater', new THREE.BufferAttribute(r.water, 1));
    g.setIndex(gridIndex().index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), r.radius);
    node.center = r.center;
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.set(r.center[0], r.center[1], r.center[2]);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.receiveShadow = true;
    mesh.userData.node = node;
    node.mesh = mesh; node.state = 2;
    if (this.onChunkReady) this.onChunkReady(node);
  }
  // synchronous build (no workers available)
  build(node) { this.finish(node, buildChunk(this.surface, this.jobFor(node))); }
  alive(node) { return !this.dead && node.state === 1 && (node.parent === null || (node.parent.children && node.parent.children.includes(node))); }
  dispatch(node) {
    node.state = 1; node.inFlight = true; this.inFlight++;
    submitChunk(this, this.jobFor(node), (res) => {
      this.inFlight--; node.inFlight = false;
      if (res.error) { console.warn('terrain chunk', res.error); node.state = 0; return; }
      if (this.alive(node)) this.finish(node, res.r); else if (node.state === 1) node.state = 0;
    });
  }
  dispose(node) {
    if (node.mesh) { this.group.remove(node.mesh); node.mesh.geometry.dispose(); node.mesh = null; if (this.onChunkDrop) this.onChunkDrop(node); }
    node.state = 0;
    if (node.children) { node.children.forEach(c => this.dispose(c)); node.children = null; }
  }
  // camBF: camera position in body-fixed frame (double precision array)
  update(camBF, budgetMs, pixelScale) {
    this.frame++;
    const want = new Set();
    const R = this.R, camR = Math.hypot(camBF[0], camBF[1], camBF[2]);
    const horizonCos = camR > R ? R / camR : 0;
    const visit = (node) => {
      // horizon cull (generous margin)
      const dx = node.center[0] - camBF[0], dy = node.center[1] - camBF[1], dz = node.center[2] - camBF[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const nd = node.dir;
      const cosAng = (nd[0] * camBF[0] + nd[1] * camBF[1] + nd[2] * camBF[2]) / (camR || 1);
      const angHalf = node.size * 0.75;
      if (node.level > 1 && camR > R && Math.acos(Math.max(-1, Math.min(1, cosAng))) - angHalf > Math.acos(horizonCos) + 0.05) return;
      // chunks on the limb get extra detail from orbit so the silhouette shows real relief
      let limbK = 1;
      if (camR > R * 1.2 && dist > 0) { const vd = (nd[0] * dx + nd[1] * dy + nd[2] * dz) / dist; limbK = 1 + 1.6 * Math.pow(1 - Math.abs(vd), 3); }
      const split = node.level < this.maxLevel && dist < node.edge * settings.q.splitK * pixelScale * limbK;
      if (split) {
        if (!node.children) {
          const h = node.size / 2;
          node.children = [new Node(this, node.face, node.level + 1, node.a0, node.b0, h, node), new Node(this, node.face, node.level + 1, node.a0 + h, node.b0, h, node),
            new Node(this, node.face, node.level + 1, node.a0, node.b0 + h, h, node), new Node(this, node.face, node.level + 1, node.a0 + h, node.b0 + h, h, node)];
        }
        const ready = node.children.every(c => c.state === 2);
        if (ready) { node.children.forEach(visit); return; }
        for (const c of node.children) { c.qd = dist / node.edge; if (c.state === 0) { c.state = 1; this.queue.push(c); } }
      } else if (node.children) {
        node.children.forEach(c => this.dispose(c)); node.children = null;
      }
      if (node.state === 0) { node.state = 1; node.qd = -1; this.queue.push(node); }
      if (node.state === 2) { want.add(node); node.lastUsed = this.frame; }
      else if (node.parent) { /* parent already drawn */ }
    };
    this.roots.forEach(visit);
    // swap visible set
    for (const n of this.visible) if (!want.has(n) && n.mesh) this.group.remove(n.mesh);
    for (const n of want) if (!this.visible.has(n)) this.group.add(n.mesh);
    this.visible = want;
    // build queued chunks: coarse levels first (avoids holes), nearest first within a level
    if (this.queue.length) {
      this.queue = this.queue.filter(n => n.state === 1 && !n.inFlight && (n.parent === null || n.parent.children && n.parent.children.includes(n)));
      this.queue.sort((a, b) => a.qd - b.qd);
      if (NW > 0) {
        const maxFlight = NW * 3;
        while (this.queue.length && this.inFlight < maxFlight) this.dispatch(this.queue.shift());
      } else {
        const t0 = performance.now();
        while (this.queue.length && performance.now() - t0 < budgetMs) this.build(this.queue.shift());
      }
    }
    return this.queue.length;
  }
  // finest loaded height near a body-fixed direction (for fast collision queries use surface directly)
  disposeAll() { this.dead = true; this.roots.forEach(r => this.dispose(r)); this.material.dispose(); }
}

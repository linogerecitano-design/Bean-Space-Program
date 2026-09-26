// Render pipeline: scene -> (half-res volumetric clouds) -> atmospheric scattering composite ->
// bloom -> tonemapped output. Works in camera-relative world space with log depth.
import * as THREE from 'three';
import { IS_MOBILE } from './textures.js';
import { EQUIRECT } from './glsl.js';
import { settings } from '../game/settings.js';

export const MAX_ATMO = 2;

// ---------- tileable 3D cloud noise (Perlin-Worley) -----------------------------------------
function makeCloudNoise(S = 64) {
  const data = new Uint8Array(S * S * S * 4);
  const rnd = (i, j, k, s) => { let h = (i * 374761393 + j * 668265263 + k * 1440662683 + s * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const worley = (x, y, z, cells, seed) => {
    const px = x * cells, py = y * cells, pz = z * cells; const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    let best = 9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const cx = ix + a, cy = iy + b, cz = iz + c; const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells, wz = ((cz % cells) + cells) % cells;
      const fx = cx + rnd(wx, wy, wz, seed), fy = cy + rnd(wx, wy, wz, seed + 1), fz = cz + rnd(wx, wy, wz, seed + 2);
      const d = (px - fx) ** 2 + (py - fy) ** 2 + (pz - fz) ** 2; if (d < best) best = d;
    }
    return 1 - Math.min(1, Math.sqrt(best));
  };
  const value = (x, y, z, cells, seed) => {
    const px = x * cells, py = y * cells, pz = z * cells; const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    const fx = px - ix, fy = py - iy, fz = pz - iz; const s = (t) => t * t * (3 - 2 * t);
    const g = (a, b, c) => rnd(((ix + a) % cells + cells) % cells, ((iy + b) % cells + cells) % cells, ((iz + c) % cells + cells) % cells, seed);
    const l = (a, b, t) => a + (b - a) * s(t);
    return l(l(l(g(0, 0, 0), g(1, 0, 0), fx), l(g(0, 1, 0), g(1, 1, 0), fx), fy), l(l(g(0, 0, 1), g(1, 0, 1), fx), l(g(0, 1, 1), g(1, 1, 1), fx), fy), fz);
  };
  for (let k = 0; k < S; k++) for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = i / S, y = j / S, z = k / S;
    const w = worley(x, y, z, 4, 1) * 0.625 + worley(x, y, z, 8, 2) * 0.25 + worley(x, y, z, 16, 3) * 0.125;
    const p = value(x, y, z, 4, 7) * 0.5 + value(x, y, z, 8, 8) * 0.3 + value(x, y, z, 16, 9) * 0.2;
    const pw = Math.max(0, Math.min(1, p + (w - 0.5) * 0.9));
    const o = (k * S * S + j * S + i) * 4;
    data[o] = pw * 255; data[o + 1] = w * 255; data[o + 2] = worley(x, y, z, 24, 4) * 255; data[o + 3] = 255;
  }
  const t = new THREE.Data3DTexture(data, S, S, S);
  t.format = THREE.RGBAFormat; t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter;
  // mipmapped, and sampled with an explicit footprint LOD: unfiltered distant samples alias into moire
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; t.userData.size = S;
  return t;
}

const FSQ_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ATMO_COMMON = /* glsl */`
struct Atmo {
  vec3 C; float R; float Ra; float cG; float cA; vec3 betaR; float betaM; vec3 mieColor; float HR; float HM; float g;
  float hasClouds; float Rb; float Rt; float cB; float cT; float coverage; float cloudTex; float opaque; vec3 cloudColor; float cloudRot; mat3 w2b; float thin; float stack; float real2D;
  float oblate; vec3 pole; // oblateness (gas giants) and spin axis
};
uniform Atmo uA[${MAX_ATMO}];
uniform int uNumA;
uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform mat4 uInvProj; uniform mat3 uCamRot; uniform vec3 uCamFwd; uniform float uLogFar;
uniform sampler2D uDepth;
vec2 raySphere(vec3 rd, vec3 C, float c) { float b = dot(rd, C); float d = b * b - c; if (d < 0.0) return vec2(1e30, -1e30); d = sqrt(d); return vec2(b - d, b + d); }
vec2 raySphereO(vec3 o, vec3 rd, vec3 C, float r) { vec3 oc = o - C; float b = dot(oc, rd); float c = dot(oc, oc) - r * r; float d = b * b - c; if (d < 0.0) return vec2(1e30, -1e30); d = sqrt(d); return vec2(-b - d, -b + d); }
uniform vec2 uTanFov;
vec3 viewRay(vec2 uv) { vec2 n = uv * 2.0 - 1.0; return normalize(uCamRot * vec3(n.x * uTanFov.x, n.y * uTanFov.y, -1.0)); }
float sceneDist(vec2 uv, vec3 rd) {
  float d = texture(uDepth, uv).r; if (d >= 0.99999) return 1e30;
  float w = exp2(d * uLogFar) - 1.0; return w / max(dot(rd, uCamFwd), 1e-4);
}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// optical depth toward the sun from p (short march)
vec2 sunDepthD(Atmo A, vec3 p, vec3 sdir);
vec2 sunDepth(Atmo A, vec3 p) { return sunDepthD(A, p, uSunDir); }
vec2 sunDepthD(Atmo A, vec3 p, vec3 sdir) {
  vec2 ts = raySphereO(p, sdir, A.C, A.Ra);
  vec2 tg = raySphereO(p, sdir, A.C, A.R * 0.9985);
  if (tg.x > 0.0 && tg.x < 1e29) return vec2(1e9);
  float L = max(ts.y, 0.0); float dt = L / 4.0; vec2 od = vec2(0.0);
  for (int i = 0; i < 4; i++) { vec3 q = p + sdir * dt * (float(i) + 0.5); float h = length(q - A.C) - A.R; od += exp(-max(h, 0.0) / vec2(A.HR, A.HM)) * dt; }
  return od;
}
`;

export class Pipeline {
  constructor(renderer) {
    this.r = renderer;
    this.quality = IS_MOBILE ? 0 : 1;
    const S = new THREE.Vector2(); renderer.getDrawingBufferSize(S);
    const mkRT = (w, h, depth, samples = 0) => {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!depth, samples });
      if (depth) { rt.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType); }
      return rt;
    };
    // multisampled on capable settings: the scene is rendered off-screen, so the canvas' own antialias flag
    // never applied and thin geometry (grass, branches, the tower) crawled with aliasing
    this.sceneRT = mkRT(S.x, S.y, true, settings.q.msaa || 0);
    this.cloudRT = mkRT(Math.ceil(S.x / 2), Math.ceil(S.y / 2), false);
    this.cloudHist = [mkRT(Math.ceil(S.x / 2), Math.ceil(S.y / 2), false), mkRT(Math.ceil(S.x / 2), Math.ceil(S.y / 2), false)]; this.histI = 0; this.histValid = false; this.frame = 0;
    this.hdrRT = mkRT(S.x, S.y, false);
    // half-resolution launch volumetrics (smoke, frost vapour), marched against the scene depth
    this.volRT = mkRT(Math.ceil(S.x / 2), Math.ceil(S.y / 2), false);
    this.bloom = []; let w = S.x, h = S.y; for (let i = 0; i < 5; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); this.bloom.push(mkRT(w, h, false)); }
    this.noise3 = makeCloudNoise(IS_MOBILE ? 48 : 64);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.qscene = new THREE.Scene(); this.qscene.add(this.quad);
    const atmoUniforms = () => {
      const arr = []; for (let i = 0; i < MAX_ATMO; i++) arr.push({ C: new THREE.Vector3(), R: 1, Ra: 1, cG: 1, cA: 1, betaR: new THREE.Vector3(), betaM: 0, mieColor: new THREE.Vector3(1, 1, 1), HR: 8000, HM: 1200, g: 0.76,
        hasClouds: 0, Rb: 1, Rt: 1, cB: 1, cT: 1, coverage: 0.5, cloudTex: 0, opaque: 0, cloudColor: new THREE.Vector3(1, 1, 1), cloudRot: 0, w2b: new THREE.Matrix3(), thin: 0, stack: 0, real2D: 0, oblate: 0, pole: new THREE.Vector3(0, 1, 0) });
      return arr;
    };
    this.common = {
      uA: { value: atmoUniforms() }, uNumA: { value: 0 }, uSunDir: { value: new THREE.Vector3(1, 0, 0) }, uSunColor: { value: new THREE.Vector3(20, 20, 20) },
      uInvProj: { value: new THREE.Matrix4() }, uTanFov: { value: new THREE.Vector2(1, 1) }, uCamRot: { value: new THREE.Matrix3() }, uCamFwd: { value: new THREE.Vector3() }, uLogFar: { value: 1 },
      uDepth: { value: this.sceneRT.depthTexture }, uTime: { value: 0 },
    };
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { ...this.common, uNoise: { value: this.noise3 }, uNoiseS: { value: this.noise3.userData.size }, uCloudMap: { value: null }, uCloudMap1: { value: null }, uCloudReal: { value: null }, uPixAng: { value: 0.002 }, uHasMap: { value: 0 }, uSteps: { value: settings.q.cloudSteps }, uFrame: { value: 0 }, uFar3D: { value: settings.q.clouds3d }, uDbg: { value: 0 },
        uSpot: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uSpotS: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uNumSpot: { value: 0 }, uClock: { value: 0 }, uBolt: { value: new THREE.Vector4() }, uBoltR: { value: 1 } },
      vertexShader: FSQ_V,
      fragmentShader: `precision highp sampler3D;
        ${ATMO_COMMON}
        ${EQUIRECT}
        uniform sampler3D uNoise; uniform sampler2D uCloudMap, uCloudMap1, uCloudReal; uniform float uHasMap; uniform int uSteps; uniform float uTime;
        varying vec2 vUv;
        uniform float uPixAng, uNoiseS;
        float dCam = 0.0; // distance of the current sample from the camera (m)
        // noise lookup whose mip level follows the pixel footprint; period = metres per texture repeat
        vec4 nz(vec3 x, float period) { return textureLod(uNoise, x, max(0.0, log2(max(dCam * uPixAng, 1e-3) * uNoiseS / period))); }
        vec4 layersAt(Atmo A, vec3 dirB, float lod) {
          float cr = A.cloudRot; vec3 d = vec3(cos(cr) * dirB.x - sin(cr) * dirB.z, dirB.y, sin(cr) * dirB.x + cos(cr) * dirB.z);
          if (A.cloudTex > 0.5) { vec2 uv = eqUV(d); return A.cloudTex > 1.5 ? textureLod(uCloudMap1, uv, lod) : textureLod(uCloudMap, uv, lod); }
          float n = textureLod(uNoise, d * 1.7, 0.0).r * 0.55 + textureLod(uNoise, d * 5.3 + 0.3, 0.0).r * 0.3 + textureLod(uNoise, d * 13.0, 0.0).g * 0.15;
          return vec4(smoothstep(1.0 - A.coverage - 0.15, 1.0 - A.coverage + 0.25, n), 0.0, 0.0, 0.2);
        }
        // gas-giant storms (body frame): centre + angular radius, and (aspect, spin); real time for lightning
        uniform vec4 uSpot[6]; uniform vec4 uSpotS[6]; uniform int uNumSpot; uniform float uClock, uDbg; uniform vec4 uBolt; uniform float uBoltR;
        float gStorm; // set by density(): how convective the sampled cloud is (drives lightning)
        float gCore;  // set by density(): 1 inside a gas-giant vortex (keeps the storm's own colour)
        bool gCoarse = false; // shadow rays: gas decks sample only the big billow shapes
        float gAO = 1.0;      // gas decks: 0 deep in the crevices between billows, 1 on their tops
        float gField = 0.0;   // gas decks: the continuous billow field (>0 inside), for surface normals
        // twist a direction around the storms' vortices, so the clouds spiral with them; core: 1 inside a storm
        vec3 swirl(vec3 d, out float core) {
          core = 0.0;
          for (int i = 0; i < 6; i++) {
            if (i >= uNumSpot) break;
            vec3 c = uSpot[i].xyz; float R = uSpot[i].w, asp = uSpotS[i].x, spin = uSpotS[i].y;
            float dc = dot(d, c); if (dc <= 0.0) continue;
            vec3 e = normalize(cross(vec3(0.0, 1.0, 0.0), c)); vec3 n = cross(c, e);
            vec3 t = d - c * dc; vec2 tv = vec2(dot(t, e) / (R * asp), dot(t, n) / R); float u = length(tv);
            if (u >= 1.25) continue;
            float k = 1.0 - u * u / 1.5625; float ang = sign(spin) * min(abs(spin), 3.0) * 2.4 * k * k; // faster near the middle: spiral arms
            float cs = cos(ang), sn = sin(ang); vec2 r = vec2(cs * tv.x - sn * tv.y, sn * tv.x + cs * tv.y);
            d = normalize(c * dc + e * (r.x * R * asp) + n * (r.y * R));
            core = max(core, 1.0 - smoothstep(0.5, 1.05, u));
          }
          return d;
        }
        float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        // lightning: storm cells flash now and then (a main stroke, sometimes a restrike), lighting the cloud from inside
        vec3 lightningAt(Atmo A, vec3 q, float hf) {
          float cs = A.stack > 3.5 ? (A.Rt - A.Rb) * 1.2 : 25000.0;
          vec3 g = q / cs; vec3 id = floor(g); vec3 f = fract(g) - 0.5;
          float h = hash31(id), h2 = hash31(id + 17.3);
          if (h2 > (A.stack > 3.5 ? 0.3 : 0.45)) return vec3(0.0); // only some storm cells are active
          float per = 1.2 + h * 3.5; float ph = fract(uClock / per + h * 7.1) * per; // seconds into this cell's cycle
          float e = exp(-ph * 6.0) * (0.65 + 0.35 * sin(ph * 160.0)) + (h2 < 0.3 ? 0.9 * exp(-abs(ph - 0.22) * 18.0) : 0.0); // stroke + restrike
          if (uDbg > 0.5) e = 1.0;
          vec3 cen = (vec3(hash31(id + 3.1), hash31(id + 5.7), hash31(id + 9.2)) - 0.5) * 0.6;
          vec3 df = f - cen; float sp = exp(-dot(df, df) * (A.stack > 3.5 ? 30.0 : 9.0)) * (1.0 - hf * 0.4); // fades to nothing before the cell edge
          return vec3(0.72, 0.8, 1.0) * e * sp;
        }
        // the band colour under a gas giant's cloud (its albedo map, or the base band tint before it is baked)
        vec3 gasBand(Atmo A, vec3 dirB, float lod) { return A.cloudTex > 0.5 ? layersAt(A, dirB, lod).rgb : A.cloudColor; }
        float density(Atmo A, vec3 p, out float hf) {
          vec3 q = A.w2b * (p - A.C); float r = length(q); vec3 d = q / r; dCam = length(p); gStorm = 0.0; gCore = 0.0;
          hf = clamp((r - A.Rb) / (A.Rt - A.Rb), 0.0, 1.0);
          float texel = 6.2831853 * A.Rb / 2048.0;
          float lod = max(0.0, log2(max(1.0, length(p) * uPixAng / texel)) - 1.0);
          vec4 L = layersAt(A, d, lod);
          vec3 wind = vec3(uTime * 6.0, 0.0, uTime * 2.0);
          float thick = A.Rt - A.Rb;
          if (A.stack > 0.5 && A.stack < 1.5) {
            // Kalileo Earth stack: stratus/cumulus base (height by cloud type), cumulonimbus anvils, cirrus veil
            float type = L.a;
            float sc = 9000.0;
            // shape is a 2D footprint (the same column through the deck), so cells read as distinct
            // clouds with rounded tops rather than smeared slices of 3D noise
            vec3 qs = d * A.Rb;
            float shape = nz((qs + wind) / sc, sc).r * 0.7 + nz((qs + wind) / (sc * 0.45), sc * 0.45).g * 0.3;
            float top = (0.06 + 0.4 * type * type) * (0.4 + 0.8 * shape);
            float profB = smoothstep(0.0, 0.02, hf) * (1.0 - smoothstep(top * 0.5, top, hf));
            float profS = smoothstep(0.04, 0.12, hf) * (1.0 - smoothstep(0.62, 0.8, hf));
            float profC = smoothstep(0.8, 0.84, hf) * (1.0 - smoothstep(0.88, 0.94, hf));
            float detail = nz((q + wind * 1.5) / (sc * 0.22), sc * 0.22).g;
            // near and far must agree: Earth's coverage comes from the same real cloud map as the 2D layer
            float cr = A.cloudRot; vec3 dr = vec3(cos(cr) * d.x - sin(cr) * d.z, d.y, sin(cr) * d.x + cos(cr) * d.z);
            // warp the lookup so the map's ~20 km texels don't show as straight cloud edges
            vec3 wq = nz(qs / 60000.0, 60000.0).rgb - 0.5; vec3 drw = normalize(dr + wq * 0.004);
            float covR = A.real2D > 0.5 ? max(textureLod(uCloudReal, eqUV(drw), lod).r, L.g * 0.8) : L.r;
            float covB = smoothstep(0.08, 0.8, covR);
            float base = smoothstep(0.0, 0.3, covB * 1.35 * profB - (1.0 - shape) * 0.62 - (1.0 - detail) * 0.2);
            gStorm = smoothstep(0.55, 0.9, L.g) * smoothstep(0.3, 0.7, covB); // cumulonimbus: occasional thunderstorms
            float anvil = clamp(smoothstep(0.25, 0.8, L.g) * 1.1 * profS - (1.0 - nz((q + wind) / (sc * 2.5), sc * 2.5).r) * 0.35, 0.0, 1.0);
            float fib = nz(vec3(q.x / 30000.0, q.y / 4000.0, q.z / 30000.0) + uTime * 0.001, 11000.0).b;
            float cirrus = clamp(L.b * profC * (fib * 1.4 - 0.3), 0.0, 1.0) * 0.18;
            return max(base, max(anvil, cirrus));
          }
          if (A.stack > 3.5) { // gas giant: a continuous sea of billowing cloud with towers over the storms
            bool gg = A.stack < 4.5;                                     // gas giant (else a Venus/Titan-like overcast world)
            float lum = gg ? dot(gasBand(A, d, lod), vec3(0.3, 0.5, 0.2)) : 0.5 + 0.35 * (nz(d * A.Rb / (thick * 30.0), thick * 30.0).g - 0.5);
            float core = 0.0; vec3 dS = gg ? swirl(d, core) : d; gCore = core;      // the sea wraps around the big vortices
            vec3 qs = dS * A.Rb; vec3 gw = wind * 25.0; q = dS * r;
            // local deck level (in deck heights): rolling swells, brighter zones higher, towers over storms
            float swell = nz((qs + gw) / (thick * 3.5), thick * 3.5).r;
            float sc = nz((qs + gw) / (thick * 2.6), thick * 2.6).b; float storm = smoothstep(0.52, 0.85, sc); storm = sqrt(storm) * storm; // convective towers: domed, a few hundred km across
            float arms = nz(qs / (thick * 25.0), thick * 25.0).r * 0.7 + nz(qs / (thick * 9.0), thick * 9.0).g * 0.3; // wound into spirals in a vortex
            gStorm = gg ? (0.3 + 0.7 * storm) * (1.0 - core) : 0.0;
            float base = 0.1 + 0.2 * swell + (lum - 0.5) * 0.2 + storm * 0.3 + core * (0.06 + 0.2 * smoothstep(0.35, 0.7, arms));
            // billows: a 3D noise volume thresholded against height, so the tops are rounded, overhanging cauliflower
            // heads rather than peaks (below the deck level it is solid, above it only the strongest lobes rise)
            float n1 = nz((q + gw) / (thick * 0.55), thick * 0.55).r * 0.7 + nz((q + gw) / (thick * 1.4), thick * 1.4).g * 0.3;
            float n2 = nz((q + gw * 1.3) / (thick * 0.18), thick * 0.18).g;
            float n3 = nz((q + gw * 1.6) / (thick * 0.05), thick * 0.05).r;
            float fp = max(dCam * uPixAng, 1.0);                                   // pixel footprint: no detail finer than ~3 px
            float k2 = smoothstep(1.5, 4.0, thick * 0.14 / fp), k3 = smoothstep(1.5, 4.0, thick * 0.05 / fp);
            if (gCoarse) { k2 = 0.0; k3 = 0.0; }
            float nb = n1 * 0.76 + mix(0.5, n2, k2) * 0.18 + mix(0.5, n3, k3) * 0.06;
            float top = base + 0.3 * (1.0 + storm);                                     // how far the heads can rise
            float dens = nb - 0.45 + (base - hf) * 0.9;
            gAO = clamp((hf - base + 0.1) / (top - base + 0.1), 0.0, 1.0); gField = dens - max(hf - top, 0.0) * 3.0;
            float deck = smoothstep(0.0, 0.06, dens) * smoothstep(0.0, 0.015, hf) * (1.0 - smoothstep(top, top + 0.06, hf)); // crisp surfaces: billows read as solid heads
            // a thin haze veil above the tops
            float veil = 0.02 * exp(-max(hf - top, 0.0) * 5.0) * (0.4 + nz(qs / (thick * 2.0) + gw / thick, thick * 2.0).g);
            return clamp(max(deck, veil), 0.0, 1.0);
          }
          if (A.stack > 1.5 && A.stack < 2.5) { // Venus: mottled lower deck under an unbroken upper deck
            float lower = L.r * (1.0 - smoothstep(0.35, 0.5, hf)) * (0.7 + 0.3 * nz(q / 60000.0 + uTime * 0.002, 60000.0).r);
            float upper = L.g * smoothstep(0.45, 0.55, hf) * exp(-(hf - 0.5) * 2.5);
            return max(lower, upper) * 0.9;
          }
          if (A.stack > 2.5) { // Mars: dust haze low, water-ice cirrus high
            float dust = L.r * (1.0 - smoothstep(0.2, 0.6, hf)) * (0.6 + 0.4 * nz(q / 40000.0 + uTime * 0.003, 40000.0).r) * 0.35;
            float ice = L.b * smoothstep(0.6, 0.7, hf) * (1.0 - smoothstep(0.8, 0.95, hf)) * nz(vec3(q.x / 25000.0, q.y / 5000.0, q.z / 25000.0), 11000.0).b * 0.5;
            return max(dust, ice);
          }
          float cov = L.r;
          if (A.opaque > 0.5) { float haze = exp(-hf * 3.0); return cov * haze * (0.7 + 0.3 * nz(q / 90000.0 + uTime * 0.002, 90000.0).r); }
          float prof = smoothstep(0.0, 0.12, hf) * smoothstep(1.0, 0.45, hf);
          float scale = thick * 2.2;
          vec3 qs = d * A.Rb;
          float shape = nz((qs + wind) / scale, scale).r;
          prof *= smoothstep(0.0, 0.25, shape - hf * 0.45); // taller where the cell is denser: rounded tops
          float detail = nz((q + wind * 1.5) / (scale * 0.18), scale * 0.18).g;
          return clamp(cov * 1.25 * prof - (1.0 - shape) * 0.55 - (1.0 - detail) * 0.15 * (1.0 - hf * 0.5), 0.0, 1.0);
        }
        float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
        uniform float uFrame, uFar3D;
        // interleaved gradient noise, rotated each frame (the temporal pass averages it out)
        float ign(vec2 p) { p += uFrame * 5.588238; return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y)); }
        // coverage of the flattened cloud layers (used for the distant 2D representation)
        float cover2D(Atmo A, vec4 L) {
          if (A.stack > 0.5 && A.stack < 1.5) return clamp(max(L.r * 1.05, max(L.g, L.b * 0.35)), 0.0, 1.0);
          if (A.stack > 1.5 && A.stack < 2.5) return clamp(max(L.r, L.g) * 1.1, 0.0, 1.0);
          if (A.stack > 4.5) return 1.0; // overcast worlds: an unbroken deck
          if (A.stack > 2.5 && A.stack < 3.5) return clamp(max(L.r * 0.3, L.b * 0.5), 0.0, 1.0);
          return L.r;
        }
        // Distant clouds: a single textured shell at mid-deck height, lit with a soft terminator
        // and self-shadowing. Cheap, and free of the sampling noise a coarse raymarch has.
        vec4 clouds2D(Atmo A, vec3 rd, float sd, vec3 sunT, float tMin) {
          if (A.stack > 3.5 && A.stack < 4.5) return vec4(0.0); // gas giants: the planet itself shows the banded deck
          float Rm = mix(A.Rb, A.Rt, 0.35); float c2 = dot(A.C, A.C) - Rm * Rm;
          vec2 tm = raySphere(rd, A.C, c2); if (tm.y < 0.0 || tm.x > 1e29) return vec4(0.0);
          float t = tm.x > 0.0 ? tm.x : tm.y;
          float tailK = tMin > 0.0 ? smoothstep(tMin, tMin * 1.25, t) : 1.0; if (tailK <= 0.0) return vec4(0.0);
          vec2 tg = raySphere(rd, A.C, A.cG); if (tg.x > 0.0 && tg.x < 1e29 && tg.x < t) return vec4(0.0);
          if (t > sd + (A.Rt - A.Rb) * 2.0) return vec4(0.0); // tolerance: only terrain clearly in front hides the layer
          vec3 p = rd * t; vec3 N = normalize(p - A.C);
          vec3 q = A.w2b * (p - A.C); vec3 dB = normalize(q);
          float texel = 6.2831853 / 2048.0; float lod = max(0.0, log2(max(1.0, t * uPixAng / (texel * Rm))));
          // procedural detail breaks up magnified texels (domain warp + fine modulation)
          float cr = A.cloudRot; vec3 dR = vec3(cos(cr) * dB.x - sin(cr) * dB.z, dB.y, sin(cr) * dB.x + cos(cr) * dB.z);
          dCam = t; vec3 wn = nz(dR * 23.0, Rm / 23.0).rgb - 0.5;
          float detailK = 1.0 - smoothstep(2.0, 5.0, lod);
          vec3 dW = normalize(dB + wn * 0.0035 * detailK);
          float cov;
          if (A.real2D > 0.5) { vec3 dw2 = vec3(cos(cr) * dW.x - sin(cr) * dW.z, dW.y, sin(cr) * dW.x + cos(cr) * dW.z); cov = textureLod(uCloudReal, eqUV(dw2), lod).r; cov = max(cov, layersAt(A, dW, lod).g * 0.8); }
          else cov = cover2D(A, layersAt(A, dW, lod));
          float fine = nz(dR * 140.0, Rm / 140.0).r * 0.6 + nz(dR * 420.0, Rm / 420.0).g * 0.4;
          cov = clamp(cov * mix(1.0, 0.55 + 0.9 * fine, detailK * 0.8), 0.0, 1.0);
          cov = smoothstep(0.08, 0.85, cov);
          vec3 sB = normalize(A.w2b * uSunDir);
          float shadow = A.real2D > 0.5 ? cov : cover2D(A, layersAt(A, normalize(dW + sB * 0.006), lod + 1.0));
          float ndl = dot(N, uSunDir);
          float lit = smoothstep(-0.12, 0.25, ndl) * (0.45 + 0.55 * max(ndl, 0.0)) * (1.0 - 0.45 * shadow * (1.0 - cov * 0.5));
          vec3 amb = (A.betaR / max(max(A.betaR.x, A.betaR.y), max(A.betaR.z, 1e-9))) * 0.05 * smoothstep(-0.3, 0.1, ndl);
          vec3 c = uSunColor * A.cloudColor * (sunT * lit * 0.55 + amb);
          if (A.stack > 0.5 && A.stack < 1.5) { float st = smoothstep(0.55, 0.9, layersAt(A, dW, lod).g); if (st > 0.02) c += lightningAt(A, q, 0.3) * st * 20.0; } // thunderstorms seen from orbit
          float a = clamp(cov * (A.opaque > 0.5 ? 1.2 : 1.1), 0.0, 1.0);
          if (A.stack > 2.5 && A.stack < 3.5) a *= 0.3; // Mars: thin water-ice wisps and dust haze, never thick decks
          a *= tailK;
          return vec4(c * a, a);
        }
        void main() {
          vec3 rd0 = viewRay(vUv);
          float sd0 = sceneDist(vUv, rd0);
          vec3 col = vec3(0.0); float T = 1.0;
          for (int ai = 0; ai < ${MAX_ATMO}; ai++) {
            if (ai >= uNumA) break;
            Atmo A = uA[ai]; if (A.hasClouds < 0.5) continue;
            // oblate planets: march in pole-stretched space, where the flattened planet and its cloud shells are spheres
            vec3 rd = rd0; float sd = sd0;
            if (A.oblate > 0.0) {
              float kx = 1.0 / (1.0 - A.oblate) - 1.0; vec3 n = A.pole;
              rd = rd0 + kx * dot(rd0, n) * n; float Lk = length(rd); rd /= Lk;
              A.C += kx * dot(A.C, n) * n; float c2 = dot(A.C, A.C); A.cG = c2 - A.R * A.R; A.cB = c2 - A.Rb * A.Rb; A.cT = c2 - A.Rt * A.Rt;
              sd = sd0 < 1e29 ? sd0 * Lk : sd0;
            }
            vec2 to = raySphere(rd, A.C, A.cT), ti = raySphere(rd, A.C, A.cB), tg = raySphere(rd, A.C, A.cG);
            if (to.y < 0.0 || to.x > 1e29) continue;
            float t0 = max(to.x, 0.0), t1 = to.y;
            float camR = length(A.C);
            if (camR < A.Rb) { t0 = max(ti.y, 0.0); }                      // below the deck: start at inner exit
            else if (ti.x > 0.0 && ti.x < 1e29) { t1 = min(t1, ti.x); }       // looking down through the shell
            if (tg.x > 0.0 && tg.x < 1e29) t1 = min(t1, tg.x);
            float thick = A.Rt - A.Rb;
            float sdC = sd + thick * 2.0; // same tolerance for the far 2D layer check below
            t1 = min(t1, sd);
            if (t1 <= t0 && sdC <= t0) continue;
            // blend to the 2D layer by distance (pixel footprint vs deck thickness)
            float farW = smoothstep(thick * 25.0 * uFar3D, thick * 80.0 * uFar3D, t0);
            vec2 sod = sunDepth(A, rd * (t0 + (t1 - t0) * 0.5));
            vec3 sunT = exp(-(A.betaR * sod.x + A.betaM * 1.1 * sod.y));
            vec3 c3 = vec3(0.0); float T3 = 1.0;
            if (farW < 0.999) {
              // march at most a few deck thicknesses, with steps packed near the camera; the rest of a
              // long grazing ray is handed to the 2D layer (a coarse march there only slices the noise)
              float L = min(t1 - t0, thick * (A.stack > 3.5 ? 7.0 : 20.0)); int N = uSteps; // gas decks: dense steps where the billows are
              float jitter = ign(gl_FragCoord.xy);
              float cosT = dot(rd, uSunDir);
              float phase = mix(hg(cosT, 0.65), hg(cosT, -0.25), 0.3) * 4.0 + 0.4;
              vec3 amb = (A.betaR / max(max(A.betaR.x, A.betaR.y), max(A.betaR.z, 1e-9))) * 0.06 + 0.1;
              float sigma = (A.opaque > 0.5 ? 0.00025 : 0.0022) * (A.opaque > 0.5 ? 1.0 : 30000.0 / max(thick, 1000.0));
              if (A.stack > 3.5) sigma = 0.0012; // gas-giant deck: dense billows that read as a surface
              // gas decks: coarse steps down to the cloud surface, then back up and march the top finely
              // (the billows are far smaller than an even split of a 1000 km grazing ray)
              bool gas = A.stack > 3.5; bool fine = false; int fineN = 0; bool haveN = false; vec3 gN = normalize(rd * t0 - A.C);
              float tg = t0 + thick * 0.05 * jitter, dtg = thick * 0.05;
              for (int i = 0; i < 160; i++) {
                if (T3 < 0.02) break;
                float t, dt;
                if (gas) { if (i >= N * 5 || tg > t0 + L) break; t = tg; dt = dtg; }
                else {
                  if (i >= N) break;
                  float u0 = (float(i) + jitter) / float(N), u1 = (float(i) + 1.0 + jitter) / float(N);
                  t = t0 + L * u0 * u0; dt = L * (u1 * u1 - u0 * u0);
                }
                vec3 p = rd * t; float hf;
                float d = density(A, p, hf); float stormHere = gStorm, coreHere = gCore, aoHere = gAO;
                if (gas) {
                  if (!fine && d > 0.05) { fine = true; tg = max(t0, tg - dtg); dtg = thick * 0.007; continue; }
                  if (fine) { fineN++; dtg = thick * 0.007 * (1.0 + float(fineN) * 0.06); } else dtg *= 1.025;
                  tg += dtg;
                  if (!fine) continue; // the thin veil above the tops is left to the haze
                }
                if (d > 0.002) {
                  float ld = 0.0; float ls = thick * (A.stack > 3.5 ? 0.02 : 0.12);
                  gCoarse = gas; if (gas) ls = thick * 0.06;
                  for (int k = 1; k <= 3; k++) { float hh; ld += density(A, p + uSunDir * ls * float(k * k), hh) * ls * float(k * k); }
                  gCoarse = false;
                  float sl = sigma * (gas ? 0.04 : 0.12); // gas decks: soft light through the billows, crisp shape from the big forms
                  float Tsun = exp(-ld * sl) + 0.5 * exp(-ld * sl * 0.25) + 0.25 * exp(-ld * sl * 0.06);
                  if (uDbg > 1.5) Tsun = 1.0;
                  float powder = 1.0 - exp(-d * sigma * dt * 2.0);
                  // sun visibility at this point (planet shadow / terminator)
                  float up = dot(normalize(p - A.C), uSunDir);
                  float shade = smoothstep(-0.08, 0.05, up);
                  float ao = gas ? 0.05 + 0.95 * aoHere * aoHere : 0.6 + 0.8 * hf; // valleys between the billows sit in shade
                  vec3 lightC = uSunColor * sunT * shade * (Tsun * phase * mix(1.0, powder * 2.0, 0.35) * 0.55 + amb * ao * 1.5);
                  if (gas) {
                    // shade the billows like a surface: normal from the big shapes where the ray first meets them
                    if (!haveN && d > 0.35) { haveN = true; float e = thick * 0.07; float h2; gCoarse = true;
                      float fx0, fx1, fy0, fy1, fz0, fz1;
                      density(A, p + vec3(e, 0, 0), h2); fx1 = gField; density(A, p - vec3(e, 0, 0), h2); fx0 = gField;
                      density(A, p + vec3(0, e, 0), h2); fy1 = gField; density(A, p - vec3(0, e, 0), h2); fy0 = gField;
                      density(A, p + vec3(0, 0, e), h2); fz1 = gField; density(A, p - vec3(0, 0, e), h2); fz0 = gField;
                      vec3 g = vec3(fx1 - fx0, fy1 - fy0, fz1 - fz0);
                      gCoarse = false; vec3 upv = normalize(p - A.C); gN = length(g) > 1e-6 ? normalize(-g) : upv; gN = normalize(gN + upv * 0.25); }
                    float lam = max(dot(gN, uSunDir) * 0.75 + 0.25, 0.0);           // wrapped: soft terminator on each head
                    float rim = pow(1.0 - max(dot(gN, -rd), 0.0), 3.0) * max(dot(rd, uSunDir), 0.0);
                    lightC = uSunColor * sunT * shade * ((mix(0.55, 1.0, lam) * 1.35 + rim * 0.5) * mix(0.3, 1.0, Tsun / 1.75) * (0.2 + 0.8 * ao) + amb * ao * 1.2); // crevices do the shaping, the sun angle adds form
                  }
                  float Ti = exp(-d * sigma * dt);
                  vec3 tint = A.cloudColor;
                  if (A.stack > 3.5 && A.stack < 4.5) { vec3 dq = normalize(A.w2b * (p - A.C)); vec3 bc = gasBand(A, dq, 1.0); bc = mix(vec3(dot(bc, vec3(0.3, 0.5, 0.2))), bc, 1.35); tint = mix(bc * 1.1, vec3(1.0, 0.97, 0.92), 0.1 * aoHere * (1.0 - coreHere * 0.85)); } // whiter ammonia-ice tops, but storms keep their colour
                  c3 += T3 * (1.0 - Ti) * lightC * tint;
                  if (stormHere > 0.02) c3 += T3 * (1.0 - Ti) * lightningAt(A, A.w2b * (p - A.C), hf) * stormHere * (gas ? 5.0 * smoothstep(thick * 3.0, thick * 10.0, t) : 22.0); // up close the real bolts take over
                  if (uBolt.w > 0.001) { vec3 db = p - uBolt.xyz; c3 += T3 * (1.0 - Ti) * vec3(0.75, 0.82, 1.0) * uBolt.w * 40.0 * exp(-dot(db, db) / (uBoltR * uBoltR)); } // a visible bolt lights its cloud
                  T3 *= Ti;
                }
              }
            }
            float Lmax = thick * (A.stack > 3.5 ? 7.0 : 20.0);
            float tCut = t0 + min(t1 - t0, Lmax);
            bool tail = farW < 0.999 && t1 - t0 > Lmax;
            vec4 c2 = (farW > 0.001 || tail) ? clouds2D(A, rd, sd, sunT, farW > 0.001 ? 0.0 : tCut) : vec4(0.0);
            if (t1 <= t0) { c3 = vec3(0.0); T3 = 1.0; }
            if (tail) { c3 += T3 * c2.rgb; T3 *= 1.0 - c2.a; }
            vec3 cc = mix(c3, c2.rgb, farW); float TT = mix(T3, 1.0 - c2.a, farW);
            col += T * cc; T *= TT;
          }
          gl_FragColor = vec4(col, T);
        }`,
      depthTest: false, depthWrite: false,
    });
    // Temporal accumulation of the (noisy, jittered) cloud march. History is reprojected through
    // the nearest planet's frame at the cloud-deck depth and clamped to the current neighbourhood.
    this.resolveMat = new THREE.ShaderMaterial({
      uniforms: { uCur: { value: null }, uHist: { value: null }, uTexel: { value: new THREE.Vector2() }, uValid: { value: 0 }, uAlpha: { value: 0.12 },
        uCamRot: this.common.uCamRot, uTanFov: this.common.uTanFov, uPrevCamRot: { value: new THREE.Matrix3() }, uPrevTanFov: { value: new THREE.Vector2(1, 1) },
        uC: { value: new THREE.Vector3() }, uPrevC: { value: new THREE.Vector3() }, uW2B: { value: new THREE.Matrix3() }, uPrevW2B: { value: new THREE.Matrix3() }, uRm: { value: 0 }, uHasBody: { value: 0 } },
      vertexShader: FSQ_V, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D uCur, uHist; uniform vec2 uTexel; uniform float uValid, uAlpha, uRm, uHasBody;
        uniform mat3 uCamRot, uPrevCamRot, uW2B, uPrevW2B; uniform vec2 uTanFov, uPrevTanFov; uniform vec3 uC, uPrevC; varying vec2 vUv;
        vec2 raySphere(vec3 rd, vec3 C, float r) { float b = dot(rd, C); float d = b * b - (dot(C, C) - r * r); if (d < 0.0) return vec2(-1.0); d = sqrt(d); return vec2(b - d, b + d); }
        void main() {
          vec4 cur = texture2D(uCur, vUv);
          if (uValid < 0.5) { gl_FragColor = cur; return; }
          vec2 n = vUv * 2.0 - 1.0; vec3 rd = normalize(uCamRot * vec3(n.x * uTanFov.x, n.y * uTanFov.y, -1.0));
          float t = 1e7;
          if (uHasBody > 0.5) { vec2 ts = raySphere(rd, uC, uRm); if (ts.y > 0.0) t = ts.x > 0.0 ? ts.x : ts.y; }
          vec3 p = rd * t, pp;
          if (uHasBody > 0.5) pp = transpose(uPrevW2B) * (uW2B * (p - uC)) + uPrevC; else pp = p;
          vec3 v = transpose(uPrevCamRot) * pp; if (v.z > -1e-6) { gl_FragColor = cur; return; }
          vec2 puv = vec2(v.x / -v.z / uPrevTanFov.x, v.y / -v.z / uPrevTanFov.y) * 0.5 + 0.5;
          if (any(lessThan(puv, vec2(0.0))) || any(greaterThan(puv, vec2(1.0)))) { gl_FragColor = cur; return; }
          vec4 mn = cur, mx = cur;
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) { vec4 c = texture2D(uCur, vUv + vec2(i, j) * uTexel); mn = min(mn, c); mx = max(mx, c); }
          vec4 h = clamp(texture2D(uHist, puv), mn, mx);
          gl_FragColor = mix(h, cur, uAlpha);
        }`,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { ...this.common, uScene: { value: this.sceneRT.texture }, uClouds: { value: this.cloudRT.texture }, uCloudTexel: { value: new THREE.Vector2(1, 1) }, uVol: { value: this.volRT.texture }, uHasVol: { value: 0 }, uSteps: { value: settings.q.atmoSteps }, uSSS: { value: settings.q.shadow >= 2048 ? 1 : 0 } },
      vertexShader: FSQ_V,
      fragmentShader: `${ATMO_COMMON}
        uniform sampler2D uScene, uClouds, uVol; uniform int uSteps; uniform float uSSS, uHasVol; uniform vec2 uCloudTexel; varying vec2 vUv;
        // Depth-aware upsample of the half-resolution clouds: each low-res texel is weighted by how well the depth
        // it was marched against matches this pixel's. A plain bilinear fetch bled bright cloud/sky into every
        // leaf, branch and antenna standing against the sky as white speckles and halos.
        float viewZ(vec2 uv) { float d = texture(uDepth, uv).r; return d >= 0.99999 ? 1e30 : exp2(d * uLogFar) - 1.0; }
        vec4 upsample(sampler2D tex, vec2 uv) {
          float z = viewZ(uv);
          vec2 p = uv / uCloudTexel - 0.5; vec2 f = fract(p), b = floor(p);
          vec4 acc = vec4(0.0); float ws = 0.0; vec4 nearest = vec4(0.0, 0.0, 0.0, 1.0); float nd = 1e38;
          for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
            vec2 tuv = (b + vec2(float(i), float(j)) + 0.5) * uCloudTexel;
            float zi = viewZ(tuv);
            float rel = (z > 1e29 && zi > 1e29) ? 0.0 : (z > 1e29 || zi > 1e29) ? 1e3 : abs(zi - z) / max(min(zi, z), 0.5);
            float wb = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
            vec4 c = texture(tex, tuv);
            float w = wb * exp(-rel * 12.0);
            acc += c * w; ws += w;
            if (rel < nd) { nd = rel; nearest = c; }
          }
          return ws > 1e-4 ? acc / ws : nearest;
        }
        // screen-space raymarched shadows: walk from the surface toward the sun through the depth
        // buffer; anything in front of the ray (within a thickness window) blocks the light
        float ssShadow(vec3 rd, float sd) {
          if (sd > 1e29 || dot(uSunDir, uSunDir) < 0.5) return 1.0;
          vec3 P = rd * sd; float len = clamp(sd * 0.08, 1.5, 12.0); float jit = 0.5; // short contact shadows, fixed pattern (random jitter read as grain)
          for (int i = 1; i <= 14; i++) {
            float t = len * pow((float(i) - jit) / 14.0, 1.7);
            vec3 Q = P + uSunDir * t; vec3 v = transpose(uCamRot) * Q; if (v.z > -1e-3) break;
            vec2 quv = vec2(v.x / -v.z / uTanFov.x, v.y / -v.z / uTanFov.y) * 0.5 + 0.5;
            if (quv.x < 0.0 || quv.y < 0.0 || quv.x > 1.0 || quv.y > 1.0) break;
            float dq = length(Q); vec3 qd = Q / dq; float sq = sceneDist(quv, qd);
            float bias = max(0.3, dq * 0.004);
            if (sq < dq - bias && sq > dq - max(len * 0.35, bias * 8.0)) return 0.0;
          }
          return 1.0;
        }
        void main() {
          vec3 rd = viewRay(vUv);
          float sd = sceneDist(vUv, rd);
          vec3 col = texture(uScene, vUv).rgb;
          // near-field only (vessels, rocks, boulders): at kilometre scales depth precision makes it unreliable
          if (uSSS > 0.5 && sd < 150.0) { float sh = ssShadow(rd, sd); col *= mix(mix(0.45, 1.0, sh), 1.0, smoothstep(60.0, 150.0, sd)); }
          if (uHasVol > 0.5) { vec4 vo = upsample(uVol, vUv); col = col * (1.0 - vo.a) + vo.rgb; }
          vec4 cl = upsample(uClouds, vUv);
          col = col * cl.a + cl.rgb;
          for (int ai = 0; ai < ${MAX_ATMO}; ai++) {
            if (ai >= uNumA) break;
            Atmo A = uA[ai];
            // oblate planets: march in a space stretched along the pole, where the planet and its shells
            // are spheres again (otherwise the shell floats off the poles of a flattened gas giant)
            vec3 rdA = rd, sunA = uSunDir; float Lk = 1.0;
            if (A.oblate > 0.0) {
              float kx = 1.0 / (1.0 - A.oblate) - 1.0; vec3 n = A.pole;
              rdA = rd + kx * dot(rd, n) * n; Lk = length(rdA); rdA /= Lk;
              A.C += kx * dot(A.C, n) * n; float c2 = dot(A.C, A.C); A.cG = c2 - A.R * A.R; A.cA = c2 - A.Ra * A.Ra;
              sunA = normalize(uSunDir + kx * dot(uSunDir, n) * n);
            }
            vec2 ta = raySphere(rdA, A.C, A.cA);
            if (ta.y < 0.0 || ta.x > 1e29) continue;
            vec2 tg = raySphere(rdA, A.C, A.cG);
            float t0 = max(ta.x, 0.0), t1 = ta.y;
            if (tg.x > 0.0 && tg.x < 1e29) t1 = min(t1, tg.x);
            t1 = min(t1, sd < 1e29 ? sd * Lk : sd);
            // a gas giant's opaque cloud deck ends the ray there: the crushing air below it is never seen
            if (A.hasClouds > 0.5 && A.stack > 3.5 && cl.a < 0.6) { float Rd = A.Rb + (A.Rt - A.Rb) * 0.3; vec2 td = raySphere(rdA, A.C, dot(A.C, A.C) - Rd * Rd); if (td.x > 0.0 && td.x < 1e29) t1 = min(t1, td.x); }
            if (t1 <= t0) continue;
            int N = uSteps; float L = t1 - t0;
            vec2 od = vec2(0.0); vec3 sR = vec3(0.0), sM = vec3(0.0);
            for (int i = 0; i < 24; i++) {
              if (i >= N) break;
              // quadratic spacing: dense near the camera where the air is thickest on horizon paths
              float u0 = float(i) / float(N), u1 = float(i + 1) / float(N);
              float qx = t0 <= 0.0 ? 2.0 : 1.0; float sA = t0 + L * pow(u0, qx), sB = t0 + L * pow(u1, qx); float dt = sB - sA;
              vec3 p = rdA * (0.5 * (sA + sB));
              float h = max(length(p - A.C) - A.R, 0.0);
              vec2 dd = exp(-h / vec2(A.HR, A.HM)) * dt; od += dd;
              vec2 ls = sunDepthD(A, p, sunA);
              vec3 Tr = exp(-(A.betaR * (od.x + ls.x) + A.betaM * 1.1 * (od.y + ls.y)));
              sR += dd.x * Tr; sM += dd.y * Tr;
            }
            float mu = dot(rd, uSunDir);
            float pR = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
            float g = A.g, g2 = g * g;
            float pM = 3.0 / (8.0 * 3.14159) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
            vec3 insc = uSunColor * (sR * A.betaR * pR + sM * A.betaM * pM * A.mieColor);
            vec3 Tv = exp(-(A.betaR * od.x + A.betaM * 1.1 * od.y));
            // multiple-scattering fudge keeps the sky from going too dark near the horizon
            insc *= 1.0 + 0.5 * (1.0 - Tv);
            col = col * Tv + insc;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0 } }, vertexShader: FSQ_V, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
        void main(){ vec2 o = uTexel; vec3 c = texture(uTex, vUv).rgb * 4.0 + texture(uTex, vUv + vec2(-o.x,-o.y)).rgb + texture(uTex, vUv + vec2(o.x,-o.y)).rgb + texture(uTex, vUv + vec2(-o.x,o.y)).rgb + texture(uTex, vUv + vec2(o.x,o.y)).rgb;
          c /= 8.0; if (uThresh > 0.0) { float l = max(c.r, max(c.g, c.b)); c *= smoothstep(uThresh, uThresh * 2.0, l); c = min(c, vec3(400.0)); } gl_FragColor = vec4(c, 1.0); }`,
    });
    this.upMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: null }, uTexel: { value: new THREE.Vector2() } }, vertexShader: FSQ_V, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
      fragmentShader: `uniform sampler2D uTex; uniform vec2 uTexel; varying vec2 vUv;
        void main(){ vec2 o = uTexel * 1.5; vec3 c = texture(uTex, vUv + vec2(-o.x,0)).rgb + texture(uTex, vUv + vec2(o.x,0)).rgb + texture(uTex, vUv + vec2(0,-o.y)).rgb + texture(uTex, vUv + vec2(0,o.y)).rgb;
          gl_FragColor = vec4(c * 0.25, 1.0); }`,
    });
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.hdrRT.texture }, uBloom: { value: this.bloom[0].texture }, uExposure: { value: 1 }, uBloomK: { value: 0.06 },
        uSunUV: { value: new THREE.Vector2(-9, -9) }, uSunVis: { value: 0 }, uAspect: { value: 1 }, uDepth: { value: this.sceneRT.depthTexture }, uLogFar2: { value: 1 }, uSunZ: { value: 1e20 }, uSunPx: { value: 0.01 } },
      vertexShader: FSQ_V, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D uTex, uBloom, uDepth; uniform float uExposure, uBloomK, uSunVis, uAspect, uLogFar2, uSunZ, uSunPx; uniform vec2 uSunUV; varying vec2 vUv;
        // is the sun visible at uv? (sky, or anything farther than the sun itself, counts as clear)
        float clearAt(vec2 uv) { float d = texture(uDepth, uv).r; if (d >= 0.99999) return 1.0; float w = exp2(d * uLogFar2) - 1.0; return w > uSunZ * 0.9 ? 1.0 : 0.0; }
        vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
        void main(){
          vec3 c = texture(uTex, vUv).rgb + texture(uBloom, vUv).rgb * uBloomK;
          if (uSunVis > 0.0) {
            vec2 d = (vUv - uSunUV) * vec2(uAspect, 1.0); float r = length(d);
            // partial occlusion from a small ring of taps around the solar disc
            float occl = 0.0; vec2 px = vec2(uSunPx / uAspect, uSunPx);
            for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; occl += clearAt(uSunUV + vec2(cos(a), sin(a)) * px); }
            occl = (occl / 8.0) * 0.6 + clearAt(uSunUV) * 0.4;
            float k = uSunVis * occl;
            float star = pow(max(0.0, 1.0 - abs(d.x * d.y) * 400.0), 20.0) * exp(-r * 3.0) * 1.5;
            float streak = exp(-abs(d.y) * 260.0) * exp(-abs(d.x) * 2.2) * 0.5; // faint anamorphic streak
            c += vec3(1.0, 0.95, 0.85) * k * (exp(-r * 25.0) * 3.0 + star) + vec3(0.6, 0.75, 1.0) * k * streak;
            // halo ring with a hint of dispersion
            float hr = abs(r - 0.33); c += vec3(0.9, 0.6, 0.4) * k * 0.035 * exp(-hr * hr * 9000.0) + vec3(0.4, 0.6, 1.0) * k * 0.03 * exp(-pow(r - 0.345, 2.0) * 9000.0);
            // ghosts along the sun->centre axis, each a slightly different tint and size
            vec2 axis = (vec2(0.5) - uSunUV);
            for (int i = 1; i <= 6; i++) { float fi = float(i); vec2 gp = uSunUV + axis * (0.32 * fi - 0.1); float gr = length((vUv - gp) * vec2(uAspect, 1.0)); float sz = 0.02 + 0.035 * fract(fi * 0.618);
              vec3 tint = mix(vec3(0.3, 0.5, 0.9), vec3(0.9, 0.55, 0.3), fract(fi * 0.37)); c += tint * k * 0.06 / (1.0 + fi * 0.4) * (smoothstep(sz, sz * 0.6, gr) * 0.6 + smoothstep(sz * 1.05, sz, gr) * smoothstep(sz * 0.8, sz, gr) * 0.8); }
          }
          c = aces(c * uExposure);
          c = pow(c, vec3(1.0 / 2.2));
          // subtle film grain + vignette
          vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.35;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
  }
  applyQuality(q) {
    const ms = q.msaa || 0; if (this.sceneRT.samples !== ms) { this.sceneRT.dispose(); this.sceneRT.samples = ms; }
    this.cloudMat.uniforms.uSteps.value = q.cloudSteps; this.compMat.uniforms.uSteps.value = q.atmoSteps; this.cloudMat.uniforms.uFar3D.value = q.clouds3d; this.compMat.uniforms.uSSS.value = q.shadow >= 2048 ? 1 : 0; }
  noiseDummy() { if (!this._dummy) { this._dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this._dummy.needsUpdate = true; } return this._dummy; }
  setSize(w, h) {
    this.sceneRT.setSize(w, h); this.sceneRT.depthTexture.image.width = w; this.sceneRT.depthTexture.image.height = h;
    this.cloudRT.setSize(Math.ceil(w / 2), Math.ceil(h / 2)); this.hdrRT.setSize(w, h); this.volRT.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    this.compMat.uniforms.uCloudTexel.value.set(1 / Math.ceil(w / 2), 1 / Math.ceil(h / 2));
    for (const rt of this.cloudHist) rt.setSize(Math.ceil(w / 2), Math.ceil(h / 2)); this.histValid = false;
    let bw = w, bh = h; for (const b of this.bloom) { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); b.setSize(bw, bh); }
    this.finalMat.uniforms.uAspect.value = w / h;
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qscene, this.cam); }
  // atmos: [{C:[x,y,z] camera-relative double, R, atmo:{...}, clouds:{...}, w2b: Matrix3, cloudRot}]
  render(scene, camera, frame) {
    const r = this.r, U = this.common;
    r.setRenderTarget(this.sceneRT); r.clear(); r.render(scene, camera);
    // camera uniforms
    U.uInvProj.value.copy(camera.projectionMatrixInverse);
    { const th = Math.tan(camera.fov * Math.PI / 360); U.uTanFov.value.set(th * camera.aspect, th); this.cloudMat.uniforms.uPixAng.value = 2 * th / Math.max(1, this.cloudRT.height); }
    U.uCamRot.value.setFromMatrix4(camera.matrixWorld);
    camera.getWorldDirection(U.uCamFwd.value);
    U.uLogFar.value = Math.log2(camera.far + 1);
    U.uTime.value = frame.time || 0;
    U.uSunDir.value.copy(frame.sunDir);
    U.uSunColor.value.copy(frame.sunColor);
    const list = frame.atmos || [];
    U.uNumA.value = Math.min(MAX_ATMO, list.length);
    let hasMap = 0, map = null, map1 = null, nMaps = 0;
    for (let i = 0; i < U.uNumA.value; i++) {
      const a = list[i], u = U.uA.value[i], at = a.atmo, C = a.C;
      const c2 = C[0] * C[0] + C[1] * C[1] + C[2] * C[2];
      u.C.set(C[0], C[1], C[2]); u.R = a.R; u.Ra = a.R + at.height;
      u.cG = c2 - a.R * a.R; u.cA = c2 - u.Ra * u.Ra;
      u.betaR.set(...at.rayleigh); u.betaM = at.mie; u.mieColor.set(...(at.mieColor || [1, 1, 1])); u.HR = at.H; u.HM = at.HM || at.H * 0.15; u.g = at.mieG;
      const cl = a.clouds;
      u.hasClouds = cl ? 1 : 0;
      if (cl) {
        u.Rb = a.R + cl.height; u.Rt = a.R + cl.height + cl.thickness; u.cB = c2 - u.Rb * u.Rb; u.cT = c2 - u.Rt * u.Rt;
        u.coverage = cl.coverage; u.opaque = cl.opaque ? 1 : 0; u.stack = cl.stack || 0; u.cloudColor.set(...cl.color); u.cloudRot = a.cloudRot || 0; u.cloudTex = 0; u.real2D = 0;
        if (cl.map && nMaps < 2) { hasMap = 1; if (nMaps === 0) map = cl.map; else map1 = cl.map; nMaps++; u.cloudTex = nMaps; }
        if (a.real2D) { this.cloudMat.uniforms.uCloudReal.value = a.real2D; u.real2D = 1; }
      }
      u.w2b.copy(a.w2b); u.oblate = a.oblate || 0; if (a.pole) u.pole.copy(a.pole);
    }
    { // storms of the (nearest) gas giant with a cloud deck, and a real-time clock for lightning
      const cu = this.cloudMat.uniforms; let ns = 0;
      const g = list.slice(0, U.uNumA.value).find(a => a.clouds && a.clouds.stack === 4 && a.clouds.spots);
      if (g) for (const sp of g.clouds.spots) { if (ns >= 6) break; cu.uSpot.value[ns].set(sp.dir[0], sp.dir[1], sp.dir[2], sp.R); cu.uSpotS.value[ns].set(sp.aspect, sp.spin, 0, 0); ns++; }
      cu.uNumSpot.value = ns; cu.uClock.value = (performance.now() / 1000) % 3600;
      const bo = frame.bolt; if (bo && bo.I > 0) { cu.uBolt.value.set(bo.pos.x, bo.pos.y, bo.pos.z, bo.I); cu.uBoltR.value = bo.R; } else cu.uBolt.value.w = 0;
    }
    this.cloudMat.uniforms.uHasMap.value = hasMap; this.cloudMat.uniforms.uCloudMap.value = map || this.noiseDummy(); this.cloudMat.uniforms.uCloudMap1.value = map1 || this.noiseDummy(); if (!this.cloudMat.uniforms.uCloudReal.value) this.cloudMat.uniforms.uCloudReal.value = this.noiseDummy();
    const anyClouds = list.slice(0, U.uNumA.value).some(a => a.clouds);
    this.frame = (this.frame + 1) % 4096; this.cloudMat.uniforms.uFrame.value = this.frame;
    const R = this.resolveMat.uniforms;
    if (anyClouds) {
      this.pass(this.cloudMat, this.cloudRT);
      const a0 = list.find(a => a.clouds);
      const same = a0 && this.prevBody === a0.body;
      R.uCur.value = this.cloudRT.texture; R.uHist.value = this.cloudHist[this.histI].texture; R.uTexel.value.set(1 / this.cloudRT.width, 1 / this.cloudRT.height);
      R.uValid.value = this.histValid && same ? 1 : 0;
      if (a0) { const cl = a0.clouds; R.uHasBody.value = 1; R.uRm.value = a0.R + cl.height + cl.thickness * 0.35; R.uC.value.set(a0.C[0], a0.C[1], a0.C[2]); R.uW2B.value.copy(a0.w2b); }
      const out = this.cloudHist[1 - this.histI];
      this.pass(this.resolveMat, out);
      this.compMat.uniforms.uClouds.value = out.texture; this.histI = 1 - this.histI; this.histValid = true;
      // remember this frame's camera for next frame's reprojection
      R.uPrevCamRot.value.copy(U.uCamRot.value); R.uPrevTanFov.value.copy(U.uTanFov.value);
      if (a0) { R.uPrevC.value.copy(R.uC.value); R.uPrevW2B.value.copy(a0.w2b); }
      this.prevBody = a0 ? a0.body : null;
    } else {
      r.setRenderTarget(this.cloudRT); r.setClearColor(0x000000, 1); r.clear(); this.compMat.uniforms.uClouds.value = this.cloudRT.texture; this.histValid = false;
    }
    // launch volumetrics (smoke, vapour) into their own buffer, stopping at the scene depth
    let hasVol = false;
    if (frame.vol) for (const m of frame.vol.children) if (m.visible && m.userData.vol) { hasVol = true; const V = m.userData.U; V.uDepth.value = this.sceneRT.depthTexture; V.uRes.value.set(this.volRT.width, this.volRT.height); V.uLogFar.value = U.uLogFar.value; }
    this.compMat.uniforms.uHasVol.value = hasVol ? 1 : 0;
    if (hasVol) { const cc = new THREE.Color(); r.getClearColor(cc); const ca = r.getClearAlpha(); r.setRenderTarget(this.volRT); r.setClearColor(0x000000, 0); r.clear(); r.render(frame.vol, camera); r.setClearColor(cc, ca); }
    const sssQ = this.compMat.uniforms.uSSS.value; if (frame.sss === false) this.compMat.uniforms.uSSS.value = 0;
    this.pass(this.compMat, this.hdrRT);
    this.compMat.uniforms.uSSS.value = sssQ;
    // bloom
    let src = this.hdrRT;
    for (let i = 0; i < this.bloom.length; i++) {
      this.downMat.uniforms.uTex.value = src.texture; this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height); this.downMat.uniforms.uThresh.value = i === 0 ? 1.2 : 0;
      this.pass(this.downMat, this.bloom[i]); src = this.bloom[i];
    }
    for (let i = this.bloom.length - 1; i > 0; i--) {
      this.upMat.uniforms.uTex.value = this.bloom[i].texture; this.upMat.uniforms.uTexel.value.set(1 / this.bloom[i].width, 1 / this.bloom[i].height);
      this.r.autoClear = false; this.pass(this.upMat, this.bloom[i - 1]); this.r.autoClear = true;
    }
    const F = this.finalMat.uniforms;
    F.uExposure.value = frame.exposure || 1;
    if (frame.sunUV) { F.uSunUV.value.copy(frame.sunUV); F.uSunVis.value = frame.sunVis; F.uSunZ.value = frame.sunZ || 1e20; F.uSunPx.value = Math.max(0.002, Math.min(0.05, frame.sunAng || 0.004)); } else F.uSunVis.value = 0;
    F.uLogFar2.value = U.uLogFar.value;
    this.pass(this.finalMat, null);
  }
}

// Launch volumetrics: billowing exhaust / deluge smoke, cryogenic frost on tanks (and the vapour that
// streams off it), and ice flakes shed at liftoff.
//
// Smoke and vapour are raymarched volumes drawn into their own half-resolution target (World.volScene)
// after the opaque scene, so every march stops at the scene depth: the rocket and the tower correctly
// hide smoke behind them and smoke in front of them hides them. The post pipeline composites the result
// before the atmosphere and clouds.
import * as THREE from 'three';
import { NOISE3 } from './glsl.js';
import { settings } from '../game/settings.js';
import { IS_MOBILE } from './textures.js';

const MAXP = 16; // puffs per smoke cloud (uniform array size)
const steps = (k) => Math.max(8, Math.round((settings.q.cloudSteps || 32) * k));
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// shared by all volume shaders: box proxy in local metres + distance to the opaque scene along the ray
const VOL_VERT = `uniform vec3 uBMin, uBMax; varying vec3 vLocal; varying vec3 vView;
  void main(){ vec3 p = mix(uBMin, uBMax, position + 0.5); vLocal = p; vec4 mv = modelViewMatrix * vec4(p, 1.0); vView = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const VOL_COMMON = `${NOISE3}
  varying vec3 vLocal; varying vec3 vView;
  uniform vec3 uCamLocal, uBMin, uBMax; uniform float uTime; uniform int uSteps;
  uniform sampler2D uDepth; uniform vec2 uRes; uniform float uLogFar;
  vec2 boxHit(vec3 ro, vec3 rd){ vec3 inv = 1.0 / rd; vec3 t0 = (uBMin - ro) * inv, t1 = (uBMax - ro) * inv;
    vec3 a = min(t0, t1), b = max(t0, t1); return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z)); }
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  // distance from the camera to the opaque scene through this pixel (log depth buffer)
  float sceneDistance(){
    float d = texture2D(uDepth, gl_FragCoord.xy / uRes).r; if (d >= 0.99999) return 1e30;
    float z = exp2(d * uLogFar) - 1.0; vec3 v = normalize(vView); return z / max(-v.z, 1e-4);
  }
  float hgPhase(float c, float g){ float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }`;

function volUniforms(extra) {
  return { uCamLocal: { value: new THREE.Vector3() }, uBMin: { value: new THREE.Vector3(-1, -1, -1) }, uBMax: { value: new THREE.Vector3(1, 1, 1) }, uTime: { value: 0 },
    uSteps: { value: steps(0.6) }, uDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uLogFar: { value: 1 }, ...extra };
}
// the pipeline supplies depth / resolution; the mesh keeps the camera position in its local frame
function volMesh(U, frag) {
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VOL_VERT, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.frustumCulled = false; m.userData.U = U; m.userData.vol = true;
  m.onBeforeRender = (r, s, cam) => { _inv.copy(m.matrixWorld).invert(); U.uCamLocal.value.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(_inv); };
  return m;
}

// ---------------------------------------------------------------- smoke cloud
// Up to 16 soft spherical puffs, eroded by noise. Local frame: y = up at the anchor, ground at uGround.
function makeSmokeCloud() {
  const U = volUniforms({ uPuff: { value: Array.from({ length: MAXP }, () => new THREE.Vector4()) }, uPuffB: { value: Array.from({ length: MAXP }, () => new THREE.Vector4()) }, uN: { value: 0 },
    uGround: { value: -1e9 }, uSunL: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Vector3(1, 1, 1) }, uAmb: { value: new THREE.Vector3(0.3, 0.35, 0.4) },
    uGlowP: { value: new THREE.Vector3() }, uGlowC: { value: new THREE.Vector3() }, uGlowR: { value: 10 }, uNoiseS: { value: 8 }, uSigma: { value: 0.25 }, uTint: { value: new THREE.Vector3(0.9, 0.89, 0.87) } });
  U.uSteps.value = steps(0.55);
  const frag = `${VOL_COMMON}
    uniform vec4 uPuff[${MAXP}]; uniform vec4 uPuffB[${MAXP}]; uniform int uN; uniform float uGround, uGlowR, uNoiseS, uSigma;
    uniform vec3 uSunL, uSunC, uAmb, uGlowP, uGlowC, uTint;
    // puff field (x: density, y: heat); cheap enough for the light probe
    vec2 field(vec3 p){
      vec2 s = vec2(0.0);
      for (int i = 0; i < ${MAXP}; i++) { if (i >= uN) break;
        vec4 P = uPuff[i]; vec3 q = p - P.xyz; float r2 = dot(q, q) / (P.w * P.w);
        if (r2 < 1.0) { float w = 1.0 - r2; w *= w; s += vec2(uPuffB[i].x, uPuffB[i].w) * w; } }
      return s;
    }
    float erode(vec3 p, float d){
      vec3 q = p / uNoiseS + vec3(0.0, -uTime * 0.04, uTime * 0.015);
      float n = snoise(q) * 0.65 + snoise(q * 2.7 + 3.1) * 0.35;
      return clamp(d * (1.0 + 0.8 * n) - 0.12 + 0.1 * snoise(q * 6.1), 0.0, 3.0);
    }
    void main(){
      vec3 ro = uCamLocal, rd = normalize(vLocal - uCamLocal);
      vec2 th = boxHit(ro, rd); float t0 = max(th.x, 0.0), t1 = min(th.y, sceneDistance());
      if (rd.y < 0.0) { float tg = (uGround - ro.y) / rd.y; if (tg > 0.0) t1 = min(t1, tg); }
      if (t1 <= t0) discard;
      int N = uSteps; float dt = (t1 - t0) / float(N); float t = t0 + dt * ign(gl_FragCoord.xy + fract(uTime * 7.13) * 61.0);
      float cosS = dot(rd, uSunL); float ph = mix(hgPhase(cosS, 0.55), hgPhase(cosS, -0.2), 0.4) * 0.8 + 0.2;
      float day = smoothstep(-0.12, 0.08, uSunL.y);
      vec3 col = vec3(0.0); float T = 1.0;
      for (int i = 0; i < 64; i++) {
        if (i >= N || T < 0.03) break;
        vec3 p = ro + rd * t; t += dt;
        vec2 f = field(p); if (f.x < 0.004) continue;
        float d = erode(p, f.x); if (d < 0.003) continue;
        float heat = f.y / max(f.x, 1e-3);
        float ls = uNoiseS * 1.4; vec2 fl = field(p + uSunL * ls);
        float sunVis = exp(-fl.x * uSigma * ls * 0.9) * day;
        float lowK = clamp((p.y - uGround) / (uNoiseS * 3.0), 0.0, 1.0);        // undersides a bit darker
        vec3 g = p - uGlowP; float glow = 1.0 / (1.0 + dot(g, g) / (uGlowR * uGlowR));
        vec3 e = uTint * (uSunC * sunVis * ph + uAmb * (0.55 + 0.45 * lowK)) + uGlowC * glow * (0.4 + heat) + vec3(1.0, 0.45, 0.12) * heat * heat * 3.0;
        float a = 1.0 - exp(-d * uSigma * dt);
        col += T * a * e; T *= 1.0 - a;
      }
      if (T > 0.995) discard;
      gl_FragColor = vec4(col, 1.0 - T);
    }`;
  return volMesh(U, frag);
}

// ---------------------------------------------------------------- frost vapour
// Cold air sliding off frosted tanks: a thin sheet hugging the tank walls that pours away along the flow
// (down with gravity on the pad or when slow, back along the airflow once moving) and trails off, however
// the rocket is turned. Frame: world axes, origin at the vessel's centre of mass.
function makeFrostVapor() {
  const U = volUniforms({ uR: { value: 2 }, uY0: { value: 0 }, uY1: { value: 10 }, uK: { value: 0 }, uFlow: { value: 1 }, uTrail: { value: 20 },
    uAxis: { value: new THREE.Vector3(0, 1, 0) }, uDown: { value: new THREE.Vector3(0, -1, 0) }, uE1: { value: new THREE.Vector3(1, 0, 0) }, uE2: { value: new THREE.Vector3(0, 0, 1) },
    uSunL: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Vector3(1, 1, 1) }, uAmb: { value: new THREE.Vector3(0.3, 0.35, 0.4) } });
  U.uSteps.value = steps(0.5);
  const frag = `${VOL_COMMON}
    uniform float uR, uY0, uY1, uK, uFlow, uTrail; uniform vec3 uSunL, uSunC, uAmb, uAxis, uDown, uE1, uE2;
    // the sheet on the tank walls (x: point relative to the centre of mass; w: how far it has drifted)
    float sheet(vec3 x, float w){
      float ya = dot(x, uAxis); float rho = length(x - uAxis * ya);
      float R = uR + w * 0.22;
      float span = smoothstep(uY1 + 0.5, uY1 - 1.5, ya) * smoothstep(uY0 - 1.0 - w * 0.3, uY0 + 0.2, ya);
      return exp(-max(rho - R, 0.0) / (0.18 * uR + w * 0.1)) * smoothstep(uR * 0.96, uR * 1.02, rho + w * 0.2) * span;
    }
    float dens(vec3 p){
      // follow the flow line back upstream: the vapour here left the tank k metres ago
      float best = 0.0; float k = 0.0;
      for (int j = 0; j < 7; j++) {
        float d = sheet(p - uDown * k, k) * exp(-k / uTrail);
        best = max(best, d); k = k < 0.5 ? 1.0 : k * 2.2;
      }
      if (best < 0.01) return 0.0;
      float s = dot(p, uDown);
      vec3 q = vec3(dot(p, uE1) * 1.1, -s * 0.18 + uTime * uFlow, dot(p, uE2) * 1.1);   // streaks stretched along the flow
      float n = snoise(q) * 0.6 + snoise(q * 2.3 + 1.7) * 0.4;
      return best * smoothstep(-0.25, 0.6, n) * uK;
    }
    void main(){
      vec3 ro = uCamLocal, rd = normalize(vLocal - uCamLocal);
      vec2 th = boxHit(ro, rd); float t0 = max(th.x, 0.0), t1 = min(th.y, sceneDistance());
      if (t1 <= t0 || uK < 0.002) discard;
      int N = uSteps; float dt = (t1 - t0) / float(N); float t = t0 + dt * ign(gl_FragCoord.xy + fract(uTime * 5.31) * 41.0);
      float day = 1.0; // (the sun colour already carries night and the planet's shadow)
      vec3 col = vec3(0.0); float T = 1.0;
      for (int i = 0; i < 48; i++) {
        if (i >= N || T < 0.05) break;
        vec3 p = ro + rd * t; t += dt;
        float d = dens(p); if (d < 0.003) continue;
        float a = 1.0 - exp(-d * 1.6 * dt);
        float ya = dot(p, uAxis); vec3 rv = p - uAxis * ya;
        vec3 e = vec3(0.92, 0.95, 1.0) * (uSunC * day * (0.6 + 0.4 * max(dot(normalize(rv + 1e-4), uSunL), 0.0)) + uAmb);
        col += T * a * e; T *= 1.0 - a;
      }
      if (T > 0.995) discard;
      gl_FragColor = vec4(col, 1.0 - T);
    }`;
  return volMesh(U, frag);
}

// ---------------------------------------------------------------- frost on tank surfaces
// Patches a (cloned) part material: white, rough, non-metallic frost in streaks and blotches that melts
// from the bottom up and in patches as uFrost falls from 1 to 0.
export function frostPatch(mat, FU) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFrost = FU.uFrost; sh.uniforms.uInvV = FU.uInvV; sh.uniforms.uYB = FU.uYB;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uInvV; varying vec3 vFrostP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFrostP = (uInvV * modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uFrost; uniform vec2 uYB; varying vec3 vFrostP;
        float fh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float fvn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(fh(i), fh(i + vec3(1,0,0)), f.x), mix(fh(i + vec3(0,1,0)), fh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(fh(i + vec3(0,0,1)), fh(i + vec3(1,0,1)), f.x), mix(fh(i + vec3(0,1,1)), fh(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float frostAmt(vec3 p){
          if (uFrost <= 0.001) return 0.0;
          float hf = clamp((p.y - uYB.x) / max(uYB.y - uYB.x, 0.1), 0.0, 1.0);
          float streak = fvn(vec3(p.x * 2.6, p.y * 0.3, p.z * 2.6));
          float blot = fvn(p * 1.4) * 0.6 + fvn(p * 5.3) * 0.4;
          float n = streak * 0.45 + blot * 0.55;
          float melt = 1.0 - uFrost;
          float thr = melt * 1.3 - 0.12 + (1.0 - hf) * melt * 0.5;       // melts from the bottom (engine heat) first
          return smoothstep(thr, thr + 0.1, n);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float frostK = frostAmt(vFrostP);
        float frostTex = fvn(vFrostP * 23.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.88, 0.93) * (0.82 + 0.25 * frostTex), frostK);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.72 + 0.2 * frostTex, frostK);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, frostK);');
  };
  mat.customProgramCacheKey = () => 'frost'; mat.userData.frostU = FU;
}

// ---------------------------------------------------------------- ice flakes
class IceFlakes {
  constructor(max = IS_MOBILE ? 150 : 400) {
    this.max = max; this.list = [];
    this.geo = new THREE.BufferGeometry(); this.pos = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ color: 0xdce8f5, size: 0.28, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.points.frustumCulled = false; this.points.renderOrder = 4;
  }
  // r, v: body-centred inertial position / velocity (V3)
  add(body, r, v) { if (this.list.length >= this.max) this.list.shift(); this.list.push({ body, r, v, age: 0, life: 3 + Math.random() * 3 }); }
  // advance existing flakes (call before adding this frame's new ones, which start exactly on the hull)
  step(dt) {
    for (const f of this.list) {
      f.age += dt; const rl = f.r.len();
      f.v.addScaled(f.r, -f.body.mu / (rl * rl * rl) * dt);
      const air = f.body.surfaceVel(f.r); const k = Math.min(1, dt * 1.6); // light flakes follow the air quickly
      f.v.x += (air.x - f.v.x) * k; f.v.y += (air.y - f.v.y) * k; f.v.z += (air.z - f.v.z) * k;
      f.r.addScaled(f.v, dt);
    }
    this.list = this.list.filter(f => f.age < f.life);
  }
  upload(t, camPos) {
    let n = 0;
    for (const f of this.list) {
      const bp = f.body.posAt(t);
      this.pos[n * 3] = bp.x + f.r.x - camPos.x; this.pos[n * 3 + 1] = bp.y + f.r.y - camPos.y; this.pos[n * 3 + 2] = bp.z + f.r.z - camPos.z; n++;
    }
    this.geo.setDrawRange(0, n); this.geo.attributes.position.needsUpdate = true; this.points.visible = n > 0;
  }
  clear() { this.list.length = 0; this.geo.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------- launch effects manager
const CRYO = new Set(['kerolox', 'methalox', 'hydrolox', 'hydrogen']);
const SMOKE_K = { solid: 2.2, kerolox: 1.0, methalox: 0.75, hypergolic: 1.1, hydrolox: 0.35, hydrogen: 0.3 };

export class LaunchFX {
  constructor(world, root) {
    this.world = world; this.root = root;
    this.clouds = []; this.maxClouds = IS_MOBILE ? 5 : 10;
    this.flakes = new IceFlakes(); root.add(this.flakes.points);
    this.vapor = makeFrostVapor(); this.vapor.visible = false; world.volScene.add(this.vapor);
    this.frost = 0; this.frostU = null; this.lastEmit = null; this.t = 0;
  }
  // new vessel mesh: clone cryogenic tank materials and give them frost
  attach(v, mesh, frosty) {
    this.frostU = { uFrost: { value: 0 }, uInvV: { value: new THREE.Matrix4() }, uYB: { value: new THREE.Vector2(v.bottom - v.com[1], v.top - v.com[1]) } };
    this.clear();
    this.cryoParts = [];
    const cache = new Map();
    for (const m of mesh.userData.parts || []) {
      const rt = m.userData.rt; if (!rt || !rt.part.prop || !CRYO.has(rt.part.prop.type) || rt.part.engine) continue;
      this.cryoParts.push({ rt, m });
      m.traverse(o => {
        if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
        let c = cache.get(o.material); if (!c) { c = o.material.clone(); frostPatch(c, this.frostU); cache.set(o.material, c); }
        o.material = c;
        if (!o.userData.frostHook) { o.userData.frostHook = true; const prev = o.onBeforeRender; o.onBeforeRender = (...a) => { this.frostU.uInvV.value.copy(mesh.matrixWorld).invert(); prev && prev.apply(o, a); }; }
      });
    }
    this.mesh = mesh;
    let y0 = Infinity, y1 = -Infinity, r = 0;
    // a part's origin is its top; it extends h downward
    for (const { rt } of this.cryoParts) { const y = rt.pl.pos[1], h = rt.part.h || 1; y0 = Math.min(y0, y - h); y1 = Math.max(y1, y); r = Math.max(r, (rt.part.d || 1) / 2); }
    this.cryoSpan = this.cryoParts.length ? { y0, y1, r } : null; this.liveN = this.cryoParts.length; this.liveCryo = this.cryoParts;
    this.frost = frosty && this.cryoParts.length ? 1 : 0; this.frostU.uFrost.value = this.frost;
    this.liftT = null;
  }
  clear() {
    for (const c of this.clouds) this.world.volScene.remove(c.mesh);
    this.clouds.length = 0; this.flakes.clear(); this.vapor.visible = false; this.lastEmit = null;
  }
  dispose() { this.clear(); this.world.volScene.remove(this.vapor); this.root.remove(this.flakes.points); }

  // cloud anchored at a body-fixed point, its local y along the body's up there
  newCloud(body, bf, t, r0) {
    const up = new THREE.Vector3(bf[0], bf[1], bf[2]).normalize();
    const mesh = makeSmokeCloud(); this.world.volScene.add(mesh);
    const c = { body, bf: bf.slice(), qLocal: new THREE.Quaternion().setFromUnitVectors(Y, up), puffs: [], mesh, age: 0, ground: -1e9, r0 };
    const rl = Math.hypot(bf[0], bf[1], bf[2]);
    if (body.hasSurface && body.surface) { const gh = body.surface.height(bf[0] / rl, bf[1] / rl, bf[2] / rl); c.ground = body.radius + gh - rl; }
    this.clouds.push(c);
    while (this.clouds.length > this.maxClouds) { const o = this.clouds.shift(); this.world.volScene.remove(o.mesh); }
    return c;
  }
  cloudWorld(c, t, camPos, outPos, outQ) {
    const q = c.body.rotAt(t); const p = new THREE.Vector3(c.bf[0], c.bf[1], c.bf[2]).applyQuaternion(q);
    const bp = c.body.posAt(t); outPos.set(bp.x + p.x - camPos.x, bp.y + p.y - camPos.y, bp.z + p.z - camPos.z);
    outQ.copy(q).multiply(c.qLocal);
  }
  // per frame. ctx: { v, t, dt (sim seconds), camPos (V3), focusRel (Vector3), pAtm, sunDir (world), sunI, sunColor }
  update(ctx) {
    const { v, t, camPos } = ctx; const dt = Math.min(ctx.dt, 0.25); this.t += dt;
    this.flakes.step(dt);
    const world = this.world;
    const air = v.body && v.body.atmo ? Math.min(1, ctx.pAtm) : 0;
    // lighting shared by all volumes (radiance of a white diffuser, like the scene's lit surfaces)
    const sunC = new THREE.Vector3(...(world.starColor || [1, 1, 1])).multiplyScalar((world.sun.intensity || 0) / Math.PI);
    const amb = new THREE.Vector3(0.55, 0.65, 0.85).multiplyScalar((world.sun.intensity || 0) / Math.PI * 0.28 * air + 0.004);
    // ------------------------------------------------ smoke emission
    const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(v.q);
    const exitRel = ctx.focusRel.clone().addScaledVector(nose, v.bottom - v.com[1]); // exhaust exit, camera-relative
    let thrust = 0, kind = 'kerolox', smokeK = 0;
    for (const p of v.livingParts()) if (p.firing && p.part.engine) { const T = p.part.engine.thrust * 1000 * p.firing; thrust += T; const k = p.part.engine.solid ? 'solid' : p.part.engine.prop; const s = SMOKE_K[k] ?? 0.6; if (s * T > smokeK) { smokeK = s * T; kind = k; } }
    const firing = thrust > 0 && air > 0.02 && v.body.hasSurface;
    if (firing) {
      const r0 = Math.max(3, Math.min(45, Math.sqrt(thrust) / 280));
      const sk = (SMOKE_K[kind] ?? 0.6) * air;
      // exhaust exit in body-fixed coordinates and its height above the ground
      const qb = v.body.rotAt(t); const qi = qb.clone().invert();
      const bp = v.body.posAt(t);
      const exitBF = new THREE.Vector3(camPos.x + exitRel.x - bp.x, camPos.y + exitRel.y - bp.y, camPos.z + exitRel.z - bp.z).applyQuaternion(qi);
      const rl = exitBF.length(); const upBF = exitBF.clone().divideScalar(rl);
      const gh = v.body.surface ? v.body.surface.height(upBF.x, upBF.y, upBF.z) : 0;
      const hAbove = rl - v.body.radius - Math.max(gh, v.body.name === 'Earth' ? 0 : -1e9) - (v.padHeight || 0) * 0.6;
      const ground = hAbove < r0 * 14;
      // emit by distance travelled (trail) or time (on the pad), whichever comes first
      const last = this.lastEmit; const moved = last ? exitBF.distanceTo(last.p) : Infinity; const since = last ? this.t - last.t : Infinity;
      const spacing = ground ? r0 * 0.5 : r0 * 0.8;
      if (moved > spacing || since > (ground ? 0.09 : 0.25)) {
        this.lastEmit = { p: exitBF.clone(), t: this.t };
        const groundBF = upBF.clone().multiplyScalar(rl - Math.max(0, hAbove));
        const anchor = ground ? groundBF : exitBF;
        let c = this.clouds[this.clouds.length - 1];
        const lim = ground ? r0 * 16 : r0 * 10;
        if (!c || c.puffs.length >= MAXP || c.body !== v.body || new THREE.Vector3(...c.bf).distanceTo(anchor) > lim || (c.isGround !== ground)) {
          c = this.newCloud(v.body, anchor.toArray(), t, r0); c.isGround = ground;
        }
        // emission point in the cloud's local frame
        const cp = new THREE.Vector3(), cq = new THREE.Quaternion(); this.cloudWorld(c, t, camPos, cp, cq);
        const cqi = cq.clone().invert();
        const toLocal = (rel) => rel.clone().sub(cp).applyQuaternion(cqi);
        if (ground) {
          // exhaust (and deluge steam) hits the pad and races outward along the ground in two main lobes
          const base = toLocal(exitRel); base.y = c.ground + r0 * 0.4;
          const lobe = Math.random() < 0.75 ? (Math.random() < 0.5 ? 0 : Math.PI) : Math.random() * Math.PI * 2;
          const ang = lobe + (Math.random() - 0.5) * 0.9; const sp = (18 + 30 * Math.random()) * Math.min(1, thrust / 5e6 + 0.4);
          c.puffs.push({ p: base, v: new THREE.Vector3(Math.cos(ang) * sp, 2 + Math.random() * 3, Math.sin(ang) * sp), r: r0 * 0.6, r1: r0 * (2.2 + Math.random() * 1.6), age: 0, life: 28 + Math.random() * 18, dens: 0.9 * Math.min(1.4, sk + 0.5), heat: 1 });
        } else {
          const p = toLocal(exitRel); const back = toLocal(exitRel.clone().addScaledVector(nose, -r0)).sub(p).normalize();
          c.puffs.push({ p: p.addScaledVector(back, r0 * 0.6), v: back.multiplyScalar(8), r: r0 * 0.5, r1: r0 * (1.6 + Math.random() * 0.8) * (1 + (1 - air) * 1.5), age: 0, life: 14 + Math.random() * 8, dens: 0.75 * sk, heat: 0.8 });
        }
      }
    }
    // ------------------------------------------------ smoke evolution + upload
    const cp = new THREE.Vector3(), cq = new THREE.Quaternion();
    const sunW = ctx.sunDir;
    for (const c of this.clouds) {
      c.age += dt;
      for (const p of c.puffs) {
        p.age += dt;
        p.p.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.exp(-dt * 0.55));
        p.v.y += (p.heat * 4 + 0.35) * dt; p.v.x += 0.6 * dt; // buoyancy and a light breeze
        p.r += (p.r1 - p.r) * Math.min(1, dt * 0.35); p.heat *= Math.exp(-dt * 0.9);
        if (p.p.y - p.r * 0.35 < c.ground) p.p.y = c.ground + p.r * 0.35;
      }
      c.puffs = c.puffs.filter(p => p.age < p.life);
      const U = c.mesh.userData.U; U.uN.value = c.puffs.length;
      if (!c.puffs.length) { c.mesh.visible = false; continue; }
      c.mesh.visible = true;
      const mn = new THREE.Vector3(Infinity, Infinity, Infinity), mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      c.puffs.forEach((p, i) => {
        const fade = Math.min(1, p.age / 0.4) * (1 - Math.max(0, (p.age - p.life * 0.6) / (p.life * 0.4)));
        U.uPuff.value[i].set(p.p.x, p.p.y, p.p.z, p.r);
        U.uPuffB.value[i].set(p.dens * fade * Math.pow(p.r1 / Math.max(p.r, 0.1), 0.6) * 0.6, p.age, 0, p.heat);
        mn.min(_v.set(p.p.x - p.r, p.p.y - p.r, p.p.z - p.r)); mx.max(_v.set(p.p.x + p.r, p.p.y + p.r, p.p.z + p.r));
      });
      mn.y = Math.max(mn.y, c.ground);
      U.uBMin.value.copy(mn); U.uBMax.value.copy(mx);
      this.cloudWorld(c, t, camPos, cp, cq); c.mesh.position.copy(cp); c.mesh.quaternion.copy(cq);
      const cqi = cq.clone().invert();
      U.uSunL.value.copy(sunW).applyQuaternion(cqi); U.uSunC.value.copy(sunC); U.uAmb.value.copy(amb);
      U.uNoiseS.value = c.r0 * 0.9; U.uSigma.value = 1.4 / c.r0; U.uTime.value = this.t;
      // the engines light the cloud from inside
      U.uGlowP.value.copy(exitRel).sub(cp).applyQuaternion(cqi);
      const gk = firing ? Math.min(1, thrust / 3e6) * 6 : 0; U.uGlowC.value.set(1.0, 0.55, 0.22).multiplyScalar(gk); U.uGlowR.value = c.r0 * 2.5;
    }
    this.clouds = this.clouds.filter(c => { if (!c.puffs.length && c.age > 2) { this.world.volScene.remove(c.mesh); return false; } return true; });

    // ------------------------------------------------ frost melt, vapour, ice shedding
    // only tanks still on the vessel steam and shed ice (a separated stage takes its frost with it)
    if (this.cryoParts) {
      const live = this.cryoParts.filter(({ rt }) => rt.attached !== false && !rt.broken);
      if (live.length !== this.liveN) {
        this.liveN = live.length;
        let y0 = Infinity, y1 = -Infinity, r = 0;
        for (const { rt } of live) { const y = rt.pl.pos[1], h = rt.part.h || 1; y0 = Math.min(y0, y - h); y1 = Math.max(y1, y); r = Math.max(r, (rt.part.d || 1) / 2); }
        this.cryoSpan = live.length ? { y0, y1, r } : null; this.liveCryo = live;
      }
    }
    if (this.frostU && this.cryoSpan) {
      const launched = v.situation !== 'prelaunch' && !v.clamped;
      if (launched && this.liftT === null) this.liftT = this.t;
      const since = this.liftT === null ? 0 : this.t - this.liftT;
      let melt = 0;
      if (launched && this.frost > 0) {
        // vibration knocks sheets of ice off in the first seconds, then airflow and heating finish the job
        melt = (since < 4 ? 0.06 : 0.012) + (v.q_dyn || 0) * 2.5e-7 + (v.heat || 0) * 1e-4;
        this.frost = Math.max(0, this.frost - melt * dt);
      }
      this.frostU.uFrost.value = this.frost;
      const S = this.cryoSpan;
      const show = this.frost > 0.01 && air > 0.2;
      this.vapor.visible = show;
      if (show) {
        const U = this.vapor.userData.U;
        U.uR.value = S.r;
        const speed = v.v.clone().sub(v.body.surfaceVel(v.r)).len();
        U.uK.value = Math.min(1, this.frost * 1.3) * air * (launched ? 1.4 : 0.8);
        U.uFlow.value = launched ? 0.4 + speed * 0.05 : 0.35; U.uTrail.value = launched ? 6 + speed * 0.15 : S.r * 2.5;
        // span relative to the current centre of mass (it moves when stages separate)
        const Y0 = S.y0 - v.com[1], Y1 = S.y1 - v.com[1];
        U.uY0.value = Y0; U.uY1.value = Y1;
        // flow: down with gravity when slow, back along the airflow when moving
        const upW = new THREE.Vector3(v.r.x, v.r.y, v.r.z).normalize();
        const airW = v.v.clone().sub(v.body.surfaceVel(v.r)); const aw = new THREE.Vector3(airW.x, airW.y, airW.z);
        const wk = THREE.MathUtils.smoothstep(speed, 2, 25);
        const down = upW.clone().negate().multiplyScalar(1 - wk).addScaledVector(aw.lengthSq() > 1e-6 ? aw.normalize().negate() : upW.clone().negate(), wk).normalize();
        const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(v.q);
        U.uAxis.value.copy(axis); U.uDown.value.copy(down);
        const e1 = new THREE.Vector3().crossVectors(down, Math.abs(down.y) < 0.9 ? Y : new THREE.Vector3(1, 0, 0)).normalize();
        U.uE1.value.copy(e1); U.uE2.value.crossVectors(down, e1);
        // bounds: the tank section and where its vapour can drift to
        const trail = Math.min(200, U.uTrail.value * 3), wR = S.r * 1.6 + trail * 0.22 + 1;
        const bmin = new THREE.Vector3(Infinity, Infinity, Infinity), bmax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        for (const yy of [Y0, Y1]) for (const kk of [0, trail]) { const c = axis.clone().multiplyScalar(yy).addScaledVector(down, kk); bmin.min(c); bmax.max(c); }
        bmin.subScalar(wR); bmax.addScalar(wR);
        U.uBMin.value.copy(bmin); U.uBMax.value.copy(bmax);
        this.vapor.position.copy(ctx.focusRel); this.vapor.quaternion.identity();
        U.uSunL.value.copy(sunW); U.uSunC.value.copy(sunC); U.uAmb.value.copy(amb); U.uTime.value = this.t;
      }
      // flakes and chunks of ice shed from the tanks while the frost melts
      const src = this.liveCryo || this.cryoParts;
      if (melt > 0 && src.length) {
        const n = Math.min(40, Math.floor(melt * dt * 2400 + Math.random()));
        for (let i = 0; i < n; i++) {
          const { rt } = src[Math.floor(Math.random() * src.length)];
          const r = (rt.part.d || 1) / 2, a = Math.random() * Math.PI * 2, y = rt.pl.pos[1] - v.com[1] - Math.random() * (rt.part.h || 1);
          _v.set(Math.cos(a) * r, y, Math.sin(a) * r).applyQuaternion(v.q); _v2.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(v.q);
          const pr = v.r.clone(); pr.x += _v.x; pr.y += _v.y; pr.z += _v.z;
          const pv = v.v.clone(); pv.x += _v2.x * 1.5; pv.y += _v2.y * 1.5; pv.z += _v2.z * 1.5;
          this.flakes.add(v.body, pr, pv);
        }
      }
    }
    this.flakes.upload(t, camPos);
  }
}

// Volumetric effects: raymarched rocket plumes, re-entry plasma sheaths and fireballs. Each one is
// a box mesh whose fragment shader marches the camera ray through a procedural density field.
import * as THREE from 'three';
import { NOISE3 } from './glsl.js';
import { settings } from '../game/settings.js';

const _inv = new THREE.Matrix4(), _cp = new THREE.Vector3();
// camera position in the mesh's local (unit box) space, refreshed just before the draw
function trackCamera(mesh, U) {
  mesh.onBeforeRender = (r, s, cam) => { _inv.copy(mesh.matrixWorld).invert(); U.uCamLocal.value.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(_inv); };
}
const steps = (k) => Math.max(8, Math.round((settings.q.cloudSteps || 32) * k));

const VERT = `#include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vLocal;
  void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
  }`;
const COMMON = `#include <common>
  #include <logdepthbuf_pars_fragment>
  ${NOISE3}
  varying vec3 vLocal; uniform vec3 uCamLocal, uBMin, uBMax; uniform float uTime; uniform int uSteps;
  vec2 boxHit(vec3 ro, vec3 rd){ vec3 inv = 1.0 / rd; vec3 t0 = (uBMin - ro) * inv, t1 = (uBMax - ro) * inv;
    vec3 a = min(t0, t1), b = max(t0, t1); return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z)); }
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;

// ---------------------------------------------------------------- exhaust plume
// Local frame: nozzle exit at the origin, flow along -y. The box is sized in metres each frame
// (vacuum plumes balloon out, sea-level ones stay columnar with shock diamonds).
const KIND = { ion: 1, solid: 2, hydrolox: 3, fusion: 4, methalox: 5, hypergolic: 6, monoprop: 7, dhe3: 4, pulse: 4, antimatter: 4, xenon: 1, argon: 1 };
export function makePlume(nozzleR, color = [1.0, 0.62, 0.3], kind = 'chem') {
  const U = { uTime: { value: 0 }, uThrottle: { value: 0 }, uPressure: { value: 1 }, uColor: { value: new THREE.Vector3(...color) }, uKind: { value: KIND[kind] || 0 },
    uCamLocal: { value: new THREE.Vector3() }, uBMin: { value: new THREE.Vector3(-1, -1, -1) }, uBMax: { value: new THREE.Vector3(1, 0, 1) }, uSteps: { value: steps(0.7) }, uR0: { value: nozzleR } };
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, -0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      uniform vec3 uBMin, uBMax; varying vec3 vLocal;
      void main(){ vec3 p = mix(uBMin, uBMax, position + vec3(0.5, 1.0, 0.5)); vLocal = p; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `${COMMON}
      uniform float uThrottle, uPressure, uKind, uR0; uniform vec3 uColor;
      vec3 hot(float k, float t){ // colour by propellant and position along the plume (t: 0 at the nozzle)
        if (k == 3.0) return mix(vec3(0.55, 0.62, 1.0), vec3(0.9, 0.55, 0.75), t) * 0.25;      // hydrolox: nearly clear
        if (k == 5.0) return mix(vec3(0.35, 0.5, 1.0), vec3(1.0, 0.5, 0.3), smoothstep(0.1, 0.6, t)) * 0.8; // methalox: blue core
        if (k == 1.0) return vec3(0.3, 0.5, 1.0) * 0.5;
        if (k == 4.0) return mix(vec3(0.9, 0.8, 1.0), vec3(0.6, 0.4, 1.0), t);
        if (k == 6.0) return mix(vec3(1.0, 0.6, 0.4), vec3(1.0, 0.45, 0.5), t) * 0.55;          // hypergolic: pinkish orange
        if (k == 7.0) return vec3(0.8, 0.82, 0.85) * 0.15;
        if (k == 2.0) return mix(vec3(1.0, 0.92, 0.7), vec3(1.0, 0.55, 0.2), smoothstep(0.1, 0.8, t)) * 1.4; // solid: blinding
        return mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.45, 0.12), smoothstep(0.05, 0.7, t));   // kerolox
      }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 ro = uCamLocal, rd = normalize(vLocal - uCamLocal);
        vec2 th = boxHit(ro, rd); float t0 = max(th.x, 0.0), t1 = th.y; if (t1 <= t0) discard;
        float P = clamp(uPressure, 0.0, 1.0), thr = uThrottle;
        float Lc = uR0 * mix(70.0, 38.0, P) * (0.35 + 0.65 * thr);
        float spread = mix(0.6, 0.05, P);
        float dsh = uR0 * 2.6;                              // shock diamond spacing
        int N = uSteps; float dt = (t1 - t0) / float(N); float t = t0 + dt * ign(gl_FragCoord.xy);
        vec3 col = vec3(0.0);
        for (int i = 0; i < 64; i++) {
          if (i >= N) break;
          vec3 p = ro + rd * t; t += dt;
          float s = max(-p.y, 0.0); float along = s / Lc;
          float rb = uR0 * (1.0 + s / uR0 * spread) * (1.0 + 0.12 * P * sin(s / dsh * 6.2832));
          float rho = length(p.xz);
          float turb = snoise(vec3(p.x, p.y + mod(uTime, 300.0) * 40.0 * uR0, p.z) * (1.6 / uR0)) * min(1.0, along * 2.0);
          float q = rho / rb + turb * 0.18;
          if (q > 1.3) continue;
          float fall = exp(-along * 2.2) * (1.0 - smoothstep(0.8, 1.25, along)) * smoothstep(0.0, 0.03, along);
          float core = exp(-q * q * 5.0), sheath = smoothstep(1.15, 0.6, q);
          vec3 e = hot(uKind, along) * (core * 1.4 + sheath * 0.45) * fall;
          e += vec3(1.0, 0.95, 0.85) * exp(-along * 14.0) * core * 1.5 * (uKind == 1.0 || uKind == 7.0 ? 0.0 : uKind == 3.0 ? 0.3 : 1.0); // white-hot core near the throat
          if (P > 0.15 && uKind != 2.0 && uKind != 1.0) { // Mach diamonds: bright shock discs on the axis
            float ph = fract(s / dsh - 0.3); float disc = exp(-pow((ph - 0.5) / 0.09, 2.0)) * exp(-pow(rho / (uR0 * 0.55), 2.0));
            e += (uKind == 3.0 ? vec3(1.0, 0.55, 0.75) : vec3(1.0, 0.9, 0.7)) * disc * P * exp(-along * 2.5) * 2.5;
          }
          col += e * (dt / uR0);
        }
        col *= thr * (0.9 + 0.1 * sin(uTime * 70.0)) * 1.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 5; m.userData.U = U;
  trackCamera(m, U);
  // box follows the plume shape: long and wide in vacuum, narrow at sea level
  m.onBeforeRender = ((prev) => (r, s, cam, g, mt, gr) => {
    const P = Math.min(1, Math.max(0, U.uPressure.value)), thr = U.uThrottle.value;
    const L = nozzleR * (70 - 32 * P) * (0.35 + 0.65 * thr) * 1.3, W = nozzleR * (1 + (L / nozzleR) * (0.6 - 0.55 * P)) * 1.35 + nozzleR * 0.4;
    U.uBMin.value.set(-W, -L, -W); U.uBMax.value.set(W, 0, W);
    prev(r, s, cam, g, mt, gr);
  })(m.onBeforeRender);
  return m;
}

// ---------------------------------------------------------------- re-entry plasma
// Local frame: +y points into the airflow, the vessel is a capsule (uA..uB, radius uRad). A bright
// stagnation layer hugs the windward side; streaky ionised wake trails downstream.
export function makePlasma() {
  const U = { uK: { value: 0 }, uTime: { value: 0 }, uCamLocal: { value: new THREE.Vector3() }, uBMin: { value: new THREE.Vector3(-1, -2.4, -1) }, uBMax: { value: new THREE.Vector3(1, 1, 1) },
    uA: { value: new THREE.Vector3(0, -0.3, 0) }, uB: { value: new THREE.Vector3(0, 0.3, 0) }, uRad: { value: 0.2 }, uSteps: { value: steps(0.8) } };
  const geo = new THREE.BoxGeometry(2, 3.4, 2); geo.translate(0, -0.7, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: VERT,
    fragmentShader: `${COMMON}
      uniform float uK, uRad; uniform vec3 uA, uB;
      vec3 closest(vec3 p){ vec3 ab = uB - uA; float h = clamp(dot(p - uA, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); return uA + ab * h; }
      float capsuleHit(vec3 ro, vec3 rd){ // first hit distance with the vessel capsule (or 1e9)
        vec3 ba = uB - uA, oa = ro - uA; float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
        float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - uRad * uRad * baba;
        float h = b * b - a * c;
        if (h >= 0.0) { float t = (-b - sqrt(h)) / a; float y = baoa + t * bard; if (y > 0.0 && y < baba && t > 0.0) return t;
          vec3 oc = (y <= 0.0) ? oa : ro - uB; b = dot(rd, oc); c = dot(oc, oc) - uRad * uRad; h = b * b - c; if (h > 0.0) { t = -b - sqrt(h); if (t > 0.0) return t; } }
        return 1e9;
      }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 ro = uCamLocal, rd = normalize(vLocal - uCamLocal);
        vec2 th = boxHit(ro, rd); float t0 = max(th.x, 0.0), t1 = min(th.y, capsuleHit(ro, rd)); if (t1 <= t0) discard;
        int N = uSteps; float dt = (t1 - t0) / float(N); float t = t0 + dt * ign(gl_FragCoord.xy);
        vec3 hotC = mix(vec3(1.0, 0.32, 0.08), vec3(1.0, 0.62, 0.85), smoothstep(0.4, 1.0, uK));
        vec3 col = vec3(0.0);
        for (int i = 0; i < 64; i++) {
          if (i >= N) break;
          vec3 p = ro + rd * t; t += dt;
          vec3 c = closest(p); vec3 dv = p - c; float dist = length(dv); float sd = dist - uRad;
          vec3 nrm = dv / max(dist, 1e-4);
          float wind = dot(nrm, vec3(0.0, 1.0, 0.0));
          // stagnation layer: thin, brightest where the surface faces the flow
          float layer = exp(-max(sd, 0.0) / (0.02 + 0.03 * max(wind, 0.0))) * smoothstep(0.15, 0.95, wind);
          // detached bow shock just ahead of the windward face
          float shell = exp(-pow((sd - 0.06 - 0.05 * (1.0 - wind)) / 0.03, 2.0)) * smoothstep(0.3, 0.9, wind) * 0.6;
          // wake: hot gas peeling off the body's edges, streaming downstream in filaments
          vec2 dxz = p.xz - c.xz; float behind = c.y - p.y;
          float w = uRad * (0.7 + 0.25 * max(behind, 0.0));
          float tm = mod(uTime, 300.0);
          float n = snoise(vec3(p.x * 14.0, p.y * 1.2 + tm * 11.0, p.z * 14.0)) * 0.5 + 0.5;
          float n2 = snoise(vec3(p.x * 5.0 + 3.1, p.y * 0.6 + tm * 6.0, p.z * 5.0)) * 0.5 + 0.5;
          float wake = exp(-pow(length(dxz) / w, 2.0)) * smoothstep(0.0, 0.2, behind) * exp(-behind * 1.6) * pow(n, 3.0) * (0.4 + n2);
          vec3 e = hotC * (layer * 6.0 + shell * 2.0) + mix(hotC, vec3(1.0, 0.45, 0.6), 0.4) * wake * 2.2;
          col += e * dt;
        }
        gl_FragColor = vec4(col * uK * uK * 3.0 * (0.92 + 0.08 * sin(uTime * 53.0)), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.userData.U = U;
  trackCamera(mesh, U);
  return mesh;
}

// ---------------------------------------------------------------- fireball
// Expanding, rising noise-displaced fireball that cools from white through orange into sooty smoke.
export function makeFireball(seed = Math.random() * 100) {
  const U = { uAge: { value: 0 }, uTime: { value: 0 }, uSeed: { value: seed }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunI: { value: 1 }, uAir: { value: 1 },
    uCamLocal: { value: new THREE.Vector3() }, uBMin: { value: new THREE.Vector3(-1, -1, -1) }, uBMax: { value: new THREE.Vector3(1, 1, 1) }, uSteps: { value: steps(0.9) } };
  const geo = new THREE.BoxGeometry(2, 2, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.FrontSide,
    vertexShader: VERT,
    fragmentShader: `${COMMON}
      uniform float uAge, uSeed, uSunI, uAir; uniform vec3 uSun;
      void main(){
        #include <logdepthbuf_fragment>
        vec3 ro = uCamLocal, rd = normalize(vLocal - uCamLocal);
        vec2 th = boxHit(ro, rd); float t0 = max(th.x, 0.0), t1 = th.y; if (t1 <= t0) discard;
        float a = uAge;
        float R = 0.82 * (1.0 - exp(-a * 3.5));
        float heat = exp(-a * 1.3);
        float fade = 1.0 - smoothstep(2.5, 7.0, a) * (uAir > 0.1 ? 1.0 : 3.0);
        if (fade <= 0.0) discard;
        int N = uSteps; float dt = (t1 - t0) / float(N); float t = t0 + dt * ign(gl_FragCoord.xy);
        vec3 col = vec3(0.0); float tr = 1.0;
        for (int i = 0; i < 64; i++) {
          if (i >= N || tr < 0.02) break;
          vec3 p = ro + rd * t; t += dt;
          vec3 q = p - vec3(0.0, a * 0.06 * uAir, 0.0);       // hot gas rises in air
          float n = fbm3(q * 2.6 + vec3(uSeed, uSeed * 0.7 - a * 0.5, 0.0));
          float d = length(q) - R * (0.72 + 0.4 * n);
          float dens = smoothstep(0.06, -0.14, d) * fade;
          if (dens <= 0.001) continue;
          float T = clamp(heat * (1.25 - length(q) / max(R, 0.05)) + n * 0.25 * heat, 0.0, 1.0);
          vec3 fire = mix(vec3(0.45, 0.06, 0.01), vec3(1.0, 0.5, 0.12), smoothstep(0.1, 0.5, T)) + vec3(1.0, 0.9, 0.7) * smoothstep(0.55, 0.95, T) * 2.0;
          float sig = dens * mix(9.0, 4.0, T) * (uAir > 0.1 ? 1.0 : 0.4);
          float lit = 0.25 + 0.75 * clamp(dot(normalize(q + 1e-4), uSun) * 0.5 + 0.5, 0.0, 1.0);
          vec3 smoke = vec3(0.16, 0.15, 0.14) * lit * uSunI;
          vec3 e = fire * T * T * 6.0 + smoke * sig * (1.0 - T);
          float att = exp(-sig * dt);
          col += tr * e * (1.0 - att) / max(sig, 1e-3);
          tr *= att;
        }
        gl_FragColor = vec4(col, 1.0 - tr);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 7; mesh.userData.U = U;
  trackCamera(mesh, U);
  // from inside the ball, draw the far faces instead
  mesh.onBeforeRender = ((prev) => (r, s, cam, g, mt, gr) => { prev(r, s, cam, g, mt, gr); const c = U.uCamLocal.value; const inside = Math.max(Math.abs(c.x), Math.abs(c.y), Math.abs(c.z)) < 1; mat.side = inside ? THREE.BackSide : THREE.FrontSide; mat.depthTest = !inside; })(mesh.onBeforeRender);
  return mesh;
}

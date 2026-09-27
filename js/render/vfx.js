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
// Local frame: +y points into the airflow, the vessel is a capsule (uA..uB, radius uRad), all in units
// of the mesh scale. A white-hot shock layer sits on the windward face; turbulent flame tongues peel
// off the shoulders and stream downstream, cooling from yellow-white through orange to deep red, with a
// faint violet air glow at the highest heating. uK (0..1) is the heating intensity.
export function makePlasma() {
  const U = { uK: { value: 0 }, uTime: { value: 0 }, uCamLocal: { value: new THREE.Vector3() }, uBMin: { value: new THREE.Vector3(-1, -4.2, -1) }, uBMax: { value: new THREE.Vector3(1, 1, 1) },
    uA: { value: new THREE.Vector3(0, -0.3, 0) }, uB: { value: new THREE.Vector3(0, 0.3, 0) }, uRad: { value: 0.2 }, uSteps: { value: steps(1.0) }, uSeed: { value: Math.random() * 50 } };
  const geo = new THREE.BoxGeometry(2, 5.2, 2); geo.translate(0, -1.6, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: VERT,
    fragmentShader: `${COMMON}
      uniform float uK, uRad, uSeed; uniform vec3 uA, uB;
      vec3 closest(vec3 p){ vec3 ab = uB - uA; float h = clamp(dot(p - uA, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); return uA + ab * h; }
      float capsuleHit(vec3 ro, vec3 rd){ // first hit distance with the vessel capsule (or 1e9)
        vec3 ba = uB - uA, oa = ro - uA; float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
        float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - uRad * uRad * baba;
        float h = b * b - a * c;
        if (h >= 0.0) { float t = (-b - sqrt(h)) / a; float y = baoa + t * bard; if (y > 0.0 && y < baba && t > 0.0) return t;
          vec3 oc = (y <= 0.0) ? oa : ro - uB; b = dot(rd, oc); c = dot(oc, oc) - uRad * uRad; h = b * b - c; if (h > 0.0) { t = -b - sqrt(h); if (t > 0.0) return t; } }
        return 1e9;
      }
      // flame colour by temperature (0 cool .. 1 hottest)
      vec3 fire(float T){
        vec3 c = mix(vec3(0.35, 0.03, 0.005), vec3(1.0, 0.28, 0.04), smoothstep(0.0, 0.35, T));
        c = mix(c, vec3(1.0, 0.62, 0.18), smoothstep(0.3, 0.65, T));
        return mix(c, vec3(1.0, 0.93, 0.8), smoothstep(0.65, 1.0, T));
      }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 ro = uCamLocal, rd = normalize(vLocal - uCamLocal);
        vec2 th = boxHit(ro, rd); float t0 = max(th.x, 0.0), t1 = min(th.y, capsuleHit(ro, rd)); if (t1 <= t0) discard;
        int N = uSteps; float dt = (t1 - t0) / float(N); float t = t0 + dt * ign(gl_FragCoord.xy);
        float tm = mod(uTime, 300.0);
        vec3 col = vec3(0.0);
        for (int i = 0; i < 64; i++) {
          if (i >= N) break;
          vec3 p = ro + rd * t; t += dt;
          vec3 c = closest(p); vec3 dv = p - c; float dist = length(dv); float sd = dist - uRad;
          vec3 nrm = dv / max(dist, 1e-4);
          float wind = dot(nrm, vec3(0.0, 1.0, 0.0));
          float aft = max(min(uA.y, uB.y) - uRad * 0.3 - p.y, 0.0);                          // downstream of the vessel (either end can lead)
          float rho = length(p.xz - c.xz);
          if (max(rho, sd + uRad) > uRad * 1.5 + aft * 0.5 && sd > 0.12) continue;          // outside any flame: skip the noise
          // advected turbulence: the pattern streams downstream fast and boils as it goes
          vec3 q = vec3(p.x, p.y + tm * 3.2, p.z) * 5.0 + uSeed;
          vec2 w = vec2(snoise(q * 0.5), snoise(q * 0.5 + 7.1));
          vec3 qw = q + vec3(w.x, 0.0, w.y) * 1.4;
          float n = (snoise(qw) * 0.55 + snoise(qw * 2.1 + 3.3) * 0.3 + snoise(qw * 4.4 + 9.1) * 0.15) * 0.5 + 0.5;
          // shock layer: thin and hottest where the surface faces the flow
          float layer = exp(-max(sd, 0.0) / (uRad * (0.12 + 0.2 * max(wind, 0.0)) * (0.7 + 0.6 * n))) * smoothstep(0.0, 0.9, wind) * (0.5 + 0.9 * n);
          // flame envelope: hugs the sides, then a widening, flickering wake behind the vessel
          float env = uRad * (1.15 + 0.3 * n) + aft * (0.22 + 0.25 * n);
          float sheath = smoothstep(env, env * 0.55, max(rho, sd + uRad)) * smoothstep(-0.3, 0.2, -wind + aft);
          float tongues = pow(n, 2.2) * (1.0 + 1.5 * smoothstep(0.55, 0.9, n));
          float wake = sheath * tongues * exp(-aft * (0.55 - 0.25 * uK));
          float T = clamp(0.25 + 0.45 * uK - aft * 0.2 + (n - 0.5) * 0.35, 0.0, 1.0);
          vec3 e = fire(clamp(0.4 + 0.3 * uK + 0.15 * n, 0.0, 1.0)) * layer * (1.2 + 2.2 * uK)
                 + fire(T) * wake * (1.6 + 2.0 * uK)
                 + vec3(0.55, 0.3, 1.0) * layer * smoothstep(0.6, 1.0, uK) * 0.8;   // ionised air glow
          col += e * dt;
        }
        float flick = 0.9 + 0.1 * sin(uTime * 41.0) * sin(uTime * 17.0 + 1.3);
        gl_FragColor = vec4(col * uK * (0.4 + 0.6 * uK) * 3.0 * flick, 1.0);
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

// ---------------------------------------------------------------- re-entry plasma that follows the vessel's shape
// Every part mesh gets a twin drawn with this shader: the surfaces facing the airflow stand off into a thin,
// white-hot shock layer, and the rear of each part is stretched downstream into a flickering wake, so the
// glow takes the real outline of capsules, tanks, fins and heat shields. Brightness is set per part (how
// exposed it is to the flow), so a capsule's shield blazes while the parts in its lee only glimmer.
const SHAPE_VERT = `#include <common>
  #include <logdepthbuf_pars_vertex>
  ${NOISE3}
  uniform vec3 uFwd, uC; uniform float uK, uPK, uR, uTime;
  varying float vA, vBack, vN; varying vec3 vW, vNrm;
  void main(){
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz; vec3 wn = normalize(mat3(modelMatrix) * normal);
    float a = dot(wn, uFwd);                                            // +1: faces into the airflow
    float s = clamp(dot(uC - wp, uFwd) / max(uR, 0.05), -1.0, 1.0);     // +1 at the part's downstream end
    float back = smoothstep(-0.35, 1.0, s);
    float k = uK * clamp(uPK, 0.0, 1.3);
    float n = snoise(wp * (1.6 / max(uR, 0.3)) + uFwd * mod(uTime, 200.0) * 3.0) * 0.5 + 0.5;
    vec3 off = wn * uR * (0.05 + 0.16 * max(a, 0.0)) * (0.4 + k);          // shock stand-off in front
    off += wn * uR * 0.28 * back * back * k;                               // the sheath widens behind
    off -= uFwd * uR * (1.0 + 3.2 * k) * pow(back, 1.6) * (0.55 + 0.6 * n); // wake streaming from the silhouette
    wp += off * step(0.001, k);
    vA = a; vBack = back; vN = n; vW = wp; vNrm = wn;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    #include <logdepthbuf_vertex>
  }`;
const SHAPE_FRAG = `#include <common>
  #include <logdepthbuf_pars_fragment>
  ${NOISE3}
  uniform vec3 uFwd; uniform float uK, uPK, uR, uTime;
  varying float vA, vBack, vN; varying vec3 vW, vNrm;
  vec3 fire(float T){
    vec3 c = mix(vec3(0.35, 0.03, 0.005), vec3(1.0, 0.28, 0.04), smoothstep(0.0, 0.35, T));
    c = mix(c, vec3(1.0, 0.62, 0.18), smoothstep(0.3, 0.65, T));
    return mix(c, vec3(1.0, 0.93, 0.8), smoothstep(0.65, 1.0, T));
  }
  void main(){
    #include <logdepthbuf_fragment>
    float k = uK * clamp(uPK, 0.0, 1.3); if (k < 0.01) discard;
    vec3 V = normalize(cameraPosition - vW); float fres = 1.0 - abs(dot(V, normalize(vNrm)));
    float tm = mod(uTime, 200.0);
    float n = snoise(vW * (2.2 / max(uR, 0.3)) + uFwd * tm * 6.0) * 0.5 + 0.5;
    float n2 = snoise(vW * (5.0 / max(uR, 0.3)) + uFwd * tm * 9.0 + 3.1) * 0.5 + 0.5;
    float front = smoothstep(0.05, 0.85, vA) * (1.0 - vBack);
    float wake = vBack * pow(n * 0.7 + n2 * 0.3, 1.6) * (1.0 - smoothstep(0.75, 1.0, vBack) * 0.6);
    float sheath = (0.25 + 0.75 * fres) * (1.0 - vBack) * 0.45 * (0.6 + 0.8 * n);
    float T = clamp(0.3 + 0.5 * k + 0.35 * front - 0.45 * vBack + (n - 0.5) * 0.3, 0.0, 1.0);
    vec3 col = fire(T) * (front * 1.15 + sheath + wake * 1.4)
             + vec3(0.55, 0.32, 1.0) * front * smoothstep(0.6, 1.0, k) * 0.6; // ionised air
    float flick = 0.85 + 0.15 * sin(uTime * 41.0 + vN * 6.0);
    gl_FragColor = vec4(col * k * (0.4 + 0.55 * k) * flick, 1.0);
  }`;
export function makeShapePlasma(vesselGroup) {
  const S = { uK: { value: 0 }, uTime: { value: 0 }, uFwd: { value: new THREE.Vector3(0, 1, 0) } };
  const entries = [];
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), box = new THREE.Box3(), tmp = new THREE.Box3();
  vesselGroup.updateWorldMatrix(true, true);
  for (const m of vesselGroup.userData.parts || []) {
    // part bounds in the part group's frame (plumes excluded)
    inv.copy(m.matrixWorld).invert(); box.makeEmpty();
    const meshes = [];
    m.traverse(o => { if (!o.isMesh || !o.geometry || !o.geometry.attributes.normal || o.userData.plasmaTwin) return;
      let p = o; while (p && p !== m) { if (p.userData && p.userData.U) return; p = p.parent; } // skip plumes
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)); box.union(tmp); meshes.push(o); });
    if (!meshes.length || box.isEmpty()) continue;
    const U = { ...S, uC: { value: new THREE.Vector3() }, uR: { value: 1 }, uPK: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SHAPE_VERT, fragmentShader: SHAPE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const twins = meshes.map(o => { const t = new THREE.Mesh(o.geometry, mat); t.userData.plasmaTwin = true; t.frustumCulled = false; t.castShadow = t.receiveShadow = false; t.raycast = () => {}; t.renderOrder = 5; t.visible = false; o.add(t); return t; });
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    entries.push({ m, U, twins, cLocal: c, r: Math.max(0.15, size.length() / 2) });
  }
  const _c = new THREE.Vector3(), _s = new THREE.Vector3();
  return {
    entries,
    // fwdWorld: unit direction of travel through the air; k: overall heating 0..1; partK(m): per-part exposure
    update(fwdWorld, k, time, partK) {
      S.uK.value = k; S.uTime.value = time; S.uFwd.value.copy(fwdWorld);
      for (const e of entries) {
        const pk = k > 0.02 && e.m.visible !== false ? partK(e.m) : 0;
        const on = pk > 0.01; for (const t of e.twins) t.visible = on;
        if (!on) continue;
        e.U.uPK.value = pk; e.m.updateWorldMatrix(true, false);
        e.U.uC.value.copy(_c.copy(e.cLocal).applyMatrix4(e.m.matrixWorld));
        e.m.matrixWorld.decompose(_c.set(0, 0, 0), new THREE.Quaternion(), _s); e.U.uR.value = e.r * Math.max(_s.x, _s.y, _s.z);
      }
    },
    hide() { for (const e of entries) for (const t of e.twins) t.visible = false; },
  };
}

// ---------------------------------------------------------------- sparks and grit from scraping
// Particles live in body-centred inertial coordinates (so they stay put on the ground while the vessel
// slides away); drawn as additive points whose colour cools from white-yellow to dull orange.
export class Sparks {
  constructor(root, max = 700) {
    this.max = max; this.list = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setAttribute('heat', new THREE.BufferAttribute(new Float32Array(max), 1));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(max), 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float heat; attribute float size; varying float vH;
        void main(){ vH = heat; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * 2200.0 / -mv.z, 3.0, 26.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <common>
        #include <logdepthbuf_pars_fragment>
        varying float vH;
        void main(){
        #include <logdepthbuf_fragment>
        vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        vec3 c = mix(vec3(0.9, 0.25, 0.03), vec3(1.0, 0.92, 0.6), clamp(vH, 0.0, 1.0));
        gl_FragColor = vec4(c * (1.0 - r * r) * (1.0 + 7.0 * vH), 1.0); }`,
    });
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 6;
    root.add(this.points);
  }
  // p: body-relative contact point; vt: slide direction; s: slide speed; n: ground normal; base: ground velocity
  emit(p, vt, s, n, base, k = 1) {
    const cnt = Math.min(18, Math.round((2 + s * 0.6) * Math.max(0.4, k) * (0.6 + Math.random())));
    for (let i = 0; i < cnt && this.list.length < this.max; i++) {
      const sp = s * (0.35 + Math.random() * 0.6);
      const up = 1 + Math.random() * 4 + s * 0.08;
      const sx = (Math.random() - 0.5) * s * 0.35, sy = (Math.random() - 0.5) * s * 0.35, sz = (Math.random() - 0.5) * s * 0.35;
      this.list.push({ p: [p[0], p[1], p[2]], v: [base.x + vt[0] * sp + n[0] * up + sx, base.y + vt[1] * sp + n[1] * up + sy, base.z + vt[2] * sp + n[2] * up + sz], age: 0, life: 0.25 + Math.random() * 0.7, size: 0.05 + Math.random() * 0.08 });
    }
  }
  // dt: seconds; g: gravity vector at the site; offset: body position minus camera (camera-relative drawing)
  update(dt, g, offset, ground) {
    const P = this.points.geometry.attributes.position, H = this.points.geometry.attributes.heat, S = this.points.geometry.attributes.size;
    let n = 0;
    for (const s of this.list) {
      s.age += dt; if (s.age > s.life) continue;
      s.v[0] += g.x * dt; s.v[1] += g.y * dt; s.v[2] += g.z * dt;
      const f = Math.exp(-dt * 1.5); s.v[0] *= f; s.v[1] *= f; s.v[2] *= f;
      s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt;
      if (ground) { const r = Math.hypot(s.p[0], s.p[1], s.p[2]); if (r < ground) { const k = ground / r; s.p[0] *= k; s.p[1] *= k; s.p[2] *= k; const up = [s.p[0] / ground, s.p[1] / ground, s.p[2] / ground]; const vn = s.v[0] * up[0] + s.v[1] * up[1] + s.v[2] * up[2]; if (vn < 0) { s.v[0] -= 1.6 * vn * up[0]; s.v[1] -= 1.6 * vn * up[1]; s.v[2] -= 1.6 * vn * up[2]; s.v[0] *= 0.5; s.v[1] *= 0.5; s.v[2] *= 0.5; } } } // bounce
      P.setXYZ(n, s.p[0] + offset.x, s.p[1] + offset.y, s.p[2] + offset.z); H.setX(n, 1 - s.age / s.life); S.setX(n, s.size); n++;
    }
    this.list = this.list.filter(s => s.age <= s.life);
    this.points.geometry.setDrawRange(0, n); P.needsUpdate = true; H.needsUpdate = true; S.needsUpdate = true;
    this.points.visible = n > 0;
  }
  clear() { this.list.length = 0; this.points.visible = false; }
}

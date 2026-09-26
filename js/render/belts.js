// Asteroid / Kuiper belts as particle clouds, and protoplanetary discs as a lit dust disc with
// gaps swept clear by forming planets. Everything is placed relative to the camera (floating origin).
import * as THREE from 'three';
import { AU } from '../core/math.js';

const TAU = Math.PI * 2;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const beltMat = () => new THREE.ShaderMaterial({
  uniforms: { uBright: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    attribute vec3 color; attribute float size; varying vec3 vC; uniform float uBright;
    void main(){ vC = color * uBright; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size;
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <common>
    #include <logdepthbuf_pars_fragment>
    varying vec3 vC;
    void main(){
    #include <logdepthbuf_fragment>
    vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vC * a, 1.0); }`,
});

function makeBelt(b, seed) {
  const r = rng(seed); const n = Math.min(b.count || 2000, 8000);
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const c = b.color || [0.55, 0.5, 0.45];
  for (let k = 0; k < n; k++) {
    let a = (b.a[0] + (b.a[1] - b.a[0]) * Math.pow(r(), 0.8)) * AU;
    let th = r() * TAU;
    if (b.trojanOf) th = (r() < 0.5 ? 1 : -1) * Math.PI / 3 + (r() - 0.5) * 0.9; // L4 / L5 clouds (rotated to the planet each frame)
    const e = (b.e || 0.1) * r(), inc = (b.i || 8) * Math.PI / 180 * (r() - 0.5) * 2;
    const rr = a * (1 - e * Math.cos(r() * TAU));
    const x = Math.cos(th) * rr, zz = -Math.sin(th) * rr, y = Math.sin(inc) * rr * Math.sin(r() * TAU);
    pos.set([x, y, zz], k * 3);
    const v = (0.5 + r() * 0.6) * 0.6; col.set([c[0] * v, c[1] * v, c[2] * v], k * 3); size[k] = 1 + r() * 1.1;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const pts = new THREE.Points(g, beltMat()); pts.frustumCulled = false; pts.renderOrder = 2;
  pts.userData = { belt: b, outer: b.a[1] * AU };
  return pts;
}

function makeDisc(b) {
  const inner = b.a[0] * AU, outer = b.a[1] * AU;
  const geo = new THREE.RingGeometry(inner, outer, 256, 8); geo.rotateX(-Math.PI / 2);
  const gaps = (b.gaps || []).slice(0, 8); while (gaps.length < 8) gaps.push(-1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uInner: { value: inner }, uOuter: { value: outer }, uGaps: { value: gaps.map(g => g * AU) }, uColor: { value: new THREE.Vector3(...(b.color || [0.9, 0.72, 0.52])) },
      uStarRel: { value: new THREE.Vector3() }, uBright: { value: 1 }, uSeed: { value: (b.seed || 1) % 1000 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vP; varying vec3 vW;
      void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uInner, uOuter, uGaps[8], uBright, uSeed; uniform vec3 uColor, uStarRel; varying vec3 vP; varying vec3 vW;
      float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        #include <logdepthbuf_fragment>
        float r = length(vP.xz); float th = atan(vP.z, vP.x);
        float x = (r - uInner) / (uOuter - uInner);
        float dens = smoothstep(0.0, 0.04, x) * (1.0 - smoothstep(0.7, 1.0, x)) * pow(uInner / r, 0.6);
        // fine ringlets + spiral density waves + clumps
        float lr = log(r / uInner);
        dens *= 0.75 + 0.25 * sin(lr * 90.0 + vn(vec2(lr * 30.0, 0.0)) * 3.0);
        dens *= 0.8 + 0.4 * vn(vec2(lr * 14.0 + th * 2.0 / 6.2831853 * 3.0, th * 3.0));
        for (int i = 0; i < 8; i++) { float g = uGaps[i]; if (g <= 0.0) continue; float wd = g * 0.07; dens *= 1.0 - 0.9 * exp(-pow((r - g) / wd, 2.0)); }
        // lighting: hot bright inner disc, forward scattering toward the viewer when the star is behind
        vec3 toStar = normalize(uStarRel - vW), toCam = normalize(-vW);
        float fwd = pow(max(dot(-toStar, toCam), 0.0), 4.0);
        float lit = (0.35 + 2.2 * pow(uInner / r, 0.45)) * (0.6 + 1.6 * fwd);
        vec3 col = mix(uColor, vec3(1.0, 0.55, 0.3), 0.4 * pow(uInner / r, 0.5)) * lit;
        // edge-on the disc looks optically thicker
        float edge = 1.0 - abs(dot(normalize(vec3(0.0, 1.0, 0.0)), toCam));
        float a = clamp(dens * (0.8 + 1.2 * edge), 0.0, 0.95);
        gl_FragColor = vec4(col * uBright, a);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 1; m.userData = { belt: b, outer };
  return m;
}

export class Belts {
  constructor(scene) { this.group = new THREE.Group(); this.group.name = 'belts'; scene.add(this.group); this.items = []; }
  setSystem(sys) {
    for (const it of this.items) { this.group.remove(it); it.geometry.dispose(); it.material.dispose(); }
    this.items = []; this.sys = sys;
    (sys.belts || []).forEach((b, i) => { const o = b.disc ? makeDisc(b) : makeBelt(b, (sys.starId || 'x').length * 977 + i * 131); this.group.add(o); this.items.push(o); });
  }
  update(t, camPos, exposure = 1) {
    for (const o of this.items) {
      const b = o.userData.belt; const par = this.sys.byName ? this.sys.byName[b.parent] || this.sys.star : this.sys.star; const pp = par.posAt(t);
      o.position.set(pp.x - camPos.x, pp.y - camPos.y, pp.z - camPos.z);
      const d = Math.hypot(o.position.x, o.position.y, o.position.z);
      // fade out when the belt would only be a speck, and when deep inside it (points would just be noise)
      const outer = o.userData.outer; const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
      // particle belts only read as a belt from outside; discs stay visible from within
      const k = (b.disc ? ss(outer * 0.02, outer * 0.2, d) : ss(outer * 1.1, outer * 2.2, d)) * (1 - ss(outer * 8, outer * 16, d));
      o.visible = k > 0.01;
      if (b.trojanOf) { const pl = this.sys.byName[b.trojanOf]; if (pl) { const r = pl.orbit ? pl.posAt(t).clone().sub(pp) : null; if (r) o.rotation.y = Math.atan2(-r.z, r.x); } }
      if (b.disc) { o.material.uniforms.uStarRel.value.set(pp.x - camPos.x, pp.y - camPos.y, pp.z - camPos.z); o.material.uniforms.uBright.value = k; }
      else o.material.uniforms.uBright.value = k * 0.9;
    }
  }
}

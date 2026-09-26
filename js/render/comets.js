// Comet comae and tails. Activity switches on inside ~4 AU and grows toward perihelion. The ion
// tail points straight away from the star; the dust tail curves back along the orbit. Each comet
// gets its own dust/gas balance and coma tint, so no two look the same.
import * as THREE from 'three';
import { AU, V3 } from '../core/math.js';

const SEG = 24;
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

const tailMat = () => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Vector3(1, 1, 1) }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    attribute vec2 aT; varying vec2 vT;
    void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <common>
    #include <logdepthbuf_pars_fragment>
    uniform vec3 uColor; uniform float uK; varying vec2 vT;
    void main(){
    #include <logdepthbuf_fragment>
    float along = vT.x, across = vT.y;
    float a = exp(-along * 3.0) * (1.0 - smoothstep(0.85, 1.0, along)) * exp(-across * across * 6.0) * (1.0 - abs(across)) * smoothstep(0.0, 0.03, along);
    a *= 0.88 + 0.07 * sin(along * 47.0 + across * 2.0) + 0.05 * sin(along * 113.0 - across * 5.0); // faint streamers
    gl_FragColor = vec4(uColor * a * uK, 1.0); }`,
});

class Tail {
  constructor(color) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array((SEG + 1) * 2 * 3); const t = new Float32Array((SEG + 1) * 2 * 2); const idx = [];
    for (let i = 0; i <= SEG; i++) { t.set([i / SEG, -1, i / SEG, 1], i * 4); if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute('aT', new THREE.BufferAttribute(t, 2)); this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, tailMat()); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
    this.mesh.material.uniforms.uColor.value.set(...color);
  }
  // points: centreline (camera-relative), widths per point
  set(points, widths) {
    const P = this.pos; const side = new THREE.Vector3(), dir = new THREE.Vector3(), view = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const p = points[i], q = points[Math.min(SEG, i + 1)], o = points[Math.max(0, i - 1)];
      dir.subVectors(q, o).normalize(); view.copy(p).normalize();
      side.crossVectors(dir, view).normalize().multiplyScalar(widths[i]);
      P.set([p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z], i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

export class Comets {
  constructor(scene) { this.group = new THREE.Group(); this.group.name = 'comets'; scene.add(this.group); this.items = new Map(); }
  setSystem(sys) { for (const [, it] of this.items) this.group.remove(it.group); this.items.clear(); this.sys = sys; }
  item(b) {
    let it = this.items.get(b); if (it) return it;
    const h = hash(b.name), h2 = hash(b.name + 'x'), h3 = hash(b.name + 'y');
    const green = h < 0.55; // C2 / CN fluorescence gives many comae a green tint
    it = { group: new THREE.Group(), dustK: 0.4 + h2 * 1.2, gasK: 0.4 + h3 * 1.1, split: h3 > 0.85,
      ion: new Tail([0.35, 0.55, 1.0]), dust: new Tail(green ? [1.0, 0.95, 0.8] : [1.0, 0.88, 0.7]), dust2: null,
      coma: new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Vector3(...(green ? [0.55, 1.0, 0.7] : [0.9, 0.95, 1.0])) }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `#include <common>
          #include <logdepthbuf_pars_vertex>
          varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
          }`,
        fragmentShader: `#include <common>
          #include <logdepthbuf_pars_fragment>
          uniform vec3 uColor; uniform float uK; varying vec2 vU;
          void main(){
          #include <logdepthbuf_fragment>
          float r = length(vU); float e = max(0.0, 1.0 - r * r); float a = (exp(-r * 6.0) * 2.0 + exp(-r * 2.2) * 0.4) * e * e; gl_FragColor = vec4(uColor * a * uK, 1.0); }` })) };
    if (it.split) it.dust2 = new Tail([1.0, 0.9, 0.75]);
    it.coma.frustumCulled = false; it.coma.renderOrder = 3;
    it.group.add(it.ion.mesh, it.dust.mesh, it.coma); if (it.dust2) it.group.add(it.dust2.mesh);
    this.group.add(it.group); this.items.set(b, it); return it;
  }
  update(t, camPos, camera) {
    if (!this.sys) return;
    const star = this.sys.star, sp = star.posAt(t); const lum = star.lum ?? 1;
    const fovK = innerHeight / 2 / Math.tan(camera.fov * Math.PI / 360);
    for (const b of this.sys.bodies) {
      if (b.type !== 'comet' || !b.orbit) continue;
      const bp = b.posAt(t); const rStar = bp.dist(sp) / AU;
      const act = Math.pow(Math.max(0, Math.min(1, (4 * Math.sqrt(lum) - rStar) / (3 * Math.sqrt(lum)))), 1.5);
      const rel = new THREE.Vector3(bp.x - camPos.x, bp.y - camPos.y, bp.z - camPos.z); const d = rel.length();
      const L = act * 1.2e10 * (1 + 1 / Math.max(0.3, rStar));
      const px = L / Math.max(1, d) * fovK;
      let it = this.items.get(b);
      if (act < 0.01 || px < 3) { if (it) it.group.visible = false; continue; }
      it = this.item(b); it.group.visible = true;
      const anti = new THREE.Vector3(bp.x - sp.x, bp.y - sp.y, bp.z - sp.z).normalize();
      const vel = b.velAt(t).clone().sub(star.velAt(t)); const vd = new THREE.Vector3(vel.x, vel.y, vel.z).normalize();
      const ionPts = [], ionW = [], dustPts = [], dustW = [], d2Pts = [], d2W = [];
      const Li = L * (0.8 + it.gasK * 0.6), Ld = L * (0.5 + it.dustK * 0.4);
      for (let i = 0; i <= SEG; i++) {
        const s = i / SEG;
        ionPts.push(rel.clone().addScaledVector(anti, Li * s)); ionW.push(Li * (0.001 + 0.02 * s));
        // dust lags behind the nucleus along the orbit: a curved, fanning tail
        dustPts.push(rel.clone().addScaledVector(anti, Ld * s).addScaledVector(vd, -Ld * 0.45 * s * s)); dustW.push(Ld * (0.002 + 0.09 * s));
        if (it.dust2) { d2Pts.push(rel.clone().addScaledVector(anti, Ld * 0.8 * s).addScaledVector(vd, -Ld * 0.8 * s * s)); d2W.push(Ld * (0.008 + 0.05 * s)); }
      }
      it.ion.set(ionPts, ionW); it.dust.set(dustPts, dustW); if (it.dust2) it.dust2.set(d2Pts, d2W);
      // tails are far too tenuous to see from inside them: fade as the camera gets close
      const near = Math.min(1, Math.max(0, (d - L * 0.04) / (L * 0.4)));
      const k = Math.min(1.5, act * 1.5) * Math.min(1, lum) * near;
      it.ion.mesh.material.uniforms.uK.value = k * 0.9 * it.gasK; it.dust.mesh.material.uniforms.uK.value = k * 1.1 * it.dustK; if (it.dust2) it.dust2.mesh.material.uniforms.uK.value = k * 0.5 * it.dustK;
      // coma: tens of thousands of km of glowing gas
      const cs = Math.max(2e7 * act, d * 0.004); it.coma.position.copy(rel); it.coma.scale.setScalar(cs); it.coma.quaternion.copy(camera.quaternion); it.coma.material.uniforms.uK.value = Math.min(1.5, act * 1.5) * Math.min(1, lum) * 1.2;
    }
  }
}

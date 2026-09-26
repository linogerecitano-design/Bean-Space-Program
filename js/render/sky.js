// Background sky. In the Solar System: the real Milky Way panorama (galactic coords). Elsewhere:
// a cubemap baked from the procedural galaxy + neighbouring stars as seen from that star.
import * as THREE from 'three';
import { planetTexture } from './textures.js';
import { eclEngineToGalaxy } from '../data/stars.js';
import { galaxyParticles, starsNear } from '../gen/galaxy.js';
import { blackbody } from './glsl.js';

// ecliptic-engine -> galactic (X toward GC, Y l=90, Z north)
function eclToGalMat() {
  const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v => { const g = eclEngineToGalaxy(v); return [-g[2], -g[0], g[1]]; });
  return new THREE.Matrix3().set(cols[0][0], cols[1][0], cols[2][0], cols[0][1], cols[1][1], cols[2][1], cols[0][2], cols[1][2], cols[2][2]);
}
// ecliptic-engine -> galaxy-engine
export function eclToGalaxyEngineMat() {
  const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v => eclEngineToGalaxy(v));
  return new THREE.Matrix3().set(cols[0][0], cols[1][0], cols[2][0], cols[0][1], cols[1][1], cols[2][1], cols[0][2], cols[1][2], cols[2][2]);
}

export class Sky {
  constructor(renderer) {
    this.renderer = renderer;
    this.E2G = eclToGalMat();
    this.E2GE = eclToGalaxyEngineMat();
    this.U = { uTex: { value: planetTexture('milkyway') }, uCube: { value: null }, uMode: { value: 0 }, uE2G: { value: this.E2G }, uE2GE: { value: this.E2GE }, uBright: { value: 1.0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.U, side: THREE.BackSide, depthWrite: false, depthTest: false,
      vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform sampler2D uTex; uniform samplerCube uCube; uniform float uMode, uBright; uniform mat3 uE2G, uE2GE; varying vec3 vD;
        void main(){
          vec3 d = normalize(vD); vec3 c;
          if (uMode < 0.5) {
            vec3 g = uE2G * d; float l = atan(g.y, g.x); float b = asin(clamp(g.z, -1.0, 1.0));
            vec2 uv = vec2(fract(0.5 - l / 6.2831853), 0.5 - b / 3.14159265);
            c = texture(uTex, uv).rgb; c = c * c * 1.2;
          } else { c = texture(uCube, uE2GE * d).rgb; }
          gl_FragColor = vec4(c * uBright, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -1000;
    this.cubes = new Map();
  }
  // build (once per star) a cubemap of the galaxy seen from galPos (ly)
  bakeFor(starId, galPos) {
    if (starId === 'sol') { this.U.uMode.value = 0; return; }
    let cube = this.cubes.get(starId);
    if (!cube) {
      const size = 1024;
      const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      const scene = new THREE.Scene();
      if (!this.gal) {
        const gp = galaxyParticles(IS_SMALL() ? 60000 : 160000);
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(gp.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(gp.col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(gp.size, 1));
        this.gal = g;
      }
      const galMat = new THREE.ShaderMaterial({
        uniforms: { uOrigin: { value: new THREE.Vector3(...galPos) } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        vertexShader: `attribute vec3 color; attribute float aSize; uniform vec3 uOrigin; varying vec3 vC;
          void main(){ vec3 p = position - uOrigin; float d = length(p);
            float near = smoothstep(800.0, 2500.0, d);            // the local neighbourhood is drawn as real stars instead
            float px = clamp(aSize * 2200.0 / d, 1.0, 7.0);
            vC = color * 0.035 * near / (1.0 + px * px * 0.08);
            if (color.r < 0.0) vC = color * 0.05 * near;
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); gl_PointSize = px; }`,
        fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d); if (r > 1.0) discard; gl_FragColor = vec4(vC * (1.0 - r), 1.0); }`,
      });
      scene.add(new THREE.Points(this.gal, galMat));
      // neighbouring stars
      const near = starsNear(galPos, 3, 2);
      const pos = [], col = [], sz = [];
      const vis = near.map((s) => { const dx = s.pos[0] - galPos[0], dy = s.pos[1] - galPos[1], dz = s.pos[2] - galPos[2]; const d = Math.hypot(dx, dy, dz); return { s, d, mag: d > 0.01 ? s.lum / (d * d) : 0 }; })
        .filter((o) => o.mag > 1e-6).sort((a, b) => b.mag - a.mag).slice(0, 3500);
      // brightness relative to the ~25th brightest star: a handful stand out, most are faint pinpricks
      const ref = vis.length ? vis[Math.min(vis.length - 1, 25)].mag : 1;
      for (const { s, d, mag } of vis) {
        const dx = s.pos[0] - galPos[0], dy = s.pos[1] - galPos[1], dz = s.pos[2] - galPos[2];
        const c = blackbody(s.temp); const cm = Math.max(...c); pos.push(dx / d * 100, dy / d * 100, dz / d * 100);
        const rel = mag / ref; const b = Math.max(0.015, Math.min(3, 0.9 * Math.pow(rel, 0.42)));
        col.push(c[0] / cm * b, c[1] / cm * b, c[2] / cm * b); sz.push(rel > 1 ? Math.min(3, 1.4 + Math.log10(rel) * 0.9) : 1.2);
      }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); sg.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
      const sm = new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `attribute vec3 color; attribute float aSize; varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); gl_PointSize = aSize; }`,
        fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d); if (r > 1.0) discard; gl_FragColor = vec4(vC * max(0.0, exp(-r * 4.0) - 0.0183) * 1.019, 1.0); }`,
      });
      scene.add(new THREE.Points(sg, sm));
      const cc = new THREE.CubeCamera(0.1, 1e6, rt);
      this.renderer.setClearColor(0x000000, 1);
      cc.update(this.renderer, scene);
      cube = rt.texture; this.cubes.set(starId, cube);
      sg.dispose(); galMat.dispose(); sm.dispose();
    }
    this.U.uCube.value = cube; this.U.uMode.value = 1;
  }
}
const IS_SMALL = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

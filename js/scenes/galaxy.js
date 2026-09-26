// Galaxy map: Space-Engine style zoom from the whole Milky Way down to individual stars.
import * as THREE from 'three';
import { h, mount, clearUI, flash } from '../ui/ui.js';
import { OrbitCam } from '../core/camera.js';
import { galaxyParticles, starsNear, SOL, allRealStars, starById, density } from '../gen/galaxy.js';
import { SUN_GALPOS } from '../data/stars.js';
import { blackbody } from '../render/glsl.js';
import { rng } from '../core/math.js';
import { IS_MOBILE } from '../render/textures.js';

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

export class GalaxyScene {
  constructor(G) {
    this.G = G;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(55, 1, 1e-6, 1e7);
    this.cam = new OrbitCam(G.world.renderer.domElement); this.cam.enabled = false;
    this.focus = SUN_GALPOS.slice(); this.focusTarget = null; this.sel = SOL;
    this.built = false;
    G.world.renderer.domElement.addEventListener('pointerup', (e) => { if (this.active && this.cam.dragged < 6) this.pick(e); });
  }
  build() {
    const gp = galaxyParticles(IS_MOBILE ? 70000 : 160000);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(gp.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(gp.col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(gp.size, 1));
    this.galU = { uOrigin: { value: new THREE.Vector3() }, uScale: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.galU, transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      vertexShader: `attribute vec3 color; attribute float aSize; uniform vec3 uOrigin; uniform float uScale; varying vec3 vC; varying float vFade;
        void main(){ vec3 p = position - uOrigin; vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;
          float px = clamp(aSize * 2500.0 * uScale / max(d, 1.0), 1.5, 48.0);
          float b = clamp(d / 25000.0, 0.04, 0.9) / (1.0 + px * 0.08);
          vC = color * b * (color.r < 0.0 ? 1.4 : 1.0);
          vFade = smoothstep(30.0, 400.0, d); // hide galaxy haze once you're among the stars
          vC *= vFade; gl_Position = projectionMatrix * mv; gl_PointSize = px; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d); if (r > 1.0) discard; gl_FragColor = vec4(vC * (1.0 - r) * (1.0 - r), 1.0); }`,
    });
    this.gal = new THREE.Points(g, m); this.gal.frustumCulled = false; this.scene.add(this.gal);
    // nebulae along the arms
    const tex = softTex(); const r = rng(7); const neb = new THREE.Group();
    for (let i = 0; i < 260; i++) {
      let x, z, tries = 0; do { const R = 3000 + r() * 40000, th = r() * Math.PI * 2; x = R * Math.cos(th); z = R * Math.sin(th); tries++; } while (density(x, 0, z) < 1.2 && tries < 30);
      const col = r() < 0.6 ? new THREE.Color(1.0, 0.35, 0.55) : r() < 0.5 ? new THREE.Color(0.4, 0.6, 1.0) : new THREE.Color(1.0, 0.7, 0.4);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.12 + r() * 0.12 }));
      s.userData.g = [x, (r() - 0.5) * 200, z]; s.userData.size = 200 + r() * 900; neb.add(s);
    }
    this.neb = neb; this.scene.add(neb);
    // nearby stars layer
    this.starGeo = new THREE.BufferGeometry();
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uSel: { value: -1 }, uRad: { value: 1e9 }, uFade: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 color; attribute float aLum; varying vec3 vC; uniform float uRad, uFade; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(-mv.z, 1e-6);
        float b = aLum / (d * d); float px = clamp(1.5 + log(1.0 + b * 3e4) * 1.6, 1.0, 26.0); vC = color * clamp(0.25 + log(1.0 + b * 3e4) * 0.35, 0.05, 3.0);
        vC *= uFade * (1.0 - smoothstep(uRad * 0.55, uRad, length(position))); // no hard-edged ball of stars
        gl_Position = projectionMatrix * mv; gl_PointSize = px; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d); if (r > 1.0) discard; gl_FragColor = vec4(vC * max(0.0, exp(-r * 4.0) - 0.0183) * 1.019, 1.0); }`,
    });
    this.starPts = new THREE.Points(this.starGeo, this.starMat); this.starPts.frustumCulled = false; this.scene.add(this.starPts);
    // selection ring
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    this.scene.add(this.ring);
    this.built = true;
  }
  async enter(params = {}) {
    const G = this.G; this.active = true; this.cam.enabled = true; this.from = params.from || 'center';
    if (!this.built) this.build();
    this.cam.dist = 30; this.cam.minDist = 0.0005; this.cam.maxDist = 250000; this.cam.pitch = 0.4;
    this.buildUI(); this.select(this.sel || SOL, true);
  }
  exit() { this.active = false; this.cam.enabled = false; clearUI(); }
  buildUI() {
    clearUI(); const G = this.G;
    mount(h('div#topbar.panel', {}, h('button', { onclick: () => G.go(this.from === 'menu' ? 'menu' : 'center') }, '← Back'), h('b', { style: { padding: '0 8px' } }, 'Milky Way'),
      h('button', { onclick: () => { this.select(SOL); this.cam.dist = 30; } }, '☉ Sun'), h('button', { onclick: () => { this.cam.dist = 120000; this.cam.pitch = 1.2; } }, 'Whole galaxy'),
      h('button', { onclick: () => { this.focusTarget = [0, 0, 0]; this.sel = null; this.cam.dist = 20000; this.info.replaceChildren(h('h2', {}, 'Sagittarius A*'), h('div.dim', {}, 'Supermassive black hole at the galactic centre (4.3 million M☉), 26,750 ly from the Sun.')); } }, 'Galactic centre')));
    const search = h('input', { placeholder: 'Search stars…', oninput: (e) => this.fillList(e.target.value) });
    this.list = h('div.list', { style: { flex: 1 } });
    mount(h('div#side.panel', {}, h('b', {}, 'Known stars'), search, this.list));
    this.info = h('div#info.panel'); mount(this.info);
    this.fillList('');
    this.labels = h('div', { style: { position: 'fixed', inset: 0, pointerEvents: 'none' } }); document.getElementById('ui').prepend(this.labels);
  }
  fillList(q) {
    q = q.toLowerCase();
    const stars = allRealStars().filter(s => !q || s.name.toLowerCase().includes(q));
    const d = (s) => Math.hypot(s.pos[0] - SUN_GALPOS[0], s.pos[1] - SUN_GALPOS[1], s.pos[2] - SUN_GALPOS[2]);
    this.list.replaceChildren(...stars.sort((a, b) => d(a) - d(b)).map(s => h('div.item' + (s === this.sel ? '.sel' : ''), { onclick: () => { this.select(s); this.cam.dist = 0.2; } }, h('b', {}, s.name), h('div.small.dim', {}, `${s.spec} · ${d(s).toFixed(2)} ly${s.planets && s.planets.length ? ' · ' + s.planets.length + ' known planet' + (s.planets.length > 1 ? 's' : '') : ''}`))));
  }
  select(s, instant) {
    this.sel = s; this.focusTarget = s.pos.slice(); if (instant) this.focus = s.pos.slice();
    const dist = Math.hypot(s.pos[0] - SUN_GALPOS[0], s.pos[1] - SUN_GALPOS[1], s.pos[2] - SUN_GALPOS[2]);
    const G = this.G;
    const visited = G.game && G.game.discovered && G.game.discovered.includes(s.id);
    this.info.replaceChildren(...[h('h2', {}, s.name), h('div.small.dim', {}, s.real ? 'Real star' : 'Procedurally generated star'),
      h('table.kv', {}, ...[['Spectral class', s.spec], ['Distance from Sun', dist.toFixed(dist < 100 ? 3 : 0) + ' ly'], ['Temperature', Math.round(s.temp) + ' K'], ['Mass', s.mass.toPrecision(3) + ' M☉'], ['Radius', s.radius.toPrecision(3) + ' R☉'], ['Luminosity', s.lum.toPrecision(3) + ' L☉'],
        s.planets ? ['Known planets', s.planets.length] : null, s.companions ? ['Companions', s.companions.map(c => c.name).join(', ')] : null].filter(Boolean).map(([k, v]) => h('tr', {}, h('td.dim', {}, k), h('td', {}, String(v))))),
      s.planets && s.planets.length ? h('div.small', { style: { marginTop: '6px' } }, 'Known: ' + s.planets.map(p => p.name).join(', ')) : null,
      h('div.small.dim', { style: { marginTop: '6px' } }, s.sol ? 'Home.' : s.real ? 'Known planets are real (or candidates); extra moons, asteroids and dwarf planets are fictional.' : 'Everything in this system is procedurally generated.'),
      h('div.row', { style: { marginTop: '10px', flexWrap: 'wrap' } },
        h('button.primary', { onclick: () => G.go('tracking', { starId: s.id, from: 'galaxy' }) }, 'Explore system ▶'),
        visited ? h('span.tag', {}, 'visited') : null)].filter(Boolean));
    for (const el of this.list.children) el.classList.remove('sel');
  }
  pick(e) {
    if (!this.nearStars) return;
    const W = innerWidth, H = innerHeight; let best = null, bd = 18 * 18;
    const v = new THREE.Vector3();
    for (const s of this.nearStars) {
      v.set(s.pos[0] - this.camG[0], s.pos[1] - this.camG[1], s.pos[2] - this.camG[2]).project(this.camera);
      if (v.z > 1) continue; const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H; const d = (x - e.clientX) ** 2 + (y - e.clientY) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    if (best) this.select(best);
  }
  rebuildStars() {
    const f = this.focus; const d = this.cam.dist;
    const maxLevel = d < 40 ? 1 : d < 400 ? 2 : 3;
    const list = starsNear(f, maxLevel, d < 5 ? 1 : 2);
    for (const s of allRealStars()) list.push(s);
    this.nearStars = list; this.starsAt = f.slice(); this.starsLevel = maxLevel;
    { const S = [20, 80, 320, 1280][maxLevel] || 1280; this.starMat.uniforms.uRad.value = S * ((d < 5 ? 1 : 2) + 0.5); }
    const n = list.length; const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), lum = new Float32Array(n);
    list.forEach((s, i) => { pos[i * 3] = s.pos[0] - f[0]; pos[i * 3 + 1] = s.pos[1] - f[1]; pos[i * 3 + 2] = s.pos[2] - f[2]; const c = blackbody(s.temp); const m = Math.max(...c); col[i * 3] = c[0] / m; col[i * 3 + 1] = c[1] / m; col[i * 3 + 2] = c[2] / m; lum[i] = s.lum; });
    this.starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); this.starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); this.starGeo.setAttribute('aLum', new THREE.BufferAttribute(lum, 1));
    this.starGeo.computeBoundingSphere();
  }
  update(dt) {
    if (!this.active) return;
    const G = this.G;
    if (this.focusTarget) { const k = Math.min(1, dt * 4); for (let i = 0; i < 3; i++) this.focus[i] += (this.focusTarget[i] - this.focus[i]) * k; }
    const off = this.cam.apply(this.camera, new THREE.Vector3(0, 1, 0));
    this.camera.aspect = innerWidth / innerHeight; this.camera.near = Math.max(1e-7, this.cam.dist * 1e-4); this.camera.far = Math.max(1e5, this.cam.dist * 50); this.camera.updateProjectionMatrix();
    const camG = [this.focus[0] + off.x, this.focus[1] + off.y, this.focus[2] + off.z]; this.camG = camG;
    this.galU.uOrigin.value.set(...camG);
    const lvl = this.cam.dist < 40 ? 1 : this.cam.dist < 400 ? 2 : 3;
    if (!this.starsAt || Math.hypot(this.focus[0] - this.starsAt[0], this.focus[1] - this.starsAt[1], this.focus[2] - this.starsAt[2]) > Math.max(2, this.cam.dist * 0.3) || lvl !== this.starsLevel) this.rebuildStars();
    this.starPts.position.set(this.starsAt[0] - camG[0], this.starsAt[1] - camG[1], this.starsAt[2] - camG[2]);
    this.starPts.visible = this.cam.dist < 6000; this.starMat.uniforms.uFade.value = 1 - Math.min(1, Math.max(0, (this.cam.dist - 1500) / 4500));
    for (const s of this.neb.children) { s.position.set(s.userData.g[0] - camG[0], s.userData.g[1] - camG[1], s.userData.g[2] - camG[2]); s.scale.setScalar(s.userData.size); }
    this.neb.visible = this.cam.dist > 300;
    if (this.sel) { const p = this.sel.pos; this.ring.position.set(p[0] - camG[0], p[1] - camG[1], p[2] - camG[2]); this.ring.quaternion.copy(this.camera.quaternion); const dd = Math.hypot(...this.ring.position.toArray()); this.ring.scale.setScalar(dd * 0.02); this.ring.visible = true; } else this.ring.visible = false;
    // labels for real stars near the focus
    this.labels.replaceChildren();
    if (this.cam.dist < 200) {
      const v = new THREE.Vector3(); let n = 0;
      for (const s of allRealStars()) {
        v.set(s.pos[0] - camG[0], s.pos[1] - camG[1], s.pos[2] - camG[2]); const d = v.length(); if (d > this.cam.dist * 4) continue;
        v.project(this.camera); if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
        this.labels.append(h('div.marker', { style: { left: ((v.x + 1) / 2 * innerWidth + 8) + 'px', top: ((1 - v.y) / 2 * innerHeight) + 'px', transform: 'translateY(-50%)' } }, s === this.sel ? h('b', {}, s.name) : s.name)); if (++n > 60) break;
      }
    }
    G.world.pipeline.render(this.scene, this.camera, { time: 0, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Vector3(1, 1, 1), atmos: [], exposure: 1.4, sss: false });
  }
}

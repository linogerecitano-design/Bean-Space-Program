// World renderer: floating origin at the camera; every body is placed relative to it each frame.
import * as THREE from 'three';
import { V3, AU } from '../core/math.js';
import { Terrain } from './terrain.js';
import { makeGasMaterial, makeStarMaterial, makeGlowSprite, makeRings, BodyPoints } from './bodies.js';
import { Pipeline } from './post.js';
import { Sky } from './sky.js';
import { Scatter, scatterTime, setFoliageAA } from './scatter.js';
import { planetTexture, PLANET_EXTRA, IS_MOBILE, getGroundArrays } from './textures.js';
import { blackbody } from './glsl.js';
import { requestBake, prefetchSystem, bakeListeners } from '../gen/baker.js';
import { GasGiantBaker } from '../gen/gasgiant.js';
import { setNight } from './spaceCenter.js';
import { settings } from '../game/settings.js';
import { Belts } from './belts.js';
import { Comets } from './comets.js';

const _q = new THREE.Quaternion(), _m3 = new THREE.Matrix3(), _m4 = new THREE.Matrix4(), _v = new THREE.Vector3();

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, settings.q.maxDpr));
    this.renderScale = settings.q.scale; this.frameTimes = []; this.lastScaleChange = 0;
    r.outputColorSpace = THREE.LinearSRGBColorSpace; // tonemapping + gamma done in post
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = settings.q.shadow > 0; r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1e17);
    this.pipeline = new Pipeline(r); setFoliageAA((settings.q.msaa || 0) > 0);
    this.sky = new Sky(r); this.scene.add(this.sky.mesh);
    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = true;
    const sc = this.sun.shadow; sc.mapSize.set(settings.q.shadow || 512, settings.q.shadow || 512); sc.camera.near = 1; sc.camera.far = 4000; sc.bias = -0.0004; sc.normalBias = 0.05;
    this.shadowSize = 120; this.setShadowSize(120);
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new THREE.HemisphereLight(0x8899bb, 0x443322, 0.25); this.scene.add(this.ambient);
    this.bodiesGroup = new THREE.Group(); this.scene.add(this.bodiesGroup);
    this.points = new BodyPoints(); this.scene.add(this.points.points);
    this.belts = new Belts(this.scene); this.comets = new Comets(this.scene);
    this.visuals = new Map();
    this.system = null; this.t = 0;
    this.camPos = new V3(); // system frame
    this.exposureBias = 2.3;
    this.envRT = null; this.lastEnv = 0;
    this.pmrem = new THREE.PMREMGenerator(r);
    this.ggBaker = new GasGiantBaker(r);
    bakeListeners.add((b, kind) => { delete b._clouds; if (kind === 'clouds') return; const v = this.visuals.get(b); if (v) { this.disposeVisual(v); this.visuals.delete(b); } });
    this.resize();
    addEventListener('resize', () => this.resize());
    settings.onChange(() => this.applySettings());
  }
  setShadowSize(s) { const c = this.sun.shadow.camera; c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.updateProjectionMatrix(); this.shadowSize = s; }
  resize() {
    const w = innerWidth || 1280, h = innerHeight || 720;
    this.renderer.setSize(w, h, false);
    const s = new THREE.Vector2(); this.renderer.getDrawingBufferSize(s);
    this.pipeline.setSize(Math.max(64, Math.round(s.x * this.renderScale)), Math.max(64, Math.round(s.y * this.renderScale)));
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  applySettings() {
    const q = settings.q, r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio, q.maxDpr));
    this.renderScale = q.scale;
    const wantShadow = q.shadow > 0;
    if (r.shadowMap.enabled !== wantShadow) { r.shadowMap.enabled = wantShadow; this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); }
    const ms = q.shadow || 512; if (this.sun.shadow.mapSize.x !== ms) { this.sun.shadow.mapSize.set(ms, ms); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.pipeline.applyQuality(q); setFoliageAA((q.msaa || 0) > 0);
    this.resize();
  }
  // Dynamic resolution: watch real frame times and trade internal resolution for frame rate
  adaptResolution() {
    const now = performance.now(); const ft = this._lastFrame ? now - this._lastFrame : 16; this._lastFrame = now;
    if (!settings.auto || ft > 500) return; // ignore stalls (tab switches, loading)
    const F = this.frameTimes; F.push(ft); if (F.length > 40) F.shift();
    if (F.length < 30 || now - this.lastScaleChange < 1500) return;
    const avg = F.slice().sort((a, b) => a - b)[Math.floor(F.length * 0.6)];
    let s = this.renderScale;
    if (avg > 26) s = Math.max(0.5, s - (avg > 45 ? 0.15 : 0.08));
    else if (avg < 17.5 && s < settings.q.scale) s = Math.min(settings.q.scale, s + 0.05);
    if (Math.abs(s - this.renderScale) > 0.01) { this.renderScale = s; this.lastScaleChange = now; F.length = 0; this.resize(); }
  }
  setSystem(sys) {
    if (this.system === sys) return;
    for (const [, v] of this.visuals) this.disposeVisual(v);
    this.visuals.clear(); this.system = sys;
    this.sky.bakeFor(sys.starId, sys.galPos);
    this.belts.setSystem(sys); this.comets.setSystem(sys);
    prefetchSystem(sys);
    // white-balanced to the Sun (as eyes and cameras adapt): sunlight is white, cooler stars orange, hotter blue
    const T = sys.star.temp || 5772; const c0 = blackbody(5772), c1 = blackbody(T); const c = c1.map((x, i) => x / c0[i]); const m = Math.max(...c); this.starColor = c.map(x => x / m);
  }
  disposeVisual(v) {
    if (v.terrain) v.terrain.disposeAll(); if (v.scatter) v.scatter.dispose();
    this.bodiesGroup.remove(v.group);
    v.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  makeVisual(b) {
    requestBake(b, 5);
    const group = new THREE.Group(); group.name = 'body:' + b.name;
    const v = { body: b, group, lastSeen: 0 };
    if (b.isStar) {
      const mat = makeStarMaterial(b); v.mat = mat;
      v.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat); v.mesh.scale.setScalar(b.radius); group.add(v.mesh);
      const col = blackbody(b.temp || 5772); const mm = Math.max(...col);
      v.glow = makeGlowSprite(col.map(x => x / mm)); group.add(v.glow);
    } else if (b.isGas) {
      v.gg = this.ggBaker.request(b); v.ggReady = v.gg.ready;
      if (!b.features) { const P = v.gg.P; b.features = [`Cloud-deck model: ${v.gg.preset} (Kupiter wind-field bake)`, `${P.bandCount} zonal bands`, P.spots.length ? `${P.spots.length} major vortex storm${P.spots.length > 1 ? 's' : ''}` : 'No major storms', P.smallCount ? `${P.smallCount} small ovals` : null].filter(Boolean); }
      const mat = makeGasMaterial(b, v.gg.ready ? v.gg : null); v.mat = mat;
      v.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
      // flattening from spin (Darwin–Radau-ish: f ≈ 0.65 q for centrally condensed giants); real values for the big two
      const w = b.rotPeriod ? 2 * Math.PI / b.rotPeriod : 0; const q = w * w * b.radius ** 3 / (b.mu || 1);
      const f = b.name === 'Saturn' && b.sys.real ? 0.098 : b.name === 'Jupiter' && b.sys.real ? 0.065 : Math.min(0.25, 0.65 * q);
      const st = (b.style && b.style.stretch) || 0; // tidal egg: long axis (+X) faces the star
      v.mesh.scale.set(b.radius * (1 + st), b.radius * (1 - f), b.radius * (1 - st * 0.3)); group.add(v.mesh);
      v.spin = new THREE.Group(); group.add(v.spin);
    } else {
      v.terrain = new Terrain(b, this);
      v.spin = v.terrain.group; group.add(v.terrain.group);
      if (getGroundArrays() && b.radius > 50000 && !IS_MOBILE_LOWMEM()) {
        v.scatter = new Scatter(this.renderer, b, v.terrain);
        v.terrain.group.add(v.scatter.group);
      }
    }
    if (b.style && b.style.rings) { v.rings = makeRings(b); group.add(v.rings); }
    this.bodiesGroup.add(group);
    this.visuals.set(b, v);
    return v;
  }
  // body-fixed camera position
  camBF(b, bodyPos) {
    const rel = this.camPos.clone().sub(bodyPos);
    b.rotAt(this.t, _q).invert();
    const p = new THREE.Vector3(rel.x, rel.y, rel.z).applyQuaternion(_q);
    return [p.x, p.y, p.z];
  }
  // frame: { t, camPos (V3), focus?: V3 (shadow focus), exposure }
  update(frame) {
    const sys = this.system; if (!sys) return;
    this.adaptResolution();
    this.t = frame.t; this.camPos.copy(frame.camPos);
    const cam = this.camera; cam.position.set(0, 0, 0); cam.updateMatrixWorld();
    const H = this.renderer.domElement.height; const fovK = H / 2 / Math.tan(cam.fov * Math.PI / 360);
    const starPos = sys.star.posAt(this.t);
    const starRel = starPos.clone().sub(this.camPos); const starDist = starRel.len();
    const sunDir = new THREE.Vector3(starRel.x, starRel.y, starRel.z).normalize();
    // Sun flux at camera and eclipses
    const lum = sys.star.lum ?? 1;
    let flux = lum / Math.pow(starDist / AU, 2);
    let occl = 1;
    const atmos = [];
    this.points.begin();
    let nearestSolid = null, nearestD = Infinity;
    for (const b of sys.bodies) {
      const bp = b.posAt(this.t); const rel = bp.clone().sub(this.camPos); const d = rel.len();
      const pix = b.radius / Math.max(d, 1) * fovK;
      // eclipse (penumbra approx) for bodies between camera and star
      if (!b.isStar && d < starDist) {
        const along = rel.x * sunDir.x + rel.y * sunDir.y + rel.z * sunDir.z;
        if (along > 0) {
          const perp = Math.sqrt(Math.max(0, d * d - along * along));
          const sunAng = sys.star.radius / starDist, bAng = b.radius / d, sep = perp / d;
          if (sep < sunAng + bAng) occl = Math.min(occl, Math.max(0, Math.min(1, (sep - (bAng - sunAng)) / (2 * sunAng + 1e-12))));
        }
      }
      if (!b.isStar && b.hasSurface && d - b.radius < nearestD) { nearestD = d - b.radius; nearestSolid = b; }
      const want = pix > 2.5 || (b.isStar && pix > 0.2);
      let v = this.visuals.get(b);
      if (want) {
        if (!v) v = this.makeVisual(b);
        v.lastSeen = performance.now();
        v.group.visible = true;
        v.group.position.set(rel.x, rel.y, rel.z);
        const q = b.rotAt(this.t, new THREE.Quaternion());
        if (v.spin) v.spin.quaternion.copy(q);
        if (v.mesh && !b.isGas) v.mesh.quaternion.copy(q);
        if (v.mesh && b.isGas) v.mesh.quaternion.copy(q);
        if (v.rings) v.rings.quaternion.copy(b.poleQuat);
        const w2b = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)).invert();
        if (v.gg && !v.ggReady && v.gg.ready) { // Kupiter bake finished: swap in albedo + flow
          v.ggReady = true; const U = v.mat.userData.U;
          if (v.gg.albedo) { U.uTex.value = v.gg.albedo; U.uHasAlbedo.value = 1; }
          U.uFlow.value = v.gg.flow; U.uHasFlow.value = 1;
        }
        if (v.mat) {
          const U = v.mat.userData.U;
          if (U.uWorldToBody) U.uWorldToBody.value.copy(w2b);
          if (U.uTime) U.uTime.value = this.t * (b.isStar ? 1 : 0.02) % 1e6;
          if (U.uSun) U.uSun.value.copy(sunDir);
          if (U.uCenter) U.uCenter.value.set(rel.x, rel.y, rel.z);
          if (U.uPole) U.uPole.value.set(b.poleAxis.x, b.poleAxis.y, b.poleAxis.z);
          if (U.uSunColor) U.uSunColor.value.set(...this.starColor).multiplyScalar(Math.min(4, Math.pow(lum / Math.pow(b.posAt(this.t).dist(starPos) / AU, 2), 0.35)));
        }
        if (v.rings) { const U = v.rings.material.userData.U; U.uSun.value.copy(sunDir); U.uCenter.value.set(rel.x, rel.y, rel.z); U.uSunColor.value.set(...this.starColor).multiplyScalar(Math.min(4, Math.pow(lum / Math.pow(bp.dist(starPos) / AU, 2), 0.35))); }
        if (v.glow) { const s = Math.max(b.radius * 6, d * 0.03); v.glow.scale.setScalar(s); v.glow.quaternion.copy(cam.quaternion); v.glow.material.uniforms.uIntensity.value = Math.min(3, 0.6 + pix * 0.02); }
        if (v.terrain) {
          const camBF = this.camBF(b, bp);
          const U = v.terrain.material.userData.U;
          const qi = q.clone().invert();
          const sBF = sunDir.clone().applyQuaternion(qi); U.uSunBF.value.copy(sBF);
          U.uBFtoView.value.setFromMatrix4(_m4.makeRotationFromQuaternion(q)).premultiply(_m3.setFromMatrix4(cam.matrixWorldInverse));
          U.uTime.value = (this.t % 10000);
          U.uCloudRot.value = this.cloudRot(b);
          U.uSunI.value = this.sun.intensity;
          if (frame.siteBF && b.name === frame.siteBody) { const sb = frame.siteBF; const l = Math.hypot(sb[0], sb[1], sb[2]); const e = (sBF.x * sb[0] + sBF.y * sb[1] + sBF.z * sb[2]) / l; this.siteNight = Math.min(1, Math.max(0, (0.05 - e) / 0.15)); }
          if (U.uHasGround.value < 0.5 && getGroundArrays()) { const ga = getGroundArrays(); U.uGroundA.value = ga.albedo; U.uGroundN.value = ga.normal; U.uHasGround.value = 1; }
          const budget = frame.budget ?? (IS_MOBILE ? 5 : 8);
          v.terrain.update(camBF, budget, frame.lodScale ?? 1);
          if (v.scatter) {
            v.scatter.site = frame.siteBF && b.name === frame.siteBody ? frame.siteBF : null;
            // viewing cone in body-fixed axes: half the frustum diagonal plus a margin, so turning a little doesn't rebuild
            const f = cam.getWorldDirection(_v).applyQuaternion(qi);
            const half = Math.atan(Math.tan(cam.fov * Math.PI / 360) * Math.hypot(1, cam.aspect)) + 0.45;
            v.scatter.update(camBF, { fwd: [f.x, f.y, f.z], cos: Math.cos(Math.min(half, Math.PI * 0.95)) });
          }
        }
        if (b.atmo && (d < b.radius + b.atmo.height * 60 + b.radius * 4 || pix > 6)) {
          atmos.push({ d, body: b, C: [rel.x, rel.y, rel.z], R: b.radius + (b.isGas ? 0 : 0), atmo: b.atmo, w2b, cloudRot: this.cloudRot(b), clouds: this.cloudsFor(b), real2D: b.name === 'Earth' && b.sys.real ? planetTexture(PLANET_EXTRA.Earth.clouds, false) : null });
        }
      } else if (v) {
        v.group.visible = false;
        if (performance.now() - v.lastSeen > 15000) { this.disposeVisual(v); this.visuals.delete(b); }
      }
      if (!want || pix < 4) {
        // point sprite: brightness by reflected light
        if (d > 0) {
          const dStar = bp.dist(starPos) || 1;
          let br = b.isStar ? Math.min(3, (b.lum || 1) * 1e22 / (d * d) + 0.3) : Math.min(2, 2e18 * (b.radius * b.radius) / (dStar * dStar) * lum * (AU * AU) / (d * d) * 1e-18 * 4e3);
          br = Math.max(br, b.type === 'planet' ? 0.25 : b.type === 'dwarf' ? 0.12 : 0.04);
          const col = b.isStar ? blackbody(b.temp || 5772) : (b.style?.colors?.mid || b.style?.bands?.[0] || [0.7, 0.7, 0.7]);
          this.points.add(rel.x, rel.y, rel.z, col[0] * br, col[1] * br, col[2] * br, b.isStar ? 6 : (b.type === 'planet' ? 5 : 3.2));
        }
      }
    }
    this.points.end();
    this.belts.update(this.t, this.camPos);
    this.comets.update(this.t, this.camPos, cam);
    this.ggBaker.step();
    this.nearest = nearestSolid;
    atmos.sort((a, b) => a.d - b.d);
    flux *= occl;
    // lights
    const sunI = 3.2 * Math.min(8, flux);
    this.sun.intensity = sunI;
    this.sun.color.setRGB(...this.starColor);
    const focus = frame.focusRel || new THREE.Vector3();
    this.sun.position.copy(focus).addScaledVector(sunDir, 2000); this.sun.target.position.copy(focus); this.sun.target.updateMatrixWorld();
    // ambient: sky/planetshine
    let amb = 0.02;
    if (atmos.length) { const a = atmos[0]; const alt = a.d - a.R; if (alt < a.atmo.height) amb = 0.25 * Math.max(0, 1 - alt / a.atmo.height) * Math.min(1, flux) + 0.05 * Math.max(0, 1 - alt / a.atmo.height); }
    this.ambient.intensity = amb;
    // post uniforms
    const sunColor = new THREE.Vector3(...this.starColor).multiplyScalar(sunI);
    const sunScreen = sunDir.clone().applyMatrix4(cam.matrixWorldInverse);
    let sunUV = null, sunVis = 0;
    if (sunScreen.z < 0) { const p = sunDir.clone().project(cam); if (Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2) { sunUV = new THREE.Vector2(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5); sunVis = Math.min(1, flux) * occl; } }
    // auto exposure (eye adaptation): measured at the focus rather than the camera, so zooming
    // the camera around doesn't pump the brightness; limited at night inside an atmosphere.
    let expFlux = flux;
    const ep = frame.exposurePos || (frame.focusRel ? this.camPos.clone().add(new V3(frame.focusRel.x, frame.focusRel.y, frame.focusRel.z)) : null);
    if (ep) { const d = Math.max(ep.dist(starPos), sys.star.radius * 2) / AU; expFlux = lum / (d * d) * occl; }
    let target = Math.min(8, Math.max(0.3, Math.pow(Math.max(expFlux, 1e-6), -0.33)));
    if (atmos.length && atmos[0].d - atmos[0].R < atmos[0].atmo.height) target = Math.min(target, 2.2 + 3 * Math.max(0, (atmos[0].d - atmos[0].R) / atmos[0].atmo.height));
    const now = performance.now(); const adt = Math.min(0.5, (now - (this._expT || now)) / 1000); this._expT = now;
    if (!this._exp || frame.snapExposure) this._exp = target; else this._exp *= Math.pow(target / this._exp, Math.min(1, adt * 1.5));
    const autoExp = this._exp;
    setNight(this.siteNight ?? 0);
    scatterTime(this.t % 1000);
    // daylight inside an atmosphere washes out the stars
    let starK = 1;
    if (atmos.length) { const a = atmos[0]; const alt = a.d - a.R; if (alt < a.atmo.height) { const up = new THREE.Vector3(-a.C[0], -a.C[1], -a.C[2]).normalize(); const elev = up.dot(sunDir); const thick = Math.min(1, a.atmo.P0 / 50) * (1 - alt / a.atmo.height); starK = 1 - thick * Math.min(1, Math.max(0, (elev + 0.12) / 0.2)); } }
    this.sky.U.uBright.value = (frame.skyBright ?? 1) * starK; this.points.points.visible = starK > 0.3;
    const sunZ = -sunScreen.z * starDist, sunAng = sys.star.radius / starDist / Math.tan(cam.fov * Math.PI / 360) * 1.2;
    this.pipeline.render(this.scene, cam, { time: this.t % 10000, sunDir, sunColor, atmos, exposure: (frame.exposure ?? 1) * autoExp * this.exposureBias, sunUV, sunVis, sunZ, sunAng });
    this.sunDir = sunDir; this.flux = flux;
  }
  cloudRot(b) { const cl = this.cloudsFor(b); if (!cl) return 0; return (this.t * (cl.speed || 10) / b.radius) % (Math.PI * 2); }
  cloudsFor(b) {
    const st = b.style; if (!st || !st.clouds) return null;
    if (!b._clouds) {
      b._clouds = { ...st.clouds };
      if (b.name === 'Earth' && b.sys.real) b._clouds.map = planetTexture(PLANET_EXTRA.Earth.clouds, false);
      if (b.name === 'Venus' && b.sys.real) b._clouds.map = planetTexture(PLANET_EXTRA.Venus.clouds, false);
      if (b.cloudStack) {
        const k = b.atmo ? Math.max(0.3, Math.min(4, b.atmo.H / 8500)) : 1;
        const pre = b.cloudStack.preset;
        b._clouds.map = b.cloudStack.tex; b._clouds.stack = pre === 'earth' ? 1 : pre === 'venus' ? 2 : 3;
        if (pre === 'earth') { b._clouds.height = 400 * k; b._clouds.thickness = 12000 * k; b._clouds.opaque = false; }
        else if (pre === 'venus') { b._clouds.height = 45000; b._clouds.thickness = 25000; b._clouds.opaque = true; }
        else { b._clouds.height = 1500 * k; b._clouds.thickness = 30000 * Math.min(1.5, k); b._clouds.opaque = false; b._clouds.color = [1.0, 0.88, 0.78]; }
      }
    }
    return b._clouds;
  }
}
const IS_MOBILE_LOWMEM = () => false;

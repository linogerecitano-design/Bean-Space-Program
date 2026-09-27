// Flight scene: launch, fly, stage, orbit, land, EVA, time warp, map view, interstellar travel.
import * as THREE from 'three';
import { h, mount, clearUI, flash, modal, toast } from '../ui/ui.js';
import { isCareer, newFlightRecord, trackFlight, checkAchievements, checkContracts, situationOf, SITUATIONS, EXPERIMENTS, sciValue, runScience, fmtFunds, expAllowed, sitText } from '../game/career.js';
import { V3, fmtDist, fmtSpeed, fmtTime, fmtMass, AU, LY, C_LIGHT, G0, DAY } from '../core/math.js';
import { Orbit } from '../core/orbit.js';
import { Vessel, physicsStep, updateSituation, vesselUp, cloneNode, newNode } from '../core/vessel.js';
import { PROPS } from '../data/parts.js';
import { buildVesselMesh } from '../render/vesselMesh.js';
import { OrbitCam } from '../core/camera.js';
import { siteFrame, localToSystem, bfToSystem, attachToBody } from './site.js';
import { siteModel, PAD_HEIGHT, PAD_RADIUS, RUNWAY } from '../render/spaceCenter.js';
import { keys, down, hit, buildTouchControls, touch } from '../core/input.js';
import { Navball } from '../render/navball.js';
import { MapView } from '../render/mapView.js';
import { Astronaut, makeFlag } from '../render/astronaut.js';
import { latLonToDir } from '../gen/planetgen.js';
import { starsNear, starById } from '../gen/galaxy.js';
import { REAL_STARS, eclEngineToGalaxy, galaxyToEclEngine } from '../data/stars.js';
import { loadSystem } from '../core/universe.js';
import { IS_MOBILE } from '../render/textures.js';
import { bakeListeners } from '../gen/baker.js';
import { graphicsDialog } from '../ui/graphics.js';
import { makeShapePlasma, makeFireball, Sparks } from '../render/vfx.js';
import { ClothChute } from '../render/chuteCloth.js';
import { beanier } from '../game/settings.js';
import { LaunchFX, frostPatch } from '../render/volumetrics.js';
import { blackbody } from '../render/glsl.js';

const WARPS = [1, 2, 3, 4, 10, 50, 100, 1000, 10000, 100000, 1e6, 1e7, 1e8, 1e9, 1e10];
const PHYS_MAX = 3; // index of the highest physics warp
const STEP = 0.02;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _ax = new THREE.Vector3();

export class FlightScene {
  constructor(G) {
    this.G = G;
    this.cam = new OrbitCam(G.world.renderer.domElement); this.cam.enabled = false;
    this.root = new THREE.Group(); this.root.name = 'flight'; G.world.scene.add(this.root);
    this.map = new MapView(G.world);
    this.map.onPick = (b) => { this.mapFocus = this.vessel && b === this.vessel.body ? null : b; this.map.target = b; this.cam.zoom(Math.max(b.radius * 4, 5e5) / this.cam.dist, true); flash('Map focus: ' + b.name); };
    this.center = null; this.fx = [];
    this.ray = new THREE.Raycaster();
    const dom = G.world.renderer.domElement;
    dom.addEventListener('contextmenu', (e) => { if (!this.active) return; e.preventDefault(); this.pickMenu(e.clientX, e.clientY); });
    dom.addEventListener('pointerdown', (e) => { if (!this.active || e.pointerType !== 'touch') return; const x = e.clientX, y = e.clientY; clearTimeout(this.lp); this.lpStart = [x, y]; this.lp = setTimeout(() => { if (this.lpStart && this.cam.dragged < 8) this.pickMenu(x, y); }, 550); });
    dom.addEventListener('pointerup', () => { clearTimeout(this.lp); this.lpStart = null; });
    // a body's terrain can finish generating while we're sitting on it: re-seat the vessel on the new ground
    bakeListeners.add((b, kind) => {
      const v = this.vessel; if (!this.active || !v || kind === 'clouds' || v.body !== b || !v.landed || !v.landedBF) return;
      const bf = v.landedBF, r = Math.hypot(...bf), d = bf.map((x) => x / r);
      let hgt = b.surface ? b.surface.height(d[0], d[1], d[2]) : 0; if (b.seaLevel != null) hgt = Math.max(hgt, b.seaLevel);
      const off = v.type === 'eva' ? 0.92 : (v.com[1] - v.bottom + 0.3);
      v.landedBF = d.map((x) => x * (b.radius + hgt + off)); this.syncLanded(v, this.G.t);
    });
  }
  // ------------------------------------------------------------------ enter / exit
  async enter(params) {
    const G = this.G; this.active = true; this.cam.enabled = true; this.dead = false; this.leaving = false;
    this.warpI = 0; this.mapMode = false; this.plan = null; this.debris = []; this.others = [];
    this.throttleTouch = null; this.hudT = 0; this.camMode = 'chase';
    if (params.design) {
      G.setSystem('sol');
      this.launchParams = params;
      const v = new Vessel(cloneNode(params.design), { crew: [] });
      v.name = params.design.name;
      const seats = v.crewCap;
      const crew = (params.crew || []).slice(0, seats);
      for (const n of crew) { const a = G.game.roster.find(r => r.name === n); if (a) a.status = 'flying'; }
      v.crew = crew;
      this.place(v, params.where || 'pad');
      // reverting: drop whatever the previous attempt of this launch left behind (vessel or debris)
      if (params.launchId) G.game.vessels = G.game.vessels.filter(x => x.launchId !== params.launchId);
      params.launchId ||= 'L' + Date.now().toString(36);
      this.vessel = v; v.launchId = params.launchId; G.game.vessels.push({ ...v.serialize(), launchId: params.launchId }); G.game.activeVessel = v.id;
    } else if (params.vesselId) {
      const d = G.game.vessels.find(x => x.id === params.vesselId);
      if (d.starId && d.starId !== G.sys.starId) G.setSystem(d.starId); else if (!d.starId) G.setSystem('sol');
      this.vessel = Vessel.deserialize(d, G.sys);
      if (d.galactic) this.vessel.galactic = d.galactic;
      G.game.activeVessel = d.id;
    }
    const v = this.vessel;
    this.buildMesh();
    this.loadOthers();
    if (G.sys.starId === 'sol') { this.siteLevel = G.game.mode === 'career' ? (G.game.facility || 0) : 1; this.center = siteModel(this.siteLevel); this.earth = G.sys.get('Earth'); this.site = siteFrame(this.earth); }
    this.cam.dist = Math.max(15, v.height * 1.8); this.cam.pitch = 0.15; this.cam.yaw = 2.6; this.cam.minDist = v.type === 'eva' ? 1.5 : 3; this.cam.maxDist = 1e13;
    this.buildUI();
    this.map.clear();
    G.world.setShadowSize(Math.max(40, v.height * 1.6));
    this.flags = []; for (const f of G.game.flags) this.spawnFlag(f);
    this.careerT = 0; this.careerDt = 0;
    if (isCareer(G.game)) { G.game.recs ||= {}; G.game.recs[v.id] ||= newFlightRecord(); }
    if (v.situation === 'prelaunch') flash(G.mobile || document.body.classList.contains('compact') ? 'Tap STAGE to launch · slide the throttle' : 'Press SPACE (or STAGE) to launch · Shift = throttle up', 4000);
  }
  exit() {
    this.persist(); this.active = false; this.cam.enabled = false; document.querySelector('.part-menu')?.remove();
    if (this.lfx) this.lfx.clear();
    this.root.clear(); if (this.center && this.center.parent) this.center.parent.remove(this.center);
    if (this.cloths) { for (const c of this.cloths.values()) c.dispose(); this.cloths.clear(); } this.prevV = null;
    for (const f of this.flags || []) f.parent && f.parent.remove(f);
    this.map.show(false); this.map.clear(); clearUI();
  }
  persist() {
    const G = this.G, v = this.vessel; if (!v || !G.game) return;
    const d = v.serialize(); d.starId = G.sys.starId; d.t = G.t;
    const i = G.game.vessels.findIndex(x => x.id === v.id); d.launchId = v.launchId || (i >= 0 ? G.game.vessels[i].launchId : undefined); if (i >= 0) G.game.vessels[i] = d; else G.game.vessels.push(d);
    for (const o of this.others || []) { const k = G.game.vessels.findIndex(x => x.id === o.v.id); if (k >= 0) { const od = o.v.serialize(); od.starId = G.sys.starId; od.t = G.t; od.launchId = G.game.vessels[k].launchId; od.dock = o.v.dock || null; G.game.vessels[k] = od; } }
    G.game.t = G.t;
  }
  place(v, where) {
    const G = this.G, t = G.t; v.throttle = 0;
    const setLanded = (body, lat, lon, extra = 0) => this.landAt(v, body, lat, lon, extra);
    if (where === 'pad') {
      const earth = G.sys.get('Earth'); const s = siteFrame(earth);
      setLanded(earth, 28.6082, -80.6041, PAD_HEIGHT + 3 - 0.3 + (s.ground - earth.surface.height(...latLonToDir(28.6082, -80.6041))));
      v.clamped = true; v.situation = 'prelaunch';
    } else if (where === 'runway') {
      // lined up at the south-west end of the runway, belly (gear side) down
      const earth = G.sys.get('Earth'); const s = siteFrame(earth);
      const dl = new THREE.Vector3(Math.sin(RUNWAY.ang), 0, Math.cos(RUNWAY.ang)), P = new THREE.Vector3(RUNWAY.x, 0, RUNWAY.z).addScaledVector(dl, RUNWAY.len * 0.44);
      const off = P.applyQuaternion(s.q); const bf = new THREE.Vector3(s.bf[0] + off.x, s.bf[1] + off.y, s.bf[2] + off.z); const U = bf.clone().normalize();
      const H = dl.negate().applyQuaternion(s.q); H.addScaledVector(U, -H.dot(U)).normalize();
      const com = new THREE.Vector3(...v.com); const B = new THREE.Vector3();
      for (const c of v.contactPts) if (c.wheel) B.add(new THREE.Vector3(c.p[0] - com.x, 0, c.p[2] - com.z));
      if (B.lengthSq() < 1e-6) B.set(0, 0, -1); B.normalize();
      let clr = 0; for (const c of v.contactPts) clr = Math.max(clr, (c.p[0] - com.x) * B.x + (c.p[1] - com.y) * B.y + (c.p[2] - com.z) * B.z);
      const Y = new THREE.Vector3(0, 1, 0), A = new THREE.Matrix4().makeBasis(Y.clone().cross(B), Y, B);
      const D = U.clone().negate(), W = new THREE.Matrix4().makeBasis(H.clone().cross(D), H, D);
      const q = new THREE.Quaternion().setFromRotationMatrix(W.multiply(A.transpose()));
      const hgt = Math.max(0, earth.surface.height(U.x, U.y, U.z)) + clr + 0.25;
      if (this.lfx) this.lfx.clear();
      v.body = earth; v.landed = true; v.landedBF = U.toArray().map(x => x * (earth.radius + hgt)); v.landedQ = q.toArray(); this.syncLanded(v, G.t);
      v.situation = 'prelaunch'; v.brakes = false;
    } else if (where === 'moon') { setLanded(G.sys.get('Moon'), 0.674, 23.473, 0.5); v.situation = 'landed'; }
    else if (where === 'mars') { setLanded(G.sys.get('Mars'), 18.44, 77.45, 0.5); v.situation = 'landed'; }
    else if (where === 'leo' || where === 'helio') {
      const earth = G.sys.get('Earth');
      if (where === 'leo') {
        const r = earth.radius + 400e3; const pole = earth.poleAxis;
        const rv = new THREE.Vector3(1, 0, 0).applyQuaternion(earth.poleQuat); const vv = new THREE.Vector3().crossVectors(new THREE.Vector3(pole.x, pole.y, pole.z), rv).normalize();
        v.body = earth; v.r = new V3(rv.x * r, rv.y * r, rv.z * r); const s = Math.sqrt(earth.mu / r); v.v = new V3(vv.x * s, vv.y * s, vv.z * s);
        v.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vv);
      } else {
        const sun = G.sys.star; const ep = earth.posAt(t), ev = earth.velAt(t);
        v.body = sun; v.r = ep.clone().add(ev.clone().norm().scale(3e9)); v.v = ev.clone(); v.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ev.x, ev.y, ev.z).normalize());
      }
      v.landed = false; v.situation = 'orbiting';
    }
  }
  // set a vessel down upright on a body's surface at lat/lon (degrees)
  landAt(v, body, lat, lon, extra = 0) {
    if (this.lfx) this.lfx.clear(); // launch smoke and frost stay at the pad
    const d = latLonToDir(lat, lon); let hgt = body.surface ? body.surface.height(...d) : 0; if (body.seaLevel != null) hgt = Math.max(hgt, body.seaLevel);
    const hCom = v.com[1] - v.bottom + 0.3 + extra + Math.max(hgt, body.name === 'Earth' ? 0 : -1e9);
    const bf = [d[0] * (body.radius + hCom), d[1] * (body.radius + hCom), d[2] * (body.radius + hCom)];
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
    v.body = body; v.landed = true; v.landedBF = bf; v.landedQ = q.toArray(); this.syncLanded(v, this.G.t);
  }
  // circular (equatorial-ish) orbit at altitude alt (m) around body
  orbitAt(v, body, alt, inc = 0) {
    if (this.lfx) this.lfx.clear();
    const r = body.radius + alt; const pole = new THREE.Vector3(body.poleAxis.x, body.poleAxis.y, body.poleAxis.z);
    const rv = new THREE.Vector3(1, 0, 0).applyQuaternion(body.poleQuat).applyAxisAngle(pole, Math.random() * Math.PI * 2);
    const vv = new THREE.Vector3().crossVectors(pole, rv).normalize().applyAxisAngle(rv, inc * Math.PI / 180);
    const sp = Math.sqrt(body.mu / r);
    v.body = body; v.r = new V3(rv.x * r, rv.y * r, rv.z * r); v.v = new V3(vv.x * sp, vv.y * sp, vv.z * sp);
    v.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vv); v.w.set(0, 0, 0);
    v.landed = false; v.clamped = false; v.contact = false; v.situation = 'orbiting';
  }
  // sandbox: jump anywhere in this star system, landed or in orbit
  async teleportDialog() {
    const G = this.G, v = this.vessel; if (!v || v.galactic) return flash('Not available in interstellar space');
    const bodies = G.sys.bodies.filter(b => b.type !== 'star' || b === G.sys.star);
    const depth = (b) => { let d = 0; for (let p = b.parentBody; p; p = p.parentBody) d++; return d; };
    const sel = h('select', {}, bodies.map(b => h('option', { value: b.name, selected: b === v.body ? true : undefined }, '\u00a0'.repeat(depth(b) * 3) + b.name + (b.isGas ? ' (gas giant)' : b.isStar ? ' (star)' : ''))));
    const mode = h('select', {}, h('option', { value: 'orbit' }, 'Circular orbit'), h('option', { value: 'land' }, 'Landed on the surface'));
    const alt = h('input', { type: 'number', min: 1, step: 'any', placeholder: 'auto' });
    const lat = h('input', { type: 'number', value: 0, step: 'any' }), lon = h('input', { type: 'number', value: 0, step: 'any' });
    const landRow = h('div.col', { style: { display: 'none' } }, h('label', {}, 'Latitude / longitude (°)'), h('div.row', {}, lat, lon));
    const altRow = h('div.col', {}, h('label', {}, 'Altitude (km) — blank picks one just above the atmosphere'), alt);
    const sync = () => { const b = G.sys.get(sel.value); const canLand = b && b.hasSurface; if (!canLand && mode.value === 'land') mode.value = 'orbit'; mode.options[1].disabled = !canLand; landRow.style.display = mode.value === 'land' ? '' : 'none'; altRow.style.display = mode.value === 'orbit' ? '' : 'none'; };
    sel.onchange = sync; mode.onchange = sync; sync();
    const r = await modal('Teleport (sandbox)', h('div.col', {}, h('label', {}, 'Destination'), sel, h('label', {}, 'Where'), mode, altRow, landRow), [{ label: 'Cancel' }, { label: 'Teleport', value: 'go', primary: true }]);
    if (r !== 'go') return;
    const b = G.sys.get(sel.value); if (!b) return;
    this.setWarp(0); this.debris = this.debris.filter(d => { this.root.remove(d.mesh); return false; });
    if (this.lfx) this.lfx.clear();
    for (const p of v.parts) { p.heatH = 0; }
    if (mode.value === 'land' && b.hasSurface) { this.landAt(v, b, +lat.value || 0, +lon.value || 0, 0.5); v.clamped = false; v.situation = 'landed'; }
    else {
      const auto = b.atmo ? b.atmo.height + Math.max(20e3, b.radius * 0.02) : Math.max(15e3, b.radius * 0.15);
      this.orbitAt(v, b, alt.value ? Math.max(1, +alt.value) * 1000 : auto);
    }
    if (this.mapMode) this.toggleMap();
    this.map.clear(); this.cam.dist = Math.max(15, v.height * 1.8);
    flash(`Teleported to ${b.name}`);
  }
  syncLanded(v, t) {
    const B = v.body; const q = B.rotAt(t);
    const p = new THREE.Vector3(...v.landedBF).applyQuaternion(q);
    v.r.set(p.x, p.y, p.z); const sv = B.surfaceVel(v.r); v.v.copy(sv);
    v.q.fromArray(v.landedQ).premultiply(q); v.w.set(0, 0, 0);
  }
  lockLanded(v, t) {
    const B = v.body; const qi = B.rotAt(t).invert();
    const p = new THREE.Vector3(v.r.x, v.r.y, v.r.z).applyQuaternion(qi);
    v.landedBF = [p.x, p.y, p.z]; v.landedQ = v.q.clone().premultiply(qi).toArray(); v.landed = true; v.w.set(0, 0, 0);
  }
  buildMesh() {
    const v = this.vessel;
    if (this.mesh) this.root.remove(this.mesh);
    if (v.type === 'eva') {
      if (!this.astro) this.astro = new Astronaut({});
      this.mesh = new THREE.Group(); this.mesh.add(this.astro.group); this.astro.group.position.set(0, -0.92, 0); this.plasma = null;
      this.astro.setSuit(v.suited !== false);
    } else {
      this.mesh = buildVesselMesh(v.placed, { plumes: true });
      this.mesh.userData.parts.forEach((m, i) => { m.userData.rt = v.parts[i]; });
      this.plasma = makeShapePlasma(this.mesh);
    }
    this.root.add(this.mesh);
    // cryogenic tanks are frosted while the vehicle sits fuelled on the pad in humid air
    if (!this.lfx) this.lfx = new LaunchFX(this.G.world, this.root);
    if (this.lfx.flakes.points.parent !== this.root) this.root.add(this.lfx.flakes.points);
    this.lfx.attach(v, this.mesh, v.type !== 'eva' && v.situation === 'prelaunch' && v.pressureAtm() > 0.5);
    this.applyDetach();
    // pre-compile shaders so the first frames don't stall
    try { this.G.world.renderer.compileAsync(this.G.world.scene, this.G.world.camera); } catch (e) {}
  }
  applyDetach() {
    const v = this.vessel; if (!this.mesh.userData.parts) return;
    for (const m of this.mesh.userData.parts) m.visible = m.userData.rt.attached && !m.userData.rt.broken;
  }
  // ------------------------------------------------------------------ UI
  buildUI() {
    clearUI(); const G = this.G;
    this.hudTop = h('div#hud-top.panel.mono'); this.hudOrbit = h('div#hud-orbit.panel.mono'); this.hudStage = h('div#hud-stage.panel');
    this.warpLbl = h('span.mono', { style: { minWidth: '70px', textAlign: 'center' } }, '1×');
    const warpbar = h('div#warpbar.panel', {}, h('button', { onclick: () => this.setWarp(this.warpI - 1) }, '◀◀'), this.warpLbl, h('button', { onclick: () => this.setWarp(this.warpI + 1) }, '▶▶'), h('button', { onclick: () => this.setWarp(0) }, '■'));
    const canvas = h('canvas#navball');
    this.btns = {};
    const B = (k, label, fn, cls = '') => { const b = h('button' + cls, { onclick: fn }, label); b.dataset.k = k; return (this.btns[k] = b); };
    const sasModes = h('div.hud-btns', {}, ['stability', 'prograde', 'retrograde', 'normal', 'antinormal', 'radial', 'antiradial', 'target', 'maneuver'].map(m => B('sas_' + m, { stability: 'Hold', prograde: 'Pro', retrograde: 'Retro', normal: 'Nrm', antinormal: 'A-Nrm', radial: 'Rad', antiradial: 'A-Rad', target: 'Tgt', maneuver: 'Node' }[m], () => { this.vessel.sas = true; this.vessel.sasMode = m; this.vessel.sasHold = null; })));
    const main = h('div.hud-btns', {},
      B('sas', 'SAS', () => { this.vessel.sas = !this.vessel.sas; this.vessel.sasHold = null; }), h('button.sas-toggle', { onclick: () => document.body.classList.toggle('show-sas') }, 'Modes'), B('rcs', 'RCS', () => this.vessel.rcs = !this.vessel.rcs),
      B('map', 'MAP', () => this.toggleMap()), B('cam', 'CAM', () => this.cycleCam()), B('eva', 'EVA', () => this.eva(), '.opt'), B('flag', 'Flag', () => this.plantFlag(), '.opt'),
      B('node', 'Maneuver', () => this.nodePanel(), '.opt'), B('sci', '🔬 Science', () => this.sciencePanel()), B('panels', 'Panels', () => this.togglePanels(), '.opt'), B('gear', 'Gear', () => this.toggleGear()), B('brakes', 'Brakes', () => { this.vessel.brakes = !this.vessel.brakes; }), B('warpd', 'Warp drive', () => this.toggleWarpDrive(), '.opt'), B('menu', '☰', () => this.pauseMenu()),
      B('more', '⋯', () => document.body.classList.toggle('hud-more')));
    const left = h('div.col', {}, sasModes); const right = h('div.col', {}, main);
    // on phones the telemetry collapses to the essentials; tap it for the full readout
    this.hudTop.addEventListener('click', () => document.body.classList.toggle('hud-exp'));
    document.body.classList.remove('hud-more', 'hud-exp');
    mount(this.hudTop, this.hudOrbit, this.hudStage, warpbar, h('div#hud-bottom', {}, left, canvas, right));
    this.navball = new Navball(canvas);
    const tc = buildTouchControls((val) => { this.vessel.throttle = val; });
    this.touchThrottle = tc; mount(...tc.els);
    mount(h('button#stagebtn.primary', { onclick: () => this.stage() }, 'STAGE'));
    this.nodeUI = null;
  }
  setWarp(i) {
    const v = this.vessel; i = Math.max(0, Math.min(WARPS.length - 1, i));
    if (i > PHYS_MAX && !this.canRails()) { flash(v.body && v.body.atmo && v.r.len() - v.body.radius < v.body.atmo.height ? 'Cannot warp faster in the atmosphere' : 'Cannot warp faster under acceleration / on the ground'); i = Math.min(i, PHYS_MAX); }
    if (i > 12 && !v.galactic) i = 12;
    this.warpI = i; this.warpLbl.textContent = fmtWarp(WARPS[i]);
  }
  canRails() {
    const v = this.vessel;
    if (v.galactic) return true;
    if (v.landed) return true;
    if (v.contact) return false;
    const alt = v.r.len() - v.body.radius;
    if (v.body.atmo && alt < v.body.atmo.height) return false;
    if (v.throttle > 0 && v.thrustN > 0 && v.thrustN / (v.mass * 1000) > 0.5) return false;
    return true;
  }
  stage() {
    const v = this.vessel;
    if (v.type === 'eva') return;
    const wasPre = v.clamped || v.situation === 'prelaunch';
    const oldCom = v.com.slice();
    const lost = v.activateNextStage();
    if (wasPre) { v.clamped = false; v.landed = false; v.situation = 'flying'; if (v.throttle < 0.01) v.throttle = 1; this.touchThrottle.show(v.throttle); flash('Liftoff!'); }
    else if (v.landed && v.wheels && v.throttle < 0.01 && v.livingParts().some(p => p.active && p.part.engine)) { v.throttle = 1; this.touchThrottle.show(1); } // rolling off from the runway
    if (lost.length) this.spawnDebris(lost, oldCom);
    this.applyDetach();
  }
  spawnDebris(lost, oldComArr) {
    const v = this.vessel; const G = this.G;
    const oldCom = new THREE.Vector3(...(oldComArr || v.com));
    // mesh group for the lost parts
    const g = new THREE.Group();
    for (const m of this.mesh.userData.parts) if (lost.includes(m.userData.rt)) { const c = m.clone(true); c.visible = true; c.traverse(o => { if (o.userData.U) o.visible = false; }); g.add(c); }
    // keep remaining parts in place: shift physics position by COM change
    const nc = new THREE.Vector3(...v.com); const d = nc.clone().sub(oldCom).applyQuaternion(v.q);
    const debrisCom = oldCom.clone();
    v.r.add(new V3(d.x, d.y, d.z));
    // the cloned part groups are already positioned relative to the old centre of mass, so the
    // debris starts exactly where it was and simply drifts away with a gentle separation push
    const deb = { mesh: g, r: v.r.clone().sub(new V3(d.x, d.y, d.z)), v: v.v.clone(), q: v.q.clone(), w: v.w.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05)), body: v.body, age: 0 };
    const push = vesselUp(v).multiplyScalar(-1.2); deb.v.add(new V3(push.x, push.y, push.z));
    this.root.add(g); this.debris.push(deb);
    v.comPrev = v.com.slice();
  }
  toggleGear() {
    const v = this.vessel; if (!v.wheels) return flash('No landing gear');
    if (!v.gearUp && (v.contact || v.landed)) return flash("Can't raise the gear on the ground");
    v.gearUp = !v.gearUp; v.contactPts = v.computeContacts(); flash(v.gearUp ? 'Gear up' : 'Gear down');
  }
  togglePanels() {
    const v = this.vessel; const ps = v.livingParts().filter(p => p.part.mesh?.deploy);
    if (!ps.length) return flash('No deployable solar panels');
    const open = !ps.every(p => p.deployed);
    if (open && v.q_dyn > 2000) return flash('Too much dynamic pressure to deploy the arrays');
    for (const p of ps) p.deployed = open; flash(open ? 'Solar arrays deploying' : 'Solar arrays retracting');
  }
  toggleMap() { this.mapMode = !this.mapMode; this.map.show(this.mapMode); if (this.mapMode) { this.savedDist = this.cam.dist; this.cam.dist = Math.max(this.vessel.body.radius * 4, 5e6); } else this.cam.dist = this.savedDist || 30; }
  cycleCam() { this.camMode = this.camMode === 'chase' ? 'free' : 'chase'; flash('Camera: ' + this.camMode); }
  toggleWarpDrive() {
    const v = this.vessel; const wd = v.livingParts().find(p => p.part.warp);
    if (!wd) return flash('No warp field generator on this vessel');
    const star = this.G.sys.star; const dStar = v.galactic ? Infinity : this.absPos().dist(star.posAt(this.G.t));
    if (!v.warp.on && dStar < 200 * AU) return flash('Warp field unstable: travel beyond 200 AU from the star first');
    const power = v.powerAvailable({ solarFlux: 0 });
    if (!v.warp.on && power < 1000) return flash('Warp field needs ≥ 1 MW of power (add a reactor)');
    v.warp.on = !v.warp.on;
    if (v.warp.on) { this.warpUI(); flash('Warp field engaged'); } else { this.warpPanel?.remove(); flash('Warp field collapsed'); v.v.copy(v.preWarpV || v.v); }
  }
  warpUI() {
    const v = this.vessel; this.warpPanel?.remove();
    const lbl = h('span.mono', {}, v.warp.factor + '× c');
    const inp = h('input', { type: 'range', min: 0, max: 3, step: 0.01, value: Math.log10(v.warp.factor), oninput: (e) => { v.warp.factor = Math.round(Math.pow(10, +e.target.value)); lbl.textContent = v.warp.factor + '× c'; } });
    this.warpPanel = h('div.panel', { style: { position: 'fixed', top: '56px', left: '50%', transform: 'translateX(-50%)', padding: '6px 10px' } }, h('div.row', {}, 'Warp factor', inp, lbl));
    mount(this.warpPanel);
  }
  async pauseMenu() {
    const G = this.G; const v = this.vessel;
    const canRecover = v.body && v.body.name === 'Earth' && (v.landed || v.situation === 'landed' || v.situation === 'splashed') && G.sys.starId === 'sol';
    const sandbox = G.game.mode !== 'career';
    const r = await modal('Flight menu', `<div class="dim">${v.name} — ${v.situation} at ${v.body ? v.body.name : 'interstellar space'}</div>`,
      [{ label: 'Resume' }, { label: 'Save', value: 'save' }, sandbox && !v.galactic ? { label: '✦ Teleport', value: 'tp' } : null, canRecover ? { label: 'Recover vessel', value: 'recover', primary: true } : null, this.launchParams ? { label: 'Revert to launch', value: 'revert' } : null,
        this.launchParams ? { label: 'Revert to VAB', value: 'vab' } : null, { label: 'Graphics', value: 'gfx' }, { label: 'Tracking Station', value: 'track' }, { label: 'Space Centre', value: 'center' }].filter(Boolean));
    if (r === 'save') G.save();
    if (r === 'tp') this.teleportDialog();
    if (r === 'gfx') graphicsDialog();
    if (r === 'recover') this.recover();
    if (r === 'revert') { this.removeVessel(); this.leave(['flight', this.launchParams]); }
    if (r === 'vab') { this.removeVessel(); this.leave(['vab']); }
    if (r === 'track') G.go('tracking');
    if (r === 'center') G.go('center');
  }
  removeVessel() {
    const G = this.G; const v = this.vessel; if (G.game.recs) delete G.game.recs[v.id];
    G.game.vessels = G.game.vessels.filter(x => x.id !== v.id);
    for (const n of v.crew) { const a = G.game.roster.find(r => r.name === n); if (a) a.status = 'available'; }
    this.vessel = null;
  }
  recover() {
    const G = this.G; const v = this.vessel; const g = G.game;
    let msg = null;
    if (isCareer(g)) { // parts come back for a refund; recovery contracts complete here
      const refund = Math.round(v.livingParts().reduce((c, p) => c + (p.part.cost || 0), 0) * 0.8);
      g.funds += refund; this.careerTick(0, { recovered: true, crewed: v.crew.length > 0 });
      msg = `Recovered ${v.name}: +${fmtFunds(refund)} refund (80% of the parts that came back)`;
      delete g.recs?.[v.id];
    }
    for (const n of v.crew) { const a = g.roster.find(r => r.name === n); if (a) { a.status = 'available'; a.missions++; a.xp += 1; } }
    g.vessels = g.vessels.filter(x => x.id !== v.id);
    this.vessel = null; flash(msg || 'Vessel recovered', msg ? 5000 : 2500); G.go('center');
  }
  // ------------------------------------------------------------------ EVA / flags
  // Crew seating: fill each crew part in vessel order
  seats(v = this.vessel) {
    const out = []; let k = 0;
    for (const p of v.livingParts()) if (p.part.crew) { const names = v.crew.slice(k, k + p.part.crew); k += p.part.crew; out.push({ part: p, names }); }
    return out;
  }
  // hatch position on a crew part (vessel-local, relative to the vessel's centre of mass) + outward dir
  hatchOf(v, p) {
    const pl = p.pl, part = p.part; const h = part.h || 1;
    const rr = ((part.dTop ?? part.d) * 0.45 + (part.d || 1) * 0.55) / 2;
    const a = (pl.ang || 0) + Math.PI / 2; const out = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const local = new THREE.Vector3(pl.pos[0], pl.pos[1] - h * 0.55, pl.pos[2]).addScaledVector(out, rr + 0.45).sub(new THREE.Vector3(...v.com));
    return { local, out };
  }
  eva(name) {
    const G = this.G; const v = this.vessel;
    if (v.type === 'eva') return this.board();
    if (!v.crew.length) return flash('No crew aboard');
    if (v.situation === 'flying' && v.v.clone().sub(v.body.surfaceVel(v.r)).len() > 5) return flash('Too fast for EVA');
    name = name && v.crew.includes(name) ? name : v.crew[0];
    const seat = this.seats(v).find(s => s.names.includes(name)) || this.seats(v)[0];
    v.crew = v.crew.filter(n => n !== name);
    this.persist();
    const e = new Vessel({ name, root: newNode('eva_bean') }, { type: 'eva', crew: [name] });
    e.name = name; e.body = v.body;
    const hatch = seat ? this.hatchOf(v, seat.part) : { local: new THREE.Vector3(v.maxR + 1.2, 0, 0), out: new THREE.Vector3(1, 0, 0) };
    const wl = hatch.local.clone().applyQuaternion(v.q), wo = hatch.out.clone().applyQuaternion(v.q);
    e.r = v.r.clone().add(new V3(wl.x, wl.y, wl.z)); e.v = v.v.clone(); e.rcs = true; e.sas = true;
    // face the hull, head toward the ship's nose
    const up = vesselUp(v); const inward = wo.clone().negate();
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(up, inward).normalize(), up, inward);
    e.q.setFromRotationMatrix(m);
    if (v.landed || v.contact) {
      const upr = e.r.clone().norm(); const hgt = v.body.surfaceHeightAt(e.r, G.t); e.r = upr.scale(v.body.radius + hgt + 0.92);
      e.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(upr.x, upr.y, upr.z)); this.lockLanded(e, G.t); e.landed = true;
    } else e.grab = { ship: v.id, local: hatch.local.toArray(), qRel: v.q.clone().invert().multiply(e.q).toArray() };
    e.suited = true;
    G.game.vessels.push(e.serialize()); Object.assign(G.game.vessels[G.game.vessels.length - 1], { starId: G.sys.starId, t: G.t });
    this.addOther(v, G.t);
    this.vessel = e; G.game.activeVessel = e.id;
    this.buildMesh(); this.cam.dist = 6; this.cam.minDist = 1.5;
    flash(e.grab ? `${name} is holding the handrail · WASD / jetpack to let go, F to board` : `${name} is on EVA · WASD to move, F to board`);
  }
  board() {
    const G = this.G; const e = this.vessel;
    let best = null, bd = 25;
    for (const o of this.others) { if (o.v.type === 'eva' || o.v.body !== e.body) continue; const dist = o.v.r.dist(e.r); if (dist < bd) { bd = dist; best = o; } }
    if (!best) return flash('Get within 25 m of a vessel to board');
    const target = best.v;
    if (target.crew.length >= target.crewCap) return flash('No free seats');
    target.crew.push(e.crew[0]);
    this.removeOther(best);
    G.game.vessels = G.game.vessels.filter(x => x.id !== e.id && x.id !== target.id);
    this.vessel = target; this.persist(); G.game.activeVessel = target.id; this.buildMesh(); this.cam.dist = Math.max(15, target.height * 1.8); this.cam.minDist = 3;
    flash(`${e.crew[0]} boarded ${target.name}`);
  }
  // ------------------------------------------------------------------ other vessels near the active one
  loadOthers() {
    const G = this.G, v = this.vessel;
    for (const o of this.others || []) this.root.remove(o.mesh);
    this.others = [];
    if (!v || v.galactic) return;
    for (const d of G.game.vessels) {
      if (d.id === v.id || d.galactic || (d.starId || 'sol') !== G.sys.starId || d.body !== v.body?.name) continue;
      const ov = Vessel.deserialize(d, G.sys); if (!ov.body) continue;
      if (d.suited === false) ov.suited = false;
      if (d.dock) ov.dock = d.dock;
      const o = this.addOther(ov, d.t ?? G.t);
      if (!(ov.dock && ov.dock.to === v.id)) this.updateOther(o);
      if (o.v.r.dist(v.r) > 30e3 && !(ov.dock && ov.dock.to === v.id)) this.removeOther(o);
    }
    // a docked pair saved the other way round (we switched to the passive vessel): make the active one the carrier
    const mine = G.game.vessels.find(x => x.id === v.id);
    if (mine && mine.dock) {
      const o = this.others.find(x => x.v.id === mine.dock.to);
      if (o) { const d = mine.dock; const qA = new THREE.Quaternion().fromArray(d.qRel);
        // we were at local d.local / qRel in the carrier's frame: invert that relation
        const qi = qA.clone().invert(); const l = new THREE.Vector3(...d.local).applyQuaternion(qi).negate();
        o.v.dock = { to: v.id, local: l.toArray(), qRel: qi.toArray() }; this.followDock(o); }
      v.dock = null; mine.dock = null;
    }
  }
  addOther(ov, t0) {
    let mesh, astro = null;
    if (ov.type === 'eva') { astro = new Astronaut({}); astro.setSuit(ov.suited !== false); mesh = new THREE.Group(); mesh.add(astro.group); astro.group.position.set(0, -0.92, 0); astro.state = ov.landed ? 'idle' : 'float'; }
    else {
      mesh = buildVesselMesh(ov.placed);
      mesh.userData.parts.forEach((m, i) => { m.userData.rt = ov.parts[i]; m.visible = ov.parts[i].attached && !ov.parts[i].broken; const pl = m.userData.placed; m.position.set(pl.pos[0] - ov.com[0], pl.pos[1] - ov.com[1], pl.pos[2] - ov.com[2]); });
    }
    mesh.userData.other = ov;
    this.root.add(mesh);
    const o = { v: ov, mesh, astro, orbit: ov.landed ? null : Orbit.fromState(ov.body.mu, ov.r, ov.v, t0) };
    this.others.push(o); return o;
  }
  removeOther(o) { this.root.remove(o.mesh); this.others = this.others.filter(x => x !== o); }
  updateOther(o) {
    const G = this.G, ov = o.v;
    if (ov.dock && this.vessel && ov.dock.to === this.vessel.id) { this.followDock(o); return; }
    if (ov.landed && ov.landedBF) this.syncLanded(ov, G.t);
    else if (o.orbit) o.orbit.stateAt(G.t, ov.r, ov.v);
  }
  // ------------------------------------------------------------------ vessel-vessel contact & docking
  // world-frame spheres roughly covering each attached part, and docking ports' faces
  partSpheres(v) {
    const out = [];
    for (const p of v.livingParts()) {
      const h = p.part.h || 1, rr = Math.max(p.part.d || 0.5, p.part.d2 || 0) / 2;
      const loc = new THREE.Vector3(p.pl.pos[0] - v.com[0], p.pl.pos[1] - h / 2 - v.com[1], p.pl.pos[2] - v.com[2]);
      const c = loc.clone().applyQuaternion(v.q);
      const e = { p, c: new V3(v.r.x + c.x, v.r.y + c.y, v.r.z + c.z), r: Math.max(0.3, Math.min(rr, h * 0.75) * 0.95) };
      if (p.part.dock) { // the port faces away from the rest of its vessel along the stack axis
        const s = Math.sign(p.pl.pos[1] - h / 2 - v.com[1]) || 1;
        const f = new THREE.Vector3(0, s, 0).applyQuaternion(v.q);
        e.face = f; e.fc = new V3(e.c.x + f.x * h / 2, e.c.y + f.y * h / 2, e.c.z + f.z * h / 2);
      }
      out.push(e);
    }
    return out;
  }
  dockMass() { let m = 0; for (const o of this.others) if (o.v.dock && o.v.dock.to === this.vessel.id) m += o.v.mass; return m; }
  followDock(o) {
    const v = this.vessel, ov = o.v, d = ov.dock;
    const l = new THREE.Vector3(...d.local).applyQuaternion(v.q);
    ov.r = v.r.clone().add(new V3(l.x, l.y, l.z)); ov.v = v.v.clone(); ov.body = v.body;
    ov.q.copy(v.q).multiply(new THREE.Quaternion().fromArray(d.qRel)); ov.w.set(0, 0, 0); ov.landed = v.landed;
  }
  // bump into (and dock with) nearby vessels; called once per physics frame
  vesselContacts() {
    const v = this.vessel;
    if (!v || v.type === 'eva' || v.landed || !this.others.length) return;
    let A = null;
    for (const o of this.others) {
      const ov = o.v; if (ov.type === 'eva' || ov.body !== v.body || (ov.dock && ov.dock.to === v.id)) continue;
      this.updateOther(o); // bring it to this instant (at orbital speed a frame-old position is ~250 m off)
      const reach = (v.height + v.maxR) + (ov.height + ov.maxR);
      if (ov.r.dist(v.r) > reach) continue;
      A = A || this.partSpheres(v); const B = this.partSpheres(ov);
      // docking: two free ports face to face, close, slow
      const rel = v.v.clone().sub(ov.v);
      for (const a of A) if (a.face && !this.portBusy(v, a.p)) for (const b of B) if (b.face && !this.portBusy(ov, b.p)) {
        const gap = a.fc.dist(b.fc), align = a.face.dot(b.face);
        if (ov.undocking) { if (gap > 1.0) ov.undocking = false; continue; } // just undocked: drift clear first
        if (gap < 0.35 + 0.25 * Math.min(a.r, b.r) && align < -0.96 && rel.len() < 1.2) { this.dock(o, a, b); return; }
      }
      // otherwise the hulls push each other apart (a simple impulse between overlapping part spheres)
      const ma = (v.mass + this.dockMass()) * 1000, mb = ov.landed ? Infinity : ov.mass * 1000;
      let hit = false;
      for (const a of A) for (const b of B) {
        const dx = a.c.x - b.c.x, dy = a.c.y - b.c.y, dz = a.c.z - b.c.z; const d = Math.hypot(dx, dy, dz), pen = a.r + b.r - d;
        if (pen <= 0 || d < 1e-6) continue;
        const n = new V3(dx / d, dy / d, dz / d); const vn = v.v.clone().sub(ov.v).dot(n);
        const inv = 1 / ma + 1 / mb; const k = 1 / ma / inv;
        v.r.addScaled(n, pen * k); if (mb !== Infinity) ov.r.addScaled(n, -pen * (1 - k));
        if (vn < 0) {
          const j = -(1 + 0.25) * vn / inv; v.v.addScaled(n, j / ma); if (mb !== Infinity) ov.v.addScaled(n, -j / mb);
          if (-vn > 12) { a.p.broken = true; v.crashPart = a.p; } // a real crash, not a bump
        }
        hit = true;
      }
      if (hit && !ov.landed) o.orbit = Orbit.fromState(ov.body.mu, ov.r, ov.v, this.G.t);
    }
  }
  portBusy(v, p) { return (v.dockPorts || []).includes(p.id ?? p.uid ?? p) || (p.dockedWith != null); }
  dock(o, a, b) {
    const G = this.G, v = this.vessel, ov = o.v;
    // snap: the other vessel turns so the ports are exactly face to face, then moves so their faces meet
    const qAlign = new THREE.Quaternion().setFromUnitVectors(b.face.clone(), a.face.clone().negate());
    ov.q.premultiply(qAlign);
    const B2 = this.partSpheres(ov).find(e => e.p === b.p);
    ov.r.add(new V3(a.fc.x - B2.fc.x, a.fc.y - B2.fc.y, a.fc.z - B2.fc.z));
    // momentum: the pair moves on together
    const ma = v.mass + this.dockMass(), mb = ov.mass; const vv = v.v.clone().scale(ma).add(ov.v.clone().scale(mb)).scale(1 / (ma + mb)); v.v.copy(vv);
    const qi = v.q.clone().invert(); const l = new THREE.Vector3(ov.r.x - v.r.x, ov.r.y - v.r.y, ov.r.z - v.r.z).applyQuaternion(qi);
    ov.dock = { to: v.id, local: l.toArray(), qRel: qi.multiply(ov.q.clone()).toArray() };
    a.p.dockedWith = ov.id; b.p.dockedWith = v.id;
    flash(`Docked with ${ov.name}!`, 4000);
    this.toastDock?.(ov);
    if (isCareer(G.game)) { const rec = this.rec(); if (rec) rec.docked = true; this.careerTick(0, { docked: true }); }
    this.persist();
  }
  undock(p) {
    const v = this.vessel;
    const o = this.others.find(x => x.v.dock && x.v.dock.to === v.id && (x.v.id === p.dockedWith || x.v.livingParts().some(q => q.dockedWith === v.id)));
    if (!o) { p.dockedWith = null; return flash('Nothing docked here'); }
    const ov = o.v; const port = this.partSpheres(v).find(e => e.p === p);
    const push = port && port.face ? port.face : new THREE.Vector3(0, 1, 0);
    ov.dock = null; ov.undocking = true; p.dockedWith = null; for (const q of ov.livingParts()) if (q.dockedWith === v.id) q.dockedWith = null;
    ov.v = v.v.clone().add(new V3(push.x * 0.3, push.y * 0.3, push.z * 0.3)); v.v.addScaled(new V3(push.x, push.y, push.z), -0.3 * ov.mass / Math.max(v.mass, 0.01));
    o.orbit = Orbit.fromState(ov.body.mu, ov.r, ov.v, this.G.t);
    flash(`Undocked from ${ov.name}`); this.persist();
  }
  // ------------------------------------------------------------------ right-click / long-press part menus
  pickMenu(x, y) {
    const G = this.G; const r = G.world.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), G.world.camera);
    const targets = [this.mesh, ...this.others.map(o => o.mesh)].filter(Boolean);
    const hits = this.ray.intersectObjects(targets, true).filter(h => h.object.visible);
    if (!hits.length) return;
    let o = hits[0].object; let placed = null; let owner = null;
    for (let q = o; q; q = q.parent) { if (!placed && q.userData.placed) placed = q.userData.placed; if (q.userData.other) { owner = q.userData.other; break; } if (q === this.mesh) { owner = this.vessel; break; } }
    const v = owner || this.vessel;
    if (v.type === 'eva') return this.astroMenu(v, x, y);
    const p = v.parts.find(pp => pp.pl === placed); if (!p) return;
    this.partMenu(v, p, x, y);
  }
  menuShell(title, x, y) {
    document.querySelector('.part-menu')?.remove();
    const body = h('div.col');
    const el = h('div.part-menu.panel', {}, h('div.pm-title', {}, h('b', {}, title), h('button.pm-x', { onclick: () => el.remove() }, '✕')), body);
    el.style.left = Math.min(x + 10, innerWidth - 300) + 'px'; el.style.top = Math.min(y + 10, innerHeight - 340) + 'px';
    mount(el); return { el, body };
  }
  partMenu(v, p, x, y) {
    const active = v === this.vessel; const part = p.part;
    const { el, body } = this.menuShell(part.name, x, y);
    const refresh = () => { el.remove(); this.partMenu(v, p, x, y); };
    body.append(h('div.small.dim', {}, 'Based on: ' + part.basis));
    if (!active) body.append(h('div.small', { style: { color: '#fcd34d' } }, 'Part of ' + v.name + ' (not the active vessel)'));
    if (part.prop) body.append(h('div.small', {}, `${PROPS[part.prop.type].name}: ${(p.fuel).toFixed(2)} / ${part.prop.mass.toFixed(2)} t`), h('div.bar', { style: { width: '100%' } }, h('i', { style: { width: (p.fuel / part.prop.mass * 100).toFixed(0) + '%' } })));
    if (part.engine && active) {
      body.append(h('div.small', {}, p.active ? (p.flameout ? 'Flameout — no propellant' : 'Engine active') : 'Engine shut down'));
      if (!part.engine.solid) {
        body.append(h('button', { onclick: () => { p.active = !p.active; refresh(); } }, p.active ? 'Shut down engine' : 'Activate engine'));
        const out = h('span.mono', {}, Math.round((p.limit ?? 1) * 100) + '%');
        body.append(h('div.pm-row', {}, h('span', {}, 'Thrust limit'), h('input', { type: 'range', min: 0, max: 100, step: 5, value: (p.limit ?? 1) * 100, oninput: (e) => { p.limit = e.target.value / 100; out.textContent = e.target.value + '%'; } }), out));
      }
    }
    if (part.decoupler && active && p.attached) body.append(h('button.danger', { onclick: () => { const oldCom = v.com.slice(); const lost = v.separateAt(p); this.spawnDebris(lost, oldCom); this.applyDetach(); el.remove(); flash('Decoupled'); } }, 'Decouple'));
    if (part.dock && active && p.dockedWith != null) body.append(h('button', { onclick: () => { this.undock(p); el.remove(); } }, 'Undock'));
    else if (part.dock && active) body.append(h('div.small.dim', {}, 'Docking port: approach another port face-to-face below 1 m/s to dock.'));
    if (part.chute && active) body.append(h('button', { onclick: () => { p.deployed = true; refresh(); flash('Parachute armed'); } }, p.deployed ? 'Parachute armed' : 'Deploy parachute'));
    if (part.science && active && isCareer(this.G.game) && v.body) { const e = this.experiments().find(x => x.kind === part.science); if (e) body.append(h('button' + (e.tp ? '.primary' : ''), { onclick: () => { this.runExp(e); refresh(); } }, e.tp ? `Run ${e.name} (+${e.tp} TP)` : `${e.name}: ${e.ok ? 'done here' : 'n/a here'}`)); }
    if (part.mesh?.deploy && active) body.append(h('button', { onclick: () => { p.deployed = !p.deployed; refresh(); } }, p.deployed ? 'Retract solar array' : 'Deploy solar array'));
    if (part.crew) {
      const seat = this.seats(v).find(s => s.part === p);
      body.append(h('div.small', { style: { marginTop: '4px' } }, h('b', {}, `Crew (${seat ? seat.names.length : 0}/${part.crew})`)));
      for (const n of seat ? seat.names : []) {
        const a = this.G.game.roster.find(r => r.name === n);
        body.append(h('div.crew-row', {}, h('span', {}, n, a ? h('span.tag', {}, a.trait) : null), active ? h('button', { onclick: () => { el.remove(); this.eva(n); } }, 'EVA') : null));
      }
      if (!seat || !seat.names.length) body.append(h('div.small.dim', {}, 'No one aboard this module.'));
    }
  }
  astroMenu(v, x, y) {
    const active = v === this.vessel; const { el, body } = this.menuShell(v.crew[0] || v.name, x, y);
    const a = this.G.game.roster.find(r => r.name === v.crew[0]);
    if (a) body.append(h('div.small.dim', {}, `${a.trait} · ${a.missions} missions`));
    const alt = v.r.len() - v.body.radius;
    const canBreathe = v.body.breathable && alt < 4000;
    if (!active) { body.append(h('div.small.dim', {}, 'Switch to this Bean to give orders.')); return; }
    if (canBreathe) body.append(h('button', { onclick: () => { v.suited = !(v.suited !== false); if (this.astro) this.astro.setSuit(v.suited); el.remove(); flash(v.suited ? 'Helmet on' : 'Helmet off — fresh air!'); } }, v.suited !== false ? 'Take off helmet & suit' : 'Put suit & helmet on'));
    else body.append(h('div.small.dim', {}, v.body.atmo && !v.body.atmo.gas ? 'This air is not breathable — the suit stays on.' : 'No atmosphere — the suit stays on.'));
    if (v.grab) body.append(h('button', { onclick: () => { v.grab = null; el.remove(); flash('Let go of the handrail'); } }, 'Let go of the handrail'));
    if (v.landed) body.append(h('button', { onclick: () => { el.remove(); this.plantFlag(); } }, 'Plant flag'));
    body.append(h('button', { onclick: () => { el.remove(); this.board(); } }, 'Board nearest vessel'));
  }
  plantFlag() {
    const G = this.G; const v = this.vessel;
    if (v.type !== 'eva' || !v.landed) return flash('Go on EVA and stand on the surface to plant a flag');
    const up = v.r.clone().norm(); const q = v.body.rotAt(G.t).invert();
    const p = new THREE.Vector3(v.r.x, v.r.y, v.r.z).applyQuaternion(q); const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.q).applyQuaternion(q);
    const f = { body: v.body.name, star: G.sys.starId, bf: [p.x + fwd.x, p.y + fwd.y, p.z + fwd.z], by: v.crew[0], t: G.t };
    G.game.flags.push(f); this.spawnFlag(f);
    if (this.astro) { this.astro.state = 'plant'; setTimeout(() => this.astro && (this.astro.state = 'wave'), 1500); setTimeout(() => this.astro && (this.astro.state = 'idle'), 5000); }
    flash(`${v.crew[0]} planted a flag on ${v.body.name}!`);
  }
  spawnFlag(f) {
    if ((f.star || 'sol') !== this.G.sys.starId) return;
    const b = this.G.sys.get(f.body); if (!b) return;
    const flag = makeFlag(); flag.userData.f = f; flag.userData.body = b; this.flags.push(flag);
  }
  // ------------------------------------------------------------------ maneuver nodes
  nodePanel() {
    const v = this.vessel; if (!v.body || v.landed) return flash('Maneuver nodes need an orbit');
    if (this.nodeUI) { this.nodeUI.remove(); this.nodeUI = null; this.plan = null; return; }
    const o = Orbit.fromState(v.body.mu, v.r, v.v, this.G.t);
    this.node = { dt: o.e < 1 ? o.timeToAp(this.G.t) : 60, pro: 0, nrm: 0, rad: 0 };
    const mk = (k, lbl) => { const out = h('span.mono', {}, '0'); const inp = h('input', { type: 'range', min: -1, max: 1, step: 0.001, value: 0, style: { width: '120px' }, oninput: (e) => { const x = +e.target.value; this.node[k] = Math.sign(x) * Math.pow(Math.abs(x), 3) * 5000; out.textContent = this.node[k].toFixed(1); } }); return h('div.row', {}, h('span', { style: { width: '70px' } }, lbl), inp, out); };
    const tLbl = h('span.mono', {}, '');
    const tInp = h('input', { type: 'range', min: 0, max: 1, step: 0.0005, value: 0.25, style: { width: '120px' }, oninput: (e) => { const P = isFinite(o.period) ? o.period : 86400 * 30; this.node.dt = +e.target.value * P * (isFinite(o.period) ? 1 : 1); } });
    this.nodeInfo = h('div.small.mono');
    this.nodeUI = h('div.panel', { style: { position: 'fixed', left: '8px', top: '240px', padding: '8px', zIndex: 5 } }, h('b', {}, 'Maneuver node'), h('div.row', {}, h('span', { style: { width: '70px' } }, 'Time'), tInp, tLbl), mk('pro', 'Prograde'), mk('nrm', 'Normal'), mk('rad', 'Radial'),
      h('div.row', {}, h('button', { onclick: () => { this.node.dt = o.timeToAp(this.G.t); } }, 'At Ap'), h('button', { onclick: () => { this.node.dt = o.timeToPe(this.G.t); } }, 'At Pe'), h('button', { onclick: () => { this.nodePanel(); } }, 'Delete')), this.nodeInfo);
    this.nodeT0 = this.G.t; mount(this.nodeUI); this.nodeTLbl = tLbl;
    if (!this.mapMode) this.toggleMap();
  }
  updatePlan() {
    if (!this.node) { this.plan = null; return; }
    const v = this.vessel; const t = this.nodeT0 + this.node.dt;
    if (t < this.G.t) { this.node.dt = this.G.t - this.nodeT0 + 1; }
    const o = Orbit.fromState(v.body.mu, v.r, v.v, this.G.t);
    const r = new V3(), vv = new V3(); o.stateAt(t, r, vv);
    const pro = vv.clone().norm(), nrm = r.clone().cross(vv).norm(), rad = nrm.clone().cross(pro).norm();
    const dv = pro.clone().scale(this.node.pro).addScaled(nrm, this.node.nrm).addScaled(rad, this.node.rad);
    this.plan = { body: v.body, r, v: vv.clone().add(dv), t, dv };
    const mag = dv.len(); const a = v.thrustMax ? v.thrustMax / (v.mass * 1000) : 0;
    this.nodeTLbl.textContent = 'T-' + fmtTime(t - this.G.t);
    this.nodeInfo.textContent = `Δv ${mag.toFixed(1)} m/s · burn ${a > 0 ? fmtTime(mag / a) : '—'} · remaining Δv ${v.stageDeltaV().toFixed(0)} m/s`;
    this.nodeDir = new THREE.Vector3(dv.x, dv.y, dv.z).normalize();
  }
  // ------------------------------------------------------------------ simulation
  absPos() { const v = this.vessel; return v.body.posAt(this.G.t).clone().add(v.r); }
  update(dt) {
    if (!this.active || !this.vessel || this.dead) return;
    const G = this.G, v = this.vessel;
    this.handleInput(dt);
    const warp = WARPS[this.warpI];
    if (this.warpI > PHYS_MAX && !this.canRails()) this.setWarp(PHYS_MAX);
    let simDt = dt * warp;
    if (v.galactic) this.stepGalactic(simDt);
    else if (this.warpI > PHYS_MAX) this.stepRails(simDt);
    else this.stepPhysics(simDt);
    this.stepDebris(dt * warp);
    this.render(dt, WARPS[this.warpI] <= WARPS[PHYS_MAX] ? warp : 0);
    if ((this.hudT += dt) > 0.1) { this.hudT = 0; this.updateHUD(); }
    this.careerDt += simDt; if ((this.careerT += dt) > 0.25) { this.careerT = 0; this.careerTick(this.careerDt); this.careerDt = 0; }
  }
  // ------------------------------------------------------------------ career
  rec(v = this.vessel) { const g = this.G.game; if (!isCareer(g) || !v) return null; g.recs ||= {}; return (g.recs[v.id] ||= newFlightRecord()); }
  careerTick(dt, event) {
    const G = this.G, g = G.game, v = this.vessel; const rec = this.rec(); if (!rec) return;
    if (!event) trackFlight(rec, v, dt);
    for (const a of checkAchievements(g, rec)) toast(a.name, `${a.desc} · +${a.tp} TP`, 'ach', 5500);
    for (const c of checkContracts(g, rec, v, event)) toast('Contract complete: ' + c.title, `+${fmtFunds(c.pay)} · +${c.tp} TP`, 'contract', 6000);
  }
  // experiments this vessel can run right now: [{kind, name, tp, part}]
  experiments(v = this.vessel) {
    const g = this.G.game; if (!isCareer(g) || !v || v.galactic || !v.body) return [];
    const sit = situationOf(v); const out = []; const seen = new Set();
    const add = (kind, part) => { if (seen.has(kind) || !EXPERIMENTS[kind]) return; seen.add(kind); out.push({ kind, part, name: EXPERIMENTS[kind].name, tp: sciValue(g, kind, v.body, sit), ok: expAllowed(kind, sit, v.body), sit }); };
    if (v.type === 'eva') add('eva', null);
    else { for (const p of v.livingParts()) if (p.part.science) add(p.part.science, p); if (v.crew.length) add('crew', null); }
    return out;
  }
  runExp(e) {
    const G = this.G, g = G.game, v = this.vessel;
    const tp = runScience(g, e.kind, v.body, e.sit);
    if (!tp) return flash(e.ok ? `Already collected ${e.name.toLowerCase()} data ${sitText(e.sit, v.body.name)}` : `${e.name} doesn't work here`);
    toast(e.name, `${sitText(e.sit, v.body.name)} · +${tp} TP`, 'sci');
    this.careerTick(0, { science: { kind: e.kind, body: v.body.name, sit: e.sit } });
  }
  sciencePanel() {
    const v = this.vessel; document.querySelector('.part-menu')?.remove();
    const { el, body } = this.menuShell('🔬 Science · ' + sitText(situationOf(v), v.body.name), innerWidth / 2 - 150, 90);
    const list = this.experiments();
    if (!list.length) body.append(h('div.small.dim', {}, 'No experiments aboard. Add science parts in the VAB, or bring a Bean for crew reports.'));
    for (const e of list) body.append(h('div.sci-row', {}, h('span', {}, e.name), e.tp ? h('span.tp', {}, '+' + e.tp + ' TP') : h('span.small.dim', {}, e.ok ? 'done here' : 'n/a here'),
      h('button' + (e.tp ? '.primary' : ''), { disabled: e.tp ? undefined : true, onclick: () => { this.runExp(e); el.remove(); this.sciencePanel(); } }, 'Run')));
    body.append(h('div.small.dim', { style: { marginTop: '6px' } }, 'Each experiment pays once per situation (landed, flying low/high, in space near/high) per world. Rarer places pay far more.'));
  }
  handleInput(dt) {
    const v = this.vessel, G = this.G;
    if (hit('Space')) this.stage();
    if (hit('KeyT')) { v.sas = !v.sas; v.sasHold = null; }
    if (hit('KeyR')) v.rcs = !v.rcs;
    if (hit('KeyM')) this.toggleMap();
    if (hit('KeyV')) this.cycleCam();
    if (hit('KeyF')) this.eva();
    if (hit('KeyG')) { for (const p of v.livingParts()) if (p.part.chute) p.deployed = true; flash('Parachutes armed'); }
    if (hit('KeyP')) this.togglePanels();
    if (hit('KeyL')) this.toggleGear();
    if (hit('KeyB')) { v.brakes = !v.brakes; flash(v.brakes ? 'Brakes on' : 'Brakes off'); }
    if (hit('Period')) this.setWarp(this.warpI + 1);
    if (hit('Comma')) this.setWarp(this.warpI - 1);
    if (hit('Slash')) this.setWarp(0);
    if (hit('Escape')) this.pauseMenu();
    if (v.type !== 'eva') {
      if (down('ShiftLeft') || down('ShiftRight')) v.throttle = Math.min(1, v.throttle + dt * 0.8);
      if (down('ControlLeft') || down('ControlRight')) v.throttle = Math.max(0, v.throttle - dt * 0.8);
      if (hit('KeyZ')) v.throttle = 1; if (hit('KeyX')) v.throttle = 0;
    }
    const k = (a, b) => (down(a) ? 1 : 0) - (down(b) ? 1 : 0);
    if (v.type === 'eva') {
      v.input.pitch = 0; v.input.yaw = 0; v.input.roll = 0;
      const fwd = k('KeyW', 'KeyS') + (-touch.pitch), side = k('KeyD', 'KeyA') + touch.yaw, upd = k('ShiftLeft', 'ControlLeft');
      this.evaMove = { fwd: Math.max(-1, Math.min(1, fwd)), side: Math.max(-1, Math.min(1, side)), up: upd, jump: hit('Space') };
    } else {
      v.input.pitch = Math.max(-1, Math.min(1, k('KeyS', 'KeyW') + touch.pitch));
      v.input.yaw = Math.max(-1, Math.min(1, k('KeyA', 'KeyD') - touch.yaw));
      v.input.roll = Math.max(-1, Math.min(1, k('KeyE', 'KeyQ') + touch.roll));
      v.input.x = k('KeyL', 'KeyJ'); v.input.y = k('KeyI', 'KeyK'); v.input.z = k('KeyH', 'KeyN');
    }
    if (this.touchThrottle) this.touchThrottle.show(v.throttle);
  }
  ctx() {
    const G = this.G, v = this.vessel; const star = G.sys.star;
    const sp = star.posAt(G.t); const ap = this.absPos(); const d = ap.dist(sp);
    const starDir = new THREE.Vector3(ap.x - sp.x, ap.y - sp.y, ap.z - sp.z).normalize();
    let targetDir = null;
    return { t: G.t, starDir, starDist: d, starLum: star.lum ?? 1, solarFlux: (star.lum ?? 1) / Math.pow(d / AU, 2), laserOn: G.sys.starId === 'sol' && v.body.name === 'Earth' && v.r.len() < 1e8,
      speedVsStar: v.v.len(), nodeDir: this.nodeDir, targetDir, noCrash: false };
  }
  stepPhysics(simDt) {
    const G = this.G, v = this.vessel;
    if (v.type === 'eva' && v.grab) {
      const m = this.evaMove;
      const ship = this.others.find(o => o.v.id === v.grab.ship);
      if (!ship || (m && (m.fwd || m.side || m.up || m.jump))) { v.grab = null; if (ship) flash('Let go of the handrail'); }
      else {
        G.t += simDt; this.updateOther(ship);
        const l = new THREE.Vector3(...v.grab.local).applyQuaternion(ship.v.q);
        v.r = ship.v.r.clone().add(new V3(l.x, l.y, l.z)); v.v = ship.v.v.clone(); v.q.copy(ship.v.q).multiply(new THREE.Quaternion().fromArray(v.grab.qRel)); v.w.set(0, 0, 0);
        if (this.astro) this.astro.state = 'grab';
        return;
      }
    }
    if (v.landed) {
      // stay locked until something pushes us off the ground
      v.engineState(0, this.ctx());
      const g = v.body.mu / v.r.len2();
      const wantsLift = v.thrustN > v.mass * 1000 * g * 0.95 || (v.wheels && !v.gearUp && v.thrustN > 0 && !v.brakes) || (v.type === 'eva' && this.evaMove && (this.evaMove.jump || this.evaMove.fwd || this.evaMove.side)) || (v.type === 'eva' && this.evaMove && this.evaMove.up > 0);
      if (v.clamped || !wantsLift) {
        G.t += simDt;
        if (v.type === 'eva' && this.evaMove && (this.evaMove.fwd || this.evaMove.side)) { this.walk(simDt); }
        else this.syncLanded(v, G.t);
        if (v.clamped && v.throttle > 0) v.engineState(simDt, this.ctx());
        if (v.type === 'eva' && this.astro) this.astro.state = this.evaMove && (this.evaMove.fwd || this.evaMove.side) ? 'walk' : (this.astro.state === 'plant' || this.astro.state === 'wave' ? this.astro.state : 'idle');
        return;
      }
      v.landed = false;
      if (v.type === 'eva' && this.evaMove && this.evaMove.jump) { const up = v.r.clone().norm(); v.v.addScaled(up, 2.5); }
    }
    let n = Math.ceil(simDt / STEP); n = Math.min(n, 400);
    const h = simDt / n;
    const ctx = this.ctx();
    v.thrustMax = v.livingParts().reduce((s, p) => s + (p.active && p.part.engine ? p.part.engine.thrust * 1000 : 0), 0);
    ctx.extraMass = this.others.length ? this.dockMass() : 0; // docked vessels ride along (their mass counts)
    for (let i = 0; i < n; i++) {
      G.t += h; ctx.t = G.t;
      if (v.type === 'eva') this.evaThrust(h);
      physicsStep(v, h, ctx);
      if (v.crashPart) { this.crash(); return; }
      this.checkSOI();
      if (v.galactic) return;
    }
    this.vesselContacts();
    // Beans stand on their feet: once they touch down they are stood upright (keeping their heading) and
    // planted, instead of toppling over like a 1.85 m pencil on springs ("Beanier Beans" keeps the flop)
    if (v.type === 'eva' && !v.grab && v.body.hasSurface && !beanier()) {
      const up = v.r.clone().norm(); const agl = v.r.len() - v.body.radius - v.body.surfaceHeightAt(v.r, G.t) - 0.92;
      const vs = v.v.clone().sub(v.body.surfaceVel(v.r)).dot(up); const m = this.evaMove;
      if (agl < 0.25 && vs < 3 && !(m && m.up > 0)) {
        const U = new THREE.Vector3(up.x, up.y, up.z); const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.q).addScaledVector(U, -new THREE.Vector3(0, 0, 1).applyQuaternion(v.q).dot(U));
        const qUp = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), U);
        if (fwd.lengthSq() > 1e-6) { const look = new THREE.Vector3(0, 0, 1).applyQuaternion(qUp); fwd.normalize(); qUp.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(new THREE.Vector3().crossVectors(look, fwd).dot(U), look.dot(fwd)))); }
        v.q.copy(qUp); v.r = up.scale(v.body.radius + v.body.surfaceHeightAt(v.r, G.t) + 0.92); v.v.copy(v.body.surfaceVel(v.r)); v.w.set(0, 0, 0);
        this.lockLanded(v, G.t); this.settle = 0;
        if (this.astro) this.astro.state = 'idle';
        return;
      }
    }
    // settle onto the ground
    const surfV = v.v.clone().sub(v.body.surfaceVel(v.r));
    if (v.contact && surfV.len() < 0.4 && v.w.length() < 0.1 && (v.throttle === 0 || v.thrustN === 0)) { this.settle = (this.settle || 0) + simDt; if (this.settle > 1) { this.lockLanded(v, G.t); this.settle = 0; flash(`Landed on ${v.body.name}`); } } else this.settle = 0;
    this.stepHeating(simDt);
    if (v.recalcNeeded) { v.recalcNeeded = false; }
    if (v.type === 'eva' && this.astro) this.astro.state = v.contact ? 'walk' : 'float';
  }
  // Re-entry heating per part. The windward end takes the full flux and parts in its lee progressively
  // less; a heat shield leading the way (nose-on to the flow) protects everything behind it. A part that
  // overheats burns away together with whatever hangs off it, so an unshielded vehicle comes apart
  // piece by piece on the way down instead of exploding all at once.
  // how exposed each part is to the flow (1 = leading surface), for the re-entry glow: the same model as
  // the heating (depth behind the leading face, heat shields shadowing the parts behind them)
  plasmaExposure(v, fW) {
    const out = new Map(); const parts = v.livingParts(); if (!parts.length) return out;
    const f = fW.clone().applyQuaternion(v.q.clone().invert());
    const lead = (p) => { const h = p.part.h || 1, y0 = p.pl.pos[1] - h, y1 = p.pl.pos[1]; return Math.max(y0 * f.y, y1 * f.y) + p.pl.pos[0] * f.x + p.pl.pos[2] * f.z + (p.part.d || 1) * 0.5 * Math.sqrt(Math.max(0, 1 - f.y * f.y)); };
    let sMax = -Infinity; for (const p of parts) { p._ps = lead(p); sMax = Math.max(sMax, p._ps); }
    const shield = parts.find(p => p.part.heatshield && sMax - p._ps < 0.6); const shielded = shield && f.y < -0.82;
    const L = 1.2 * (v.maxR || 1) + 0.8;
    for (const p of parts) {
      let e = Math.exp(-(sMax - p._ps) / L) + 0.12 * (1 - Math.abs(f.y));
      if (shielded && p !== shield) e *= 0.3; // in the shield's wake: only the sheath and wake glow reach it
      out.set(p, Math.min(1.3, e * (1 + Math.min(1, p.heatH || 0) * 0.5)));
    }
    return out;
  }
  stepHeating(dt) {
    const v = this.vessel; if (!v || v.type === 'eva' || !v.body || !v.body.atmo || v.landed || dt <= 0) return;
    const parts = v.livingParts(); const flux = v.heat || 0;
    if (flux < 700 && !parts.some(p => p.heatH > 0)) return;
    const air = v.v.clone().sub(v.body.surfaceVel(v.r)); const sp = air.len(); if (sp < 1) return;
    const f = new THREE.Vector3(air.x, air.y, air.z).applyQuaternion(v.q.clone().invert()).divideScalar(sp); // direction of travel, vessel frame
    const lead = (p) => { const h = p.part.h || 1, y0 = p.pl.pos[1] - h, y1 = p.pl.pos[1]; return Math.max(y0 * f.y, y1 * f.y) + p.pl.pos[0] * f.x + p.pl.pos[2] * f.z + (p.part.d || 1) * 0.5 * Math.sqrt(Math.max(0, 1 - f.y * f.y)); };
    let sMax = -Infinity, leader = null; for (const p of parts) { const s = lead(p); p._s = s; if (s > sMax) { sMax = s; leader = p; } }
    const shield = parts.find(p => p.part.heatshield && sMax - p._s < 0.6);
    const shielded = shield && f.y < -0.82; // shields sit on a capsule's base: they only work travelling base-first
    const L = 1.2 * (v.maxR || 1) + 0.8;
    let lost = null;
    for (const p of parts) {
      let expo = Math.exp(-(sMax - p._s) / L) + 0.12 * (1 - Math.abs(f.y));
      if (shielded && p !== shield) expo *= 0.04;
      let cap = 2600 * (0.6 + Math.sqrt(Math.max(p.part.mass || 0.3, 0.05)));
      if (p.part.heatshield) cap *= 30;
      if (p.part.heatTol) cap *= p.part.heatTol;
      // only re-entry-class heating does damage (ascent through max-Q peaks well below this); cools slowly
      const net = flux * expo - 700;
      p.heatH = Math.max(0, (p.heatH || 0) + (net > 0 ? net / cap : -0.04) * dt);
      if (p.heatH > 1 && !lost) lost = p;
    }
    if (!lost) return;
    const all = v.livingParts().length;
    const wr = this.partWorldR(lost); const oldCom = v.com.slice();
    const group = v.breakOff(lost);
    this.explosion(wr, v.body, Math.max(2, (lost.part.d || 1) * 0.8));
    if (group.length >= all || !v.livingParts().length) { lost.broken = true; lost.attached = true; v.recalc(); v.crashPart = lost; this.crash(); return; }
    this.spawnDebris(group, oldCom); this.applyDetach();
    flash(`${lost.part.name} burned up!`);
  }
  // body-centred inertial position of a part's centre
  partWorldR(p) {
    const v = this.vessel; const h = p.part.h || 1;
    const o = new THREE.Vector3(p.pl.pos[0] - v.com[0], p.pl.pos[1] - h / 2 - v.com[1], p.pl.pos[2] - v.com[2]).applyQuaternion(v.q);
    const r = v.r.clone(); r.x += o.x; r.y += o.y; r.z += o.z; return r;
  }
  // parts glow red to white-hot as they heat up (per-part material copies, created on first need)
  updateHullGlow() {
    for (const m of this.mesh.userData.parts || []) {
      const rt = m.userData.rt; const H = rt.heatH || 0;
      if (H < 0.03 && !m.userData.hot) continue;
      if (!m.userData.hot) {
        m.userData.hot = [];
        m.traverse(o => { if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial || o.userData.U) return;
          const c = o.material.clone(); if (o.material.userData.frostU) frostPatch(c, o.material.userData.frostU);
          o.material = c; m.userData.hot.push(c); });
      }
      const col = blackbody(900 + 1500 * Math.min(1, H)); const k = Math.min(1, H) ** 2 * 4 * (rt.part.heatshield ? 1.5 : 1);
      for (const c of m.userData.hot) { c.emissive.setRGB(col[0], col[1], col[2]); c.emissiveIntensity = k; }
    }
  }
  walk(dt) {
    const v = this.vessel, G = this.G, B = v.body; const m = this.evaMove;
    const up = v.r.clone().norm();
    const g = B.mu / v.r.len2(); const speed = g < 4 ? 1.8 : 1.5;
    // move relative to camera heading
    const camF = new THREE.Vector3(); G.world.camera.getWorldDirection(camF);
    const U = new THREE.Vector3(up.x, up.y, up.z);
    const f = camF.clone().addScaledVector(U, -camF.dot(U)).normalize(); const r = new THREE.Vector3().crossVectors(f, U);
    const dir = f.multiplyScalar(m.fwd).addScaledVector(r, m.side); if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const step = dir.clone().multiplyScalar(speed * Math.min(dt, 0.5));
    const np = v.r.clone().add(new V3(step.x, step.y, step.z));
    const hgt = B.surfaceHeightAt(np, G.t); const nu = np.clone().norm();
    v.r = nu.clone().scale(B.radius + hgt + 0.92);
    const qUp = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nu.x, nu.y, nu.z));
    const look = new THREE.Vector3(0, 0, 1).applyQuaternion(qUp); const ang = Math.atan2(new THREE.Vector3().crossVectors(look, dir).dot(new THREE.Vector3(nu.x, nu.y, nu.z)), look.dot(dir));
    v.q.copy(qUp).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang));
    this.lockLanded(v, G.t);
    if (this.astro) { this.astro.gravity = g; this.astro.speed = speed; }
  }
  evaThrust(h) {
    const v = this.vessel, m = this.evaMove; if (!m || (v.contact && beanier())) return; // (the jetpack works from the ground too)
    const camF = new THREE.Vector3(); this.G.world.camera.getWorldDirection(camF);
    const up = this.G.world.camera.up.clone(); const right = new THREE.Vector3().crossVectors(camF, up).normalize(); const u2 = new THREE.Vector3().crossVectors(right, camF);
    // near the ground "up" means straight up (the camera's up is only meaningful floating in space)
    const B = v.body; const rv = v.r.clone().norm(); const agl = B && B.hasSurface ? v.r.len() - B.radius - B.surfaceHeightAt(v.r, this.G.t) : Infinity;
    const upDir = agl < 5000 ? new THREE.Vector3(rv.x, rv.y, rv.z) : u2;
    const dir = camF.multiplyScalar(m.fwd).addScaledVector(right, m.side).addScaledVector(upDir, m.up);
    if (dir.lengthSq() > 0) { dir.normalize().multiplyScalar(4 * h); v.v.add(new V3(dir.x, dir.y, dir.z)); } // 4 m/s²: hops on the Moon and Mars, not on Earth
  }
  stepRails(simDt) {
    const G = this.G, v = this.vessel;
    if (v.landed) { G.t += simDt; this.syncLanded(v, G.t); return; }
    const lowThrust = v.throttle > 0 && v.engineState(0, this.ctx()) > 0;
    const o = Orbit.fromState(v.body.mu, v.r, v.v, G.t);
    const P = isFinite(o.period) ? o.period : Math.max(1e4, v.r.len() / Math.max(1, v.v.len()));
    const n = Math.min(lowThrust ? 3000 : 400, Math.max(1, Math.ceil(simDt / (P / (lowThrust ? 3000 : 400)))));
    const h = simDt / n;
    const ctx = this.ctx();
    let orb = o;
    for (let i = 0; i < n; i++) {
      if (lowThrust) {
        // integrate gravity + thrust (velocity Verlet)
        const acc = () => { v.updateMass(); const rl = v.r.len(); const a = v.r.clone().scale(-v.body.mu / (rl * rl * rl)); const F = v.engineState(h, ctx); const nose = vesselUp(v); if (v.sas && v.sasMode !== 'stability') this.orientRails(); a.addScaled(new V3(nose.x, nose.y, nose.z), F / (v.mass * 1000)); return a; };
        const a0 = acc(); v.v.addScaled(a0, h / 2); v.r.addScaled(v.v, h); const a1 = acc(); v.v.addScaled(a1, h / 2);
        G.t += h;
      } else { G.t += h; orb.stateAt(G.t, v.r, v.v); }
      const b0 = v.body; this.checkSOI(); if (v.galactic) return;
      if (v.body !== b0) orb = Orbit.fromState(v.body.mu, v.r, v.v, G.t);
      const alt = v.r.len() - v.body.radius;
      if ((v.body.atmo && alt < v.body.atmo.height) || alt < 5000) { this.setWarp(PHYS_MAX); flash('Entering atmosphere / low altitude — warp reduced'); break; }
    }
    if (v.sas && v.sasMode !== 'stability') this.orientRails();
  }
  orientRails() {
    const v = this.vessel; const vel = new THREE.Vector3(v.v.x, v.v.y, v.v.z).normalize(); const rad = new THREE.Vector3(v.r.x, v.r.y, v.r.z).normalize();
    const nrm = new THREE.Vector3().crossVectors(rad, vel).normalize();
    const t = { prograde: vel, retrograde: vel.clone().negate(), normal: nrm, antinormal: nrm.clone().negate(), radial: rad, antiradial: rad.clone().negate(), maneuver: this.nodeDir }[v.sasMode];
    if (t) v.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t);
  }
  checkSOI() {
    const G = this.G, v = this.vessel; const B = v.body; const t = G.t;
    if (B.parentBody && v.r.len() > B.soi) {
      const bp = new V3(), bv = new V3(); B.orbit.stateAt(t, bp, bv);
      v.r.add(bp); v.v.add(bv); v.body = B.parentBody; flash('Entering ' + v.body.name + ' sphere of influence'); return;
    }
    for (const c of B.children) {
      if (c.type === 'star' && c.soi > 1e14) {}
      const cp = new V3(), cv = new V3(); c.orbit.stateAt(t, cp, cv);
      if (cp.dist(v.r) < c.soi) { v.r.sub(cp); v.v.sub(cv); v.body = c; flash('Entering ' + c.name + ' sphere of influence'); return; }
    }
    // leaving the star system entirely
    if (!B.parentBody && v.r.len() > G.sys.boundary) this.enterInterstellar();
  }
  // ------------------------------------------------------------------ interstellar
  enterInterstellar() {
    const G = this.G, v = this.vessel;
    const gp = G.sys.galPos; const off = eclEngineToGalaxy(v.r.toArray()).map(x => x / LY);
    const vel = eclEngineToGalaxy(v.v.toArray());
    v.galactic = { pos: [gp[0] + off[0], gp[1] + off[1], gp[2] + off[2]], vel, from: G.sys.starId };
    flash('You have left the ' + G.sys.name + '. Interstellar space!', 4000);
    this.setWarp(Math.min(this.warpI, 12));
  }
  stepGalactic(simDt) {
    const G = this.G, v = this.vessel, g = v.galactic;
    G.t += simDt;
    const nose = vesselUp(v); const nG = eclEngineToGalaxy([nose.x, nose.y, nose.z]);
    if (v.warp.on) { const s = v.warp.factor * C_LIGHT; g.vel = nG.map(x => x * s); }
    else if (v.throttle > 0) {
      const F = v.engineState(simDt, { solarFlux: 0, speedVsStar: Math.hypot(...g.vel) }); const a = F / (v.mass * 1000);
      g.vel = g.vel.map((x, i) => x + nG[i] * a * simDt);
      const sp = Math.hypot(...g.vel); if (sp > 0.999 * C_LIGHT) g.vel = g.vel.map(x => x * 0.999 * C_LIGHT / sp);
    }
    for (let i = 0; i < 3; i++) g.pos[i] += g.vel[i] * simDt / LY;
    if (v.sas && ['prograde', 'retrograde'].includes(v.sasMode)) { const e = galaxyToEclEngine(g.vel); const d = new THREE.Vector3(...e).normalize(); if (v.sasMode === 'retrograde') d.negate(); v.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); }
    // arrival check against real + procedural stars near the ship
    if ((this.arrT = (this.arrT || 0) + 1) % 10 === 0) {
      const near = [...REAL_STARS, { id: 'sol', pos: [0, 65, 26750], mass: 1 }, ...starsNear(g.pos, 1, 1)];
      let best = null, bd = Infinity;
      for (const s of near) { const d = Math.hypot(s.pos[0] - g.pos[0], s.pos[1] - g.pos[1], s.pos[2] - g.pos[2]); if (d < bd) { bd = d; best = s; } }
      this.nearestStar = best; this.nearestD = bd;
      if (best && best.id !== g.from) {
        const bound = 50000 * AU * Math.sqrt(Math.max(0.05, best.mass || 1)) / LY * 0.95;
        if (bd < bound) this.arrive(best);
      } else if (best && best.id === g.from && bd > 1) g.from = null;
    }
  }
  arrive(star) {
    const G = this.G, v = this.vessel, g = v.galactic;
    const sys = G.setSystem(star.id);
    const rel = [(g.pos[0] - sys.galPos[0]) * LY, (g.pos[1] - sys.galPos[1]) * LY, (g.pos[2] - sys.galPos[2]) * LY];
    v.r = V3.from(galaxyToEclEngine(rel)); v.v = V3.from(galaxyToEclEngine(g.vel)); v.body = sys.star; v.galactic = null;
    if (v.warp.on) { v.warp.on = false; v.v.scale(1e-4); this.warpPanel?.remove(); }
    if (!G.game.discovered.includes(star.id)) G.game.discovered.push(star.id);
    this.map.clear();
    if (!G.game.log) G.game.log = []; G.game.log.push({ t: G.t, text: `${v.name} arrived at ${star.name || sys.star.name}` });
    flash(`Arrived at the ${sys.name}!`, 5000);
  }
  // ------------------------------------------------------------------ debris / crash
  stepDebris(dt) {
    const G = this.G;
    for (const d of this.debris) {
      d.age += dt; const rl = d.r.len();
      d.v.addScaled(d.r, -d.body.mu / (rl * rl * rl) * dt);
      if (d.body.atmo) { const alt = rl - d.body.radius; const rho = d.body.atmoDensity(alt); const air = d.v.clone().sub(d.body.surfaceVel(d.r)); const s = air.len(); if (s > 0) d.v.addScaled(air, -0.5 * rho * s * 0.01 * dt); }
      d.r.addScaled(d.v, dt);
      const wl = d.w.length(); if (wl > 0) d.q.multiply(_q.setFromAxisAngle(_v.copy(d.w).divideScalar(wl), wl * dt));
      const hgt = d.body.hasSurface ? d.body.surfaceHeightAt(d.r, G.t) : 0;
      if (rl < d.body.radius + hgt) { this.explosion(d.r.clone(), d.body, 10); d.dead = true; }
      if (d.age > 600 || d.r.dist(this.vessel.r) > 200e3) d.dead = true;
    }
    for (const d of this.debris) if (d.dead) this.root.remove(d.mesh);
    this.debris = this.debris.filter(d => !d.dead);
  }
  explosion(r, body, size) {
    const s = makeFireball();
    s.userData = { ...s.userData, r: r.clone(), body, age: 0, size, air: Math.min(1, body.pressure ? body.pressure(r.len() - body.radius) / 101.325 : 0) };
    this.root.add(s); this.fx.push(s);
  }
  async crash() {
    const G = this.G, v = this.vessel;
    if (!v || this.dead) return; // already showing the "destroyed" dialog: never stack a second one
    this.explosion(v.r.clone(), v.body, Math.max(8, v.height));
    for (const p of v.livingParts()) if (p.broken) p.attached = false;
    const cmd = v.livingParts().some(p => p.part.crew || p.part.probe);
    v.crashPart = null; v.recalc(); this.applyDetach();
    if (cmd && v.livingParts().length) { flash('Parts destroyed on impact!'); return; }
    this.setWarp(0); this.mesh.visible = false;
    for (const n of v.crew) { const a = G.game.roster.find(r => r.name === n); if (a) a.status = 'lost'; }
    G.game.vessels = G.game.vessels.filter(x => x.id !== v.id);
    this.dead = true;
    const r = await modal('Vessel destroyed', `${v.name} was destroyed${v.crew.length ? '. The crew (' + v.crew.join(', ') + ') did not survive — use Revert to undo.' : '.'}`, [this.launchParams ? { label: 'Revert to launch', value: 'revert', primary: true } : null, this.launchParams ? { label: 'Revert to VAB', value: 'vab' } : null, { label: 'Space Centre', value: 'center' }].filter(Boolean));
    if (r === 'revert' || r === 'vab') for (const n of v.crew) { const a = G.game.roster.find(x => x.name === n); if (a) a.status = 'available'; }
    this.vessel = null;
    this.leave(r === 'revert' ? ['flight', this.launchParams] : r === 'vab' ? ['vab'] : ['center']);
  }
  // leave the flight exactly once (a second tap on Revert used to launch a second copy of the rocket)
  leave([scene, params]) {
    if (this.leaving) return; this.leaving = true;
    document.querySelectorAll('.modal-bg').forEach(m => m.remove());
    this.G.go(scene, params);
  }
  // ------------------------------------------------------------------ rendering
  render(dt, fxWarp = 1) {
    const G = this.G, v = this.vessel; if (!v) return;
    const world = G.world;
    let camPos, focusRel = new THREE.Vector3();
    if (v.galactic) return this.renderGalactic(dt);
    const vp = this.absPos();
    const up = v.r.clone().norm(); const U = new THREE.Vector3(up.x, up.y, up.z);
    const alt = v.r.len() - v.body.radius;
    let camUp = U;
    if (this.mapMode) camUp = new THREE.Vector3(0, 1, 0);
    else if (this.camMode === 'chase' && alt > (v.body.atmo ? v.body.atmo.height : 50000) * 1.2) camUp = vesselUp(v).clone(); // orbital: align with the vessel
    this.cam.minDist = this.mapMode ? v.body.radius * 1.05 : (v.type === 'eva' ? 1.5 : 3);
    const off = this.cam.apply(world.camera, camUp);
    const focus = this.mapMode && this.mapFocus ? this.mapFocus.posAt(G.t) : vp;
    camPos = focus.clone().add(new V3(off.x, off.y, off.z));
    // don't go underground
    if (!this.mapMode && v.body.hasSurface) {
      const rel = camPos.clone().sub(v.body.posAt(G.t)); const hgt = v.body.surfaceHeightAt(rel, G.t) + v.body.radius + 1.5;
      if (rel.len() < hgt) { camPos = v.body.posAt(G.t).clone().add(rel.norm().scale(hgt)); }
    }
    focusRel.set(vp.x - camPos.x, vp.y - camPos.y, vp.z - camPos.z);
    // vessel mesh
    this.mesh.position.copy(focusRel); this.mesh.quaternion.copy(v.q);
    const com = v.com; if (this.mesh.userData.parts) this.mesh.children.forEach(c => { if (c.userData.placed) c.position.set(c.userData.placed.pos[0] - com[0], c.userData.placed.pos[1] - com[1], c.userData.placed.pos[2] - com[2]); });
    if (v.type === 'eva' && this.astro) {
      if (v.suited === false && !(v.body.breathable && alt < 4000)) { v.suited = true; this.astro.setSuit(true); flash('Suit back on — this air is not breathable'); }
      this.astro.update(dt);
    }
    // plumes & plasma
    const pAtm = Math.min(1, v.pressureAtm());
    if (this.mesh.userData.parts) for (const m of this.mesh.userData.parts) {
      const rt = m.userData.rt; if (!m.userData.plumes) continue;
      for (const pl of m.userData.plumes) { pl.visible = !!rt.firing && rt.attached; const U2 = pl.userData.U; U2.uThrottle.value = rt.firing || 0; U2.uPressure.value = pAtm; U2.uTime.value = performance.now() / 1000; }
    }
    if (this.plasma) {
      const k = Math.min(1, (v.heat || 0) / 600);
      if (k > 0.02 && v.body) {
        const air = v.v.clone().sub(v.body.surfaceVel(v.r)); const sp = air.len() || 1;
        const fW = new THREE.Vector3(air.x / sp, air.y / sp, air.z / sp);
        const ex = this.plasmaExposure(v, fW);
        this.plasma.update(fW, k, performance.now() / 1000, (m) => ex.get(m.userData.rt) || 0);
      } else this.plasma.hide();
    }
    // launch smoke, tank frost / vapour, shed ice
    if (this.lfx && v.type !== 'eva' && G.world.sunDir) this.lfx.update({ v, t: G.t, dt: dt * fxWarp, camPos, focusRel, pAtm, sunDir: G.world.sunDir });
    if (v.type !== 'eva') this.updateHullGlow();
    // chutes: simple canopy
    this.updateChutes(dt * fxWarp);
    // sparks from anything scraping along the ground
    if (!this.sparks || this.sparks.points.parent !== this.root) { this.sparks = new Sparks(this.root); }
    if (v.scrapes && v.scrapes.length) { const base = v.body.surfaceVel(v.r); for (const e of v.scrapes) this.sparks.emit(e.p, e.vt, e.s, e.n, base, e.k); v.scrapes.length = 0; }
    { const bp = v.body.posAt(G.t); const up = v.r.clone().norm(); const gg = v.body.mu / v.r.len2();
      this.sparks.update(Math.min(0.1, dt * fxWarp), { x: -up.x * gg, y: -up.y * gg, z: -up.z * gg }, { x: bp.x - camPos.x, y: bp.y - camPos.y, z: bp.z - camPos.z }, v.body.hasSurface ? v.body.radius + v.body.surfaceHeightAt(v.r, G.t) : 0); }
    // control surfaces swing, landing gear folds
    if (this.mesh.userData.parts) for (const m of this.mesh.userData.parts) {
      const f = m.userData.flap, gl = m.userData.gearLeg, rt = m.userData.rt;
      if (f) { const ax = f.userData.axis || [1, 0, 0]; f.quaternion.setFromAxisAngle(_ax.set(ax[0], ax[1], ax[2]), rt.defl || 0); }
      if (gl) { const want = v.gearUp ? 1 : 0; gl.userData.k = (gl.userData.k ?? want) + (want - (gl.userData.k ?? want)) * Math.min(1, dt * 1.2); gl.rotation.z = -gl.userData.k * Math.PI * 0.47; }
    }
    // deployable solar arrays fold/unfold (and retract automatically in thick air)
    if (this.mesh.userData.parts) for (const m of this.mesh.userData.parts) {
      const wing = m.userData.wing; if (!wing) continue; const rt = m.userData.rt;
      const want = rt.deployed ? 1 : 0; wing.userData.k = (wing.userData.k ?? want) + (want - (wing.userData.k ?? want)) * Math.min(1, dt * 1.5);
      const k = wing.userData.k; wing.scale.set(Math.max(0.04, k), 1, 1); wing.rotation.x = (1 - k) * 0.0; wing.visible = true;
    }
    // debris & fx
    for (const d of this.debris) { const p = d.body.posAt(G.t).clone().add(d.r); d.mesh.position.set(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z); d.mesh.quaternion.copy(d.q); }
    for (const s of this.fx) {
      const u = s.userData; u.age += dt; const p = u.body.posAt(G.t).clone().add(u.r); s.position.set(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z);
      // orient local +y to the body's up so hot gas rises; blast radius ~3x the wreck size
      const up = u.r.clone().norm(); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(up.x, up.y, up.z)); s.scale.setScalar(u.size * 3);
      const U = u.U; U.uAge.value = u.age; U.uAir.value = u.air; U.uSunI.value = this.G.world.sun.intensity / 3.2;
      U.uSun.value.copy(this.G.world.sun.position).sub(this.G.world.sun.target.position).normalize().applyQuaternion(s.quaternion.clone().invert());
    }
    this.fx = this.fx.filter(s => { if (s.userData.age > (s.userData.air > 0.1 ? 7 : 3)) { this.root.remove(s); s.geometry.dispose(); s.material.dispose(); return false; } return true; });
    // other vessels nearby (the ship you just left, stations, landers...)
    for (const o of this.others) {
      if (!(this.vessel.type === 'eva' && this.vessel.grab && o.v.id === this.vessel.grab.ship)) this.updateOther(o);
      const p = o.v.body.posAt(G.t).clone().add(o.v.r); o.mesh.position.set(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z); o.mesh.quaternion.copy(o.v.q);
      if (o.astro) o.astro.update(dt);
    }
    // space centre & flags
    if (this.center && G.sys.starId === 'sol') attachToBody(world, this.earth, this.center, this.site);
    for (const f of this.flags) { const vis = world.visuals.get(f.userData.body); if (vis && vis.spin) { if (f.parent !== vis.spin) vis.spin.add(f); const b = f.userData.f.bf; f.position.set(...b); f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...b).normalize()); } }
    // pad height for contact
    if (G.sys.starId === 'sol' && v.body.name === 'Earth') {
      const s = this.site; const q = v.body.rotAt(G.t).invert(); const p = new THREE.Vector3(v.r.x, v.r.y, v.r.z).applyQuaternion(q);
      const dpad = Math.hypot(p.x - s.bf[0], p.y - s.bf[1], p.z - s.bf[2]);
      v.padHeight = dpad < 25 ? PAD_HEIGHT + 3 + (s.ground - (v.body.terrainHeightAt(v.r, G.t))) : dpad < PAD_RADIUS[this.siteLevel ?? 1] ? PAD_HEIGHT : 0;
    } else v.padHeight = 0;
    // map
    if (this.mapMode) { this.updatePlan(); this.map.update(G.sys, G.t, camPos, this.mapFocus || v.body, v, this.plan); }
    else if (this.node) this.updatePlan();
    G.world.setShadowSize(Math.max(40, Math.min(400, this.cam.dist * 1.2)));
    world.update({ t: G.t, camPos, focusRel, siteBF: this.site?.bf, siteBody: 'Earth', skyBright: 1 });
    // navball
    const north0 = new THREE.Vector3(v.body.poleAxis.x, v.body.poleAxis.y, v.body.poleAxis.z);
    const north = north0.clone().addScaledVector(U, -north0.dot(U)).normalize();
    const surfRel = v.situation === 'flying' || v.landed || v.contact || alt < 30000;
    const vel = surfRel ? v.v.clone().sub(v.body.surfaceVel(v.r)) : v.v.clone();
    const pro = new THREE.Vector3(vel.x, vel.y, vel.z).normalize();
    const nrm = new THREE.Vector3().crossVectors(U, pro).normalize();
    const vecs = vel.len() > 0.5 ? { pro, retro: pro.clone().negate(), normal: nrm, anti: nrm.clone().negate(), radial: U, aradial: U.clone().negate(), node: this.nodeDir || null } : { node: this.nodeDir || null };
    this.navball.update(v.q, U, north, vecs);
  }
  renderGalactic(dt) {
    const G = this.G, v = this.vessel, world = G.world;
    const off = this.cam.apply(world.camera, vesselUp(v).clone());
    this.mesh.position.set(-off.x, -off.y, -off.z); this.mesh.quaternion.copy(v.q);
    // rebake the sky for our position every half light-year
    const g = v.galactic;
    if (!this.skyAt || Math.hypot(g.pos[0] - this.skyAt[0], g.pos[1] - this.skyAt[1], g.pos[2] - this.skyAt[2]) > 0.5) { this.skyAt = g.pos.slice(); world.sky.bakeFor('ship:' + g.pos.map(x => x.toFixed(1)).join(','), g.pos); }
    // render: hide the system bodies
    world.bodiesGroup.visible = false; world.points.points.visible = false; world.belts.group.visible = false; world.comets.group.visible = false;
    world.pipeline.render(world.scene, world.camera, { time: 0, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Vector3(0.3, 0.3, 0.35), atmos: [], exposure: 2.5, sss: false });
    world.bodiesGroup.visible = true; world.points.points.visible = true; world.belts.group.visible = true; world.comets.group.visible = true;
    const U = vesselUp(v); this.navball.update(v.q, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), {});
    this.mesh.children.forEach(c => { if (c.userData.placed) c.position.set(c.userData.placed.pos[0] - v.com[0], c.userData.placed.pos[1] - v.com[1], c.userData.placed.pos[2] - v.com[2]); });
    for (const m of this.mesh.userData.parts || []) for (const pl of m.userData.plumes || []) { pl.visible = !!m.userData.rt.firing; pl.userData.U.uThrottle.value = m.userData.rt.firing || 0; pl.userData.U.uPressure.value = 0; pl.userData.U.uTime.value = performance.now() / 1000; }
  }
  // parachute canopies are cloth (render/chuteCloth.js): they inflate, swing, and drape after landing
  updateChutes(dt) {
    const v = this.vessel; if (!this.mesh.userData.parts || v.type === 'eva') return;
    this.cloths ||= new Map();
    const live = new Set();
    // the vessel's acceleration (the canopy's frame moves with it) and its gravity
    const vv = new THREE.Vector3(v.v.x, v.v.y, v.v.z); const accel = this.prevV && dt > 0 ? vv.clone().sub(this.prevV).divideScalar(Math.max(dt, 1e-3)) : new THREE.Vector3(); this.prevV = vv;
    if (accel.length() > 200) accel.set(0, 0, 0); // a teleport or SOI change, not a real acceleration
    const up = new THREE.Vector3(v.r.x, v.r.y, v.r.z).normalize(); const gW = up.clone().multiplyScalar(-v.body.mu / v.r.len2());
    const gEff = gW.sub(accel);
    const airV = v.v.clone().sub(v.body.surfaceVel(v.r)); const air = new THREE.Vector3(-airV.x, -airV.y, -airV.z);
    const ground = v.body.hasSurface ? { up, h: v.body.radius + v.body.surfaceHeightAt(v.r, this.G.t) - v.r.len() + 0.1 } : null;
    for (const m of this.mesh.userData.parts) {
      const rt = m.userData.rt; if (!rt.part.chute) continue;
      const out = rt.deployed && rt.attached && !rt.broken;
      let c = this.cloths.get(rt);
      if (!out) continue;
      if (!c) { if (!(v.rho > 1e-5)) continue; c = new ClothChute(rt.part.chute.area, rt.part.chute.drogue ? 0xf0f0ea : 0xff7a1a); this.cloths.set(rt, c); this.root.add(c.group); }
      live.add(rt);
      // attachment: the chute part's top, in world axes relative to the centre of mass
      const pl = rt.pl; const anchor = new THREE.Vector3(pl.pos[0] - v.com[0], pl.pos[1] - v.com[1] + 0.2, pl.pos[2] - v.com[2]).applyQuaternion(v.q);
      c.step(dt, anchor, air, gEff, v.rho || 0, Math.min(1, (rt.openT || 0) / (rt.part.chute.drogue ? 1 : 3)), ground);
      c.group.position.copy(this.mesh.position);
    }
    for (const [rt, c] of this.cloths) if (!live.has(rt)) { this.root.remove(c.group); c.dispose(); this.cloths.delete(rt); }
  }

  // ------------------------------------------------------------------ HUD
  updateHUD() {
    const G = this.G, v = this.vessel; if (!v) return;
    for (const k of ['sas', 'rcs', 'map']) this.btns[k].classList.toggle('on', k === 'map' ? this.mapMode : !!v[k]);
    for (const m of ['stability', 'prograde', 'retrograde', 'normal', 'antinormal', 'radial', 'antiradial', 'target', 'maneuver']) this.btns['sas_' + m].classList.toggle('on', v.sas && v.sasMode === m);
    this.btns.eva.textContent = v.type === 'eva' ? 'Board' : 'EVA';
    this.btns.warpd.classList.toggle('on', v.warp.on); this.btns.warpd.style.display = v.livingParts().some(p => p.part.warp) ? '' : 'none';
    this.btns.flag.style.display = v.type === 'eva' ? '' : 'none';
    if (this.btns.sci) { const ex = this.experiments(); this.btns.sci.style.display = ex.length ? '' : 'none'; this.btns.sci.classList.toggle('on', ex.some(e => e.tp > 0)); }
    { const gear = v.wheels; this.btns.gear.style.display = gear ? '' : 'none'; this.btns.gear.classList.toggle('on', gear && !v.gearUp); this.btns.brakes.style.display = gear ? '' : 'none'; this.btns.brakes.classList.toggle('on', !!v.brakes); }
    this.btns.panels.style.display = v.livingParts().some(p => p.part.mesh?.deploy) ? '' : 'none'; this.btns.panels.classList.toggle('on', v.livingParts().some(p => p.part.mesh?.deploy && p.deployed));
    if (v.galactic) {
      const g = v.galactic; const sp = Math.hypot(...g.vel);
      this.hudTop.innerHTML = `<div>${v.name}</div><div class="dim">Interstellar space</div><div class="big">${fmtSpeed(sp)}</div><div>${(sp / C_LIGHT).toFixed(4)} c</div>`;
      const ns = this.nearestStar; const eta = ns && sp > 0 ? this.nearestD * LY / sp : Infinity;
      this.hudOrbit.innerHTML = `<div>Nearest star: <b>${ns ? (ns.name || starById(ns.id)?.name || ns.id) : '—'}</b></div><div>Distance ${this.nearestD ? this.nearestD.toFixed(3) + ' ly' : '—'}</div><div>ETA ${fmtTime(eta)}</div><div class="dim">Galactic ${g.pos.map(x => x.toFixed(1)).join(', ')} ly</div><div class="dim">${fmtTime(G.t - 946728000)} since 2000</div>`;
      this.stageHUD(); return;
    }
    const B = v.body; const alt = v.r.len() - B.radius;
    const radar = B.hasSurface ? alt - B.surfaceHeightAt(v.r, G.t) : alt;
    const up = v.r.clone().norm(); const surfV = v.v.clone().sub(B.surfaceVel(v.r));
    const vs = v.v.dot(up);
    const orbitalMode = alt > (B.atmo ? B.atmo.height : 30000);
    const spd = orbitalMode ? v.v.len() : surfV.len();
    const g = B.mu / v.r.len2();
    const twr = v.thrustN ? v.thrustN / (v.mass * 1000 * g) : 0;
    updateSituation(v, G.t);
    const kpa = B.pressure(alt);
    const o = v.landed ? null : Orbit.fromState(B.mu, v.r, v.v, G.t);
    const apPe = o ? `<div class="conly">Ap ${o.e < 1 ? fmtDist(o.ap - B.radius) : '∞'} · Pe ${fmtDist(o.pe - B.radius)}</div>` : '';
    this.hudTop.innerHTML = `<div class="xtra">${v.name}${v.crew.length ? ' <span class="dim">(' + v.crew.length + ' crew)</span>' : ''}</div><div class="dim xtra">${v.situation} · ${B.name}</div>
      <div class="big">${fmtDist(alt)}</div><div class="small dim xtra">radar ${fmtDist(radar)}</div>
      <div>${orbitalMode ? 'Orbital' : 'Surface'} ${fmtSpeed(spd)}</div><div class="xtra">Vertical ${fmtSpeed(vs)}</div>${apPe}
      <div class="xtra">Throttle ${(v.throttle * 100).toFixed(0)}% · TWR ${twr.toFixed(2)}</div><div class="small dim xtra">Mass ${fmtMass(v.mass)} · ${kpa > 0 ? kpa.toFixed(kpa < 1 ? 3 : 1) + ' kPa' : 'vacuum'}${v.q_dyn > 100 ? ' · Q ' + (v.q_dyn / 1000).toFixed(1) + ' kPa' : ''}</div>`;
    if (!v.landed) {
      const soiT = this.map.patches && this.map.patches[0] && this.map.patches[0].next ? this.map.patches[0].t1 - G.t : null;
      this.hudOrbit.innerHTML = `<div>Ap <b>${o.e < 1 ? fmtDist(o.ap - B.radius) : '∞'}</b> <span class="dim">${o.e < 1 ? fmtTime(o.timeToAp(G.t)) : ''}</span></div>
        <div>Pe <b>${fmtDist(o.pe - B.radius)}</b> <span class="dim">${fmtTime(o.timeToPe(G.t))}</span></div>
        <div class="small">Inc ${(Math.acos(Math.max(-1, Math.min(1, o.W.dot(B.poleAxis)))) * 180 / Math.PI).toFixed(2)}° · e ${o.e.toFixed(4)}</div><div class="small">Period ${fmtTime(o.period)}</div>
        ${soiT ? `<div class="small">SOI change in ${fmtTime(soiT)}</div>` : ''}<div class="small dim">Δv left ≈ ${(v.stageDeltaV()).toFixed(0)} m/s</div><div class="small dim">${fmtDate(G.t)}</div>`;
    } else this.hudOrbit.innerHTML = `<div>Landed</div><div class="small dim">${fmtDate(G.t)}</div><div class="small dim">g = ${g.toFixed(2)} m/s²</div>`;
    this.stageHUD();
  }
  stageHUD() {
    const v = this.vessel;
    const props = v.propellantSummary();
    const rows = [];
    for (const [k, p] of Object.entries(props)) rows.push(`<div class="small">${k}<div class="bar" style="width:100%"><i style="width:${(p.cur / p.max * 100).toFixed(0)}%"></i></div></div>`);
    const upcoming = [];
    for (let s = v.stage; s < v.nStages + 1 && upcoming.length < 4; s++) { const ps = v.livingParts().filter(p => p.pl.stage === s); if (ps.length) upcoming.push(`<div class="stage"><div class="h">Stage ${s + 1}${s === v.stage ? ' ▶' : ''}</div>${[...new Set(ps.map(p => p.part.name))].slice(0, 3).join(', ')}</div>`); }
    this.hudStage.innerHTML = upcoming.join('') + rows.join('');
  }
}

function fmtWarp(w) { return w >= 1e6 ? (w / 1e6) + 'M×' : w >= 1000 ? (w / 1000) + 'k×' : w + '×'; }
function fmtDate(t) { const d = new Date(Date.UTC(2000, 0, 1, 12) + t * 1000); return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; }

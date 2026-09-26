// Tracking station / system explorer: browse every body in any star system and your vessels.
import * as THREE from 'three';
import { h, mount, clearUI, flash } from '../ui/ui.js';
import { V3, fmtDist, fmtTime, fmtMass, AU, DAY, YEAR, LY } from '../core/math.js';
import { OrbitCam } from '../core/camera.js';
import { MapView } from '../render/mapView.js';
import { starById } from '../gen/galaxy.js';
import { bakeListeners, recipeFor } from '../gen/baker.js';

const TYPE_ORDER = { star: 0, planet: 1, dwarf: 2, moon: 3, asteroid: 4, centaur: 5, kbo: 6, comet: 7 };

export class TrackingScene {
  constructor(G) { this.G = G; this.cam = new OrbitCam(G.world.renderer.domElement); this.cam.enabled = false; this.map = new MapView(G.world); this.map.onPick = (b) => { this.focus = b; this.cam.zoom(Math.max(b.radius * 4, 2e3) / this.cam.dist, true); this.fillList(''); this.showInfo(b); }; }
  async enter(params = {}) {
    const G = this.G; this.cam.enabled = true;
    this.starId = params.starId || (G.sys ? G.sys.starId : 'sol');
    G.setSystem(this.starId);
    this.map.clear(); this.map.show(true);
    const sys = G.sys;
    this.focus = params.focus ? sys.get(params.focus) : (this.starId === 'sol' ? sys.get('Earth') : sys.bodies.find(b => b.type === 'planet') || sys.star);
    this.cam.dist = this.focus.radius * 4; this.cam.minDist = 10; this.cam.maxDist = 1e14; this.cam.pitch = 0.3;
    this.warp = 1; this.from = params.from || 'center';
    if (!this._bl) { this._bl = (b) => this.onBake(b); bakeListeners.add(this._bl); }
    this.buildUI();
  }
  onBake(b) { if (this.cam.enabled && b === this.focus) this.showInfo(b); }
  exit() { this.cam.enabled = false; this.map.show(false); this.map.clear(); clearUI(); }
  buildUI() {
    clearUI(); const G = this.G; const sys = G.sys;
    this.warpLbl = h('span.mono', {}, '1×');
    mount(h('div#topbar.panel', {}, h('button', { onclick: () => G.go(this.from === 'galaxy' ? 'galaxy' : 'center', { from: 'menu' }) }, this.from === 'galaxy' ? '← Galaxy' : '← Space Centre'),
      h('b', { style: { padding: '0 8px' } }, sys.name),
      h('button', { onclick: () => this.setWarp(this.warp / 10) }, '◀◀'), this.warpLbl, h('button', { onclick: () => this.setWarp(this.warp * 10) }, '▶▶'), h('button', { onclick: () => this.setWarp(1) }, '■'),
      this.starId !== 'sol' ? h('button', { onclick: () => G.go('galaxy', { from: 'center' }) }, '🔭 Galaxy') : null));
    const search = h('input', { placeholder: `Search ${sys.bodies.length} bodies…`, oninput: (e) => this.fillList(e.target.value) });
    this.list = h('div.list', { style: { flex: '1' } });
    const vesselsInSys = G.game ? G.game.vessels.filter(v => (v.starId || 'sol') === this.starId || (v.galactic && this.starId === 'sol')) : [];
    const vlist = h('div.list', { style: { maxHeight: '30%' } }, vesselsInSys.length ? vesselsInSys.map(v => h('div.item', { onclick: () => this.G.go('flight', { vesselId: v.id }) }, h('b', {}, v.name), h('div.small.dim', {}, `${v.situation} · ${v.galactic ? 'interstellar' : v.body}`), h('div.small', { style: { color: '#fcd34d' } }, 'Fly ▶'))) : h('div.dim.small', {}, 'No vessels in this system.'));
    mount(h('div#side.panel', {}, h('b', {}, 'Vessels'), vlist, h('b', {}, 'Bodies'), search, this.list));
    this.info = h('div#info.panel'); mount(this.info);
    this.fillList(''); this.showInfo(this.focus);
  }
  setWarp(w) { this.warp = Math.max(1, Math.min(1e7, w)); this.warpLbl.textContent = this.warp >= 1000 ? (this.warp / 1000) + 'k×' : this.warp + '×'; }
  fillList(q) {
    const sys = this.G.sys; q = q.toLowerCase();
    const depth = (b) => { let d = 0; for (let p = b.parentBody; p; p = p.parentBody) d++; return d; };
    const ordered = [];
    const add = (b) => { ordered.push(b); b.children.slice().sort((a, c) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[c.type] ?? 9) || (a.orbit.a - c.orbit.a)).forEach(add); };
    add(sys.star);
    const shown = q ? ordered.filter(b => b.name.toLowerCase().includes(q)) : ordered.filter(b => depth(b) <= 1 || b.parentBody === this.focus || b.parentBody === this.focus.parentBody && b.type === 'moon');
    this.list.replaceChildren(...shown.slice(0, 400).map(b => h('div.item' + (b === this.focus ? '.sel' : ''), { style: { paddingLeft: (8 + depth(b) * 14) + 'px' }, onclick: () => { this.focus = b; this.cam.dist = Math.max(b.radius * 4, 2e3); this.fillList(q); this.showInfo(b); } },
      h('span', {}, b.name), b.fictional ? h('span.tag.fic', {}, 'fictional') : null, b.candidate ? h('span.tag', {}, 'candidate') : null, h('span.small.dim', { style: { marginLeft: '6px' } }, b.type))));
  }
  showInfo(b) {
    const G = this.G; const rows = [];
    const r = (k, v) => rows.push(h('tr', {}, h('td.dim', {}, k), h('td', {}, v)));
    r('Type', b.type + (b.class ? ` (${b.class})` : '')); r('Radius', fmtDist(b.radius)); r('Mass', b.mass.toExponential(3) + ' kg');
    if (!b.isStar) r('Surface gravity', (b.mu / b.radius ** 2).toFixed(3) + ' m/s²');
    r('Escape velocity', (Math.sqrt(2 * b.mu / b.radius) / 1000).toFixed(2) + ' km/s');
    if (b.rotPeriod) r('Rotation', fmtTime(b.rotPeriod)); else if (b.locked) r('Rotation', 'tidally locked');
    if (b.orbit) { r('Orbits', b.parentBody.name); r('Semi-major axis', fmtDist(b.orbit.a)); r('Eccentricity', b.orbit.e.toFixed(4)); r('Inclination', (b.elements.i).toFixed(2) + '°'); r('Period', fmtTime(b.orbit.period)); r('Sphere of influence', isFinite(b.soi) ? fmtDist(b.soi) : '—'); }
    if (b.atmo) r('Atmosphere', b.atmo.gas ? 'gas giant' : `${b.atmo.P0 >= 1 ? b.atmo.P0.toFixed(1) + ' kPa' : (b.atmo.P0 * 1000).toFixed(2) + ' Pa'} · scale height ${(b.atmo.H / 1000).toFixed(1)} km`);
    if (b.isStar) { r('Temperature', (b.temp || 5772) + ' K'); r('Luminosity', (b.lum ?? 1).toPrecision(3) + ' L☉'); }
    if (b.Teq) r('Equilibrium temp.', b.Teq.toFixed(0) + ' K');
    if (b.children.length) r('Satellites', b.children.length);
    const note = b.fictional ? 'Fictional body (procedurally generated to fill this system).' : b.candidate ? 'Candidate exoplanet — not yet confirmed.' : this.G.sys.real || b.known ? 'Real body — parameters from published data.' : '';
    const st = this.G.sys.starInfo;
    const featList = [...(b.traits || []), ...(b.features || [])];
    const feats = featList.length ? h('div', { style: { marginTop: '8px' } }, h('b', {}, 'Notable features'), h('ul', { style: { margin: '4px 0 0 16px', padding: 0 } }, featList.map((f) => h('li.small', {}, f)))) : (recipeFor(b) && !b.baked && !b.hasRealMap ? h('div.small.dim', { style: { marginTop: '8px' } }, 'Surface is being generated…') : null);
    this.info.replaceChildren(...[h('h2', {}, b.name), h('div.small.dim', {}, note), h('table.kv', { style: { marginTop: '8px' } }, rows), feats,
      b === this.G.sys.star && st && st.pos ? h('div.small.dim', { style: { marginTop: '8px' } }, `${st.spec || ''} · ${(Math.hypot(st.pos[0] - 0, st.pos[1] - 65, st.pos[2] - 26750)).toFixed(2)} ly from the Sun`) : null].filter(Boolean));
  }
  update(dt) {
    const G = this.G; G.t += dt * this.warp;
    const b = this.focus;
    const off = this.cam.apply(G.world.camera, new THREE.Vector3(0, 1, 0));
    this.cam.minDist = b.radius * 1.2;
    const camPos = b.posAt(G.t).clone().add(new V3(off.x, off.y, off.z));
    this.map.update(G.sys, G.t, camPos, b, null, null);
    G.world.update({ t: G.t, camPos, exposurePos: b.posAt(G.t) });
  }
}

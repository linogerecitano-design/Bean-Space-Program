import * as THREE from 'three';
import { h, mount, clearUI, flash, modal } from '../ui/ui.js';
import { fmtTime } from '../core/math.js';
import { buildSpaceCenter } from '../render/spaceCenter.js';
import { OrbitCam } from '../core/camera.js';
import { siteFrame, localToSystem, attachToBody, localDirToWorld } from './site.js';
import { START_T } from '../core/universe.js';

const SPOTS = { pad: [0, 60, 0], vab: [-1500, 90, 900], mission: [-1200, 20, 1250], astronauts: [-2300, 20, 400], tracking: [-2600, 40, -700], observatory: [-3100, 30, 300] };
const NAMES = { pad: 'Launch Pad 39B', vab: 'Vehicle Assembly Building', mission: 'Mission Control', astronauts: 'Astronaut Complex', tracking: 'Tracking Station', observatory: 'Observatory (Galaxy Map)' };

export class SpaceCenterScene {
  constructor(G) { this.G = G; this.center = null; this.cam = new OrbitCam(G.world.renderer.domElement); this.focus = new THREE.Vector3(-1100, 0, 500); }
  async enter() {
    const G = this.G; G.setSystem('sol');
    this.earth = G.sys.get('Earth'); this.site = siteFrame(this.earth);
    if (!this.center) this.center = buildSpaceCenter();
    this.cam.enabled = true; this.cam.dist = 2600; this.cam.pitch = 0.32; this.cam.yaw = 2.3; this.cam.minDist = 50; this.cam.maxDist = 60000;
    this.focusT = null;
    clearUI();
    this.clock = h('div.clock.mono');
    mount(h('div#topbar.panel', {}, this.clock,
      h('button', { onclick: () => G.go('vab') }, '🛠 VAB'), h('button.primary', { onclick: () => this.launchDialog() }, '🚀 Launch'),
      h('button', { onclick: () => G.go('astronauts') }, '👨‍🚀 Astronauts'), h('button', { onclick: () => G.go('tracking') }, '🛰 Tracking'),
      h('button', { onclick: () => G.go('galaxy', { from: 'center' }) }, '🔭 Galaxy'), h('button', { onclick: () => G.save() }, '💾 Save'), h('button', { onclick: () => { G.save(true); G.go('menu'); } }, '☰ Menu')));
    this.labels = {};
    for (const k in SPOTS) { const el = h('div.label3d', { onclick: () => this.click(k) }, NAMES[k]); this.labels[k] = el; mount(el); }
    this.G.world.setShadowSize(900);
  }
  click(k) {
    const G = this.G;
    if (k === 'vab') G.go('vab'); else if (k === 'pad') this.launchDialog(); else if (k === 'astronauts') G.go('astronauts');
    else if (k === 'tracking' || k === 'mission') G.go('tracking'); else if (k === 'observatory') G.go('galaxy', { from: 'center' });
  }
  async launchDialog() {
    const G = this.G; const game = G.game;
    const sel = h('select', {}, game.designs.map((d, i) => h('option', { value: i, selected: i === game.selectedDesign ? true : undefined }, d.name)));
    const where = h('select', {}, h('option', { value: 'pad' }, 'Launch Pad 39B (Earth)'), h('option', { value: 'leo' }, 'Low Earth Orbit, 400 km (sandbox)'), h('option', { value: 'moon' }, 'Lunar surface (sandbox)'), h('option', { value: 'mars' }, 'Mars surface (sandbox)'), h('option', { value: 'helio' }, 'Deep space near Earth (sandbox)'));
    const avail = game.roster.filter(a => a.status === 'available');
    const crew = h('select', { multiple: true, size: Math.min(5, Math.max(2, avail.length)) }, avail.map((a, i) => h('option', { value: a.name, selected: i === 0 ? true : undefined }, `${a.name} (${a.trait})`)));
    const r = await modal('Launch', h('div.col', {}, h('label', {}, 'Vessel'), sel, h('label', {}, 'Start location'), where, h('label', {}, 'Crew (seats permitting)'), crew), [{ label: 'Cancel' }, { label: 'Launch!', value: 'go', primary: true }]);
    if (r !== 'go') return;
    game.selectedDesign = +sel.value;
    const crewNames = [...crew.selectedOptions].map(o => o.value);
    G.go('flight', { design: game.designs[+sel.value], where: where.value, crew: crewNames });
  }
  exit() { if (this.center && this.center.parent) this.center.parent.remove(this.center); clearUI(); this.cam.enabled = false; }
  update(dt) {
    const G = this.G; G.t += dt; // real time at the space centre
    const earth = this.earth;
    this.clock.textContent = 'Y' + (1 + Math.floor((G.t - START_T) / 31557600)) + ' ' + fmtTime((G.t - START_T) % 31557600).replace(/^\d+y /, '');
    // camera in local frame
    const off = this.cam.apply(G.world.camera, localDirToWorld(earth, G.t, this.site, [0, 1, 0]));
    const focusSys = localToSystem(earth, G.t, this.site, this.focus.toArray());
    const camPos = focusSys.clone().add({ x: off.x, y: off.y, z: off.z });
    // keep the camera above ground
    const ground = localToSystem(earth, G.t, this.site, [0, 0, 0]);
    G.world.update({ t: G.t, camPos, siteBF: this.site.bf, siteBody: 'Earth', focusRel: new THREE.Vector3(focusSys.x - camPos.x, focusSys.y - camPos.y, focusSys.z - camPos.z) });
    attachToBody(G.world, earth, this.center, this.site);
    // labels
    const cam = G.world.camera; const W = innerWidth, H = innerHeight;
    for (const k in SPOTS) {
      const p = localToSystem(earth, G.t, this.site, SPOTS[k]);
      const v = new THREE.Vector3(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z).project(cam);
      const el = this.labels[k];
      if (v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1) { el.style.display = ''; el.style.left = ((v.x + 1) / 2 * W) + 'px'; el.style.top = ((1 - v.y) / 2 * H) + 'px'; } else el.style.display = 'none';
    }
  }
}

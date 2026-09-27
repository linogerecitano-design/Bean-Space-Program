import * as THREE from 'three';
import { h, mount, clearUI, flash, modal } from '../ui/ui.js';
import { fmtTime } from '../core/math.js';
import { siteModel, STARTER_SPOTS, FULL_SPOTS } from '../render/spaceCenter.js';
import { isCareer, FACILITY, UPGRADE_COST, fmtFunds, launchCheck } from '../game/career.js';
import { OrbitCam } from '../core/camera.js';
import { siteFrame, localToSystem, attachToBody, localDirToWorld } from './site.js';
import { START_T } from '../core/universe.js';

const NAMES = [
  { pad: 'Gravel Launch Pad', vab: 'Tin Hangar (VAB)', mission: 'Portakabin Mission Control', rnd: 'R&D Shed', astronauts: 'Crew Caravan', tracking: 'Second-hand Dish (Tracking)', observatory: 'Garden Observatory (Galaxy)' },
  { pad: 'Launch Pad 39B', vab: 'Vehicle Assembly Building', mission: 'Mission Control', rnd: 'Research & Development', astronauts: 'Astronaut Complex', tracking: 'Tracking Station', observatory: 'Observatory (Galaxy Map)' },
];

export class SpaceCenterScene {
  constructor(G) { this.G = G; this.center = null; this.cam = new OrbitCam(G.world.renderer.domElement); this.focus = new THREE.Vector3(-1100, 0, 500); }
  get level() { return isCareer(this.G.game) ? (this.G.game.facility || 0) : 1; }
  async enter() {
    const G = this.G; G.setSystem('sol');
    this.earth = G.sys.get('Earth'); this.site = siteFrame(this.earth);
    const lvl = this.level; const career = isCareer(G.game);
    this.center = siteModel(lvl);
    this.spots = lvl ? FULL_SPOTS : STARTER_SPOTS;
    if (!career) { this.spots = { ...this.spots }; delete this.spots.rnd; }
    this.cam.enabled = true; this.cam.minDist = 50; this.cam.maxDist = 60000; this.cam.pitch = 0.32;
    if (lvl) { this.focus.set(-1100, 0, 500); this.cam.dist = 2600; this.cam.yaw = 2.3; } else { this.focus.set(-110, 0, 150); this.cam.dist = 340; this.cam.yaw = 2.5; this.cam.pitch = 0.42; }
    this.focusT = null;
    clearUI();
    this.clock = h('div.clock.mono');
    const money = career ? h('div.clock.mono.money', {}) : null; this.money = money; this.refreshMoney();
    mount(h('div#topbar.panel', {}, this.clock, money,
      h('button', { onclick: () => G.go('vab') }, '🛠 VAB'), h('button.primary', { onclick: () => this.launchDialog() }, '🚀 Launch'),
      career ? h('button', { onclick: () => G.go('mission') }, '📋 Contracts') : null,
      career ? h('button', { onclick: () => G.go('rnd') }, '🔬 R&D') : null,
      career && !lvl ? h('button.gold', { onclick: () => this.upgradeDialog() }, '🏗 Upgrade site') : null,
      h('button', { onclick: () => G.go('astronauts') }, '👨‍🚀 Astronauts'), h('button', { onclick: () => G.go('tracking') }, '🛰 Tracking'),
      h('button', { onclick: () => G.go('galaxy', { from: 'center' }) }, '🔭 Galaxy'), h('button', { onclick: () => G.save() }, '💾 Save'), h('button', { onclick: () => { G.save(true); G.go('menu'); } }, '☰ Menu')));
    this.labels = {};
    const names = NAMES[lvl];
    for (const k in this.spots) { const el = h('div.label3d', { onclick: () => this.click(k) }, names[k]); this.labels[k] = el; mount(el); }
    this.G.world.setShadowSize(lvl ? 900 : 400);
  }
  refreshMoney() { const g = this.G.game; if (this.money) this.money.textContent = `${fmtFunds(g.funds)} · ${Math.floor(g.tp)} TP`; }
  async upgradeDialog() {
    const G = this.G, g = G.game; const F = FACILITY[1];
    const can = g.funds >= UPGRADE_COST;
    const r = await modal('Upgrade to the Bean Space Centre', h('div.col', {},
      h('p', {}, `Bean Field is a gravel pad in a turnip field: rockets up to ${FACILITY[0].maxMass} t, ${FACILITY[0].maxParts} parts and ${FACILITY[0].maxHeight} m tall.`),
      h('p', {}, F.desc + ' No size limits.'),
      h('p', {}, h('b', {}, `Cost: ${fmtFunds(UPGRADE_COST)}`), ` — you have ${fmtFunds(g.funds)}.`)),
      [{ label: 'Not yet' }, can ? { label: 'Build it!', value: 'go', primary: true } : { label: 'Need more money', value: null }]);
    if (r !== 'go' || g.funds < UPGRADE_COST) return;
    g.funds -= UPGRADE_COST; g.facility = 1; (g.log ||= []).push({ t: g.t, text: 'Moved to the Bean Space Centre' });
    G.save(); flash('Welcome to the Bean Space Centre!'); this.exit(); await this.enter();
  }
  click(k) {
    const G = this.G;
    if (k === 'vab') G.go('vab'); else if (k === 'pad') this.launchDialog(); else if (k === 'astronauts') G.go('astronauts');
    else if (k === 'mission') G.go(isCareer(G.game) ? 'mission' : 'tracking'); else if (k === 'rnd') G.go('rnd');
    else if (k === 'tracking') G.go('tracking'); else if (k === 'observatory') G.go('galaxy', { from: 'center' });
  }
  async launchDialog() {
    const G = this.G; const game = G.game;
    const sel = h('select', {}, game.designs.map((d, i) => h('option', { value: i, selected: i === game.selectedDesign ? true : undefined }, d.name)));
    const career = isCareer(game);
    const where = career ? h('select', {}, h('option', { value: 'pad' }, NAMES[this.level].pad + ' (Earth)'), h('option', { value: 'runway' }, (this.level ? 'Runway' : 'Grass airstrip') + ' (planes)'))
      : h('select', {}, h('option', { value: 'pad' }, 'Launch Pad 39B (Earth)'), h('option', { value: 'runway' }, 'Runway (planes)'), h('option', { value: 'leo' }, 'Low Earth Orbit, 400 km (sandbox)'), h('option', { value: 'moon' }, 'Lunar surface (sandbox)'), h('option', { value: 'mars' }, 'Mars surface (sandbox)'), h('option', { value: 'helio' }, 'Deep space near Earth (sandbox)'));
    const info = h('div.small.muted');
    const check = () => { // career: price and launch-site limits of the chosen design
      if (!career) return true; const c = launchCheck(game, game.designs[+sel.value]); const bad = c.problems;
      info.innerHTML = `Cost <b>${fmtFunds(c.cost)}</b> (you have ${fmtFunds(game.funds)}) · ${c.mass.toFixed(1)} t · ${c.parts} parts · ${c.height.toFixed(1)} m` + (bad.length ? `<br><span style="color:#f87171">Can't launch: ${bad.join('; ')}.</span>` : '');
      return !bad.length;
    };
    const pickSite = () => { const d = game.designs[+sel.value]; let gear = false; const walkN = (n) => { if (!n || gear) return; if (/^gear_/.test(n.id)) gear = true; walkN(n.below); for (const r of n.radial || []) walkN(r.node); walkN(n.stack); }; walkN(d?.root); where.value = gear ? 'runway' : 'pad'; };
    sel.onchange = () => { pickSite(); check(); }; pickSite(); check();
    const avail = game.roster.filter(a => a.status === 'available');
    const crew = h('select', { multiple: true, size: Math.min(5, Math.max(2, avail.length)) }, avail.map((a, i) => h('option', { value: a.name, selected: i === 0 ? true : undefined }, `${a.name} (${a.trait})`)));
    const r = await modal('Launch', h('div.col', {}, h('label', {}, 'Vessel'), sel, h('label', {}, 'Start location'), where, h('label', {}, 'Crew (seats permitting)'), crew, info), [{ label: 'Cancel' }, { label: 'Launch!', value: 'go', primary: true }]);
    if (r !== 'go') return;
    if (career) { if (!check()) return flash(info.textContent.split("Can't launch: ")[1] || 'Cannot launch'); game.funds -= launchCheck(game, game.designs[+sel.value]).cost; }
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
    for (const k in this.spots) {
      const p = localToSystem(earth, G.t, this.site, this.spots[k]);
      const v = new THREE.Vector3(p.x - camPos.x, p.y - camPos.y, p.z - camPos.z).project(cam);
      const el = this.labels[k];
      if (v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1) { el.style.display = ''; el.style.left = ((v.x + 1) / 2 * W) + 'px'; el.style.top = ((1 - v.y) / 2 * H) + 'px'; } else el.style.display = 'none';
    }
  }
}

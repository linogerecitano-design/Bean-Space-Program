import * as THREE from 'three';
import { h, mount, clearUI, modal, flash } from '../ui/ui.js';
import { V3 } from '../core/math.js';
import { newGame, importCode, exportCode, downloadSave, cloud, saveLocal } from '../game/save.js';
import { PART_COUNT } from '../data/parts.js';
import { graphicsDialog } from '../ui/graphics.js';

export class MenuScene {
  constructor(G) { this.G = G; this.a = 0; }
  async enter() {
    const G = this.G; G.setSystem('sol');
    clearUI();
    const has = !!G.game;
    const menu = h('div#menu.panel', {},
      h('div.title', {}, 'BEAN ', h('span', {}, 'SPACE'), h('br'), 'PROGRAM'),
      h('div.dim.small', {}, `Real Solar System · ${PART_COUNT} parts · the whole galaxy`),
      has ? h('button.big.primary', { onclick: () => this.start() }, 'Continue') : null,
      h('button.big' + (has ? '' : '.primary'), { onclick: () => this.newGame('career') }, 'New Career'),
      h('button.big', { onclick: () => this.newGame('sandbox') }, 'New Sandbox Game'),
      h('button', { onclick: () => this.saves() }, 'Saves & Sync (desktop ⇄ mobile)'),
      h('button', { onclick: () => G.go('galaxy', { from: 'menu' }) }, 'Explore the Galaxy'),
      h('button', { onclick: () => graphicsDialog() }, 'Graphics'),
      h('button', { onclick: () => this.credits() }, 'Controls & Credits'),
      h('div.dim.small', {}, cloud.available() ? '☁ Cloud sync active — progress follows you across devices.' : 'Saves are stored on this device. Use Saves & Sync to move them to another device.'));
    mount(menu);
    G.t = G.game ? G.game.t : G.t;
  }
  async start() { await this.G.go('center'); }
  async newGame(mode) {
    const G = this.G;
    const what = mode === 'career' ? 'Career: start at a small launch site with little money and a few parts. Earn money from contracts and Tech Points from science and achievements to research the tech tree — and eventually buy the full Bean Space Centre.' : 'Sandbox: every part unlocked, unlimited money, teleport anywhere.';
    if (G.game && !await modal(mode === 'career' ? 'New career' : 'New sandbox game', what + '<br><br>Your current save will be replaced (export it first from Saves & Sync if you want to keep it).', [{ label: 'Cancel', value: false }, { label: 'Start', value: true, primary: true }])) return;
    G.game = newGame(mode); G.t = G.game.t; G.save(true); await G.go('center');
  }
  async saves() {
    const G = this.G;
    const ta = h('textarea', { placeholder: 'Paste a save code here to import…' });
    const body = h('div.col', {},
      h('div', {}, 'Your progress is saved automatically on this device' + (cloud.available() ? ' and to your account (cloud), so it syncs between phone and desktop.' : '.')),
      h('div.dim.small', {}, 'To move a save manually: Export a code (or file) here, then Import it on the other device.'), ta);
    const r = await modal('Saves & Sync', body, [{ label: 'Import code', value: 'imp' }, { label: 'Load .bsp file', value: 'file' }, { label: 'Export code', value: 'exp', primary: true }, { label: 'Download file', value: 'dl' }, { label: 'Close' }]);
    try {
      if (r === 'imp') { G.game = await importCode(ta.value); saveLocal(G.game); cloud.save(G.game); flash('Save imported'); this.enter(); }
      if (r === 'exp') { if (!G.game) return flash('No game to export'); const code = await exportCode(G.game); try { await navigator.clipboard.writeText(code); } catch (e) {} await modal('Save code', h('textarea', { readonly: true, onclick: (e) => e.target.select() }, code), [{ label: 'Done' }]); }
      if (r === 'dl') { if (G.game) downloadSave(G.game); }
      if (r === 'file') {
        const inp = h('input', { type: 'file', accept: '.bsp,.txt' });
        inp.onchange = async () => { const txt = await inp.files[0].text(); G.game = await importCode(txt); saveLocal(G.game); cloud.save(G.game); flash('Save loaded'); this.enter(); };
        inp.click();
      }
    } catch (e) { flash('Import failed: ' + e.message, 4000); }
  }
  credits() {
    modal('Controls & Credits', `
      <b>Flight (keyboard)</b>: W/S pitch · A/D yaw · Q/E roll · Shift/Ctrl throttle · Z full · X cut · Space stage · T SAS · R RCS · I/J/K/L/H/N translate · M map · , / . time warp · F EVA/board · G legs/chutes · V camera · Esc pause<br>
      <b>Touch</b>: left stick = pitch/yaw, ⟲⟳ roll, right slider = throttle, big button = stage. Drag the view to orbit the camera, pinch to zoom.<br><br>
      <b>Art credits</b><br>
      Mr. Bean toon model: vicente betoret ferrero (Sketchfab, CC-BY-4.0).<br>
      Planet textures: Solar System Scope (CC-BY-4.0); moon & dwarf-planet maps by Steve Albers, Björn Jónsson; NASA/JPL/USGS imagery; lunar elevation NASA LRO LOLA; Earth relief from three-globe (NASA data).<br>
      Ground materials, rocks, trees and plants: Poly Haven (CC0).<br>
      Coastline data: Natural Earth. Engine & part data from public NASA / manufacturer figures.`, [{ label: 'Close' }]);
  }
  exit() { clearUI(); }
  update(dt) {
    const G = this.G; this.a += dt * 0.02;
    G.t += dt * 60;
    const earth = G.sys.get('Earth');
    const bp = earth.posAt(G.t);
    const cam = G.world.camera;
    const d = earth.radius * 2.4;
    const off = new THREE.Vector3(Math.cos(this.a) * d, earth.radius * 0.5, Math.sin(this.a) * d);
    const camPos = bp.clone().add(new V3(off.x, off.y, off.z));
    cam.position.set(0, 0, 0); cam.up.set(0, 1, 0);
    cam.lookAt(-off.x + Math.sin(this.a) * earth.radius * 0.9, -off.y, -off.z - Math.cos(this.a) * earth.radius * 0.9);
    cam.updateMatrixWorld();
    G.world.update({ t: G.t, camPos });
  }
}

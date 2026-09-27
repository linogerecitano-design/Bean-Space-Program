import * as THREE from 'three';
import { h, mount, clearUI, modal, flash } from '../ui/ui.js';
import { V3 } from '../core/math.js';
import { newGame, importCode, exportCode, downloadSave, cloud, saveLocal, listSaves, loadSave, deleteSave, ensureSlot } from '../game/save.js';
import { PART_COUNT } from '../data/parts.js';
import { graphicsDialog } from '../ui/graphics.js';
import { beanier, setBeanier } from '../game/settings.js';

export class MenuScene {
  constructor(G) { this.G = G; this.a = 0; }
  async enter() {
    const G = this.G; G.setSystem('sol');
    clearUI();
    const has = !!G.game;
    const menu = h('div#menu.panel', {},
      h('div.title', {}, 'BEAN ', h('span', {}, 'SPACE'), h('br'), 'PROGRAM'),
      h('div.dim.small', {}, `Real Solar System · ${PART_COUNT} parts · the whole galaxy`),
      has ? h('button.big.primary', { onclick: () => this.start() }, h('div', {}, 'Continue'), h('div.small', { style: { opacity: 0.8, fontWeight: 400 } }, G.game.name || '')) : null,
      h('button.big', { onclick: () => this.loadMenu() }, 'Load Game'),
      h('button.big' + (has ? '' : '.primary'), { onclick: () => this.newGame('career') }, 'New Career'),
      h('button.big', { onclick: () => this.newGame('sandbox') }, 'New Sandbox Game'),
      h('button', { onclick: () => this.saves() }, 'Saves & Sync (desktop ⇄ mobile)'),
      h('button', { onclick: () => G.go('galaxy', { from: 'menu' }) }, 'Explore the Galaxy'),
      h('button', { onclick: () => graphicsDialog() }, 'Graphics'),
      h('button', { onclick: () => this.credits() }, 'Controls & Credits'),
      h('button.beanier', { onclick: (e) => { setBeanier(!beanier()); e.target.textContent = '🫘 Beanier Beans: ' + (beanier() ? 'ON' : 'off'); flash(beanier() ? 'The Beans have gone floppy.' : 'The Beans stand up straight again.'); } }, '🫘 Beanier Beans: ' + (beanier() ? 'ON' : 'off')),
      h('div.dim.small', {}, cloud.available() ? '☁ Cloud sync active — progress follows you across devices.' : 'Saves are stored on this device. Use Saves & Sync to move them to another device.'));
    mount(menu);
    G.t = G.game ? G.game.t : G.t;
  }
  async start() { await this.G.go('center'); }
  async newGame(mode) {
    const G = this.G;
    const what = mode === 'career' ? 'Career: start at a small launch site with little money and a few parts. Earn money from contracts and Tech Points from science and achievements to research the tech tree — and eventually buy the full Bean Space Centre.' : 'Sandbox: every part unlocked, unlimited money, teleport anywhere.';
    const g = newGame(mode);
    const name = h('input', { value: g.name, maxlength: 40 });
    if (!await modal(mode === 'career' ? 'New career' : 'New sandbox game', h('div.col', {}, h('div', {}, what), h('label', {}, 'Save name'), name, h('div.small.dim', {}, 'Your other saves are kept — switch between them from Load Game.')), [{ label: 'Cancel', value: false }, { label: 'Start', value: true, primary: true }])) return;
    if (G.game) G.save(true); // keep the current game's progress in its own slot
    g.name = name.value.trim() || g.name; G.game = g; G.t = g.t; G.save(true); await G.go('center');
  }
  // save selector: every slot on this device and in the cloud
  async loadMenu() {
    const G = this.G;
    const box = h('div.col.saves', {}, h('div.dim', {}, 'Loading saves…'));
    const done = modal('Load Game', box, [{ label: 'Close' }]);
    const ago = (t) => { const m = (Date.now() - t) / 60000; return m < 1 ? 'just now' : m < 60 ? Math.round(m) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
    const fill = async () => {
      if (G.game) G.save(true);
      const list = await listSaves();
      box.replaceChildren(...(list.length ? list.map(x => {
        const cur = G.game && G.game.slot === x.id;
        const info = x.mode === 'career' ? `£${Math.round(x.funds || 0).toLocaleString()} · ${Math.floor(x.tp || 0)} TP · ${x.facility ? 'Bean Space Centre' : 'Bean Field'}` : 'Everything unlocked';
        return h('div.save-row' + (cur ? '.cur' : ''), {},
          h('div.save-badge.' + (x.mode || 'sandbox'), {}, x.mode === 'career' ? '💼' : '🧪'),
          h('div.save-txt', {}, h('b', {}, x.name || 'Unnamed save'), h('div.small', {}, (x.mode === 'career' ? 'Career' : 'Sandbox') + ' · ' + info), h('div.small.dim', {}, (cur ? 'Playing now · ' : '') + 'saved ' + ago(x.updated) + (x.cloudNewer && !x.local ? ' · ☁ from another device' : ''))),
          h('div.save-btns', {},
            h('button.primary', { onclick: async () => { const g = cur ? G.game : await loadSave(x); if (!g) return flash('Could not load that save'); G.game = g; G.t = g.t; document.querySelector('.modal-bg')?.remove(); await G.go('center'); } }, cur ? 'Resume' : 'Play'),
            h('button', { title: 'Rename', onclick: async () => { const inp = h('input', { value: x.name || '', maxlength: 40 }); if (await modal('Rename save', inp, [{ label: 'Cancel', value: false }, { label: 'Rename', value: true, primary: true }]) !== true) return; const g = cur ? G.game : await loadSave(x); if (!g) return; g.name = inp.value.trim() || g.name; saveLocal(g); await cloud.save(g); fill(); } }, '✎'),
            h('button.danger', { title: 'Delete', onclick: async () => { if (await modal('Delete save?', `“${x.name}” will be deleted from this device${cloud.available() ? ' and your account' : ''}. This can't be undone.`, [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, danger: true }]) !== true) return; await deleteSave(x.id); if (cur) G.game = null; fill(); } }, '🗑')));
      }) : [h('div.dim', {}, 'No saves yet — start a New Career or Sandbox game.')]));
    };
    await fill(); await done; this.enter();
  }
  async saves() {
    const G = this.G;
    const ta = h('textarea', { placeholder: 'Paste a save code here to import…' });
    const body = h('div.col', {},
      h('div', {}, 'Your progress is saved automatically on this device' + (cloud.available() ? ' and to your account (cloud), so it syncs between phone and desktop.' : '.')),
      h('div.dim.small', {}, 'To move a save manually: Export a code (or file) here, then Import it on the other device.'), ta);
    const r = await modal('Saves & Sync', body, [{ label: 'Import code', value: 'imp' }, { label: 'Load .bsp file', value: 'file' }, { label: 'Export code', value: 'exp', primary: true }, { label: 'Download file', value: 'dl' }, { label: 'Close' }]);
    try {
      if (r === 'imp') { G.game = ensureSlot(await importCode(ta.value)); saveLocal(G.game); cloud.save(G.game); flash('Save imported'); this.enter(); }
      if (r === 'exp') { if (!G.game) return flash('No game to export'); const code = await exportCode(G.game); try { await navigator.clipboard.writeText(code); } catch (e) {} await modal('Save code', h('textarea', { readonly: true, onclick: (e) => e.target.select() }, code), [{ label: 'Done' }]); }
      if (r === 'dl') { if (G.game) downloadSave(G.game); }
      if (r === 'file') {
        const inp = h('input', { type: 'file', accept: '.bsp,.txt' });
        inp.onchange = async () => { const txt = await inp.files[0].text(); G.game = ensureSlot(await importCode(txt)); saveLocal(G.game); cloud.save(G.game); flash('Save loaded'); this.enter(); };
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

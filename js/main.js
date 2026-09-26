// Bean Space Program — boot, shared context and scene manager.
import * as THREE from 'three';
import { World } from './render/world.js';
import { loadSystem, START_T } from './core/universe.js';
import { loadCpuMaps, loadGroundArrays, IS_MOBILE, ensureAlbedo } from './render/textures.js';
import { loadScatterLibrary } from './render/scatter.js';
import { loadAstronautBase } from './render/astronaut.js';
import { endFrame } from './core/input.js';
import { newGame, loadLocal, saveLocal, cloud } from './game/save.js';
import { progress } from './ui/ui.js';
import { initCompactDrawers } from './ui/compact.js';
import { MenuScene } from './scenes/menu.js';
import { SpaceCenterScene } from './scenes/spaceCenter.js';
import { VABScene } from './scenes/vab.js';
import { FlightScene } from './scenes/flight.js';
import { TrackingScene } from './scenes/tracking.js';
import { GalaxyScene } from './scenes/galaxy.js';
import { AstronautScene } from './scenes/astronauts.js';
import { RnDScene } from './scenes/rnd.js';
import { MissionScene } from './scenes/mission.js';

const G = window.BSP = {
  world: null, game: null, scene: null, scenes: {}, t: START_T, sys: null, mobile: IS_MOBILE,
  async go(name, params = {}) {
    if (G.scene && G.scene.exit) G.scene.exit();
    const s = G.scenes[name]; G.scene = s; G.sceneName = name;
    document.getElementById('view').focus();
    await s.enter(params);
  },
  setSystem(starId) { G.sys = loadSystem(starId); G.world.setSystem(G.sys); return G.sys; },
  save(silent) {
    if (!G.game) return; G.game.t = G.t;
    if (G.scene && G.scene.persist) G.scene.persist();
    saveLocal(G.game); cloud.save(G.game);
    if (!silent) import('./ui/ui.js').then(m => m.flash('Game saved'));
  },
};

// Compact UI for phones (either orientation) and small windows: the short side decides.
function setCompact() {
  const s = Math.min(innerWidth, innerHeight), coarse = matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('compact', s < 560 || innerWidth < 760 || (coarse && s < 720));
  document.body.classList.toggle('portrait', innerHeight > innerWidth);
}
setCompact(); addEventListener('resize', setCompact);
initCompactDrawers();

async function boot() {
  cloud.init(); // resolves in parallel with loading (null when not hosted on claude.ai)
  const bar = document.getElementById('loadbar'), txt = document.getElementById('loadtxt');
  const steps = [];
  let done = 0; const total = 5;
  const step = (label) => { txt.textContent = label; progress(bar, done / total); };
  const tick = () => { done++; progress(bar, done / total); };
  step('Loading real planet elevation & surface maps…');
  await loadCpuMaps(); tick();
  step('Building ground materials…');
  await loadGroundArrays(); tick();
  step('Suiting up the astronauts…');
  await loadAstronautBase(); tick();
  G.world = new World(document.getElementById('view'));
  G.setSystem('sol'); tick();
  step('Loading rocks, trees and plants…');
  const scatterP = loadScatterLibrary((f) => { txt.textContent = `Loading rocks, trees and plants… ${Math.round(f * 100)}%`; });
  ensureAlbedo('Earth');
  await Promise.race([scatterP, new Promise(r => setTimeout(r, new URLSearchParams(location.search).get('scene') ? 1500 : IS_MOBILE ? 4000 : 15000))]); tick();
  // saves: prefer the newest of local and cloud
  const local = loadLocal(); const remote = await cloud.load();
  G.game = [local, remote].filter(Boolean).sort((a, b) => (b.updated || 0) - (a.updated || 0))[0] || null;
  G.scenes = { menu: new MenuScene(G), center: new SpaceCenterScene(G), vab: new VABScene(G), flight: new FlightScene(G), tracking: new TrackingScene(G), galaxy: new GalaxyScene(G), astronauts: new AstronautScene(G), rnd: new RnDScene(G), mission: new MissionScene(G) };
  document.getElementById('loading').remove();
  const qs = new URLSearchParams(location.search);
  if (qs.get('scene')) { if (!G.game) G.game = newGame('sandbox'); G.t = G.game.t; const sc = qs.get('scene'); await G.go(sc, sc === 'flight' ? { design: G.game.designs[+(qs.get('d') || 1)], where: qs.get('where') || 'pad', crew: [G.game.roster[0].name] } : { starId: qs.get('star') || undefined, focus: qs.get('focus') || undefined }); } else await G.go('menu');
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try { if (G.scene) G.scene.update(dt); } catch (e) { console.error(e); }
    endFrame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // manual stepping (used when the page is hidden and rAF is paused)
  G.step = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { try { G.scene.update(dt); } catch (e) { console.error(e); } endFrame(); } };
  setInterval(() => { if (G.game && G.sceneName !== 'menu') G.save(true); }, 60000);
  addEventListener('visibilitychange', () => { if (document.hidden && G.game && G.sceneName !== 'menu') G.save(true); });
}
boot().catch(e => { console.error(e); const t = document.getElementById('loadtxt'); if (t) t.textContent = 'Error: ' + e.message; });

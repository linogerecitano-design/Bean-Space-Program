// Game state + persistence. Saves go to localStorage and (when the page is hosted with the
// artifact storage capability) to per-user cloud storage so desktop and phone share progress.
// Save codes (compressed text) and .bsp files work everywhere as a manual fallback.
import { START_T } from '../core/universe.js';
import { newNode } from '../core/vessel.js';
import { initCareer } from './career.js';

const KEY = 'bsp.save.v1';
const FIRST = ['Bean', 'Jebedean', 'Valentean', 'Bobean', 'Billbean', 'Neil', 'Sally', 'Yuri', 'Valentina', 'Buzz', 'Mae', 'Chris', 'Peggy', 'Gene', 'Kalpana', 'Tim'];
const LAST = ['Bean', 'Beanman', 'Beanfield', 'Beanstrong', 'Beanski', 'Beanova', 'Beanworth', 'Beancroft', 'Van Bean', 'McBean'];

export function defaultDesigns() {
  const d = (name, root) => ({ name, root, builtin: true });
  // Bean-1 suborbital hopper
  const hop = newNode('pod_mercury'); hop.below = newNode('heat_2.5'); hop.below.below = newNode('dec_1.25');
  let c = hop.below.below; c.below = newNode('tank_Falcon_4'); c = c.below; c.below = newNode('eng_merlin'); hop.radial.push({ sym: 1, at: 0.2, node: newNode('chute_main') });
  hop.below.below.below.radial.push({ sym: 4, at: 0.85, node: newNode('fin_delta') });
  // Falcon-9 style orbital rocket with Dragon
  const f9 = newNode('pod_dragon'); f9.radial.push({ sym: 1, at: 0.1, node: newNode('chute_cluster') });
  c = f9; const add = (id) => { c.below = newNode(id); c = c.below; return c; };
  add('adapt_3.66_5.2'); add('dec_3.75'); add('tank_Falcon_12'); add('eng_mvac'); add('dec_3.75'); add('tank_Falcon_36');
  const t36 = c; t36.radial.push({ sym: 4, at: 0.05, node: newNode('fin_grid') }); t36.radial.push({ sym: 4, at: 0.95, node: newNode('legs_f9') }); add('eng_merlin9');
  // Saturn V style Moon rocket
  const sv = newNode('les_tower'); c = sv; add('pod_apollo'); c.radial.push({ sym: 1, at: 0.1, node: newNode('chute_cluster') }); add('dec_3.75'); add('tank_Service_4'); c.radial.push({ sym: 4, at: 0.5, node: newNode('rcs_quad') }); add('eng_aj10');
  add('adapt_3.75_5.4'); add('pod_lm'); c.radial.push({ sym: 4, at: 0.8, node: newNode('legs_lm') }); add('tank_Small_1.6'); add('eng_dps'); add('adapt_5.4_7'); add('dec_7');
  add('tank_SIVB_16'); add('eng_j2'); add('adapt_7_9'); add('dec_9'); add('tank_SLSCore_16'); add('tank_SLSCore_16'); add('eng_j2x5'); add('adapt_9_10.1'); add('dec_10.1'); add('tank_SaturnSIC_30');
  c.radial.push({ sym: 4, at: 0.9, node: newNode('fin_large') }); add('eng_f1x5');
  // Heavy lifter with strap-on boosters (SLS-like)
  const sls = newNode('pod_orion'); c = sls; sls.radial.push({ sym: 1, at: 0.1, node: newNode('chute_cluster') }); add('heat_5'); add('dec_5.4'); add('tank_Service_4'); c.radial.push({ sym: 4, at: 0.5, node: newNode('solar_juno') }); add('eng_aj10');
  add('adapt_5.4_7'); add('dec_7'); add('tank_Centaur_10'); add('eng_rl10b'); add('adapt_7_9'); add('dec_9'); add('tank_SLSCore_64');
  const core = c; const rd = newNode('dec_radial_l'); rd.stack = newNode('nose_3.75'); rd.stack.below = newNode('srb_sls'); rd.stackOffset = 0.5;
  core.radial.push({ sym: 2, at: 0.25, node: rd }); add('eng_rs25x4');
  // Ion probe
  const ion = newNode('probe_voyager'); c = ion; ion.radial.push({ sym: 2, at: 0.5, node: newNode('solar_rosa') }); add('tank_xenon_l'); add('eng_nextc'); add('dec_2.5'); add('tank_Centaur_4'); add('eng_rl10'); add('dec_5.4');
  add('adapt_3.66_5.2'); add('tank_Falcon_24'); add('eng_merlin9');
  // Interstellar fusion ship (Daedalus-like) — to be assembled in orbit in reality; here it just launches
  const ds = newNode('probe_voyager'); c = ds; add('isd_shield'); add('ant_interstellar'); add('isd_cryo'); add('tank_dhe3_s'); add('isd_daedalus2'); add('dec_10.1'); add('tank_dhe3'); add('isd_daedalus');
  ds.radial.push({ sym: 4, at: 0.3, node: newNode('isd_radiator') });
  // Warp courier (sandbox)
  const wp = newNode('pod_orion'); c = wp; add('reactor_fusion'); add('isd_warp'); add('tank_lh2_ntr_s'); add('eng_nerva'); add('dec_9'); add('tank_Starship_50'); add('eng_raptor33');
  return [d('Bean-1 Hopper', hop), d('Falcon Dragon', f9), d('Saturn Moonshot', sv), d('Heavy Lift SLS', sls), d('Deep Ion Probe', ion), d('Daedalus Starship', ds), d('Warp Courier (sandbox)', wp)];
}

function makeRoster() {
  const r = [];
  const names = new Set();
  const base = [['Bean', 'Bean'], ['Jebedean', 'Beanman'], ['Valentean', 'Beanova'], ['Bobean', 'Beanworth']];
  for (const [f, l] of base) { r.push({ name: `${f} ${l}`, status: 'available', xp: 0, trait: ['Pilot', 'Engineer', 'Scientist', 'Pilot'][r.length % 4], suit: [0xffffff, 0xffe8d0, 0xe8f0ff, 0xf0f0f0][r.length % 4], missions: 0 }); names.add(`${f} ${l}`); }
  return r;
}

// career starts with starter-tech rockets only
export function careerDesigns() {
  const d = (name, root) => ({ name, root, builtin: true });
  const hop = newNode('pod_mercury'); hop.radial.push({ sym: 1, at: 0.1, node: newNode('chute_main') });
  let c = hop; const add = (id) => { c.below = newNode(id); c = c.below; return c; };
  add('heat_1.25'); add('dec_1.25'); add('srb_castor4'); c.radial.push({ sym: 4, at: 0.9, node: newNode('fin_delta') });
  const snd = newNode('probe_sputnik'); c = snd; add('srb_blackbrant');
  c.radial.push({ sym: 1, at: 0.12, node: newNode('sci_thermo') }); c.radial.push({ sym: 1, at: 0.12, angle: Math.PI, node: newNode('sci_baro') });
  c.radial.push({ sym: 3, at: 0.92, node: newNode('fin_delta') });
  return [d('Castor Hopper', hop), d('Sounding Probe', snd)];
}
export function newGame(mode = 'sandbox') {
  const g = newGameBase(mode); g.slot = newSlotId(); g.name = nameFor(mode);
  if (mode === 'career') { initCareer(g); g.designs = careerDesigns(); g.selectedDesign = 0; }
  return g;
}
function newGameBase(mode) {
  return {
    version: 1, mode, created: Date.now(), updated: Date.now(),
    t: START_T, funds: mode === 'career' ? 250000 : Infinity, science: 0,
    roster: makeRoster(), designs: defaultDesigns(), vessels: [], flags: [],
    selectedDesign: 1, activeVessel: null, settings: { quality: null, sound: true },
    discovered: ['sol'], log: [],
  };
}
export function hireAstronaut(game) {
  const f = FIRST[Math.floor(Math.random() * FIRST.length)], l = LAST[Math.floor(Math.random() * LAST.length)];
  game.roster.push({ name: `${f} ${l}`, status: 'available', xp: 0, trait: ['Pilot', 'Engineer', 'Scientist'][Math.floor(Math.random() * 3)], suit: 0xffffff, missions: 0 });
}

// ---------------------------------------------------------------- persistence
const serialize = (g) => JSON.stringify(g, (k, v) => v === Infinity ? '__inf' : v);
const deserialize = (s) => JSON.parse(s, (k, v) => v === '__inf' ? Infinity : v);
// Save slots: every game has its own id; an index lists them for the save selector.
const INDEX = 'bsp.slots.v1', LAST_SLOT = 'bsp.lastSlot';
const slotKey = (id) => 'bsp.save.v1.' + id;
const newSlotId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export function slotSummary(g) { return { id: g.slot, name: g.name, mode: g.mode, updated: g.updated || 0, funds: g.funds === Infinity ? null : g.funds, tp: g.tp || 0, facility: g.facility || 0, t: g.t }; }
function nameFor(mode) { const n = readIndex().filter(x => x.mode === mode).length + 1; return `${mode === 'career' ? 'Career' : 'Sandbox'} ${n}`; }
export function ensureSlot(game) { if (!game.slot) game.slot = newSlotId(); if (!game.name) game.name = nameFor(game.mode || 'sandbox'); return game; }
function readIndex() { try { return JSON.parse(localStorage.getItem(INDEX) || '[]'); } catch (e) { return []; } }
function writeIndex(list) { try { localStorage.setItem(INDEX, JSON.stringify(list)); } catch (e) {} }
let migrating = false;
function migrateLegacy() { // the old single save becomes the first slot
  if (migrating) return; migrating = true;
  try { const s = localStorage.getItem(KEY); if (!s) return; const g = deserialize(s); ensureSlot(g); localStorage.setItem(slotKey(g.slot), serialize(g)); writeIndex([...readIndex().filter(x => x.id !== g.slot), slotSummary(g)]); localStorage.setItem(LAST_SLOT, g.slot); localStorage.removeItem(KEY); } catch (e) {} finally { migrating = false; }
}
export function listLocal() { migrateLegacy(); return readIndex().sort((a, b) => b.updated - a.updated); }
export function saveLocal(game) {
  ensureSlot(game); game.updated = Date.now();
  try { localStorage.setItem(slotKey(game.slot), serialize(game)); localStorage.setItem(LAST_SLOT, game.slot); } catch (e) { return false; }
  writeIndex([...readIndex().filter(x => x.id !== game.slot), slotSummary(game)]);
  return true;
}
export function loadLocal(id) {
  migrateLegacy();
  try { id ||= localStorage.getItem(LAST_SLOT) || listLocal()[0]?.id; if (!id) return null; const s = localStorage.getItem(slotKey(id)); return s ? deserialize(s) : null; } catch (e) { return null; }
}
export function deleteLocal(id) { try { localStorage.removeItem(slotKey(id)); if (localStorage.getItem(LAST_SLOT) === id) localStorage.removeItem(LAST_SLOT); } catch (e) {} writeIndex(readIndex().filter(x => x.id !== id)); }
export function renameLocal(id, name) { const g = loadLocal(id); if (!g) return; g.name = name; const u = g.updated; saveLocal(g); }

async function gz(text) { const cs = new CompressionStream('gzip'); const b = await new Response(new Blob([text]).stream().pipeThrough(cs)).arrayBuffer(); return btoa(String.fromCharCode(...new Uint8Array(b))); }
async function gunzip(b64) { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const ds = new DecompressionStream('gzip'); return await new Response(new Blob([bin]).stream().pipeThrough(ds)).text(); }
export async function exportCode(game) { return 'BSP1:' + await gz(serialize(game)); }
export async function importCode(code) { code = code.trim(); if (!code.startsWith('BSP1:')) throw new Error('Not a Bean Space Program save code'); return deserialize(await gunzip(code.slice(5))); }
export async function downloadSave(game) {
  const code = await exportCode(game);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' })); a.download = `bean-space-program-${new Date().toISOString().slice(0, 10)}.bsp`; a.click();
}

// Cloud sync: when the game is hosted as a claude.ai Artifact with the `db` + `user` capabilities,
// each player's save lives in their own private data/users/<id>/ documents, so it follows them
// between desktop and phone. Stored gzip+base64, chunked under the 256 KiB document limit.
const CHUNK = 180000;
let _ns = null, _ready = false, _saving = null;
function ns() {
  if (_ns) return _ns;
  if (!window.claude || typeof window.claude.use !== 'function') return (_ns = Promise.resolve(null));
  _ns = Promise.all([window.claude.use('db'), window.claude.use('user')]).then(async ([db, user]) => {
    if (!db || !user) return null;
    const id = await user.id(); if (!id) return null;
    _ready = true; return { db, base: 'data/users/' + id };
  }).catch(() => null);
  return _ns;
}
export const cloud = {
  available() { return _ready; },
  init() { return ns(); },
  async _list(n) { const d = await n.db.doc(`${n.base}/slots`).get(); return d.exists ? (d.data().list || []) : null; },
  async _setList(n, list) { await n.db.doc(`${n.base}/slots`).set({ list }); },
  async _write(n, game) {
    const id = game.slot, code = await exportCode(game); const parts = Math.ceil(code.length / CHUNK);
    for (let i = 0; i < parts; i++) await n.db.doc(`${n.base}/s_${id}_${i}`).set({ s: code.slice(i * CHUNK, (i + 1) * CHUNK) });
    await n.db.doc(`${n.base}/s_${id}`).set({ parts, updated: game.updated || Date.now(), version: 2 });
    const list = (await this._list(n)) || []; await this._setList(n, [...list.filter(x => x.id !== id), slotSummary(game)]);
  },
  async save(game) {
    const n = await ns(); if (!n) return false;
    ensureSlot(game);
    if (_saving) { this._next = game; return _saving; } // one write chain at a time
    _saving = (async () => {
      try { await this._write(n, game); return true; }
      catch (e) { console.warn('cloud save failed', e && e.code, e && e.message); return false; }
      finally { _saving = null; if (this._next) { const g = this._next; this._next = null; this.save(g); } }
    })();
    return _saving;
  },
  // slot summaries in the cloud (migrating the old single cloud save the first time)
  async list() {
    const n = await ns(); if (!n) return [];
    try {
      let list = await this._list(n);
      if (!list) {
        list = [];
        const idx = await n.db.doc(`${n.base}/save`).get();
        if (idx.exists) { const { parts } = idx.data(); let code = ''; for (let i = 0; i < parts; i++) { const d = await n.db.doc(`${n.base}/save_${i}`).get(); if (!d.exists) { code = ''; break; } code += d.data().s; }
          if (code) { const g = ensureSlot(await importCode(code)); await this._write(n, g); list = [slotSummary(g)]; } }
        else await this._setList(n, []);
      }
      return list.sort((a, b) => b.updated - a.updated);
    } catch (e) { console.warn('cloud list failed', e && e.code); return []; }
  },
  async load(id) {
    const n = await ns(); if (!n || !id) return null;
    try {
      const idx = await n.db.doc(`${n.base}/s_${id}`).get(); if (!idx.exists) return null;
      const { parts } = idx.data(); let code = '';
      for (let i = 0; i < parts; i++) { const d = await n.db.doc(`${n.base}/s_${id}_${i}`).get(); if (!d.exists) return null; code += d.data().s; }
      return await importCode(code);
    } catch (e) { console.warn('cloud load failed', e && e.code); return null; }
  },
  async remove(id) {
    const n = await ns(); if (!n) return;
    try { const list = (await this._list(n)) || []; await this._setList(n, list.filter(x => x.id !== id)); const d = n.db.doc(`${n.base}/s_${id}`); if (d.delete) await d.delete(); else await d.set({ deleted: true, parts: 0 }); } catch (e) { console.warn('cloud delete failed', e && e.code); }
  },
};
// every save the player has, local and cloud merged (newest copy of each wins)
export async function listSaves() {
  const m = new Map();
  for (const x of listLocal()) m.set(x.id, { ...x, local: true });
  for (const x of await cloud.list()) { const o = m.get(x.id); if (!o || x.updated > o.updated) m.set(x.id, { ...x, local: !!o, cloudNewer: true }); }
  return [...m.values()].sort((a, b) => b.updated - a.updated);
}
export async function loadSave(entry) {
  let g = null;
  if (entry.cloudNewer) g = await cloud.load(entry.id);
  if (!g) g = loadLocal(entry.id);
  if (!g && !entry.cloudNewer) g = await cloud.load(entry.id);
  if (g) { ensureSlot(g); saveLocal(g); }
  return g;
}
export async function deleteSave(id) { deleteLocal(id); await cloud.remove(id); }

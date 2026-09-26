// Phone layout for the menu-style screens (VAB, tracking station, galaxy, astronaut complex): their side
// panels would cover the whole view on a small screen, so in compact mode each becomes a drawer opened
// from a small tab bar, one at a time. Scenes need no changes: panels are recognised by their ids.
import { h, ui } from './ui.js';

const PANELS = [['vab-left', 'Parts'], ['side', null], ['vab-right', 'Stats'], ['info', 'Info']];
let open = '', tabs = null, building = false;

function label(el, fallback) {
  if (fallback) return fallback; const b = el.querySelector('b, h2, h3'); const t = (b && b.textContent.trim()) || 'List';
  return t === 'Vessels' ? 'Bodies' : t; // tracking station: the vessel list sits above the (much longer) body list
}
function apply() {
  for (const [id] of PANELS) { const el = document.getElementById(id); if (el) el.classList.toggle('open', open === id); }
  if (tabs) for (const b of tabs.children) b.classList.toggle('on', b.dataset.id === open);
}
function setOpen(id) { open = open === id ? '' : id; apply(); }
function rebuild() {
  building = true;
  const present = PANELS.map(([id, l]) => [id, l, document.getElementById(id)]).filter(p => p[2]);
  tabs?.remove(); tabs = null;
  if (present.length) {
    for (const [, , el] of present) el.classList.add('drawer');
    tabs = h('div#ctabs.panel', {}, present.map(([id, l, el]) => { const b = h('button', { onclick: () => setOpen(id) }, label(el, l)); b.dataset.id = id; return b; }));
    ui().append(tabs);
    if (!present.some(p => p[0] === open)) open = '';
  } else open = '';
  apply();
  building = false;
}

export function initCompactDrawers() {
  const root = ui();
  // scenes rebuild their UI wholesale (clearUI + mount), so re-scan whenever #ui's children change
  let pending = false;
  new MutationObserver((recs) => {
    if (building || pending) return;
    if (!recs.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.id !== 'ctabs'))) return; // our own tab bar
    pending = true; queueMicrotask(() => { pending = false; rebuild(); });
  }).observe(root, { childList: true });
  // picking something from a list fills the info panel: follow it there
  let sideTap = 0;
  document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('#side')) sideTap = performance.now(); }, true);
  new MutationObserver((recs) => {
    if (open !== 'side' || performance.now() - sideTap > 800 || !document.body.classList.contains('compact')) return;
    if (recs.some(r => r.target.closest && r.target.closest('#info'))) { open = 'info'; apply(); }
  }).observe(root, { childList: true, subtree: true });
  // dragging a part out of the VAB drawer: get the drawer out of the way of the rocket
  new MutationObserver(() => { if (document.body.classList.contains('vab-holding') && open) { open = ''; apply(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  rebuild();
}

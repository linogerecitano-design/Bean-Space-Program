// Research & Development: the tech tree (spend Tech Points to unlock parts) and the achievements board.
// Pure DOM: a scrollable map of node cards joined by curved links, with a detail sheet for the
// selected node showing every part it unlocks.
import { h, mount, clearUI, flash, toast } from '../ui/ui.js';
import { PART } from '../data/parts.js';
import { partIcon } from '../render/partIcons.js';
import { TECH, TECH_BY_ID, canResearch, research, ACHIEVEMENTS, fmtFunds, EXPERIMENTS, SITUATIONS, sitText } from '../game/career.js';

const SVGNS = 'http://www.w3.org/2000/svg';

export class RnDScene {
  constructor(G) { this.G = G; this.tab = 'tree'; this.selected = null; }
  async enter(params = {}) {
    this.active = true; if (params.tab) this.tab = params.tab;
    this.build();
  }
  exit() { this.active = false; clearUI(); }
  update() {} // the page covers the canvas
  build() {
    const G = this.G, g = G.game;
    clearUI();
    const tabs = [['tree', '🧬 Tech tree'], ['ach', '🏆 Achievements'], ['sci', '📚 Science log']];
    this.money = h('div.clock.mono.money', {}, `${fmtFunds(g.funds)} · ${Math.floor(g.tp)} TP`);
    const page = h('div#rnd.rnd-page');
    mount(page); // under the top bar
    mount(h('div#topbar.panel', {}, h('button', { onclick: () => G.go('center') }, '← Space Centre'), this.money,
      ...tabs.map(([k, l]) => h('button' + (this.tab === k ? '.on' : ''), { onclick: () => { this.tab = k; this.build(); } }, l))));
    if (this.tab === 'tree') this.buildTree(page);
    else if (this.tab === 'ach') this.buildAch(page);
    else this.buildSci(page);
  }
  // ------------------------------------------------------------------ tech tree
  buildTree(page) {
    const g = this.G.game;
    const compact = document.body.classList.contains('compact');
    const CW = compact ? 132 : 170, CH = compact ? 74 : 92, PX = compact ? 176 : 228, PY = compact ? 92 : 116, M = 24;
    const tiers = Math.max(...TECH.map(t => t.tier)) + 1, rows = Math.max(...TECH.map(t => t.row)) + 1;
    const W = M * 2 + (tiers - 1) * PX + CW, H = M * 2 + (rows - 1) * PY + CH;
    const map = h('div.tree', { style: { width: W + 'px', height: H + 'px' } });
    const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.classList.add('links'); map.append(svg);
    const pos = (t) => [M + t.tier * PX, M + t.row * PY];
    const state = (t) => g.tech.includes(t.id) ? 'done' : canResearch(g, t) ? (g.tp >= t.cost ? 'ready' : 'avail') : 'locked';
    // tier headers
    const ERA = ['Start', 'Sounding rockets', 'Early space age', 'Race to the Moon', 'Modern spaceflight', 'Deep space', 'Next generation', 'Star drives', 'Interstellar'];
    for (let i = 0; i < tiers; i++) map.append(h('div.era', { style: { left: (M + i * PX) + 'px', width: CW + 'px' } }, ERA[i] || ''));
    for (const t of TECH) for (const r of t.req) {
      const a = TECH_BY_ID[r]; if (!a) continue; const [x0, y0] = pos(a), [x1, y1] = pos(t);
      const sx = x0 + CW, sy = y0 + CH / 2, ex = x1, ey = y1 + CH / 2, mx = (sx + ex) / 2;
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', `M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}`);
      p.setAttribute('class', 'link ' + (g.tech.includes(t.id) ? 'done' : g.tech.includes(r) ? 'avail' : 'locked'));
      svg.append(p);
    }
    for (const t of TECH) {
      const [x, y] = pos(t); const st = state(t);
      const card = h('div.tnode.' + st + (this.selected === t.id ? '.sel' : ''), { style: { left: x + 'px', top: y + 'px', width: CW + 'px', height: CH + 'px' }, onclick: () => { this.selected = t.id; this.build(); } },
        h('div.ticon', {}, t.icon), h('div.tname', {}, t.name),
        h('div.tmeta', {}, st === 'done' ? h('span.good', {}, '✓ Researched') : h('span', {}, `${t.cost} TP`), h('span.dim', {}, ` · ${t.parts.length} parts`)));
      map.append(card);
    }
    const scroller = h('div.tree-scroll', {}, map);
    page.append(scroller);
    // detail sheet
    const t = TECH_BY_ID[this.selected];
    if (t) {
      const st = state(t);
      const reqs = t.req.map(r => TECH_BY_ID[r]).filter(Boolean);
      const btn = st === 'done' ? h('button', { disabled: true }, '✓ Researched')
        : st === 'locked' ? h('button', { disabled: true }, 'Research ' + reqs.filter(r => !g.tech.includes(r.id)).map(r => r.name).join(' & ') + ' first')
        : h('button.primary' + (st === 'ready' ? '.glow' : ''), { disabled: st !== 'ready' ? true : undefined, onclick: () => this.doResearch(t) }, st === 'ready' ? `Research for ${t.cost} TP` : `Need ${t.cost} TP (have ${Math.floor(g.tp)})`);
      const icons = h('div.tparts');
      const sheet = h('div.tsheet.panel', {},
        h('div.tsheet-head', {}, h('h3', {}, t.icon + ' ' + t.name), h('button.pm-x', { onclick: () => { this.selected = null; this.build(); } }, '✕')),
        reqs.length ? h('div.small.dim', {}, 'Requires: ' + reqs.map(r => r.name).join(', ')) : null,
        icons, btn);
      page.append(sheet);
      const r = this.G.world.renderer; let k = 0; const items = t.parts.map(id => PART[id]).filter(Boolean).map(p => { const img = h('img', { alt: '' }); icons.append(h('div.tpart', { title: p.basis }, img, h('span', {}, p.name))); return { img, p }; });
      const step = () => { if (!this.active || !icons.isConnected) return; const t0 = performance.now(); while (k < items.length && performance.now() - t0 < 12) { const it = items[k++]; try { it.img.src = partIcon(r, it.p); } catch (e) { } } if (k < items.length) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    // keep the scroll position across rebuilds; first time, show the frontier
    if (this.scroll) { scroller.scrollLeft = this.scroll[0]; scroller.scrollTop = this.scroll[1]; }
    else { const front = TECH.filter(x => state(x) !== 'done' && state(x) !== 'locked'); const minTier = front.length ? Math.min(...front.map(x => x.tier)) : 0; scroller.scrollLeft = Math.max(0, (minTier - 1) * PX); }
    scroller.addEventListener('scroll', () => { this.scroll = [scroller.scrollLeft, scroller.scrollTop]; });
  }
  doResearch(t) {
    const g = this.G.game;
    if (!research(g, t.id)) return flash('Cannot research that yet');
    toast('Researched ' + t.name, `${t.parts.length} new parts in the VAB`, 'sci', 5000);
    this.G.save(true); this.justDone = t.id; this.build();
    const el = document.querySelector('.tnode.sel'); if (el) { el.classList.add('burst'); }
  }
  // ------------------------------------------------------------------ achievements
  buildAch(page) {
    const g = this.G.game; const got = g.achievements || {};
    const groups = [...new Set(ACHIEVEMENTS.map(a => a.group))];
    const n = ACHIEVEMENTS.filter(a => got[a.id]).length;
    const wrap = h('div.ach-wrap', {}, h('div.ach-head', {}, h('b', {}, `${n} / ${ACHIEVEMENTS.length} earned`), h('div.bar', {}, h('i', { style: { width: (n / ACHIEVEMENTS.length * 100).toFixed(1) + '%' } }))));
    for (const gr of groups) {
      wrap.append(h('h3', {}, gr));
      wrap.append(h('div.ach-grid', {}, ACHIEVEMENTS.filter(a => a.group === gr).map(a => h('div.ach' + (got[a.id] ? '.got' : ''), {},
        h('div.ach-t', {}, (got[a.id] ? '🏆 ' : '🔒 ') + a.name), h('div.small.dim', {}, a.desc), h('div.small.tp', {}, `+${a.tp} TP`)))));
    }
    page.append(wrap);
  }
  buildSci(page) {
    const g = this.G.game; const sci = g.science && typeof g.science === 'object' ? g.science : {};
    const rows = Object.entries(sci).map(([k, tp]) => { const [kind, where, sit] = k.split('@'); return { kind, body: where.split('/')[1], sit, tp }; });
    const wrap = h('div.ach-wrap', {}, h('div.ach-head', {}, h('b', {}, `${rows.length} experiments · ${rows.reduce((s, r) => s + r.tp, 0)} TP from science`)));
    if (!rows.length) wrap.append(h('div.dim', {}, 'No science yet. Put a thermometer or barometer on a rocket and run it from the 🔬 button in flight — every situation (landed, flying low/high, in space near/high) on every world pays once.'));
    const byBody = {}; for (const r of rows) (byBody[r.body] ||= []).push(r);
    for (const [b, list] of Object.entries(byBody)) {
      wrap.append(h('h3', {}, b));
      wrap.append(h('div.ach-grid', {}, list.map(r => h('div.ach.got', {}, h('div.ach-t', {}, EXPERIMENTS[r.kind]?.name || r.kind), h('div.small.dim', {}, sitText(r.sit, b)), h('div.small.tp', {}, `+${r.tp} TP`)))));
    }
    page.append(wrap);
  }
}

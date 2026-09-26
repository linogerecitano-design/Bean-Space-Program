// Vehicle Assembly Building: drag-and-drop rocket construction.
//  - drag a part from the catalogue (or tap it, then tap the rocket) — a ghost shows where it goes
//  - green markers are stack attachment nodes; radial parts snap to part surfaces with symmetry
//  - drag a part on the rocket to pick it up (with everything attached below it)
//  - drop on the catalogue / press Delete to remove, right-click or long-press for part options
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { h, mount, clearUI, flash, modal } from '../ui/ui.js';
import { PARTS, PART, CATEGORIES, PROPS } from '../data/parts.js';
import { newNode, layout, designStats, walk, cloneNode, reseedUids } from '../core/vessel.js';
import { buildVesselMesh, highlight } from '../render/vesselMesh.js';
import { partIcon } from '../render/partIcons.js';
import { OrbitCam } from '../core/camera.js';
import { fmtMass } from '../core/math.js';

const SYMS = [1, 2, 3, 4, 6, 8];
const SNAP_PX = 46;
const lastInStack = (n) => { while (n.below) n = n.below; return n; };
const _v = new THREE.Vector3();

export class VABScene {
  constructor(G) {
    this.G = G;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    const dom = G.world.renderer.domElement;
    this.cam = new OrbitCam(dom); this.cam.enabled = false;
    this.cam.intercept = (e) => this.onDown(e);
    this.buildHangar();
    this.design = null; this.sel = null; this.sym = 4; this.cat = 'pods'; this.query = '';
    this.held = null; this.snap = null; this.undoStack = []; this.redoStack = [];
    this.ray = new THREE.Raycaster();
    this.mouse = { x: 0, y: 0, inCanvas: false };
    addEventListener('pointermove', (e) => this.active && this.onMove(e));
    addEventListener('pointerup', (e) => this.active && this.onUp(e));
    dom.addEventListener('contextmenu', (e) => { if (!this.active) return; e.preventDefault(); if (this.held) return; const hit = this.pickPart(e.clientX, e.clientY); if (hit) this.partMenu(hit, e.clientX, e.clientY); });
    addEventListener('keydown', (e) => {
      if (!this.active || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); this.redo(); }
      else if (e.code === 'Delete' || e.code === 'Backspace') { if (this.held) this.dropHeld(true); else if (this.hover || this.sel) this.deleteNode(this.hover?.node || this.sel); }
      else if (e.code === 'Escape') { if (this.held) this.cancelHeld(); }
      else if (e.code === 'KeyX') { const i = SYMS.indexOf(this.sym); this.setSym(SYMS[(i + 1) % SYMS.length]); }
    });
  }
  buildHangar() {
    const s = this.scene;
    const pm = new THREE.PMREMGenerator(this.G.world.renderer);
    s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    s.background = new THREE.Color(0x0b0e13);
    const tl = new THREE.TextureLoader();
    const tex = (n, rep, nor) => { const t = tl.load(`assets/ground/${n}_${nor ? 'nor' : 'diff'}.webp`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (!nor) t.colorSpace = THREE.SRGBColorSpace; return t; };
    // floor: polished concrete with a painted work-area grid
    const grid = document.createElement('canvas'); grid.width = grid.height = 512; const g = grid.getContext('2d');
    g.clearRect(0, 0, 512, 512); g.strokeStyle = 'rgba(240,200,60,0.55)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 509, 509);
    const gt = new THREE.CanvasTexture(grid); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(16, 16); gt.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ map: tex('concrete_floor_02', 22), normalMap: tex('concrete_floor_02', 14, true), roughness: 0.35, metalness: 0.0, color: 0x8f8f8c, envMapIntensity: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const lines = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false }));
    lines.rotation.x = -Math.PI / 2; lines.position.y = 0.02; s.add(lines);
    // walls: ribbed panels (room box sits below the floor so the two never z-fight)
    const wc = document.createElement('canvas'); wc.width = 256; wc.height = 256; const w = wc.getContext('2d');
    w.fillStyle = '#4a515b'; w.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 16) { w.fillStyle = 'rgba(0,0,0,0.18)'; w.fillRect(x, 0, 3, 256); w.fillStyle = 'rgba(255,255,255,0.05)'; w.fillRect(x + 3, 0, 2, 256); }
    const wt = new THREE.CanvasTexture(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(20, 12); wt.colorSpace = THREE.SRGBColorSpace;
    const room = new THREE.Mesh(new THREE.BoxGeometry(320, 242, 320), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.85, metalness: 0.2, side: THREE.BackSide }));
    room.position.y = 120; s.add(room);
    const steel = new THREE.MeshStandardMaterial({ color: 0x7c828a, metalness: 0.7, roughness: 0.4 });
    const rail = new THREE.MeshStandardMaterial({ color: 0xd8b030, metalness: 0.3, roughness: 0.5 });
    for (let y = 14; y < 230; y += 20) for (const x of [-153, 153]) { const b = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 200), steel); b.position.set(x, y, 0); b.castShadow = true; b.receiveShadow = true; s.add(b); const r = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 200), rail); r.position.set(x - Math.sign(x) * 7, y + 0.9, 0); s.add(r); }
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 2), new THREE.MeshStandardMaterial({ emissive: 0xfff4e0, emissiveIntensity: 4, color: 0 })); l.position.set(-60 + i * 24, 238, 0); s.add(l); }
    s.add(new THREE.HemisphereLight(0xdfe8ff, 0x303030, 0.9));
    const key = new THREE.DirectionalLight(0xfff6ea, 2.6); key.position.set(40, 120, 60); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -70, right: 70, top: 160, bottom: -10, near: 1, far: 500 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; s.add(key);
    const fill = new THREE.DirectionalLight(0xbcd0ff, 0.9); fill.position.set(-60, 40, -40); s.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(0, 30, -80); s.add(rim);
    this.rocketRoot = new THREE.Group(); s.add(this.rocketRoot);
    this.ghostRoot = new THREE.Group(); s.add(this.ghostRoot);
    this.nodeRoot = new THREE.Group(); s.add(this.nodeRoot);
    this.nodeMat = new THREE.MeshBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.8, depthTest: false });
    this.nodeHotMat = new THREE.MeshBasicMaterial({ color: 0xfff45a, transparent: true, opacity: 0.95, depthTest: false });
  }
  async enter() {
    const G = this.G; this.active = true; this.cam.enabled = true;
    const game = G.game;
    if (!this.design) this.design = cloneNode(game.designs[game.selectedDesign] || game.designs[0]);
    this.cam.minDist = 3; this.cam.maxDist = 145; this.cam.pitch = 0.15; this.cam.yaw = 0.5;
    this.buildUI(); this.rebuild(true);
    if (!localStorage.getItem('bsp-vab-help')) { flash('Drag parts onto the green nodes · drag rocket parts to move them · right-click for options', 6000); try { localStorage.setItem('bsp-vab-help', '1'); } catch (e) {} }
  }
  exit() { this.active = false; this.cam.enabled = false; this.clearHeld(); clearUI(); }
  // ------------------------------------------------------------------ UI
  buildUI() {
    clearUI();
    const G = this.G;
    this.nameIn = h('input', { value: this.design.name || 'Untitled', style: { width: '160px' }, oninput: (e) => { this.design.name = e.target.value; } });
    mount(h('div#topbar.panel', {}, h('button', { onclick: () => G.go('center') }, '← Space Centre'), this.nameIn,
      h('button', { onclick: () => this.newDesign() }, 'New'), h('button', { onclick: () => this.loadDialog() }, 'Load'), h('button', { onclick: () => this.saveDesign() }, 'Save'),
      h('button', { title: 'Undo (Ctrl+Z)', onclick: () => this.undo() }, '↶'), h('button', { title: 'Redo (Ctrl+Y)', onclick: () => this.redo() }, '↷'),
      h('button.primary', { onclick: () => { this.saveDesign(true); G.scenes.center.launchDialog(); } }, '🚀 Launch')));
    const cats = h('div#vab-cats', {}, CATEGORIES.map(([id, label]) => h('button' + (id === this.cat ? '.on' : ''), { onclick: () => { this.cat = id; this.query = ''; this.buildUI(); } }, label)));
    const search = h('input#vab-search', { placeholder: 'Search parts (name, real hardware)…', value: this.query, oninput: (e) => { this.query = e.target.value; this.fillParts(); } });
    this.partList = h('div#vab-parts');
    this.leftPanel = h('div#vab-left.panel', {}, cats, search, this.partList);
    mount(this.leftPanel);
    this.fillParts();
    this.right = h('div#vab-right.panel'); mount(this.right);
    this.symBtns = SYMS.map(n => h('button' + (n === this.sym ? '.on' : ''), { onclick: () => this.setSym(n) }, '×' + n));
    mount(h('div#vab-bottom.panel', {}, h('span.small.dim', {}, 'Symmetry (X)'), ...this.symBtns,
      h('span.small.dim.vab-hint', {}, 'Drag parts to green nodes · Right-click a part for options · Del removes')));
    this.updateStats();
  }
  setSym(n) { this.sym = n; this.symBtns?.forEach((b, i) => b.classList.toggle('on', SYMS[i] === n)); if (this.held) this.updateSnap(); }
  fillParts() {
    const q = this.query.toLowerCase();
    const list = PARTS.filter(p => !p.hidden && (q ? (p.name + ' ' + p.basis + ' ' + p.id).toLowerCase().includes(q) : p.cat === this.cat));
    const r = this.G.world.renderer;
    const items = list.map(p => {
      const img = h('img.part-icon', { alt: '', draggable: 'false' });
      const el = h('div.part' + (p.theoretical ? '.theory' : ''), { title: p.basis },
        img, h('div.part-txt', {}, h('div.n', {}, p.name), h('div.b', {}, 'Based on: ' + p.basis), h('div.s', {}, partSummary(p))));
      el.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); try { el.releasePointerCapture(e.pointerId); } catch (err) {} this.grabFromList(p.id, e); });
      return { el, img, p };
    });
    this.partList.replaceChildren(...items.map(i => i.el));
    // icons render lazily (a few per frame) so opening a category stays instant
    let k = 0; const step = () => { if (!this.active) return; const t0 = performance.now(); while (k < items.length && performance.now() - t0 < 12) { const it = items[k++]; try { it.img.src = partIcon(r, it.p); } catch (e) { } } if (k < items.length) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  // ------------------------------------------------------------------ history
  snapshot() { this.undoStack.push(JSON.stringify(this.design)); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack.length = 0; }
  undo() { if (this.held) this.cancelHeld(); if (!this.undoStack.length) return flash('Nothing to undo'); this.redoStack.push(JSON.stringify(this.design)); this.design = JSON.parse(this.undoStack.pop()); this.sel = null; this.rebuild(); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(JSON.stringify(this.design)); this.design = JSON.parse(this.redoStack.pop()); this.sel = null; this.rebuild(); }
  // ------------------------------------------------------------------ holding parts
  grabFromList(id, e) {
    if (this.held) this.clearHeld();
    const n = newNode(id);
    if (!this.design.root) { // first part becomes the root
      this.snapshot(); this.design.root = n; this.sel = n; this.rebuild(true); return;
    }
    this.held = { node: n, fromRocket: false, pointerId: e.pointerId, dragged: false, start: [e.clientX, e.clientY] };
    this.buildGhost(); this.showNodes(); this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.updateSnap();
    document.body.classList.add('vab-holding');
  }
  pickUp(node) {
    if (node === this.design.root) { this.sel = node; this.markSel(); this.updateStats(); return flash('The root part stays put — move the parts attached to it instead'); }
    const info = this.findParent(node); if (!info) return;
    this.snapshot(); this.pickUndo = this.undoStack.length;
    if (info.rel === 'below') info.parent.below = null;
    else if (info.rel === 'stack') info.parent.stack = null;
    else info.parent.radial.splice(info.parent.radial.indexOf(info.rel), 1);
    this.held = { node, fromRocket: true, dragged: true, pointerId: this.downId };
    if (info.rel && info.rel.sym) this.setSym(info.rel.sym);
    this.sel = null; this.rebuild(); this.buildGhost(); this.showNodes(); this.updateSnap();
    document.body.classList.add('vab-holding');
  }
  clearHeld() { this.held = null; this.snap = null; this.ghostRoot.clear(); this.nodeRoot.clear(); document.body.classList.remove('vab-holding'); }
  cancelHeld() { const from = this.held && this.held.fromRocket; this.clearHeld(); if (from) { this.design = JSON.parse(this.undoStack.pop()); this.rebuild(); } }
  dropHeld(discard) {
    const H = this.held; if (!H) return;
    if (discard || !this.snap) { const from = H.fromRocket; this.clearHeld(); if (from) { this.rebuild(); flash('Part removed'); } return; }
    if (!H.fromRocket) this.snapshot();
    attach(this.design, H.node, this.snap, this.sym);
    const n = H.node; this.clearHeld(); this.sel = n; this.rebuild();
  }
  buildGhost() {
    this.ghostRoot.clear();
    const heldUids = new Set(); walk(this.held.node, (n) => heldUids.add(n.uid)); this.held.uids = heldUids;
  }
  // green markers for every stack attachment node that can accept the held part
  showNodes() {
    this.nodeRoot.clear(); this.nodes = [];
    const H = this.held; if (!H || !this.placed) return;
    const hp = PART[H.node.id];
    if (!hp.radial) {
      const y0 = this.mesh ? this.mesh.position.y : 0;
      for (const pl of this.placed) {
        if (pl.radial || H.uids?.has(pl.node.uid)) continue;
        if ((pl.sideIndex || 0) > 0) continue; // symmetric stacks share nodes: use the first copy
        const r = Math.max(0.25, (pl.part.d2 ?? pl.part.d ?? 1) / 2);
        this.nodes.push({ kind: 'below', node: pl.node, pos: new THREE.Vector3(pl.pos[0], pl.pos[1] - (pl.part.h || 1) + y0, pl.pos[2]), r });
        if (pl.node === this.design.root) this.nodes.push({ kind: 'root', node: pl.node, pos: new THREE.Vector3(pl.pos[0], pl.pos[1] + y0, pl.pos[2]), r: Math.max(0.25, (pl.part.dTop ?? pl.part.d ?? 1) / 2) });
        const par = pl.parentPlaced; if (par && par.radialDec && par.node.stack === pl.node) this.nodes.push({ kind: 'decstack', node: par.node, pos: new THREE.Vector3(pl.pos[0], pl.pos[1] + y0, pl.pos[2]), r });
      }
      for (const pl of this.placed) if (pl.radialDec && !pl.node.stack && !H.uids?.has(pl.node.uid) && !(pl.sideIndex > 0)) { const a = pl.ang; this.nodes.push({ kind: 'decstack', node: pl.node, pos: new THREE.Vector3(pl.pos[0] + Math.cos(a) * 0.6, pl.pos[1] + y0, pl.pos[2] - Math.sin(a) * 0.6), r: 0.3 }); }
    }
    const sph = new THREE.SphereGeometry(1, 16, 12);
    for (const nd of this.nodes) { const m = new THREE.Mesh(sph, this.nodeMat); m.position.copy(nd.pos); m.scale.setScalar(Math.max(0.18, nd.r * 0.16)); m.renderOrder = 10; nd.mesh = m; this.nodeRoot.add(m); }
  }
  // ------------------------------------------------------------------ pointer
  ndc(x, y) { const r = this.G.world.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); }
  pickPart(x, y) {
    if (!this.mesh) return null;
    this.ray.setFromCamera(this.ndc(x, y), this.camera);
    const hits = this.ray.intersectObject(this.mesh, true).filter(h => h.object.userData.placed && h.object.visible);
    return hits.length ? { placed: hits[0].object.userData.placed, node: hits[0].object.userData.placed.node, point: hits[0].point, object: hits[0].object } : null;
  }
  onDown(e) {
    // returns true when the VAB handles this pointer (so the camera doesn't orbit)
    this.downId = e.pointerId;
    if (this.held && e.button !== 0) return false; // right/middle drag still orbits while holding a part
    if (this.held) { this.held.pointerId = e.pointerId; this.held.pressed = true; this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.updateSnap(); return true; }
    if (e.button !== 0) return false;
    const hit = this.pickPart(e.clientX, e.clientY);
    if (!hit) { this.pending = null; return false; }
    this.pending = { node: hit.node, x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    clearTimeout(this.longPress);
    if (e.pointerType === 'touch') this.longPress = setTimeout(() => { if (this.pending && this.pending.id === e.pointerId) { const p = this.pending; this.pending = null; this.partMenu(hit, p.x, p.y); } }, 550);
    return true;
  }
  onMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    if (this.pending && e.pointerId === this.pending.id && Math.hypot(e.clientX - this.pending.x, e.clientY - this.pending.y) > 7) { clearTimeout(this.longPress); const n = this.pending.node; this.pending = null; this.pickUp(n); }
    if (this.held) { if (this.held.start && Math.hypot(e.clientX - this.held.start[0], e.clientY - this.held.start[1]) > 10) this.held.dragged = true; this.updateSnap(); return; }
    // hover highlight
    if (e.pointerType !== 'touch' && e.target === this.G.world.renderer.domElement) { const hit = this.pickPart(e.clientX, e.clientY); const n = hit ? hit.node : null; if (n !== this.hover?.node) { this.hover = hit; this.markSel(); } }
  }
  onUp(e) {
    clearTimeout(this.longPress);
    if (this.pending && e.pointerId === this.pending.id) { this.sel = this.pending.node; this.pending = null; this.markSel(); this.updateStats(); return; }
    const H = this.held; if (!H) return;
    if (H.pointerId !== undefined && e.pointerId !== H.pointerId) return;
    const overList = this.leftPanel && this.leftPanel.contains(document.elementFromPoint(e.clientX, e.clientY));
    if (overList && (H.dragged || H.fromRocket)) return this.dropHeld(true);
    if (overList) return; // tapped a part in the list: keep holding, the next tap on the rocket places it
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.updateSnap();
    if (this.snap) return this.dropHeld(false);
    if (H.dragged || H.pressed) flash(H.fromRocket ? 'Drop on a green node or a part surface (or on the part list to delete)' : 'Drop the part on a green node or on the rocket\'s surface');
    H.pressed = false;
  }
  // ------------------------------------------------------------------ snapping
  updateSnap() {
    const H = this.held; if (!H) return;
    const hp = PART[H.node.id]; let snap = null;
    const r = this.G.world.renderer.domElement.getBoundingClientRect();
    // 1) stack nodes (screen distance)
    let best = SNAP_PX * (devicePixelRatio > 1.5 ? 1.3 : 1);
    for (const nd of this.nodes || []) {
      _v.copy(nd.pos).project(this.camera); if (_v.z > 1) continue;
      const sx = (_v.x + 1) / 2 * r.width + r.left, sy = (1 - _v.y) / 2 * r.height + r.top;
      const d = Math.hypot(sx - this.mouse.x, sy - this.mouse.y);
      if (d < best) { best = d; snap = { kind: nd.kind, uid: nd.node.uid, nd }; }
    }
    // 2) surface attachment for radial parts (or any part when no stack node is near)
    if (!snap && this.mesh) {
      const hit = this.pickPart(this.mouse.x, this.mouse.y);
      if (hit && !hit.placed.radial && !hit.object.userData.shroud && (hp.radial || this.sym > 1 || !hit.placed.radialDec) && !H.uids.has(hit.node.uid)) {
        const pl = hit.placed; const y0 = this.mesh.position.y;
        const at = Math.max(0.03, Math.min(0.97, (pl.pos[1] + y0 - hit.point.y) / (pl.part.h || 1)));
        const ang = Math.atan2(-(hit.point.z - pl.pos[2]), hit.point.x - pl.pos[0]) - (pl.ang || 0);
        if (hp.radial || !this.nodes?.length || hit.placed.part.decoupler !== 'radial') snap = { kind: 'surface', uid: pl.node.uid, at, angle: Math.round(ang / (Math.PI / 24)) * (Math.PI / 24) };
      }
    }
    for (const nd of this.nodes || []) nd.mesh.material = snap && snap.nd === nd ? this.nodeHotMat : this.nodeMat;
    const key = snap ? `${snap.kind}:${snap.uid}:${(snap.at || 0).toFixed(2)}:${(snap.angle || 0).toFixed(2)}:${this.sym}` : 'free';
    this.snap = snap;
    if (key === this.ghostKey && this.ghostRoot.children.length) { if (!snap) this.placeFreeGhost(); return; }
    this.ghostKey = key; this.ghostRoot.clear();
    if (snap) {
      // preview: attach a copy to a copy of the design and show only the held parts
      const d = cloneNode(this.design); const t = findUid(d.root, snap.uid); const heldCopy = cloneNode(H.node);
      if (t) {
        const s2 = { ...snap, target: t };
        matchSize(heldCopy, s2, d); attach(d, heldCopy, s2, this.sym);
        const placed = layout(d).filter(pl => H.uids.has(pl.node.uid));
        const g = buildVesselMesh(placed, { noShrouds: true }); ghostify(g, true); g.position.y = this.mesh.position.y;
        this.ghostRoot.add(g);
      }
    } else {
      const g = buildVesselMesh(layout({ root: H.node }), { noShrouds: true }); ghostify(g, false); this.ghostRoot.add(g); this.placeFreeGhost();
    }
  }
  placeFreeGhost() {
    const g = this.ghostRoot.children[0]; if (!g) return;
    this.ray.setFromCamera(this.ndc(this.mouse.x, this.mouse.y), this.camera);
    const d = Math.max(4, this.cam.dist * 0.7); g.position.copy(this.ray.ray.origin).addScaledVector(this.ray.ray.direction, d);
  }
  // ------------------------------------------------------------------ editing
  findParent(target) { let res = null; walk(this.design.root, (n, parent, rel) => { if (n === target) res = { parent, rel }; }); return res; }
  deleteNode(node) {
    if (!node) return;
    if (node === this.design.root) { if (!this.design.root.below && !this.design.root.radial.length) { this.snapshot(); this.design.root = null; this.sel = null; this.rebuild(); } else flash('Remove the attached parts first (or start a New design)'); return; }
    const info = this.findParent(node); if (!info) return;
    this.snapshot();
    if (info.rel === 'below') info.parent.below = null;
    else if (info.rel === 'stack') info.parent.stack = null;
    else info.parent.radial.splice(info.parent.radial.indexOf(info.rel), 1);
    this.sel = null; this.hover = null; this.rebuild(); flash('Removed ' + PART[node.id].name + (node.below || node.radial.length ? ' and attached parts' : ''));
  }
  newDesign() { this.snapshot(); this.design = { name: 'Untitled Rocket', root: null }; this.sel = null; this.nameIn.value = this.design.name; this.rebuild(true); flash('Drag a command pod or probe core into the hangar to start'); this.cat = 'pods'; this.buildUI(); }
  saveDesign(quiet) {
    const game = this.G.game; const d = cloneNode(this.design); d.builtin = false;
    const i = game.designs.findIndex(x => x.name === d.name && !x.builtin);
    if (i >= 0) game.designs[i] = d; else game.designs.push(d);
    game.selectedDesign = i >= 0 ? i : game.designs.length - 1;
    this.G.save(true); if (!quiet) flash('Design saved');
  }
  async loadDialog() {
    const game = this.G.game;
    const list = h('div.list', { style: { maxHeight: '50vh' } }, game.designs.map((d, i) => {
      const st = designStats(d);
      return h('div.item', { onclick: () => { this.snapshot(); this.design = cloneNode(d); reseedUids(this.design.root); this.sel = null; game.selectedDesign = i; list.dispatchEvent(new Event('pick')); } },
        h('b', {}, d.name), d.builtin ? h('span.tag', {}, 'stock') : null, h('div.small.dim', {}, `${st.parts} parts · ${fmtMass(st.wet)} · Δv ${(st.totalDvVac / 1000).toFixed(1)} km/s`));
    }));
    const p = modal('Load design', list, [{ label: 'Close' }]);
    list.addEventListener('pick', () => { document.querySelector('.modal-bg')?.remove(); this.nameIn.value = this.design.name; this.rebuild(true); });
    await p;
  }
  // right-click / long-press part options
  partMenu(hit, x, y) {
    document.querySelector('.part-menu')?.remove();
    const node = hit.node, p = PART[node.id], info = this.findParent(node);
    const close = () => el.remove();
    const rows = [h('div.pm-title', {}, h('b', {}, p.name), h('button.pm-x', { onclick: close }, '✕')), h('div.small.dim', {}, 'Based on: ' + p.basis), h('div.small', {}, partSummary(p, true))];
    const slider = (label, val, min, max, step, fmt, set) => { const out = h('span.mono', {}, fmt(val)); return h('div.pm-row', {}, h('span', {}, label), h('input', { type: 'range', min, max, step, value: val, oninput: (e) => { set(+e.target.value); out.textContent = fmt(+e.target.value); this.updateStats(); }, onchange: () => this.rebuild() }), out); };
    let snapped = false; const once = () => { if (!snapped) { this.snapshot(); snapped = true; } };
    if (p.prop) rows.push(slider(PROPS[p.prop.type].name, (node.fuel ?? 1) * 100, 0, 100, 5, v => v.toFixed(0) + '%', v => { once(); node.fuel = v / 100; }));
    if (p.engine && !p.engine.solid) rows.push(slider('Thrust limit', (node.thrustLimit ?? 1) * 100, 10, 100, 5, v => v.toFixed(0) + '%', v => { once(); node.thrustLimit = v / 100; }));
    if (info && info.rel && info.rel.sym) {
      const r = info.rel;
      rows.push(h('div.pm-row', {}, h('span', {}, 'Symmetry'), h('select', { onchange: (e) => { once(); r.sym = +e.target.value; this.rebuild(); } }, SYMS.map(n => h('option', { value: n, selected: n === r.sym ? true : undefined }, '×' + n)))));
      rows.push(slider('Height', (1 - (r.at ?? 0.5)) * 100, 3, 97, 1, v => v.toFixed(0) + '%', v => { once(); r.at = 1 - v / 100; this.rebuild(); }));
      rows.push(slider('Rotation', ((r.angle || 0) * 180 / Math.PI + 360) % 360, 0, 355, 5, v => v.toFixed(0) + '°', v => { once(); r.angle = v * Math.PI / 180; this.rebuild(); }));
    }
    if (p.crew) rows.push(h('div.small', {}, `${p.crew} seat${p.crew > 1 ? 's' : ''} — pick the crew in the launch dialog`));
    rows.push(h('div.row', { style: { marginTop: '6px', flexWrap: 'wrap' } },
      node !== this.design.root ? h('button', { onclick: () => { close(); this.pickUp(node); } }, 'Move') : null,
      h('button', { onclick: () => { close(); this.held = { node: reseeded(cloneNode(node)), fromRocket: false, dragged: false, start: [x, y] }; this.buildGhost(); this.showNodes(); this.updateSnap(); document.body.classList.add('vab-holding'); flash('Copy picked up — place it on a node'); } }, 'Copy'),
      h('button.danger', { onclick: () => { close(); this.deleteNode(node); } }, 'Delete')));
    const el = h('div.part-menu.panel', {}, rows);
    el.style.left = Math.min(x + 8, innerWidth - 300) + 'px'; el.style.top = Math.min(y + 8, innerHeight - 320) + 'px';
    mount(el); this.sel = node; this.markSel(); this.updateStats();
  }
  // ------------------------------------------------------------------ view
  rebuild(frame) {
    if (this.mesh) { this.rocketRoot.remove(this.mesh); }
    this.mesh = null;
    if (!this.design.root) { this.placed = []; this.updateStats(); if (this.held) this.showNodes(); return; }
    this.placed = layout(this.design);
    this.mesh = buildVesselMesh(this.placed);
    const box = new THREE.Box3().setFromObject(this.mesh);
    this.mesh.position.y = -box.min.y + 0.5;
    this.rocketRoot.add(this.mesh);
    this.height = box.max.y - box.min.y;
    if (frame) { this.cam.dist = Math.min(145, Math.max(8, this.height * 1.6 + 5)); }
    this.focusY = this.mesh.position.y + (box.max.y + box.min.y) / 2;
    this.markSel();
    this.updateStats();
    if (this.held) { this.showNodes(); this.ghostKey = null; this.updateSnap(); }
  }
  markSel() {
    if (!this.mesh) return;
    const set = new Set(); if (this.sel) set.add(this.sel); if (this.hover?.node) set.add(this.hover.node);
    highlight(this.mesh, set);
  }
  updateStats() {
    if (!this.right) return;
    const G = this.G; const earth = G.sys.get('Earth');
    if (!this.design.root) { this.right.replaceChildren(h('div.dim', {}, 'Empty design. Drag a command pod or probe core from the list into the hangar.')); return; }
    const st = designStats(this.design, earth);
    const selP = this.sel ? PART[this.sel.id] : null;
    const stages = st.stages.filter(s => s.dvVac > 0 || s.twr > 0);
    this.right.replaceChildren(...[
      h('h3', {}, this.design.name),
      h('table.kv', {}, row('Parts', st.parts), row('Mass (wet)', fmtMass(st.wet)), row('Mass (dry)', fmtMass(st.dry)), row('Crew seats', st.crew),
        row('Δv vacuum', (st.totalDvVac / 1000).toFixed(2) + ' km/s'), row('Δv sea level', (st.totalDvASL / 1000).toFixed(2) + ' km/s'), row('Liftoff TWR (Earth)', (st.stages[0]?.twr || 0).toFixed(2))),
      h('div.small.dim', { style: { marginTop: '6px' } }, 'Low Earth orbit needs ≈ 9.4 km/s. Liftoff needs TWR > 1.'),
      h('h3', { style: { marginTop: '10px' } }, 'Stages'),
      ...stages.map((s, i) => h('div.stage', {}, h('div.h', {}, 'Stage ' + (i + 1), h('span.mono', {}, (s.dvVac / 1000).toFixed(2) + ' km/s')),
        h('div.dim', {}, `TWR ${s.twr.toFixed(2)} (vac ${s.twrVac.toFixed(2)}) · burn ${fmtBurn(s.burn)}`),
        h('div.small', {}, summarize(st.placed, s.stage)))),
      selP ? h('div', { style: { marginTop: '10px' } }, h('h3', {}, selP.name), h('div.small.dim', {}, 'Based on: ' + selP.basis), h('div.small', {}, partSummary(selP, true)), selP.theoretical ? h('div.small', { style: { color: '#fbbf24' } }, '⚠ Theoretical concept — physics simplified.') : null) : null,
    ].filter(Boolean));
  }
  update(dt) {
    if (!this.active) return;
    const G = this.G;
    G.world.adaptResolution();
    const off = this.cam.apply(this.camera, new THREE.Vector3(0, 1, 0));
    this.camera.position.set(off.x, (this.focusY || 10) + off.y, off.z);
    this.camera.lookAt(0, this.focusY || 10, 0);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    // markers keep a constant on-screen size
    for (const nd of this.nodes || []) if (nd.mesh) { const d = this.camera.position.distanceTo(nd.pos); nd.mesh.scale.setScalar(Math.max(nd.r * 0.12, d * 0.012)); }
    if (this.held && !this.snap) this.placeFreeGhost();
    G.world.pipeline.render(this.scene, this.camera, { time: 0, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Vector3(1, 1, 1), atmos: [], exposure: 1.15, sss: false });
  }
}

// ---------------------------------------------------------------- tree helpers
function findUid(n, uid) { let r = null; walk(n, (x) => { if (x.uid === uid) r = x; }); return r; }
function reseeded(n) { reseedUids(n); return n; }
// Attach a held subtree to the design at a snap target
export function attach(design, held, snap, sym) {
  const t = snap.target || findUid(design.root, snap.uid);
  if (snap.kind === 'root') { lastInStack(held).below = design.root; design.root = held; }
  else if (snap.kind === 'below') { const old = t.below; t.below = held; if (old) lastInStack(held).below = old; }
  else if (snap.kind === 'decstack') { const old = t.stack; t.stack = held; if (old) lastInStack(held).below = old; }
  else if (snap.kind === 'surface') t.radial.push({ sym, at: snap.at, angle: snap.angle, node: held });
  matchSize(held, { ...snap, target: t }, design);
}
// Size-family parts (decouplers, heat shields, nose cones) resize to fit where they're attached
const FAMILY = /^(dec|heat|nose)_([\d.]+)$/;
function matchSize(node, snap, design) {
  const m = FAMILY.exec(node.id); if (!m || snap.kind === 'surface' || !snap.target) return;
  const tp = PART[snap.target.id]; if (!tp) return;
  const want = snap.kind === 'root' ? (tp.dTop ?? tp.d) : (tp.d2 ?? tp.d);
  if (!want) return;
  let best = node.id, bd = Infinity;
  for (const p of PARTS) { const k = FAMILY.exec(p.id); if (!k || k[1] === undefined || k[1] === '' || !p.id.startsWith(m[1] + '_')) continue; const d = Math.abs((m[1] === 'nose' ? p.d2 : p.d) - want); if (d < bd) { bd = d; best = p.id; } }
  node.id = best;
}
function ghostify(g, ok) {
  g.traverse(o => {
    if (!o.isMesh) return;
    const m = new THREE.MeshStandardMaterial({ color: ok ? 0x8fe3ff : 0xff8a70, emissive: ok ? 0x1a6a8a : 0x7a2010, emissiveIntensity: 0.6, transparent: true, opacity: ok ? 0.55 : 0.4, depthWrite: false, roughness: 0.4 });
    o.material = m; o.castShadow = false; o.renderOrder = 8;
  });
  g.traverse(o => { if (o.userData && o.userData.U) o.visible = false; });
}
function row(k, v) { return h('tr', {}, h('td.dim', {}, k), h('td', {}, String(v))); }
function fmtBurn(s) { if (!s) return '—'; if (s < 120) return s.toFixed(0) + ' s'; if (s < 7200) return (s / 60).toFixed(1) + ' min'; if (s < 172800) return (s / 3600).toFixed(1) + ' h'; return (s / 86400).toFixed(0) + ' d'; }
function summarize(placed, stage) {
  const c = {}; for (const p of placed) if (p.stage === stage && (p.part.engine || p.part.decoupler || p.part.chute)) c[p.part.name] = (c[p.part.name] || 0) + 1;
  return Object.entries(c).map(([n, k]) => (k > 1 ? k + '× ' : '') + n).join(', ');
}
export function partSummary(p, long) {
  const bits = [fmtMass(p.mass)];
  if (p.d) bits.push(p.d2 && p.d2 !== p.d ? `${p.d}→${p.d2} m` : `⌀${p.d} m`);
  if (p.engine) bits.push(`${p.engine.thrust >= 1000 ? (p.engine.thrust / 1000).toFixed(1) + ' MN' : p.engine.thrust >= 1 ? p.engine.thrust.toFixed(0) + ' kN' : (p.engine.thrust * 1000).toFixed(0) + ' N'} · Isp ${p.engine.isp >= 1e5 ? (p.engine.isp / 1e6).toFixed(2) + 'M' : p.engine.isp} s`);
  if (p.engine && p.engine.power) bits.push(p.engine.power + ' kW');
  if (p.prop) bits.push(`${fmtMass(p.prop.mass)} ${PROPS[p.prop.type].name}`);
  if (p.crew) bits.push(p.crew + ' crew');
  if (p.power) bits.push(p.power + ' kW');
  if (p.torque) bits.push(p.torque + ' kN·m');
  if (p.chute) bits.push('chute ' + p.chute.area + ' m²');
  if (p.sail) bits.push('sail ' + p.sail.area + ' m²');
  if (p.warp) bits.push('up to ' + p.warp.max + '× c');
  if (long && p.engine && p.engine.prop) bits.push('burns ' + PROPS[p.engine.prop].name);
  return bits.join(' · ');
}

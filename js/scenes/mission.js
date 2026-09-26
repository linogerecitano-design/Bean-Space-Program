// Mission Control (career): contract givers — each a Bean with their own outfit and mannerisms —
// stand in front of the big screen (or the whiteboard, back at the Bean Field portakabin) and
// offer contracts. Accept or decline from the contract list; the givers react.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { h, mount, clearUI, flash, toast } from '../ui/ui.js';
import { Astronaut } from '../render/astronaut.js';
import { OrbitCam } from '../core/camera.js';
import { GIVER_BY_ID, refreshOffers, acceptContract, declineContract, fmtFunds, isCareer } from '../game/career.js';

const BADGE = { tycoon: '🎩', scientist: '🥼', general: '🎖️', farmer: '🌾', professor: '🎓', chef: '👨‍🍳' };

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export class MissionScene {
  constructor(G) {
    this.G = G; this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 300);
    this.cam = new OrbitCam(G.world.renderer.domElement); this.cam.enabled = false;
    this.cam.intercept = (e) => { this.downAt = [e.clientX, e.clientY]; return false; };
    G.world.renderer.domElement.addEventListener('pointerup', (e) => { if (!this.active || !this.downAt) return; const d = Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]); this.downAt = null; if (d < 8) this.tap(e.clientX, e.clientY); });
    this.envTex = new THREE.PMREMGenerator(G.world.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.rooms = {}; this.givers = []; this.ray = new THREE.Raycaster();
  }
  // ------------------------------------------------------------------ rooms
  room(level) {
    if (this.rooms[level]) return this.rooms[level];
    const s = new THREE.Scene(); s.environment = this.envTex;
    const M = (o) => new THREE.MeshStandardMaterial(o);
    const box = (w, hh, d, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; s.add(o); return o; };
    if (level >= 1) {
      // big mission control: carpet, tiered console rows, giant wall screen, side screens
      s.background = new THREE.Color(0x06080d);
      const carpet = canvasTex(256, 256, (g, w, hh) => { g.fillStyle = '#1a2233'; g.fillRect(0, 0, w, hh); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${80 + Math.random() * 60},${90 + Math.random() * 60},${130 + Math.random() * 60},.15)`; g.fillRect(Math.random() * w, Math.random() * hh, 1, 1); } }); carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(8, 8);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), M({ map: carpet, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
      const wall = M({ color: 0x1c2330, roughness: 0.8 });
      box(40, 12, 0.3, wall, 0, 6, -8); box(0.3, 12, 30, wall, -14, 6, 0); box(0.3, 12, 30, wall, 14, 6, 0);
      box(40, 0.3, 30, M({ color: 0x10141c, roughness: 0.9 }), 0, 9, 0);
      this.screenTex = canvasTex(1024, 440, () => {}); this.screenTex.userData = { level };
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(16, 6.9), M({ map: this.screenTex, emissiveMap: this.screenTex, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.4 })); scr.position.set(0, 5.1, -7.8); s.add(scr);
      box(16.6, 7.5, 0.2, M({ color: 0x0a0a0a, roughness: 0.3, metalness: 0.6 }), 0, 5.1, -7.95);
      for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), M({ color: 0, emissive: sx < 0 ? 0x1a5a3a : 0x3a2a6a, emissiveIntensity: 1.2 })); side.position.set(sx * 10.8, 5.5, -7.8); s.add(side); }
      // console rows with glowing monitors, stepping up towards the back
      const desk = M({ color: 0x2a3140, roughness: 0.5, metalness: 0.3 }), scrM = M({ color: 0x000000, emissive: 0x2a7ab0, emissiveIntensity: 1.6 });
      for (let r = 0; r < 3; r++) { const z = 3 + r * 3.2, y = r * 0.45; if (r) box(28, y, 3.2, M({ color: 0x151b26, roughness: 0.9 }), 0, y / 2, z);
        for (let i = -3; i <= 3; i++) { box(3.2, 0.9, 1.1, desk, i * 3.6, y + 0.45, z); for (const dx of [-0.7, 0.7]) { box(0.9, 0.6, 0.06, scrM, i * 3.6 + dx, y + 1.3, z - 0.3); } } }
      for (let i = -2; i <= 2; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.6), M({ color: 0, emissive: 0xfff2e0, emissiveIntensity: 3 })); l.position.set(i * 6, 8.8, 1); s.add(l); }
      const flag = canvasTex(256, 128, (g) => { g.fillStyle = '#12306b'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#fff'; g.font = 'bold 44px Arial'; g.fillText('BSP', 80, 80); });
      for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.4), M({ map: flag, roughness: 0.9, side: THREE.DoubleSide })); b.position.set(sx * 13.8, 6, -3); b.rotation.y = -sx * Math.PI / 2; s.add(b); }
    } else {
      // Bean Field portakabin: wood panelling, a whiteboard, a folding table with a CRT and a kettle
      s.background = new THREE.Color(0x1a1510);
      const wood = canvasTex(256, 256, (g, w, hh) => { for (let x = 0; x < w; x += 32) { g.fillStyle = `hsl(28, 35%, ${30 + Math.random() * 8}%)`; g.fillRect(x, 0, 32, hh); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, 0, 2, hh); for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(40,20,5,.15)'; g.fillRect(x + Math.random() * 30, 0, 1, hh); } } }); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(4, 1);
      const lino = canvasTex(128, 128, (g, w, hh) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) & 1 ? '#8a8270' : '#a89e88'; g.fillRect(x * 16, y * 16, 16, 16); } }); lino.wrapS = lino.wrapT = THREE.RepeatWrapping; lino.repeat.set(6, 4);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), M({ map: lino, roughness: 0.6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
      const wm = M({ map: wood, roughness: 0.8 });
      box(14, 3.2, 0.12, wm, 0, 1.6, -3.2); box(0.12, 3.2, 8, wm, -6, 1.6, 0.8); box(0.12, 3.2, 8, wm, 6, 1.6, 0.8); box(14, 0.12, 8, M({ color: 0xd8d4c8, roughness: 0.9 }), 0, 3.2, 0.8);
      this.screenTex = canvasTex(1024, 512, () => {}); this.screenTex.userData = { level };
      const wb = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), M({ map: this.screenTex, roughness: 0.35 })); wb.position.set(0, 1.9, -3.12); s.add(wb);
      box(4.6, 2.4, 0.05, M({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.4 }), 0, 1.9, -3.16);
      // window with daylight
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), M({ color: 0, emissive: 0xbfe0ff, emissiveIntensity: 2.2 })); win.position.set(-5.93, 2.0, 0); win.rotation.y = Math.PI / 2; s.add(win);
      // folding table, CRT, kettle, mugs, filing cabinet, a potted plant
      const tbl = M({ color: 0xcfc6b0, roughness: 0.7 }); box(2.4, 0.06, 1.0, tbl, 3.6, 0.8, -2.2); for (const [dx, dz] of [[-1.1, -0.4], [1.1, -0.4], [-1.1, 0.4], [1.1, 0.4]]) box(0.05, 0.8, 0.05, M({ color: 0x555555, metalness: 0.7 }), 3.6 + dx, 0.4, -2.2 + dz);
      box(0.6, 0.5, 0.55, M({ color: 0xd8d0b8, roughness: 0.6 }), 3.2, 1.08, -2.3); const crt = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.34), M({ color: 0, emissive: 0x40ff80, emissiveIntensity: 1.1 })); crt.position.set(3.2, 1.1, -2.02); s.add(crt);
      const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.24, 16), M({ color: 0xe8e8e8, metalness: 0.8, roughness: 0.25 })); kettle.position.set(4.3, 0.95, -2.2); s.add(kettle);
      for (const [dx, c] of [[0.2, 0xc02020], [0.4, 0x2050c0]]) { const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 12), M({ color: c })); mug.position.set(4.3 + dx, 0.88, -1.95); s.add(mug); }
      box(0.6, 1.3, 0.7, M({ color: 0x6a7a6a, metalness: 0.5, roughness: 0.5 }), -5.4, 0.65, -2.6);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 14), M({ color: 0xa0522d })); pot.position.set(-5.4, 1.45, -2.6); s.add(pot); const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), M({ color: 0x2f6a2a, roughness: 0.9, flatShading: true })); bush.position.set(-5.4, 1.8, -2.6); s.add(bush);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.2), M({ color: 0, emissive: 0xfff4dc, emissiveIntensity: 3 })); lamp.position.set(0, 3.12, 0.5); s.add(lamp);
    }
    const key = new THREE.SpotLight(0xfff4e6, level ? 420 : 110, level ? 40 : 14, 0.75, 0.6); key.position.set(3, level ? 8 : 3, 6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; s.add(key, key.target);
    const fill = new THREE.DirectionalLight(level ? 0x8fb0ff : 0xffe0b0, level ? 0.9 : 0.8); fill.position.set(-4, 5, 3); s.add(fill);
    s.add(new THREE.HemisphereLight(level ? 0x9ab8ff : 0xfff0d8, 0x201810, level ? 0.5 : 0.7));
    this.spot = new THREE.SpotLight(0xfff0c0, 0, 12, 0.35, 0.5); this.spot.position.set(0, level ? 7 : 3.1, 2); s.add(this.spot, this.spot.target);
    s.userData.spot = this.spot;
    return (this.rooms[level] = s);
  }
  drawScreen() {
    const tex = this.screenTex; const c = tex.image; const g = c.getContext('2d'); const W = c.width, H = c.height; const game = this.G.game; const t = performance.now() / 1000;
    if (tex.userData.level >= 1) {
      g.fillStyle = '#04101e'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(60,140,220,.25)'; g.lineWidth = 1; for (let x = 0; x <= W; x += W / 12) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, H); g.stroke(); } for (let y = 40; y <= H; y += (H - 40) / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      // stylised continents
      g.fillStyle = 'rgba(70,160,110,.35)'; for (const [x, y, rx, ry] of [[210, 170, 120, 70], [260, 300, 60, 90], [520, 160, 90, 60], [540, 280, 60, 80], [760, 170, 150, 70], [860, 330, 60, 40]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); }
      // ground tracks
      for (let k = 0; k < 3; k++) { g.strokeStyle = ['#fbbf24', '#38bdf8', '#f472b6'][k]; g.lineWidth = 2.5; g.beginPath(); for (let x = 0; x <= W; x += 6) { const y = 240 + Math.sin(x / W * Math.PI * 2 * (1 + k * 0.5) + k * 2) * (120 - k * 30); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      const px = (t * 40) % W; const py = 240 + Math.sin(px / W * Math.PI * 2) * 120; g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, 7, 0, 7); g.fill();
      g.fillStyle = '#0b1f38'; g.fillRect(0, 0, W, 40); g.fillStyle = '#e8eef7'; g.font = 'bold 24px monospace'; g.fillText('BEAN SPACE CENTRE · MISSION CONTROL', 16, 28);
      g.fillStyle = '#fde68a'; g.textAlign = 'right'; g.fillText(`${fmtFunds(game.funds)}  ${Math.floor(game.tp)} TP`, W - 16, 28); g.textAlign = 'left';
    } else { // whiteboard scribbles
      g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#1e40af'; g.lineWidth = 5; g.lineCap = 'round'; g.font = 'bold 44px "Comic Sans MS", cursive'; g.fillStyle = '#1e40af';
      g.fillText('BEAN FIELD MISSIONS', 250, 62);
      g.fillStyle = '#b91c1c'; g.font = '32px "Comic Sans MS", cursive'; g.fillText(`Money: ${fmtFunds(game.funds)}`, 40, 130); g.fillText(`Science: ${Math.floor(game.tp)} TP`, 40, 175);
      g.fillStyle = '#15803d'; g.fillText('TO DO:', 40, 250); (game.contracts?.active || []).slice(0, 5).forEach((c, i) => g.fillText('☐ ' + c.title, 60, 295 + i * 40));
      if (!(game.contracts?.active || []).length) g.fillText('☐ get a contract!', 60, 295);
      // rocket doodle with a dotted trajectory
      g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.moveTo(800, 420); g.lineTo(800, 300); g.lineTo(820, 260); g.lineTo(840, 300); g.lineTo(840, 420); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(800, 400); g.lineTo(780, 430); g.moveTo(840, 400); g.lineTo(860, 430); g.stroke();
      g.setLineDash([8, 12]); g.beginPath(); g.moveTo(820, 250); g.quadraticCurveTo(880, 60, 990, 120); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(960, 440, 60, Math.PI, 0); g.stroke(); g.font = '26px "Comic Sans MS", cursive'; g.fillStyle = '#111'; g.fillText('Earth', 925, 500);
    }
    tex.needsUpdate = true;
  }
  // ------------------------------------------------------------------ enter / UI
  async enter() {
    const G = this.G, game = G.game; this.active = true;
    if (!isCareer(game)) return G.go('center');
    refreshOffers(game);
    const level = game.facility || 0; this.level = level;
    this.scene = this.room(level); this.screenTex = this.scene.userData.screenTex || this.screenTex; this.scene.userData.screenTex = this.screenTex; this.spot = this.scene.userData.spot;
    this.cam.enabled = true; this.cam.yaw = Math.PI / 2; this.cam.pitch = 0.08; this.cam.dist = level ? 9 : 6.2; this.cam.minDist = 3; this.cam.maxDist = level ? 18 : 8;
    this.selected = null; this.focusOn = null; this.placeGivers(); this.drawScreen(); this.buildUI();
    if (!this.bubble) this.bubble = h('div.speech'); this.bubble.style.display = 'none'; document.body.append(this.bubble);
  }
  exit() { this.active = false; this.cam.enabled = false; clearUI(); this.bubble?.remove(); }
  placeGivers() {
    for (const a of this.givers) a.group.removeFromParent();
    const C = this.G.game.contracts; const ids = [...new Set([...C.offered, ...C.active].map(c => c.giver))].slice(0, 5);
    if (!ids.length) ids.push('farmer');
    this.pool ||= {};
    const n = ids.length, gap = this.level ? 1.9 : 1.45, z0 = this.level ? -3.5 : -1.8;
    this.givers = ids.map((id, i) => {
      const a = this.pool[id] || (this.pool[id] = new Astronaut().dress(GIVER_BY_ID[id].outfit));
      a.giver = GIVER_BY_ID[id]; a.state = a.giver.idle; a.t = i * 1.7;
      const x = (i - (n - 1) / 2) * gap; a.group.position.set(x, 0, z0 - Math.abs(i - (n - 1) / 2) * 0.25); a.group.rotation.y = -x * 0.08; a.group.scale.setScalar(0.9);
      this.scene.add(a.group); return a;
    });
  }
  buildUI() {
    clearUI(); const G = this.G, game = G.game, C = game.contracts;
    this.money = h('div.clock.mono.money', {}, `${fmtFunds(game.funds)} · ${Math.floor(game.tp)} TP`);
    mount(h('div#topbar.panel', {}, h('button', { onclick: () => G.go('center') }, '← Space Centre'), h('b', { style: { padding: '0 6px' } }, this.level ? 'Mission Control' : 'Portakabin Mission Control'), this.money));
    const card = (c, active) => {
      const gv = GIVER_BY_ID[c.giver];
      return h('div.contract' + (this.selected === c.id ? '.sel' : '') + (active ? '.active' : ''), { onclick: () => this.select(c) },
        h('div.c-head', {}, h('span.c-badge', {}, BADGE[gv.outfit] || '🫘'), h('div', {}, h('b', {}, c.title), h('div.small.dim', {}, gv.name + ' · ' + gv.role))),
        h('div.small', {}, c.text),
        h('div.c-pay', {}, h('span', {}, '💰 ' + fmtFunds(c.pay)), h('span.dim', {}, active ? 'advance paid' : `(${fmtFunds(c.advance)} up front)`), h('span.tp', {}, `+${c.tp} TP`)),
        active ? null : h('div.row', { style: { gap: '6px', marginTop: '6px' } },
          h('button.primary', { onclick: (e) => { e.stopPropagation(); this.accept(c); } }, 'Accept'),
          h('button', { onclick: (e) => { e.stopPropagation(); this.decline(c); } }, 'Decline')));
    };
    mount(h('div#side.panel.contracts', {}, h('b', {}, 'Contracts'),
      h('div.small.dim', {}, `Offers · ${C.active.length}/5 active · ${C.done || 0} completed`),
      ...C.offered.map(c => card(c, false)),
      C.active.length ? h('h3', { style: { margin: '10px 0 4px' } }, 'Active') : null,
      ...C.active.map(c => card(c, true))));
  }
  select(c) {
    this.selected = c.id; const a = this.givers.find(x => x.giver.id === c.giver);
    for (const g of this.givers) g.state = g === a ? 'talk' : g.giver.idle;
    this.focusOn = a; this.buildUI(); this.say(a, `“${a.giver.line}”`, c.title);
  }
  say(a, line, sub) { if (!a) return; this.speaker = a; this.bubble.replaceChildren(h('b', {}, a.giver.name), h('div', {}, line), sub ? h('div.small.dim', {}, sub) : null); this.bubble.style.display = ''; clearTimeout(this.sayT); this.sayT = setTimeout(() => { this.bubble.style.display = 'none'; this.speaker = null; }, 6000); }
  react(a, state, ms) { if (!a) return; a.state = state; clearTimeout(a._rt); a._rt = setTimeout(() => { a.state = a.giver.idle; }, ms); }
  accept(c) {
    const g = this.G.game; if (g.contracts.active.length >= 5) return flash('You can only run 5 contracts at once');
    const a = this.givers.find(x => x.giver.id === c.giver);
    if (!acceptContract(g, c.id)) return;
    toast('Contract accepted', `${c.title} · ${fmtFunds(c.advance)} advance received`, 'contract');
    this.say(a, ['Splendid! Don’t let me down.', 'Excellent. I expect results!', 'Wonderful — off you go!'][Math.floor(Math.random() * 3)]); this.react(a, 'cheer', 2600);
    refreshOffers(g); this.G.save(true); this.selected = null; this.drawScreen(); this.buildUI();
    setTimeout(() => { if (this.active) this.placeGivers(); }, 2700);
  }
  decline(c) {
    const g = this.G.game; const a = this.givers.find(x => x.giver.id === c.giver);
    declineContract(g, c.id); this.say(a, ['Pity. Perhaps another time.', 'Hmph.', 'Your loss, my dear Bean.'][Math.floor(Math.random() * 3)]); this.react(a, 'shrug', 2200);
    this.G.save(true); this.selected = null; this.buildUI();
    setTimeout(() => { if (this.active) this.placeGivers(); }, 2300);
  }
  tap(x, y) {
    const r = this.G.world.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1), this.camera);
    let best = null, bd = Infinity; for (const a of this.givers) { const p = a.group.position.clone().setY(1.0); const d = this.ray.ray.distanceToPoint(p); if (d < 0.8 && d < bd) { bd = d; best = a; } }
    if (!best) return;
    const c = [...this.G.game.contracts.offered, ...this.G.game.contracts.active].find(k => k.giver === best.giver.id);
    if (c) this.select(c); else { this.say(best, `“${best.giver.line}”`); this.react(best, 'wave', 2500); }
  }
  update(dt) {
    if (!this.active) return;
    const lookY = this.level ? 1.3 : 1.2;
    const f = this.focusOn ? this.focusOn.group.position : null;
    this.look = this.look || new THREE.Vector3(0, lookY, -2);
    this.look.lerp(new THREE.Vector3(f ? f.x * 0.6 : 0, lookY, this.level ? -2.5 : -1.2), Math.min(1, dt * 3));
    this.cam.yaw = Math.max(Math.PI / 2 - 0.7, Math.min(Math.PI / 2 + 0.7, this.cam.yaw)); this.cam.pitch = Math.max(-0.1, Math.min(0.55, this.cam.pitch));
    const off = this.cam.apply(this.camera, new THREE.Vector3(0, 1, 0));
    this.camera.position.set(this.look.x + off.x, this.look.y + 0.3 + off.y, this.look.z + off.z); this.camera.lookAt(this.look);
    this.camera.aspect = innerWidth / innerHeight; this.camera.fov = innerHeight > innerWidth ? 62 : 42; this.camera.updateProjectionMatrix();
    for (const a of this.givers) a.update(dt);
    if (this.spot) { const a = this.focusOn; this.spot.intensity += ((a ? 60 : 0) - this.spot.intensity) * Math.min(1, dt * 4); if (a) { this.spot.target.position.copy(a.group.position); this.spot.position.set(a.group.position.x, this.level ? 7 : 3.1, a.group.position.z + 2); } }
    if ((this.scrT = (this.scrT || 0) + dt) > (this.level ? 0.2 : 2)) { this.scrT = 0; this.drawScreen(); }
    // speech bubble follows the speaker's head
    if (this.speaker && this.bubble.style.display !== 'none') {
      const p = this.speaker.group.position.clone(); p.y += 1.85; p.project(this.camera);
      this.bubble.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; this.bubble.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
    }
    this.G.world.pipeline.render(this.scene, this.camera, { time: 0, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Vector3(1, 1, 1), atmos: [], exposure: 1.0, sss: false });
  }
}

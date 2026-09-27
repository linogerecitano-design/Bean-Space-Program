// Map view: orbit lines, patched-conic trajectory prediction, maneuver nodes and markers.
import * as THREE from 'three';
import { Orbit } from '../core/orbit.js';
import { V3, fmtDist, fmtTime } from '../core/math.js';
import { h } from '../ui/ui.js';

const N = 256;
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// map colours and base line opacity by body type (dwarfs dimmer, small bodies dimmer still)
const TYPE_STYLE = { planet: { color: 0x6fa8ff, alpha: 0.7 }, moon: { color: 0x9aa6b8, alpha: 0.45 }, dwarf: { color: 0xb49ae8, alpha: 0.26 },
  asteroid: { color: 0x8a8f99, alpha: 0.11 }, kbo: { color: 0x8a8f99, alpha: 0.11 }, centaur: { color: 0x8a8f99, alpha: 0.11 }, comet: { color: 0x66e0d0, alpha: 0.22 }, star: { color: 0xffe28a, alpha: 0.6 } };
function lineObj(color, opacity = 1, dashed = false) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3));
  const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 1, gapSize: 1, transparent: true, opacity, depthWrite: false }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const l = new THREE.Line(g, m); l.frustumCulled = false; l.renderOrder = 10; return l;
}
function fillOrbit(line, orbit, t0, t1, relTo, count = N) {
  // positions relative to the orbit's central body (double) -> float relative to relTo offset
  const arr = line.geometry.attributes.position.array; const r = new V3(), v = new V3();
  let n = 0;
  if (orbit.e < 1 && !isFinite(t1)) { // full ellipse by true anomaly (even spacing looks better)
    for (let i = 0; i <= count; i++) { const nu = i / count * Math.PI * 2; orbit.posAtTrue(nu, r); arr[n++] = r.x - relTo.x; arr[n++] = r.y - relTo.y; arr[n++] = r.z - relTo.z; }
  } else {
    for (let i = 0; i <= count; i++) { const t = t0 + (t1 - t0) * i / count; orbit.stateAt(t, r, v); arr[n++] = r.x - relTo.x; arr[n++] = r.y - relTo.y; arr[n++] = r.z - relTo.z; }
  }
  line.geometry.setDrawRange(0, count + 1);
  line.geometry.attributes.position.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

// Predict up to 3 conic patches starting from (body, r, v, t)
export function predictPatches(sys, body, r, v, t, maxPatches = 3) {
  const patches = [];
  let B = body, R = r.clone(), Vv = v.clone(), T = t;
  for (let k = 0; k < maxPatches; k++) {
    const o = Orbit.fromState(B.mu, R, Vv, T);
    const period = o.period;
    let tEnd = isFinite(period) ? T + period : T + (o.timeToTrue(o.trueAtRadius(Math.min(B.soi, 1e20)) * 0.999, T) || 1e7);
    if (!isFinite(tEnd) || tEnd <= T) tEnd = T + 1e8;
    let exitT = null, next = null;
    // SOI exit
    if (B.parentBody && (o.e >= 1 || o.ap > B.soi)) {
      const nuExit = o.trueAtRadius(B.soi);
      const dt = o.timeToTrue(nuExit, T);
      if (dt > 0 && isFinite(dt)) { exitT = T + dt; tEnd = exitT; next = { body: B.parentBody, kind: 'escape' }; }
    }
    // encounters with children (sampled)
    const steps = 400; const pr = new V3(), pv = new V3();
    const surfaceR = B.radius + (B.atmo ? 0 : 0);
    let impactT = null;
    for (let i = 1; i <= steps && !impactT; i++) {
      const ts = T + (tEnd - T) * i / steps;
      o.stateAt(ts, pr, pv);
      if (pr.len() < surfaceR) { impactT = ts; break; }
      for (const c of B.children) {
        if (c.soi < 1 || c.type === 'star') continue;
        const cp = c.orbit.stateAt(ts, new V3());
        if (cp.dist(pr) < c.soi) { // refine by bisection
          let a = T + (tEnd - T) * (i - 1) / steps, b = ts;
          for (let it = 0; it < 30; it++) { const m = (a + b) / 2; o.stateAt(m, pr, pv); const cpm = c.orbit.stateAt(m, new V3()); if (cpm.dist(pr) < c.soi) b = m; else a = m; }
          exitT = b; tEnd = b; next = { body: c, kind: 'encounter' }; break;
        }
      }
      if (next && next.kind === 'encounter') break;
    }
    patches.push({ body: B, orbit: o, t0: T, t1: impactT || tEnd, full: !exitT && !impactT && o.e < 1, impactT, next });
    if (!next || impactT) break;
    // transform state into next body frame
    o.stateAt(tEnd, pr, pv);
    if (next.kind === 'escape') { const bp = B.orbit.stateAt(tEnd, new V3()), bv = new V3(); B.orbit.stateAt(tEnd, new V3(), bv); R = pr.clone().add(bp); Vv = pv.clone().add(bv); }
    else { const cp = new V3(), cv = new V3(); next.body.orbit.stateAt(tEnd, cp, cv); R = pr.clone().sub(cp); Vv = pv.clone().sub(cv); }
    B = next.body; T = tEnd;
  }
  return patches;
}

const ICON_W = { planet: 11, star: 13, moon: 8, dwarf: 9, asteroid: 6, comet: 7 };
export class MapView {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group(); this.group.visible = false; world.scene.add(this.group);
    this.bodyLines = new Map();
    this.traj = [lineObj(0xffa04a), lineObj(0xffd08a, 0.9), lineObj(0xffe0aa, 0.8)];
    this.plan = [lineObj(0x4a9dff), lineObj(0x7ab8ff, 0.9), lineObj(0xa0ccff, 0.8)];
    for (const l of [...this.traj, ...this.plan]) this.group.add(l);
    this.markerLayer = h('div', { style: { position: 'fixed', inset: '0', pointerEvents: 'none' } });
    this.markers = [];
    this.focus = null;
  }
  show(on) { this.group.visible = on; this.markerLayer.style.display = on ? '' : 'none'; if (on && !this.markerLayer.isConnected) document.getElementById('ui').prepend(this.markerLayer); }
  ensureBodyLine(b) {
    let l = this.bodyLines.get(b);
    if (!l) { const st = TYPE_STYLE[b.type] || TYPE_STYLE.asteroid; l = lineObj(st.color, st.alpha); l.userData.base = st.alpha; l.userData.alpha = 0; this.group.add(l); this.bodyLines.set(b, l); l.userData.dirty = true; }
    return l;
  }
  clear() { for (const [, l] of this.bodyLines) { this.group.remove(l); l.geometry.dispose(); } this.bodyLines.clear(); }
  // camPos: system frame; focusBody: body whose moons should be shown
  update(sys, t, camPos, focusBody, vessel, plan, others = []) {
    if (!this.group.visible) return;
    const show = new Set();
    const camFocusD = focusBody && focusBody.parentBody ? camPos.dist(focusBody.posAt(t)) : Infinity;
    const zoomedOut = !focusBody || !focusBody.parentBody || camFocusD > focusBody.soi * 0.6;
    for (const b of sys.bodies) {
      if (!b.parentBody) continue;
      const P = b.parentBody;
      const isTop = P === sys.star && (b.type === 'planet' || b.type === 'dwarf' || b.type === 'star' || (b.type !== 'moon' && (b.radius > 100e3 || b.type === 'comet')));
      const nearFocus = focusBody && (P === focusBody || P === focusBody.parentBody && b.type === 'moon' || b === focusBody);
      if (!isTop && !nearFocus) continue;
      if (isTop && !nearFocus && !zoomedOut && b !== focusBody) continue;
      if (b.unnamed && P !== focusBody) continue;
      show.add(b);
    }
    // orbit lines fade in/out smoothly: hidden when tiny on screen, and when the camera is so deep
    // inside a huge orbit that it would only be a stray line across the view
    const now = performance.now(); const fdt = Math.min(0.2, (now - (this._ft || now)) / 1000); this._ft = now;
    const fovK = innerHeight / 2 / Math.tan(this.world.camera.fov * Math.PI / 360);
    for (const [b, l] of this.bodyLines) {
      let target = 0;
      if (show.has(b)) {
        const pp = b.parentBody.posAt(t); const d = Math.max(1, pp.dist(camPos)); const px = b.orbit.a * (1 + b.orbit.e) / d * fovK;
        const special = b === focusBody || b === this.target || (vessel && vessel.body === b);
        target = special ? 0.9 : l.userData.base * smoothstep(12, 50, px) * (1 - smoothstep(5000, 20000, px));
      }
      const a = l.userData.alpha + (target - l.userData.alpha) * Math.min(1, fdt * 5); l.userData.alpha = a;
      l.material.opacity = a; l.visible = a > 0.01;
    }
    for (const b of show) {
      const l = this.ensureBodyLine(b); if (!l.visible && l.userData.alpha > 0.01) l.visible = true;
      if (l.userData.dirty || b.orbit.e >= 1) { fillOrbit(l, b.orbit, t, Infinity, { x: 0, y: 0, z: 0 }); l.userData.dirty = false; }
      const pp = b.parentBody.posAt(t);
      l.position.set(pp.x - camPos.x, pp.y - camPos.y, pp.z - camPos.z);
    }
    // markers
    this.clearMarkers();
    const cam = this.world.camera;
    for (const b of show) if (b.type !== 'moon' || b.parentBody === focusBody || b.parentBody === focusBody?.parentBody) this.marker(sys, b.posAt(t), camPos, b.name, b === focusBody ? 'b' : 'body', b);
    // vessels: yours, and the others in this star system (tap one to target it)
    for (const o of others) if (o && o.body && !o.galactic && o.type !== 'debris') this.marker(sys, o.body.posAt(t).clone().add(o.r), camPos, o.name || 'Vessel', 'ves', null, o);
    if (vessel && vessel.body && !vessel.galactic) this.marker(sys, vessel.body.posAt(t).clone().add(vessel.r), camPos, vessel.name || 'You', 'me', null, vessel);
    // vessel trajectory
    for (const l of [...this.traj, ...this.plan]) l.visible = false;
    if (vessel && vessel.body && !vessel.landed && !vessel.galactic) {
      const patches = predictPatches(sys, vessel.body, vessel.r, vessel.v, t);
      this.drawPatches(sys, patches, this.traj, t, camPos, true);
      this.patches = patches;
      if (plan) {
        const pp = predictPatches(sys, plan.body, plan.r, plan.v, plan.t);
        this.drawPatches(sys, pp, this.plan, t, camPos, false);
        this.planPatches = pp;
        this.marker(sys, plan.body.posAt(t).clone().add(plan.r), camPos, 'Maneuver', 'node');
      } else this.planPatches = null;
    }
  }
  drawPatches(sys, patches, lines, t, camPos, markers) {
    patches.forEach((p, i) => {
      const l = lines[i]; if (!l) return; l.visible = true;
      fillOrbit(l, p.orbit, p.t0, p.full ? Infinity : p.t1, { x: 0, y: 0, z: 0 });
      const bp = p.body.posAt(i === 0 ? t : p.t0 > t ? t : t); // draw relative to the body's current position
      l.position.set(bp.x - camPos.x, bp.y - camPos.y, bp.z - camPos.z);
      if (!markers) return;
      const o = p.orbit;
      const mk = (nu, label) => { const r = o.posAtTrue(nu); this.marker(sys, bp.clone().add(r), camPos, label, 'ap'); };
      if (o.e < 1 && o.ap < (p.body.soi || Infinity)) mk(Math.PI, 'Ap ' + fmtDist(o.ap - p.body.radius));
      if (o.pe > 0 && (p.full || o.timeToPe(p.t0) < p.t1 - p.t0)) mk(0, 'Pe ' + fmtDist(o.pe - p.body.radius));
      if (p.next) { const r = new V3(); o.stateAt(p.t1, r); this.marker(sys, bp.clone().add(r), camPos, (p.next.kind === 'escape' ? 'Escape → ' : 'Encounter ') + p.next.body.name, 'soi'); }
      if (p.impactT) { const r = new V3(); o.stateAt(p.impactT, r); this.marker(sys, bp.clone().add(r), camPos, 'Impact in ' + fmtTime(p.impactT - t), 'imp'); }
    });
  }
  clearMarkers() { for (const m of this.markers) m.style.display = 'none'; this.mi = 0; }
  marker(sys, pos, camPos, text, kind, body, ves) {
    const cam = this.world.camera;
    const v = new THREE.Vector3(pos.x - camPos.x, pos.y - camPos.y, pos.z - camPos.z);
    const p = v.clone().project(cam); if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) return;
    // picked on pointerdown: the markers are refreshed every frame, and a tap whose element changed under it
    // between press and release never became a click (so bodies couldn't be selected)
    let el = this.markers[this.mi]; if (!el) { el = h('div.marker'); el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (el._body && this.onPick) this.onPick(el._body); else if (el._ves && this.onPickVessel) this.onPickVessel(el._ves); }); this.markers.push(el); this.markerLayer.append(el); } this.mi++;
    el.style.display = ''; el.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
    el._body = body || null; el._ves = ves || null; el.classList.toggle('pick', !!((body && this.onPick) || (ves && kind === 'ves' && this.onPickVessel)));
    const set = (html, w) => { if (el._html !== html) { el._html = html; el.innerHTML = html; } el.style.transform = `translate(${-w / 2}px, -50%)`; }; // the icon (not the label) sits on the point
    if (body) {
      const type = body.type === 'kbo' || body.type === 'centaur' ? 'asteroid' : body.type;
      const st = TYPE_STYLE[type] || TYPE_STYLE.asteroid; const col = '#' + st.color.toString(16).padStart(6, '0');
      const showName = kind === 'b' || type === 'planet' || type === 'star' || type === 'dwarf' || type === 'moon' || body === this.target;
      el.title = text;
      set(`<i class="ico ico-${type}" style="--c:${col}"></i>${showName ? `<span class="${kind === 'b' ? 'foc' : ''}">${text}</span>` : ''}`, ICON_W[type] || 8);
      return;
    }
    if (ves) {
      el.title = text; const me = kind === 'me', tg = ves === this.targetVessel;
      set(`<i class="ico ico-ves${me ? ' me' : ''}"></i><span class="${me ? 'foc' : tg ? 'tgt' : ''}">${tg ? '◎ ' : ''}${text}</span>`, 14);
      return;
    }
    el.title = '';
    set(kind === 'node' ? '<span style="color:#4a9dff">◆ ' + text + '</span>' : kind === 'ap' ? '<span style="color:#fcd34d">▲ ' + text + '</span>' : kind === 'soi' ? '<span style="color:#f0abfc">● ' + text + '</span>' : kind === 'imp' ? '<span style="color:#f87171">✖ ' + text + '</span>' : '· ' + text, 10);
  }
}

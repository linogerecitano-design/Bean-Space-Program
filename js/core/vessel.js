// Vessel designs (part trees), layout, staging, resources, and rigid-body flight physics.
import * as THREE from 'three';
import { PART, PROPS } from '../data/parts.js';
import { V3, G0, C_LIGHT, AU } from './math.js';
import { Orbit } from './orbit.js';

let UID = 1;
export const newNode = (id) => ({ id, uid: UID++, below: null, radial: [] });
export function reseedUids(node) { if (!node) return; node.uid = UID++; reseedUids(node.below); for (const r of node.radial) reseedUids(r.node); if (node.stack) reseedUids(node.stack); }
export function cloneNode(n) { return n ? JSON.parse(JSON.stringify(n)) : null; }
export function walk(node, fn, parent = null, rel = null) {
  if (!node) return; fn(node, parent, rel);
  walk(node.below, fn, node, 'below');
  for (const r of node.radial) walk(r.node, fn, node, r);
  if (node.stack) walk(node.stack, fn, node, 'stack');
}

// ---------------------------------------------------------------- layout
// Returns placed parts: { node, part, pos:[x,y,z], ang (rotation about Y), mirrorIndex, parentPlaced, radialOf }
export function layout(design) {
  const out = [];
  const stackR = (n) => { let r = 0; for (let c = n; c; c = c.below) r = Math.max(r, (PART[c.id]?.d || 1) / 2, (PART[c.id]?.d2 || 0) / 2); return r; };
  const stackH = (n) => { let h = 0; for (let c = n; c; c = c.below) h += PART[c.id]?.h || 1; return h; };
  const placeStack = (node, x, y, z, ang, sym, depthAxial, parentPlaced, sideIndex) => {
    let cy = y; let prev = parentPlaced;
    for (let c = node; c; c = c.below) {
      const p = PART[c.id]; if (!p) continue;
      const pl = { node: c, part: p, pos: [x, cy, z], ang, sym, sideIndex, depthAxial, parentPlaced: prev, radius: Math.max(p.d || 0, p.d2 || 0) / 2 };
      out.push(pl);
      // radial attachments
      for (const r of c.radial) {
        const rp = PART[r.node.id]; if (!rp) continue;
        const at = r.at ?? 0.5;
        const yA = cy - (p.h || 1) * at;
        // surface radius at the attach height: capsules taper (d = base, dTop = top), adapters and
        // nose cones run from d at the top to d2 at the bottom; using the widest radius left parts
        // such as a chute near a capsule's nose floating in the air beside it
        const rTop = p.dTop != null ? p.dTop / 2 : (p.d || 0) / 2, rBot = p.dTop != null ? (p.d || 0) / 2 : (p.d2 ?? p.d ?? 0) / 2;
        const parentR = Math.max(0.1, rTop + (rBot - rTop) * Math.max(0, Math.min(1, at))) || 0.5;
        for (let k = 0; k < r.sym; k++) {
          const a = (r.angle || 0) + ang + k * Math.PI * 2 / r.sym;
          const ca = Math.cos(a), sa = Math.sin(a);
          const bx = x + ca * parentR, bz = z - sa * parentR;
          if (rp.radial) {
            const rpl = { node: r.node, part: rp, pos: [bx, yA, bz], ang: a, radial: true, sym: r.sym, sideIndex: k, depthAxial: pl.depthAxial, parentPlaced: pl, radialDec: rp.decoupler === 'radial' };
            out.push(rpl);
            if (r.node.stack) { // booster stack hung off the radial part (e.g. radial decoupler)
              const sr = stackR(r.node.stack); const off = (rp.decoupler ? 0.6 : (rp.d || 0.3)) + sr;
              placeStack(r.node.stack, bx + ca * off, yA + (r.node.stackOffset ?? 0.5) * Math.min(stackH(r.node.stack), (p.h || 1) * 2) * 0.2 + (rp.h || 1) / 2, bz - sa * off, a, r.sym, pl.depthAxial, rpl, k);
            }
          } else if (rp.chute && r.sym === 1) { // a stack chute pack "on the side" of a pod: it lives in the nose bay
            placeStack(r.node, x, cy + (rp.h || 1) * 0.3, z, ang, 1, pl.depthAxial, pl, 0);
          } else { // stack part attached directly on the side (strap-on without decoupler)
            const sr = stackR(r.node); const off = sr;
            placeStack(r.node, bx + ca * off, yA + (rp.h || 1) / 2, bz - sa * off, a, r.sym, pl.depthAxial, pl, k);
          }
        }
      }
      cy -= p.h || 1;
      if (p.decoupler === 'axial') depthAxial++;
      prev = pl;
    }
  };
  placeStack(design.root, 0, 0, 0, 0, 1, 0, null, 0);
  return out;
}

// ---------------------------------------------------------------- staging
// Stage numbers ascend in activation order: 0 fires first (engines at the bottom), etc.
export function computeStages(placed) {
  let D = 0; for (const p of placed) D = Math.max(D, p.depthAxial);
  for (const pl of placed) {
    const p = pl.part; pl.stage = null;
    if (p.engine && !p.engine.abort) pl.stage = 2 * (D - pl.depthAxial);      // bottom engines ignite first
    else if (p.decoupler === 'axial') pl.stage = 2 * (D - pl.depthAxial);     // fires with ignition of the stage above it
    else if (p.decoupler === 'radial') pl.stage = 2 * (D - pl.depthAxial) + 1; // strap-ons drop before the core separates
    else if (p.clamp) pl.stage = 0;
  }
  const chutes = placed.filter(p => p.part.chute);
  let max = 0; for (const p of placed) if (p.stage !== null) max = Math.max(max, p.stage);
  for (const c of chutes) c.stage = max + 1;
  const used = [...new Set(placed.filter(p => p.stage !== null).map(p => p.stage))].sort((a, b) => a - b);
  const remap = new Map(used.map((s, i) => [s, i]));
  for (const p of placed) if (p.stage !== null) p.stage = remap.get(p.stage);
  return used.length;
}

// ---------------------------------------------------------------- vessel stats (VAB readout)
export function designStats(design, body) {
  const placed = layout(design); const nStages = computeStages(placed);
  let dry = 0, wet = 0, cost = 0, crew = 0, parts = placed.length;
  for (const pl of placed) { dry += pl.part.mass; wet += pl.part.mass + (pl.part.prop?.mass || 0) * (pl.node.fuel ?? 1); cost += pl.part.cost || 0; crew += pl.part.crew || 0; }
  // delta-v per stage (vacuum + ASL) using simple sequential burn model
  const stages = [];
  const alive = new Set(placed);
  const g = body ? body.mu / body.radius ** 2 : 9.81;
  for (const p of placed) p._left = p.node.fuel ?? 1;
  for (let s = 0; s < nStages; s++) {
    // engines that are running during stage s: ignited at <= s and still attached
    const engines = [...alive].filter(p => p.part.engine && p.stage !== null && p.stage <= s && !p.part.engine.abort);
    const mass0 = [...alive].reduce((m, p) => m + p.part.mass + (p.part.prop?.mass || 0) * (p._left ?? 1), 0);
    // propellant usable by these engines: tanks that will separate at the next decoupler event
    const next = [...alive].filter(p => p.part.decoupler && p.stage === s + 1);
    const dropping = new Set(); for (const d of next) collectBelow(placed, d, dropping);
    let usable = 0; for (const p of alive) if (p.part.prop && engines.some(e => e.part.engine.prop === p.part.prop.type) && (dropping.has(p) || !next.length)) usable += p.part.prop.mass * (p._left ?? 1);
    const lim = (e) => e.node.thrustLimit ?? 1;
    const thrV = engines.reduce((t, e) => t + e.part.engine.thrust * lim(e), 0), thrS = engines.reduce((t, e) => t + e.part.engine.thrustSL * lim(e), 0);
    const ispV = thrV ? thrV / engines.reduce((t, e) => t + e.part.engine.thrust / e.part.engine.isp, 0) : 0;
    const ispS = thrS ? thrS / engines.reduce((t, e) => t + (e.part.engine.thrustSL || 1e-9) / (e.part.engine.ispSL || 1), 0) : 0;
    const m1 = mass0 - usable;
    const dvV = ispV && usable > 0 ? ispV * G0 * Math.log(mass0 / m1) : 0;
    const dvS = ispS && usable > 0 ? ispS * G0 * Math.log(mass0 / m1) : 0;
    stages.push({ stage: s, dvVac: dvV, dvASL: dvS, twr: thrS / (mass0 * g), twrVac: thrV / (mass0 * g), mass: mass0, burn: thrV ? usable * 1000 * ispV * G0 / (thrV * 1000) : 0 });
    for (const p of alive) if (p.part.prop && dropping.has(p)) p._left = 0; else if (p.part.prop && engines.some(e => e.part.engine.prop === p.part.prop.type) && !next.length) p._left = 0;
    for (const p of dropping) alive.delete(p);
  }
  for (const p of placed) delete p._left;
  return { dry, wet, cost, crew, parts, stages, nStages, totalDvVac: stages.reduce((a, s) => a + s.dvVac, 0), totalDvASL: stages.reduce((a, s) => a + s.dvASL, 0), placed };
}
function collectBelow(placed, decPl, set) {
  // parts whose chain passes through decPl (below it / its stack)
  const nodes = new Set(); walk(decPl.part.decoupler === 'radial' ? decPl.node : decPl.node, (n) => nodes.add(n));
  for (const p of placed) if (nodes.has(p.node)) { if (decPl.part.decoupler === 'radial' && p.node === decPl.node) { set.add(p); continue; } set.add(p); }
  // radial decouplers carry symmetric copies — include all side indices
}

// ---------------------------------------------------------------- runtime vessel
export class Vessel {
  constructor(design, opts = {}) {
    this.design = design; this.name = design.name || 'Vessel';
    this.id = opts.id || 'v' + Math.floor(Math.random() * 1e9);
    this.type = opts.type || 'ship';
    this.placed = layout(design);
    this.nStages = computeStages(this.placed);
    this.stage = 0; // next stage to activate
    this.parts = this.placed.map((pl, i) => ({ i, pl, part: pl.part, attached: true, fuel: pl.part.prop ? pl.part.prop.mass * (pl.node.fuel ?? 1) : 0, limit: pl.node.thrustLimit ?? 1, active: false, deployed: false, broken: false, section: 0 }));
    this.computeSections();
    this.throttle = 0; this.sas = false; this.sasMode = 'stability'; this.rcs = false;
    this.q = new THREE.Quaternion(); this.w = new THREE.Vector3();
    this.r = new V3(); this.v = new V3();
    this.body = null; this.landed = false; this.clamped = false; this.landedBF = null; this.landedQ = null;
    this.crew = opts.crew || [];
    this.onRails = false; this.orbit = null;
    this.input = { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 };
    this.warp = { on: false, factor: 10 };
    this.destroyed = false; this.situation = 'prelaunch';
    this.recalc();
  }
  // Sections: parts connected without crossing a decoupler share propellant.
  computeSections() {
    let sec = 0; const map = new Map();
    const assign = (pl, s) => map.set(pl, s);
    for (const p of this.parts) {
      const pl = p.pl; const par = pl.parentPlaced;
      if (!par) assign(pl, 0);
      else if (par.part.decoupler) assign(pl, ++sec);
      else assign(pl, map.get(par) ?? 0);
      if (pl.part.decoupler === 'radial') assign(pl, map.get(par) ?? 0);
    }
    for (const p of this.parts) p.section = map.get(p.pl) ?? 0;
  }
  livingParts() { return this.parts.filter(p => p.attached && !p.broken); }
  recalc() {
    let m = 0; const com = [0, 0, 0];
    let top = -Infinity, bottom = Infinity, rmax = 0, crewCap = 0;
    for (const p of this.livingParts()) {
      const pm = p.part.mass + p.fuel;
      m += pm; const [x, y, z] = p.pl.pos; const h = p.part.h || 1;
      com[0] += x * pm; com[1] += (y - h / 2) * pm; com[2] += z * pm;
      top = Math.max(top, y); bottom = Math.min(bottom, y - h); rmax = Math.max(rmax, Math.hypot(x, z) + (p.pl.radius || 0.5));
      crewCap += p.part.crew || 0;
    }
    this.mass = Math.max(m, 0.001); // tonnes
    this.com = com.map(c => c / this.mass);
    this.height = top - bottom; this.top = top; this.bottom = bottom; this.maxR = rmax;
    this.crewCap = crewCap;
    const L = Math.max(this.height, 0.5), Rr = Math.max(rmax, 0.3);
    const mk = this.mass * 1000;
    this.I = new THREE.Vector3(mk * (3 * Rr * Rr + L * L) / 12, mk * Rr * Rr / 2, mk * (3 * Rr * Rr + L * L) / 12);
    this.torque = 0; this.hasFins = 0; this.heatshield = false; this.chutes = 0; this.legs = false;
    for (const p of this.livingParts()) {
      this.torque += (p.part.torque || 0);
      if (p.part.fin) this.hasFins += p.part.fin;
      if (p.part.heatshield) this.heatshield = true;
      if (p.part.legs) this.legs = true;
      if (p.part.rcs) this.torque += p.part.rcs.thrust * Math.max(1, this.maxR) * 0.5;
    }
    this.contactPts = this.computeContacts();
    this.hasControl = this.livingParts().some(p => p.part.crew || p.part.probe) || this.type === 'eva';
    this.frontal = Math.PI * Rr * Rr;
    this.cd = this.livingParts().some(p => p.part.fairing || (p.part.mesh?.t === 'nose')) ? 0.35 : this.heatshield && this.height < 6 ? 1.1 : 0.6;
  }
  updateMass() { let m = 0; for (const p of this.parts) if (p.attached && !p.broken) m += p.part.mass + p.fuel; this.mass = Math.max(m, 0.001); }
  computeContacts() {
    const pts = [];
    for (const p of this.livingParts()) {
      const [x, y, z] = p.pl.pos; const h = p.part.h || 1, r = p.pl.radius || 0.3;
      const tol = p.part.legs ? p.part.legs : 6;
      if (p.pl.radial) {
        if (p.part.legs) { const a = p.pl.ang; pts.push({ p: [x + Math.cos(a) * (0.5 + h * 0.35), y - h * (p.part.mesh?.f9 ? 1 : 0.95), z - Math.sin(a) * (0.5 + h * 0.35)], tol, leg: true, part: p }); }
        continue;
      }
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; pts.push({ p: [x + Math.cos(a) * r, y - h, z + Math.sin(a) * r], tol, part: p }); pts.push({ p: [x + Math.cos(a) * r, y, z + Math.sin(a) * r], tol, part: p }); }
    }
    return pts;
  }
  // ---------------------------------------------------------- staging
  activateNextStage() {
    if (this.stage >= this.nStages + 1) return [];
    const s = this.stage++;
    const separated = [];
    for (const p of this.livingParts()) {
      if (p.pl.stage !== s) continue;
      if (p.part.engine) p.active = true;
      if (p.part.clamp) { p.attached = false; this.clamped = false; }
      if (p.part.chute) p.deployed = true;
      if (p.part.decoupler) separated.push(p);
    }
    const lost = [];
    for (const d of separated) lost.push(...this.separateAt(d, false));
    if (lost.length || separated.length || this.clamped === false) this.recalc();
    return lost;
  }
  // detach everything hanging off decoupler part d (returns the parts that left)
  separateAt(d, recalc = true) {
    const nodes = new Set();
    if (d.part.decoupler === 'axial') walk(d.pl.node.below, n => nodes.add(n));
    else walk(d.pl.node, n => nodes.add(n));
    // symmetric copies share node refs; separate only parts attached through this decoupler's side
    const group = this.livingParts().filter(p => nodes.has(p.pl.node) && (d.part.decoupler === 'axial' || p.pl.sideIndex === d.pl.sideIndex || p === d));
    if (d.part.decoupler === 'axial') group.push(d);
    for (const p of group) p.attached = false;
    if (recalc) this.recalc();
    return group;
  }
  // a part burned or broke away: it leaves with everything attached through it (returns the lost parts)
  breakOff(p) {
    const nodes = new Set(); walk(p.pl.node, n => nodes.add(n));
    const group = this.livingParts().filter(q => nodes.has(q.pl.node) && (!p.pl.radial || q.pl.sideIndex === p.pl.sideIndex));
    if (!group.includes(p)) group.push(p);
    for (const q of group) q.attached = false;
    this.recalc();
    return group;
  }
  // ---------------------------------------------------------- engines & resources
  pressureAtm() { if (!this.body || !this.body.atmo) return 0; const alt = this.r.len() - this.body.radius; return this.body.pressure(alt) / 101.325; }
  engineState(dtBurn = 0, ctx = {}) {
    // returns total thrust (N) along +Y and mass flow; consumes propellant when dtBurn > 0
    const pAtm = this.pressureAtm();
    let F = 0, mdot = 0; const sections = new Map();
    const power = this.powerAvailable(ctx);
    let powerNeeded = 0; for (const p of this.livingParts()) if (p.active && p.part.engine?.power) powerNeeded += p.part.engine.power;
    const powerFrac = powerNeeded > 0 ? Math.min(1, power / powerNeeded) : 1;
    for (const p of this.livingParts()) {
      if (!p.active || !p.part.engine) continue;
      const e = p.part.engine;
      const thr = e.solid ? 1 : (this.throttle < 1e-3 ? 0 : Math.max(e.throttleMin ?? 0, this.throttle));
      if (thr <= 0) { p.firing = 0; continue; }
      const k = Math.min(1, pAtm);
      let thrust = (e.thrust + (e.thrustSL - e.thrust) * k) * 1000 * thr * (p.limit ?? 1);
      let isp = e.isp + (e.ispSL - e.isp) * k;
      if (e.power) thrust *= powerFrac;
      if (e.ramjet) { const vs = ctx.speedVsStar || 0; thrust *= Math.min(1, Math.max(0, (vs - 0.001 * C_LIGHT) / (0.02 * C_LIGHT))); }
      if (thrust <= 0) { p.firing = 0; continue; }
      const flow = e.prop ? thrust / (isp * G0) / 1000 : 0; // tonnes/s
      if (e.prop) {
        const tanks = this.livingParts().filter(t => t.part.prop && t.part.prop.type === e.prop && t.fuel > 1e-9 && (t.section === p.section || e.solid && t === p));
        const avail = tanks.reduce((s, t) => s + t.fuel, 0);
        if (e.solid && p.fuel <= 1e-9) { p.firing = 0; p.active = false; continue; }
        if (avail <= 1e-9) { p.firing = 0; p.flameout = true; continue; }
        if (dtBurn > 0) {
          let need = flow * dtBurn; const frac = Math.min(1, avail / need);
          for (const t of tanks) t.fuel = Math.max(0, t.fuel - need * t.fuel / avail);
          thrust *= frac;
        }
      }
      p.firing = thr; p.flameout = false;
      F += thrust; mdot += flow;
    }
    this.thrustN = F; this.mdot = mdot;
    return F;
  }
  powerAvailable(ctx) {
    let pw = 0;
    const flux = ctx.solarFlux ?? 1; // relative to 1 AU from the Sun
    for (const p of this.livingParts()) { if (p.part.power) pw += p.part.solar ? (p.part.mesh?.deploy && !p.deployed ? 0 : p.part.power * flux) : p.part.power; }
    return pw;
  }
  hasFuelFor(eng) { return true; }
  propellantSummary() {
    const out = {};
    for (const p of this.livingParts()) if (p.part.prop) { const t = p.part.prop.type; out[t] = out[t] || { cur: 0, max: 0 }; out[t].cur += p.fuel; out[t].max += p.part.prop.mass; }
    return out;
  }
  stageDeltaV() {
    // remaining Δv (vacuum) estimate with currently active + remaining stages
    const d = { name: this.name, root: this.design.root };
    let dv = 0; const m0 = this.mass;
    let isp = 0, thr = 0;
    for (const p of this.livingParts()) if (p.part.engine && (p.active || p.pl.stage >= this.stage)) { thr += p.part.engine.thrust; isp += p.part.engine.thrust / p.part.engine.isp; }
    const ispE = thr ? thr / isp : 0;
    let fuel = 0; for (const p of this.livingParts()) if (p.part.prop) fuel += p.fuel;
    if (ispE && fuel) dv = ispE * G0 * Math.log(m0 / Math.max(0.001, m0 - fuel));
    return dv;
  }
  serialize() {
    return { id: this.id, name: this.name, type: this.type, design: this.design, stage: this.stage, crew: this.crew,
      parts: this.parts.map(p => [p.attached ? 1 : 0, +p.fuel.toFixed(4), p.active ? 1 : 0, p.deployed ? 1 : 0, +(p.limit ?? 1).toFixed(3)]),
      body: this.body?.name, r: this.r.toArray(), v: this.v.toArray(), q: this.q.toArray(), landed: this.landed, landedBF: this.landedBF, landedQ: this.landedQ,
      situation: this.situation, throttle: this.throttle, sas: this.sas, sasMode: this.sasMode, galactic: this.galactic || null, suited: this.suited, grab: this.grab || null };
  }
  static deserialize(d, sys) {
    const v = new Vessel(d.design, { id: d.id, type: d.type, crew: d.crew });
    v.stage = d.stage; d.parts.forEach((a, i) => { const p = v.parts[i]; if (!p) return; p.attached = !!a[0]; p.fuel = a[1]; p.active = !!a[2]; p.deployed = !!a[3]; if (a[4] !== undefined) p.limit = a[4]; });
    v.recalc(); v.body = sys ? sys.get(d.body) : null; v.r = V3.from(d.r); v.v = V3.from(d.v); v.q.fromArray(d.q);
    v.landed = d.landed; v.landedBF = d.landedBF; v.landedQ = d.landedQ; v.situation = d.situation; v.throttle = 0; v.sas = d.sas; v.sasMode = d.sasMode || 'stability';
    v.galactic = d.galactic; v.suited = d.suited; v.grab = d.grab || null;
    return v;
  }
}

// ---------------------------------------------------------------- physics
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
export function vesselUp(v, out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(v.q); }

// One physics step in the SOI body's inertial frame. ctx: {t, star, sysBody fns}
export function physicsStep(v, dt, ctx) {
  const B = v.body; const r = v.r, vel = v.v;
  const rl = r.len(); const up = r.clone().scale(1 / rl);
  const alt = rl - B.radius;
  // --- surface/ground
  const tH = B.hasSurface ? B.terrainHeightAt(r, ctx.t) : 0;
  // --- forces
  const mkg = v.mass * 1000;
  const ax = new V3().addScaled(r, -B.mu / (rl * rl * rl));
  const thrust = v.engineState(dt, ctx);
  if (thrust > 0) v.updateMass();
  const nose = vesselUp(v, _v);
  if (thrust > 0) ax.addScaled(new V3(nose.x, nose.y, nose.z), thrust / mkg);
  // RCS translation
  if (v.rcs && (v.input.x || v.input.y || v.input.z)) {
    const rcsF = v.livingParts().reduce((s, p) => s + (p.part.rcs ? p.part.rcs.thrust * 1000 : 0), 0) + (v.type === 'eva' ? 60 : 0);
    const loc = new THREE.Vector3(v.input.x, v.input.z, -v.input.y).applyQuaternion(v.q);
    ax.addScaled(new V3(loc.x, loc.y, loc.z), rcsF / mkg);
  }
  // --- atmosphere
  let rho = 0, q = 0, airV = null;
  if (B.atmo && alt < B.atmo.height) {
    rho = B.atmoDensity(alt);
    const surfV = B.surfaceVel(r); airV = vel.clone().sub(surfV);
    const s = airV.len(); q = 0.5 * rho * s * s;
    if (s > 0.01) {
      const vn = airV.clone().scale(1 / s);
      const cosA = Math.abs(vn.x * nose.x + vn.y * nose.y + vn.z * nose.z);
      let area = v.frontal * cosA + v.height * v.maxR * 2 * Math.sqrt(1 - cosA * cosA) * 0.6;
      let cd = v.cd;
      // parachutes
      for (const p of v.livingParts()) if (p.deployed && p.part.chute) {
        const ch = p.part.chute; const safe = ch.supersonic || s < 350 || ch.drogue && s < 500;
        if (!safe && q > 30000) { p.broken = true; continue; }
        const openK = Math.min(1, (p.openT = (p.openT || 0) + dt) / (ch.drogue ? 1 : 3));
        area += ch.area * openK * (alt < 30000 || ch.drogue ? 1 : 0.3); cd = Math.max(cd, 0.9);
      }
      if (v.type === 'eva') area = 0.8;
      const D = q * cd * area;
      ax.addScaled(vn, -D / mkg);
      v.dragN = D;
      // aerodynamic torque toward stable orientation
      const stableAxis = v.hasFins > 0 || v.cd < 0.4 ? 1 : v.heatshield && v.height < 8 ? -1 : 0.25;
      const want = new THREE.Vector3(vn.x, vn.y, vn.z).multiplyScalar(stableAxis >= 0 ? 1 : -1);
      const axis = _v2.crossVectors(nose, want);
      const k = q * v.frontal * Math.max(v.height, 1) * 0.04 * (v.hasFins ? 2 + v.hasFins * 0.3 : Math.abs(stableAxis));
      const tq = axis.multiplyScalar(k);
      applyTorqueWorld(v, tq, dt);
      // aero damping
      v.w.multiplyScalar(Math.max(0, 1 - Math.min(0.5, q * 1e-6 * dt * 60)));
    }
    // reentry heating (visual + damage)
    const flux = 1.7e-4 * Math.sqrt(rho / Math.max(B.radius * 1e-7, 1)) * Math.pow(airV.len(), 3) * 1e-3;
    v.heat = flux;
    if (!v.heatshield && flux > 900 && airV.len() > 2500) v.overheat = (v.overheat || 0) + dt; else v.overheat = Math.max(0, (v.overheat || 0) - dt);
  } else { v.heat = 0; v.dragN = 0; }
  v.q_dyn = q; v.rho = rho;
  // sails (solar / laser)
  if (ctx.starDir && v.livingParts().some(p => p.part.sail)) {
    let F = 0;
    for (const p of v.livingParts()) if (p.part.sail) {
      const d2 = ctx.starDist * ctx.starDist; const P = ctx.starLum * 3.828e26 / (4 * Math.PI * d2 * C_LIGHT);
      const cs = Math.abs(nose.x * ctx.starDir.x + nose.y * ctx.starDir.y + nose.z * ctx.starDir.z);
      F += 2 * P * p.part.sail.area * cs * cs;
      if (p.part.sail.laser && ctx.laserOn) F += 2 * p.part.sail.laser / C_LIGHT * 0.1 * cs;
    }
    const sgn = (nose.x * ctx.starDir.x + nose.y * ctx.starDir.y + nose.z * ctx.starDir.z) < 0 ? 1 : -1;
    ax.addScaled(new V3(nose.x, nose.y, nose.z), sgn * F / mkg);
    v.sailN = F;
  }
  // --- integrate translation (semi-implicit)
  vel.addScaled(ax, dt);
  r.addScaled(vel, dt);
  // --- ground contact via spring-damper at contact points
  v.contact = false;
  if (B.hasSurface || B.isGas) {
    const R0 = B.radius + (B.isGas ? 0 : tH);
    const nr = r.len(); const upn = r.clone().scale(1 / nr);
    const surfV = B.surfaceVel(r);
    let impact = 0;
    const kSpring = mkg * 600, cDamp = 2 * Math.sqrt(kSpring * mkg) * 0.9;
    const Fn = new V3(); const T = new THREE.Vector3();
    const comLocal = new THREE.Vector3(...v.com);
    for (const c of v.contactPts) {
      const lp = _v2.set(c.p[0] - comLocal.x, c.p[1] - comLocal.y, c.p[2] - comLocal.z).applyQuaternion(v.q);
      const px = r.x + lp.x, py = r.y + lp.y, pz = r.z + lp.z;
      const pr = Math.sqrt(px * px + py * py + pz * pz);
      const pen = R0 + (v.padHeight || 0) - pr;
      if (pen > 0) {
        v.contact = true;
        const n = new V3(px / pr, py / pr, pz / pr);
        // point velocity = vel + w x lp (w in world)
        const ww = v.w.clone().applyQuaternion(v.q);
        const pv = new V3(vel.x + ww.y * lp.z - ww.z * lp.y, vel.y + ww.z * lp.x - ww.x * lp.z, vel.z + ww.x * lp.y - ww.y * lp.x).sub(surfV);
        const vn = pv.dot(n);
        impact = Math.max(impact, -vn);
        if (-vn > c.tol * (v.type === 'eva' ? 2 : 1) && !v.clamped && !ctx.noCrash) { c.part.broken = true; v.crashPart = c.part; }
        let fn = kSpring * pen - cDamp * vn; if (fn < 0) fn = 0;
        const vt = pv.clone().addScaled(n, -vn); const vtl = vt.len();
        const fr = vtl > 1e-4 ? Math.min(fn * 0.8, mkg * vtl / dt * 0.25) : 0;
        const F = n.clone().scale(fn); if (vtl > 1e-4) F.addScaled(vt, -fr / vtl);
        Fn.add(F);
        T.add(new THREE.Vector3().crossVectors(lp, new THREE.Vector3(F.x, F.y, F.z)));
      }
    }
    if (v.contact) {
      vel.addScaled(Fn, dt / mkg);
      applyTorqueWorld(v, T, dt);
      v.lastImpact = impact;
    }
    if (v.crashPart) { v.recalcNeeded = true; }
  }
  // --- rotation
  const Iw = v.I;
  let tIn = new THREE.Vector3(v.input.pitch, v.input.roll, v.input.yaw); // local axes: pitch about X, roll about Y, yaw about Z
  const ctrlT = v.hasControl ? (v.torque * 1000 + gimbalTorque(v)) : 0;
  if (v.sas && v.hasControl) tIn.add(sasInput(v, ctx));
  tIn.clampScalar(-1, 1);
  const tau = tIn.multiplyScalar(ctrlT);
  v.w.x += tau.x / Iw.x * dt; v.w.y += tau.y / Iw.y * dt; v.w.z += tau.z / Iw.z * dt;
  const wl = v.w.length();
  if (wl > 1e-9) { _q.setFromAxisAngle(_v2.copy(v.w).divideScalar(wl), wl * dt); v.q.multiply(_q).normalize(); }
  if (v.w.length() > 6) v.w.setLength(6);
}
function gimbalTorque(v) {
  let t = 0; for (const p of v.livingParts()) if (p.firing && p.part.engine.gimbal) t += v.thrustN > 0 ? p.part.engine.thrust * 1000 * p.firing * Math.sin(p.part.engine.gimbal * Math.PI / 180) * Math.max(1, v.height * 0.45) : 0; return t;
}
function applyTorqueWorld(v, tw, dt) {
  const tl = _v2.copy(tw).applyQuaternion(_q.copy(v.q).invert());
  v.w.x += tl.x / v.I.x * dt; v.w.y += tl.y / v.I.y * dt; v.w.z += tl.z / v.I.z * dt;
}
// SAS: PD controller toward a target direction (or damp rotation)
function sasInput(v, ctx) {
  const out = new THREE.Vector3();
  const damp = v.w.clone().multiplyScalar(-4);
  let target = null;
  const vel = ctx.refVel || v.v; const r = v.r;
  const pro = new THREE.Vector3(vel.x, vel.y, vel.z).normalize();
  const rad = new THREE.Vector3(r.x, r.y, r.z).normalize();
  const nrm = new THREE.Vector3().crossVectors(rad, pro).normalize();
  switch (v.sasMode) {
    case 'prograde': target = pro; break; case 'retrograde': target = pro.clone().negate(); break;
    case 'normal': target = nrm; break; case 'antinormal': target = nrm.clone().negate(); break;
    case 'radial': target = rad; break; case 'antiradial': target = rad.clone().negate(); break;
    case 'target': target = ctx.targetDir || null; break; case 'maneuver': target = ctx.nodeDir || null; break;
    default: if (v.input.pitch || v.input.yaw || v.input.roll) { v.sasHold = null; return new THREE.Vector3(); }
      if (!v.sasHold && v.w.length() < 0.02) v.sasHold = vesselUp(v).clone();
      target = v.sasHold;
  }
  if (target && target.lengthSq() > 0.5) {
    const cur = vesselUp(v);
    const axisW = new THREE.Vector3().crossVectors(cur, target);
    const ang = Math.atan2(axisW.length(), cur.dot(target));
    if (axisW.lengthSq() > 1e-12) axisW.normalize().multiplyScalar(ang);
    const axisL = axisW.applyQuaternion(_q.copy(v.q).invert());
    const k = 6 * Math.min(1, v.torque ? 1 : 0.5);
    out.set(axisL.x * k, 0, axisL.z * k);
  }
  out.add(damp.multiplyScalar(Math.min(3, 1 + 50 / (1 + v.I.x / Math.max(1, v.torque * 1000)))));
  return out;
}

export function updateSituation(v, t) {
  const B = v.body; const alt = v.r.len() - B.radius;
  if (v.clamped) v.situation = 'prelaunch';
  else if (v.landed || v.contact) v.situation = (B.name === 'Earth' || (B.style && B.style.seaLevel != null)) && B.terrainHeightAt(v.r, t) < (B.style?.seaLevel ?? 0) - 0.5 ? 'splashed' : 'landed';
  else if (B.atmo && alt < B.atmo.height) v.situation = 'flying';
  else { const o = Orbit.fromState(B.mu, v.r, v.v, t); v.situation = o.e < 1 && o.pe > B.radius + (B.atmo ? B.atmo.height : 0) ? 'orbiting' : o.e >= 1 ? 'escaping' : 'suborbital'; }
  return v.situation;
}

// Runtime star system: bodies with orbits, spin, spheres of influence and lazily created surfaces.
import * as THREE from 'three';
import { Orbit, eclToWorld } from './orbit.js';
import { V3, DEG, AU, LY, hashStr } from './math.js';
import { buildSolarSystem } from '../data/solarSystem.js';
import { generateSystem } from '../gen/systemgen.js';
import { starById, SOL } from '../gen/galaxy.js';
import { Surface } from '../gen/planetgen.js';
import { CPU_MAPS, PLANET_MAPS } from '../render/textures.js';

export const START_T = 946728000 + 15 * 3600; // 2030-01-01 15:00 UTC (mid-morning at the Cape)
let LAND_MASK = null;
const _lr = new V3(), _lv = new V3(), _lq = new THREE.Vector3(), _lqi = new THREE.Quaternion();

export async function loadLandMask() {
  if (LAND_MASK) return LAND_MASK;
  try {
    const topo = await (await fetch('assets/land-50m.json')).json();
    const land = window.topojson.feature(topo, topo.objects.land);
    const W = 2048, H = 1024;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff';
    const P = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
    for (const f of land.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) {
        g.beginPath();
        for (const ring of poly) {
          // unwrap longitudes so rings crossing the antimeridian draw correctly
          let prev = null, off = 0;
          ring.forEach(([lon, lat], i) => {
            if (prev !== null) { const d = lon + off - prev; if (d > 180) off -= 360; else if (d < -180) off += 360; }
            const L = lon + off; prev = L;
            const [x, y] = P(L, lat); i ? g.lineTo(x, y) : g.moveTo(x, y);
          });
          g.closePath();
        }
        g.fill('evenodd');
        // wrapped copies
        for (const shift of [-360, 360]) {
          g.save(); g.translate(shift / 360 * W, 0); g.fill('evenodd'); g.restore();
        }
      }
    }
    // Antarctica: ensure the pole cap is land
    g.fillRect(0, H * (1 - 12 / 180), W, H);
    g.filter = 'blur(2px)'; g.drawImage(cv, 0, 0); g.filter = 'none';
    const img = g.getImageData(0, 0, W, H).data;
    const data = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) data[i] = img[i * 4] / 255;
    LAND_MASK = { w: W, h: H, data };
  } catch (e) { console.warn('land mask failed', e); LAND_MASK = null; }
  return LAND_MASK;
}
export const getLandMask = () => LAND_MASK;

const NORTH = new THREE.Vector3(0, 1, 0);

export class Body {
  constructor(def, sys) {
    Object.assign(this, def);
    this.def = def; this.sys = sys;
    this.children = [];
    this.parentBody = null;
    this._pt = NaN; this._pos = new V3(); this._vel = new V3();
    this._surface = null;
    this.seed = hashStr(def.name);
  }
  get surface() {
    if (!this._surface && this.style && this.style.kind !== 'gas' && this.style.kind !== 'star') this._surface = new Surface(this, { landMask: this.name === 'Earth' && this.sys.real ? LAND_MASK : null, maps: this.baked ? { height: this.baked.hmap } : this.sys.real ? CPU_MAPS[this.name] : null });
    return this._surface;
  }
  get isStar() { return this.type === 'star'; }
  // air a Bean could breathe: Earth, or an Earth-like world with enough pressure and a mild climate
  get breathable() {
    if (this.name === 'Earth' && this.sys.real) return true;
    const a = this.atmo; if (!a || a.gas) return false;
    return (this.class === 'terra' || this.class === 'ocean') && a.P0 > 50 && a.P0 < 300 && (this.Teq ?? 0) > 235 && (this.Teq ?? 999) < 320;
  }
  get hasRealMap() { return !!(this.sys.real && PLANET_MAPS[this.name]); }
  get isGas() { return this.style && this.style.kind === 'gas'; }
  get hasSurface() { return !this.isStar && !this.isGas; }
  // absolute position/velocity in system frame (primary star at origin)
  posAt(t, out = new V3()) {
    if (!this.parentBody) return out.set(0, 0, 0);
    if (t === this._pt) return out.copy(this._pos);
    const pr = this.parentBody.posAt(t, new V3());
    const r = new V3(), v = new V3();
    this.orbit.stateAt(t, r, v);
    this._pt = t; this._pos.copy(pr).add(r);
    this._vel.copy(this.parentBody.velAt(t)).add(v);
    // double planet: this body's orbit describes the pair's barycentre, so step back from it
    if (this.binaryWith) {
      const c = this.sys.byName[this.binaryWith];
      if (c && c.orbit) { const cr = new V3(), cv = new V3(); c.orbit.stateAt(t, cr, cv); const k = c.mass / (c.mass + this.mass); this._pos.addScaled(cr, -k); this._vel.addScaled(cv, -k); }
    }
    return out.copy(this._pos);
  }
  velAt(t, out = new V3()) {
    if (!this.parentBody) return out.set(0, 0, 0);
    this.posAt(t); return out.copy(this._vel);
  }
  // rotation: body-fixed -> inertial
  spinAngle(t) {
    if (this.locked && this.orbit) {
      // tidally locked: the prime meridian (+X body axis) always faces the parent
      if (t === this._lockT) return this._lockA;
      const r = _lr, v = _lv; let d;
      const c = this.binaryWith && this.sys.byName[this.binaryWith];
      if (c && c.orbit) { c.orbit.stateAt(t, r, v); d = _lq.set(r.x, r.y, r.z); } // face the companion
      else { this.orbit.stateAt(t, r, v); d = _lq.set(-r.x, -r.y, -r.z); }
      d.applyQuaternion(_lqi.copy(this.poleQuat).invert());
      this._lockT = t; this._lockA = Math.atan2(-d.z, d.x) + (this.lockOffset || 0);
      return this._lockA;
    }
    if (!this.rotPeriod) return 0;
    return this.theta0 + 2 * Math.PI * t / this.rotPeriod;
  }
  rotAt(t, out = new THREE.Quaternion()) {
    const spin = new THREE.Quaternion().setFromAxisAngle(NORTH, this.spinAngle(t));
    return out.copy(this.poleQuat).multiply(spin);
  }
  angularVelocity() { // rad/s about the pole (world)
    let w = 0;
    const c = this.binaryWith && this.sys.byName[this.binaryWith];
    if (this.locked && c && c.orbit) w = c.orbit.n; else if (this.locked && this.orbit) w = this.orbit.n; else if (this.rotPeriod) w = 2 * Math.PI / this.rotPeriod;
    return this.poleAxis.clone().scale(w);
  }
  // surface velocity of a point (relative to body center) due to rotation
  surfaceVel(rel) { return this.angularVelocity().cross(rel); }
  heightAtDir(x, y, z) { const s = this.surface; return s ? s.height(x, y, z) : 0; }
  // terrain height at an inertial relative position (m above mean radius)
  terrainHeightAt(rel, t) {
    if (!this.hasSurface) return 0;
    const q = this.rotAt(t).invert();
    const v = new THREE.Vector3(rel.x, rel.y, rel.z).normalize().applyQuaternion(q);
    return this.surface.height(v.x, v.y, v.z);
  }
  atmoDensity(alt) {
    const a = this.atmo; if (!a || alt > a.height) return 0;
    const P = a.P0 * 1000 * Math.exp(-Math.max(alt, 0) / a.H); // Pa
    return P / (a.H * this.g0Surface()); // rho = P / (g H)
  }
  pressure(alt) { const a = this.atmo; if (!a || alt > a.height) return 0; return a.P0 * Math.exp(-Math.max(alt, 0) / a.H); } // kPa
  g0Surface() { return this.mu / (this.radius * this.radius); }
}

export class StarSystem {
  constructor(def, starInfo) {
    this.def = def; this.name = def.name; this.real = !!def.real; this.starInfo = starInfo;
    this.bodies = []; this.byName = {};
    for (const d of def.bodies) { const b = new Body(d, this); this.bodies.push(b); this.byName[b.name] = b; }
    this.star = this.byName[def.star];
    for (const b of this.bodies) {
      if (b.parent) { b.parentBody = this.byName[b.parent]; b.parentBody.children.push(b); }
    }
    // Pole orientation, then orbits (moons may reference parent equator)
    const order = [...this.bodies].sort((a, b) => this.depth(a) - this.depth(b));
    for (const b of order) {
      const tilt = (b.tilt || 0) * DEG;
      const lon = (b.poleLon ?? (b.seed % 360)) * DEG;
      const d = new THREE.Vector3(Math.cos(lon), 0, -Math.sin(lon));
      const axis = new THREE.Vector3().crossVectors(NORTH, d).normalize();
      b.poleQuat = new THREE.Quaternion().setFromAxisAngle(axis, tilt);
      if (b.rotPeriod && b.rotPeriod < 0) { b.poleQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)); b.rotPeriod = -b.rotPeriod; }
      const pa = NORTH.clone().applyQuaternion(b.poleQuat); b.poleAxis = new V3(pa.x, pa.y, pa.z);
      b.theta0 = b.name === 'Earth' ? 280.46 * DEG : (b.seed % 628) / 100;
      if (b.parentBody) {
        const el = b.elements, P = b.parentBody;
        let frame = null;
        if (el.frame === 'equator' && P.poleQuat) {
          const q = P.poleQuat; frame = (v) => { const w = new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(q); return new V3(w.x, w.y, w.z); };
        }
        b.orbit = Orbit.fromElements(P.mu, el.a, el.e, el.i, el.Om, el.om, el.M, 0, frame);
        if (b.locked) b.theta0 = 0;
      }
    }
    // SOI
    for (const b of this.bodies) {
      if (!b.parentBody) { b.soi = Infinity; continue; }
      const a = b.orbit.a;
      b.soi = Math.min(a * Math.pow(b.mass / b.parentBody.mass, 0.4), b.parentBody.soi === Infinity ? Infinity : b.parentBody.soi * 0.9);
      if (b.type === 'star') b.soi = a * Math.pow(b.mass / b.parentBody.mass, 0.4);
      b.soi = Math.max(b.soi, b.radius * 1.5);
    }
    // interstellar boundary of this system (m)
    const mStar = this.star.mass / 1.98847e30;
    this.boundary = 50000 * AU * Math.sqrt(Math.max(0.05, mStar));
    this.belts = def.belts || [];
  }
  depth(b) { let d = 0; let p = b.parent; while (p) { d++; p = this.def.bodies.find(x => x.name === p)?.parent; } return d; }
  get(name) { return this.byName[name]; }
  // deepest body whose SOI contains absolute position p (system frame) at time t
  soiBody(p, t, start = this.star) {
    let cur = start;
    // go up while outside
    while (cur.parentBody && cur.posAt(t).dist(p) > cur.soi) cur = cur.parentBody;
    // go down
    for (;;) {
      let next = null;
      for (const c of cur.children) { if (c.soi > 0 && c.posAt(t).dist(p) < c.soi) { next = c; break; } }
      if (!next) break; cur = next;
    }
    return cur;
  }
}

const systemCache = new Map();
export function loadSystem(starId) {
  if (systemCache.has(starId)) return systemCache.get(starId);
  let sys;
  if (starId === 'sol') sys = new StarSystem(buildSolarSystem(), SOL);
  else {
    const st = starById(starId);
    const def = generateSystem(st, { fillPlanets: !st.planets || !st.planets.length });
    sys = new StarSystem(def, st);
  }
  sys.starId = starId;
  sys.galPos = (starById(starId) || SOL).pos;
  systemCache.set(starId, sys);
  return sys;
}

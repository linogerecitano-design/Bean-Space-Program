// Keplerian two-body orbits (elliptic + hyperbolic) stored in perifocal-basis form so there are
// no angle singularities for circular / equatorial orbits.
import { V3, DEG } from './math.js';

const TAU = Math.PI * 2;

// Ecliptic (x,y,z with z = north) -> engine frame (x, y = north, z)
export function eclToWorld(x, y, z) { return new V3(x, z, -y); }

export function solveKeplerE(M, e) {
  M = ((M % TAU) + TAU) % TAU; if (M > Math.PI) M -= TAU;
  let E = e < 0.8 ? M : (M > 0 ? Math.PI : -Math.PI);
  for (let k = 0; k < 50; k++) {
    const f = E - e * Math.sin(E) - M, fp = 1 - e * Math.cos(E);
    const d = f / fp; E -= d; if (Math.abs(d) < 1e-13) break;
  }
  return E;
}
export function solveKeplerH(M, e) {
  let H = Math.asinh(M / e);
  for (let k = 0; k < 80; k++) {
    const f = e * Math.sinh(H) - H - M, fp = e * Math.cosh(H) - 1;
    const d = f / fp; H -= d; if (Math.abs(d) < 1e-12 * (1 + Math.abs(H))) break;
  }
  return H;
}

export class Orbit {
  // mu: gravitational parameter of the central body
  constructor(mu) { this.mu = mu; this.a = 1; this.e = 0; this.P = new V3(1, 0, 0); this.Q = new V3(0, 0, -1); this.W = new V3(0, 1, 0); this.M0 = 0; this.t0 = 0; }

  get n() { return Math.sqrt(this.mu / Math.abs(this.a * this.a * this.a)); }
  get period() { return this.e < 1 ? TAU / this.n : Infinity; }
  get pe() { return this.e < 1 ? this.a * (1 - this.e) : Math.abs(this.a) * (this.e - 1); }
  get ap() { return this.e < 1 ? this.a * (1 + this.e) : Infinity; }
  get inc() { return Math.acos(Math.max(-1, Math.min(1, this.W.y))); }

  // Build from classical elements. frame: optional function(V3)->V3 rotating from reference plane into world.
  static fromElements(mu, a, e, iDeg, OmDeg, omDeg, MDeg, t0 = 0, frame = null) {
    const o = new Orbit(mu);
    o.a = e < 1 ? a : -Math.abs(a); o.e = e; o.M0 = MDeg * DEG; o.t0 = t0;
    const i = iDeg * DEG, Om = OmDeg * DEG, om = omDeg * DEG;
    const cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(om), sw = Math.sin(om);
    // Standard perifocal -> ecliptic rotation
    const P = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si];
    const Q = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];
    const W = [sO * si, -cO * si, ci];
    o.P = eclToWorld(...P); o.Q = eclToWorld(...Q); o.W = eclToWorld(...W);
    if (frame) { o.P = frame(o.P); o.Q = frame(o.Q); o.W = frame(o.W); }
    return o;
  }

  static fromState(mu, r, v, t) {
    const o = new Orbit(mu); o.setState(r, v, t); return o;
  }

  setState(r, v, t) {
    const mu = this.mu;
    const rl = r.len();
    let h = r.clone().cross(v);
    if (h.len() < 1e-6 * rl * (v.len() + 1e-9)) { // nearly radial: nudge so the conic is defined
      const perp = Math.abs(r.y) < 0.9 * rl ? new V3(0, 1, 0) : new V3(1, 0, 0);
      const nudge = perp.cross(r).norm().scale(1e-3 + 1e-6 * v.len());
      v = v.clone().add(nudge); h = r.clone().cross(v);
    }
    const W = h.clone().norm();
    const evec = v.clone().cross(h).scale(1 / mu).sub(r.clone().scale(1 / rl));
    let e = evec.len();
    const energy = v.len2() / 2 - mu / rl;
    let a = -mu / (2 * energy);
    if (Math.abs(e - 1) < 1e-9) { e = 1 + 1e-9; a = -mu / (2 * (energy || -1e-12)); }
    let P;
    if (e < 1e-10) P = r.clone().norm(); else P = evec.clone().norm();
    const Q = W.clone().cross(P).norm();
    this.P = P; this.Q = Q; this.W = W; this.e = e; this.a = a; this.t0 = t;
    // true anomaly of r
    const nu = Math.atan2(r.dot(Q), r.dot(P));
    this.M0 = this.meanFromTrue(nu);
  }

  meanFromTrue(nu) {
    const e = this.e;
    if (e < 1) {
      const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
      return E - e * Math.sin(E);
    }
    const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    return e * Math.sinh(H) - H;
  }
  trueFromMean(M) {
    const e = this.e;
    if (e < 1) { const E = solveKeplerE(M, e); return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)); }
    const H = solveKeplerH(M, e); return 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(H / 2));
  }
  meanAt(t) { return this.M0 + this.n * (t - this.t0); }

  // position/velocity relative to the central body at time t
  stateAt(t, outR = new V3(), outV = new V3()) {
    const e = this.e, n = this.n; const M = this.meanAt(t);
    let x, y, vx, vy;
    if (e < 1) {
      const a = this.a, E = solveKeplerE(M, e), cE = Math.cos(E), sE = Math.sin(E), b = a * Math.sqrt(1 - e * e);
      const Ed = n / (1 - e * cE);
      x = a * (cE - e); y = b * sE; vx = -a * sE * Ed; vy = b * cE * Ed;
    } else {
      const a = Math.abs(this.a), H = solveKeplerH(M, e), cH = Math.cosh(H), sH = Math.sinh(H), b = a * Math.sqrt(e * e - 1);
      const Hd = n / (e * cH - 1);
      x = a * (e - cH); y = b * sH; vx = -a * sH * Hd; vy = b * cH * Hd;
    }
    const P = this.P, Q = this.Q;
    outR.set(P.x * x + Q.x * y, P.y * x + Q.y * y, P.z * x + Q.z * y);
    outV.set(P.x * vx + Q.x * vy, P.y * vx + Q.y * vy, P.z * vx + Q.z * vy);
    return outR;
  }
  posAtTrue(nu, out = new V3()) {
    const e = this.e; const p = this.e < 1 ? this.a * (1 - e * e) : Math.abs(this.a) * (e * e - 1);
    const r = p / (1 + e * Math.cos(nu)); const x = r * Math.cos(nu), y = r * Math.sin(nu);
    return out.set(this.P.x * x + this.Q.x * y, this.P.y * x + this.Q.y * y, this.P.z * x + this.Q.z * y);
  }
  radiusAtTrue(nu) { const e = this.e; const p = this.e < 1 ? this.a * (1 - e * e) : Math.abs(this.a) * (e * e - 1); return p / (1 + e * Math.cos(nu)); }
  // Time (after t) until periapsis / apoapsis
  timeToTrue(nu, t) {
    const Mt = this.meanFromTrue(nu); const Mn = this.meanAt(t);
    if (this.e < 1) { let d = (Mt - Mn) % TAU; if (d < 0) d += TAU; return d / this.n; }
    return (Mt - Mn) / this.n;
  }
  timeToPe(t) { return this.timeToTrue(0, t); }
  timeToAp(t) { return this.e < 1 ? this.timeToTrue(Math.PI, t) : Infinity; }
  // max true anomaly reachable before r exceeds rmax (for hyperbolic / escaping orbits)
  trueAtRadius(r) {
    const e = this.e; const p = this.e < 1 ? this.a * (1 - e * e) : Math.abs(this.a) * (e * e - 1);
    const c = (p / r - 1) / e; if (c > 1) return 0; if (c < -1) return Math.PI; return Math.acos(c);
  }
  clone() { const o = new Orbit(this.mu); o.a = this.a; o.e = this.e; o.P = this.P.clone(); o.Q = this.Q.clone(); o.W = this.W.clone(); o.M0 = this.M0; o.t0 = this.t0; return o; }
  serialize() { return { mu: this.mu, a: this.a, e: this.e, P: this.P.toArray(), Q: this.Q.toArray(), W: this.W.toArray(), M0: this.M0, t0: this.t0 }; }
  static deserialize(d) { const o = new Orbit(d.mu); o.a = d.a; o.e = d.e; o.P = V3.from(d.P); o.Q = V3.from(d.Q); o.W = V3.from(d.W); o.M0 = d.M0; o.t0 = d.t0; return o; }
}

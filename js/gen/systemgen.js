// Procedural planetary systems (Space-Engine style classes). Used for every star outside the
// Solar System — both to fill real stars with fictional moons/asteroids/dwarfs and to invent
// complete systems for procedural stars.
import { rng, hashStr } from '../core/math.js';

const AU = 1.495978707e11, MSUN = 1.98847e30, RSUN = 695700e3, ME = 5.97237e24, RE = 6371e3, MJ = 1.8982e27;
const Gc = 6.674e-11;

const SYL_A = ['ka', 've', 'lo', 'ri', 'sa', 'tu', 'mi', 'no', 'xe', 'da', 'phi', 'or', 'an', 'el', 'ys', 'qua', 'zen', 'tor', 'bel', 'cy', 'dra', 'gal', 'hel', 'ix', 'jun', 'kor', 'lum', 'mar', 'nev', 'oph', 'pyr', 'rho', 'sel', 'tha', 'ur', 'vox', 'wen', 'yl', 'zar', 'bean'];
export function makeName(r, n = 0) {
  const k = 2 + Math.floor(r() * 2);
  let s = ''; for (let i = 0; i < k; i++) s += SYL_A[Math.floor(r() * (SYL_A.length - (i === 0 ? 0 : 1)))];
  return s[0].toUpperCase() + s.slice(1);
}

// ---------- visual styles --------------------------------------------------------------------
const pal = (r, base, spread = 0.12) => base.map(v => Math.max(0, Math.min(1, v + (r() - 0.5) * spread)));
export function styleFor(cls, r, T) {
  switch (cls) {
    case 'selena': {
      // airless rock: pick a composition so moons don't all look alike
      const comp = r(); let c, extra = {};
      if (comp < 0.34) c = [[0.42, 0.41, 0.4], [0.56, 0.55, 0.53], [0.7, 0.69, 0.67]];                 // lunar grey
      else if (comp < 0.55) { c = [[0.46, 0.41, 0.37], [0.58, 0.53, 0.48], [0.7, 0.66, 0.61]]; extra = { faculae: 3 + Math.floor(r() * 8), icePatches: r() < 0.6 ? 0.3 + r() * 0.5 : 0 }; } // Ceres-like
      else if (comp < 0.7) c = [[0.5, 0.36, 0.28], [0.62, 0.46, 0.35], [0.74, 0.6, 0.48]];              // iron-oxide red
      else if (comp < 0.84) c = [[0.36, 0.34, 0.31], [0.48, 0.46, 0.43], [0.62, 0.6, 0.57]];           // dark carbonaceous (brighter ejecta)
      else c = [[0.5, 0.47, 0.42], [0.63, 0.6, 0.55], [0.78, 0.75, 0.7]];                               // bright anorthosite highlands
      return { kind: 'rocky', colors: { low: pal(r, c[0], 0.06), mid: pal(r, c[1], 0.06), high: pal(r, c[2], 0.05) }, relief: 5000, craters: 0.7 + r() * 0.3, maria: r() * 0.6, rays: r() * 0.6, detail: 'airless', ...extra };
    }
    case 'scorched': return { kind: 'rocky', colors: { low: pal(r, [0.36, 0.33, 0.31], 0.08), mid: pal(r, [0.5, 0.46, 0.42], 0.08), high: pal(r, [0.64, 0.6, 0.55], 0.06) }, relief: 6000, craters: 0.6, detail: 'airless', scarps: true };
    case 'iron': return { kind: 'rocky', colors: { low: pal(r, [0.3, 0.3, 0.31], 0.04), mid: pal(r, [0.42, 0.42, 0.43], 0.04), high: pal(r, [0.56, 0.55, 0.55], 0.04) }, relief: 7000, craters: 0.5, detail: 'airless', metallic: true };
    case 'carbon': return { kind: 'rocky', colors: { low: pal(r, [0.08, 0.07, 0.07], 0.03), mid: pal(r, [0.16, 0.14, 0.13], 0.04), high: pal(r, [0.3, 0.27, 0.24], 0.05) }, relief: 6000, craters: 0.3, dunes: 0.5, detail: 'desert' };
    case 'molten': return { kind: 'rocky', colors: { low: [0.06, 0.05, 0.05], mid: [0.12, 0.1, 0.09], high: [0.22, 0.2, 0.18] }, relief: 4000, craters: 0.02, lava: 1, volcanic: 1, forming: true };
    case 'desert': return { kind: 'rocky', colors: { low: pal(r, [0.55, 0.35, 0.2], 0.25), mid: pal(r, [0.7, 0.5, 0.32], 0.25), high: pal(r, [0.8, 0.68, 0.52], 0.2), ice: [0.95, 0.94, 0.92] }, relief: 8000, craters: r() * 0.4, dunes: r(), iceCaps: r() < 0.5 ? 0.85 : 0, volcanic: r() * 0.5 };
    case 'terra': {
      const oceanTone = pal(r, [0.02, 0.07, 0.18], 0.06);
      return { kind: 'terra', colors: { low: pal(r, [0.15, 0.25, 0.1], 0.15), mid: pal(r, [0.35, 0.33, 0.2], 0.15), high: pal(r, [0.5, 0.45, 0.4]), desert: pal(r, [0.72, 0.6, 0.42], 0.2), ice: [0.92, 0.95, 1], ocean: oceanTone, shallow: pal(r, [0.05, 0.25, 0.35], 0.1),
        vegetation: pal(r, [0.1, 0.25, 0.08], r() < 0.2 ? 0.6 : 0.1) }, relief: 6000, seaLevel: 0, oceanFrac: 0.3 + r() * 0.5, iceCaps: 0.75 + r() * 0.15, clouds: { coverage: 0.3 + r() * 0.4, color: [1, 1, 1], height: 2500, thickness: 6000, speed: 10 } };
    }
    case 'ocean': return { kind: 'terra', colors: { low: pal(r, [0.2, 0.3, 0.15]), mid: pal(r, [0.4, 0.38, 0.25]), high: [0.55, 0.5, 0.45], desert: [0.7, 0.62, 0.45], ice: [0.92, 0.95, 1], ocean: pal(r, [0.01, 0.05, 0.2], 0.06), shallow: pal(r, [0.05, 0.3, 0.4], 0.1), vegetation: [0.1, 0.25, 0.1] }, relief: 5000, seaLevel: 0, oceanFrac: 0.93 + r() * 0.06, iceCaps: 0.8, clouds: { coverage: 0.5 + r() * 0.3, color: [1, 1, 1], height: 2500, thickness: 7000, speed: 14 } };
    case 'ice': return { kind: 'icy', colors: { low: pal(r, [0.55, 0.6, 0.65]), mid: pal(r, [0.78, 0.82, 0.86]), high: pal(r, [0.95, 0.96, 0.98]), crack: pal(r, [0.45, 0.35, 0.3], 0.2) }, relief: 3000, craters: r() * 0.8, cracks: r() };
    case 'lava': return { kind: 'rocky', colors: { low: [0.08, 0.06, 0.05], mid: [0.15, 0.12, 0.1], high: [0.25, 0.22, 0.2] }, relief: 6000, craters: 0.05, lava: 0.6 + r() * 0.4, volcanic: 1 };
    case 'titan': return { kind: 'rocky', colors: { low: pal(r, [0.28, 0.2, 0.1]), mid: pal(r, [0.45, 0.33, 0.18]), high: pal(r, [0.62, 0.5, 0.32]), ocean: [0.05, 0.04, 0.03], shallow: [0.1, 0.08, 0.05] }, relief: 1500, dunes: 0.8, seaLevel: -300, craters: 0.05,
      clouds: { coverage: 1, color: pal(r, [0.85, 0.6, 0.25]), height: 50000, thickness: 120000, opaque: true, haze: true, speed: 20 } };
    case 'venus': return { kind: 'rocky', colors: { low: [0.45, 0.33, 0.2], mid: [0.6, 0.45, 0.28], high: [0.72, 0.6, 0.42] }, relief: 5000, volcanic: 0.6, craters: 0.05, clouds: { coverage: 1, color: pal(r, [0.93, 0.85, 0.66]), height: 45000, thickness: 20000, opaque: true, speed: 80 } };
    case 'asteroid': return { kind: 'asteroid', colors: { low: pal(r, [0.2, 0.19, 0.18]), mid: pal(r, [0.32, 0.3, 0.28]), high: pal(r, [0.45, 0.43, 0.4]) }, craters: 0.8, irregular: 0.15 + r() * 0.3, shape: [1 + r() * 0.8, 0.8 + r() * 0.2, 0.6 + r() * 0.3], contactBinary: r() < 0.1 };
    case 'kbo': {
      const t = r(); // tholin-red, neutral grey, or fresh bright ice
      const c = t < 0.45 ? [[0.55, 0.38, 0.3], [0.72, 0.56, 0.45], [0.88, 0.8, 0.74]] : t < 0.75 ? [[0.5, 0.49, 0.48], [0.66, 0.65, 0.63], [0.82, 0.81, 0.8]] : [[0.66, 0.68, 0.72], [0.82, 0.84, 0.87], [0.94, 0.95, 0.97]];
      return { kind: 'icy', colors: { low: pal(r, c[0], 0.1), mid: pal(r, c[1], 0.1), high: pal(r, c[2], 0.06) }, relief: 3000, craters: 0.6, maria: r() * 0.4, icePatches: r() < 0.3 ? 0.4 : 0 };
    }
    case 'jovian': case 'sudarsky2': case 'hotjupiter': case 'icegiant': case 'sudarsky3': case 'minineptune': {
      let bands;
      if (cls === 'jovian') bands = [pal(r, [0.84, 0.76, 0.66], 0.2), pal(r, [0.66, 0.46, 0.33], 0.25), pal(r, [0.93, 0.9, 0.84], 0.1), pal(r, [0.72, 0.56, 0.42], 0.25), pal(r, [0.55, 0.42, 0.34], 0.2)];
      else if (cls === 'sudarsky2') bands = [pal(r, [0.92, 0.93, 0.95], 0.06), pal(r, [0.8, 0.82, 0.86], 0.08), pal(r, [0.95, 0.95, 0.96], 0.04), pal(r, [0.75, 0.78, 0.84], 0.1)];
      else if (cls === 'sudarsky3') bands = [pal(r, [0.3, 0.45, 0.75], 0.1), pal(r, [0.25, 0.38, 0.7], 0.1), pal(r, [0.35, 0.5, 0.8], 0.1)];
      else if (cls === 'hotjupiter') bands = [pal(r, [0.25, 0.15, 0.12], 0.1), pal(r, [0.35, 0.2, 0.15], 0.1), pal(r, [0.18, 0.12, 0.1], 0.1)];
      else if (cls === 'minineptune') bands = [pal(r, [0.7, 0.78, 0.86], 0.15), pal(r, [0.62, 0.72, 0.82], 0.15), pal(r, [0.78, 0.84, 0.9], 0.1)];
      else bands = r() < 0.5 ? [pal(r, [0.62, 0.84, 0.88], 0.1), pal(r, [0.58, 0.8, 0.85], 0.1), pal(r, [0.66, 0.86, 0.9], 0.1)] : [pal(r, [0.25, 0.4, 0.85], 0.12), pal(r, [0.2, 0.33, 0.75], 0.12), pal(r, [0.32, 0.5, 0.9], 0.12)];
      const storms = [];
      const ns = cls === 'jovian' ? 1 + Math.floor(r() * 4) : Math.floor(r() * 3);
      for (let i = 0; i < ns; i++) storms.push({ lat: (r() - 0.5) * 120, lon: r() * 360, size: 0.02 + r() * (i === 0 ? 0.12 : 0.04), color: pal(r, bands[Math.floor(r() * bands.length)], 0.4), strength: 0.4 + r() * 0.6 });
      const s = { kind: 'gas', bands, bandCount: 6 + Math.floor(r() * 16), turbulence: cls === 'jovian' ? 0.5 + r() * 0.6 : 0.1 + r() * 0.5, storms };
      if (cls === 'hotjupiter') s.emissive = [1.0, 0.35, 0.1];
      if (cls !== 'minineptune' && cls !== 'hotjupiter' && r() < (cls === 'icegiant' ? 0.55 : 0.35)) {
        const inner = 1.2 + r() * 0.4;
        // composition follows temperature: bright water-ice rings only survive beyond the frost line; warmer
        // giants keep dark, dusty rock/carbon rings (narrow ringlets or a faint sheet), never vivid colours
        const icy = (T ?? 100) < 170 && r() < 0.75;
        const ice = [[0.86, 0.82, 0.75], [0.82, 0.8, 0.78], [0.84, 0.77, 0.66], [0.78, 0.76, 0.74]][Math.floor(r() * 4)];
        const dust = [[0.38, 0.36, 0.34], [0.45, 0.4, 0.35], [0.33, 0.32, 0.33], [0.5, 0.44, 0.38]][Math.floor(r() * 4)];
        const profile = icy ? (r() < 0.8 ? 'saturn' : 'uranus') : (r() < 0.55 ? 'uranus' : 'faint');
        const width = profile === 'saturn' ? 0.5 + r() * 0.9 : profile === 'uranus' ? 0.15 + r() * 0.4 : 0.4 + r() * 1.0;
        s.rings = { inner, outer: inner + width, profile, color: pal(r, icy ? ice : dust, 0.05), seed: Math.floor(r() * 1e6) };
      }
      return s;
    }
  }
  return styleFor('selena', r, T);
}
function atmoFor(cls, r, radius, g) {
  const Hscale = (h) => h * Math.max(0.3, Math.min(3, 9.8 / Math.max(0.5, g)));
  switch (cls) {
    case 'terra': case 'ocean': { const tint = r() < 0.75 ? [5.8e-6, 13.5e-6, 33.1e-6] : [r() * 3e-5, r() * 3e-5, r() * 3e-5]; return { height: 100000 * Math.max(0.5, Math.min(2, 9.8 / g)), H: Hscale(8500), P0: 60 + r() * 90, rayleigh: tint, mie: 2e-5, mieG: 0.76, HM: 1200 }; }
    case 'desert': return r() < 0.6 ? { height: 80000, H: Hscale(11000), P0: 0.3 + r() * 20, rayleigh: [1.9e-5, 1.25e-5, 0.7e-5], mie: 2.5e-5, mieG: 0.8, mieColor: [1, 0.75, 0.55], HM: 3000 } : null;
    case 'titan': return { height: 500000, H: Hscale(21000), P0: 100 + r() * 200, rayleigh: [2.5e-6, 5e-6, 1.1e-5], mie: 3.5e-5, mieG: 0.7, mieColor: [1, 0.62, 0.25], HM: 30000 };
    case 'venus': return { height: 140000, H: Hscale(15900), P0: 3000 + r() * 8000, rayleigh: [0.9e-5, 0.8e-5, 0.45e-5], mie: 2e-5, mieG: 0.7, mieColor: [1, 0.85, 0.55] };
    case 'lava': return r() < 0.5 ? { height: 60000, H: Hscale(8000), P0: 1 + r() * 50, rayleigh: [1.5e-5, 0.9e-5, 0.6e-5], mie: 3e-5, mieG: 0.7, mieColor: [1, 0.6, 0.4] } : null;
    case 'molten': return { height: 80000, H: Hscale(9000), P0: 5 + r() * 80, rayleigh: [1.6e-5, 0.9e-5, 0.5e-5], mie: 4e-5, mieG: 0.7, mieColor: [1, 0.55, 0.35], HM: 4000 };
    case 'carbon': return r() < 0.5 ? { height: 90000, H: Hscale(10000), P0: 10 + r() * 150, rayleigh: [1.2e-5, 0.9e-5, 0.7e-5], mie: 3e-5, mieG: 0.75, mieColor: [0.8, 0.7, 0.55], HM: 5000 } : null;
    case 'jovian': case 'sudarsky2': case 'sudarsky3': case 'hotjupiter': case 'icegiant': case 'minineptune':
      return { height: Math.max(300000, radius * 0.017), H: 27000, P0: 1e6, rayleigh: cls === 'hotjupiter' ? [1e-5, 4e-6, 2e-6] : [3.5e-6, 7e-6, 1.6e-5], mie: 2e-6, mieG: 0.7, gas: true };
  }
  return null;
}

// Classify a planet given equilibrium temperature and mass (Earth masses)
function classify(r, Teq, mEarth, gas) {
  if (mEarth > 60) { if (Teq > 900) return 'hotjupiter'; if (Teq > 350) return 'sudarsky3'; if (Teq > 150) return 'sudarsky2'; return 'jovian'; }
  if (mEarth > 10 || gas) return mEarth < 12 ? 'minineptune' : Teq > 700 ? 'hotjupiter' : 'icegiant';
  // rare oddballs
  const odd = r();
  if (odd < 0.03 && mEarth > 0.3) return 'carbon';
  if (odd < 0.06 && Teq > 300) return 'iron';
  if (Teq > 1500) return 'lava';                       // true magma-ocean worlds only when really hot
  if (Teq > 700) return r() < 0.25 ? 'lava' : 'scorched';
  if (Teq > 330) return r() < 0.35 ? 'venus' : r() < 0.6 ? 'scorched' : 'desert';
  if (Teq > 230) { const x = r(); return mEarth > 0.3 ? (x < 0.45 ? 'terra' : x < 0.65 ? 'ocean' : x < 0.85 ? 'desert' : 'selena') : (x < 0.5 ? 'selena' : 'desert'); }
  if (Teq > 140) return r() < 0.3 ? 'titan' : r() < 0.6 ? 'desert' : 'ice';
  return r() < 0.15 && mEarth > 0.05 ? 'titan' : 'ice';
}
function radiusFor(mEarth, cls) {
  if (cls === 'minineptune') return 2 + mEarth * 0.12;
  if (cls === 'iron') return 0.8 * Math.pow(mEarth, 0.26);
  if (mEarth < 2) return Math.pow(mEarth, 0.28);
  if (mEarth < 130) return 0.8 * Math.pow(mEarth, 0.55);
  return 11 * Math.pow(mEarth / 318, -0.04);
}

function moonList(r, parentName, pMassKg, pRadius, count, starTeq, isGiant, sysName) {
  const out = [];
  const hill = 0.4; // fraction handled by caller
  for (let k = 0; k < count; k++) {
    const regular = k < (isGiant ? 4 + Math.floor(r() * 3) : 2);
    const aR = regular ? (4 + k * k * 3 + r() * 5) * (isGiant ? 1 : 3) : 60 + r() * 400;
    // most regular moons are Mimas..Titania sized; Ganymede-class giants are rare
    const mE = regular ? (isGiant ? Math.pow(10, -5 + Math.pow(r(), 1.6) * 3.4) : Math.pow(10, -5 + Math.pow(r(), 1.4) * 3)) : Math.pow(10, -9 + r() * 3);
    const cls = mE < 1e-4 ? 'asteroid' : starTeq > 250 ? (r() < 0.6 ? 'selena' : 'desert') : (r() < 0.55 ? 'ice' : r() < 0.7 ? 'selena' : r() < 0.85 ? 'kbo' : 'titan');
    const radius = cls === 'asteroid' ? (0.3 + r() * 30) * 1e3 : radiusFor(mE) * RE;
    const mass = cls === 'asteroid' ? 2000 * 4 / 3 * Math.PI * radius ** 3 : mE * ME;
    out.push({ name: `${parentName} ${roman(k + 1)}`, type: 'moon', fictional: true, parent: parentName, radius, mass, locked: regular, rotPeriod: regular ? null : (4 + r() * 30) * 3600, tilt: r() * 20,
      style: { ...styleFor(cls, r, starTeq), seed: Math.floor(r() * 1e6) }, atmo: cls === 'titan' && radius > 1.5e6 ? atmoFor('titan', r, radius, Gc * mass / radius ** 2) : null, class: cls,
      elements: { a: aR * pRadius, e: regular ? r() * 0.02 : r() * 0.5, i: regular ? r() * 2 : (r() < 0.6 ? 100 + r() * 70 : r() * 60), Om: r() * 360, om: r() * 360, M: r() * 360, frame: regular ? 'equator' : 'ecliptic' } });
  }
  return out;
}
const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const roman = (k) => ROM[k - 1] || String(k);

// star: {name, mass (Msun), radius (Rsun), temp, lum, planets?: known [{name,a,mass,radius,e}], companions?}
// Returns a system object compatible with the solar system (bodies, byName, belts).
export function generateSystem(star, opts = {}) {
  const seed = hashStr(star.id || star.name);
  const r = rng(seed);
  const bodies = [], byName = {};
  const push = (b) => { b.mu = Gc * b.mass; bodies.push(b); byName[b.name] = b; return b; };
  const L = star.lum, M = star.mass;
  const starStyle = { kind: 'star', temp: star.temp, brownDwarf: star.brownDwarf, whiteDwarf: star.whiteDwarf };
  push({ name: star.name, type: 'star', radius: star.radius * RSUN, mass: star.mass * MSUN, rotPeriod: (star.radius > 5 ? 200 : 20 + r() * 30) * 86400, tilt: r() * 30, style: starStyle, lum: L, temp: star.temp, oblate: star.oblate });
  const Teq = (aAU) => 278 * Math.pow(L, 0.25) / Math.sqrt(aAU);
  const snow = 2.7 * Math.sqrt(L);
  // Companions (binary stars) orbit the primary
  const companionsA = [];
  for (const c of star.companions || []) {
    const cb = push({ name: c.name, type: 'star', parent: star.name, radius: c.radius * RSUN, mass: c.mass * MSUN, rotPeriod: 30 * 86400, tilt: r() * 20, style: { kind: 'star', temp: c.temp, whiteDwarf: c.whiteDwarf }, lum: c.lum, temp: c.temp,
      elements: { a: c.a * AU, e: c.e, i: r() * 10, Om: r() * 360, om: r() * 360, M: r() * 360, frame: 'ecliptic' } });
    companionsA.push(c.a);
  }
  const minCompA = companionsA.length ? Math.min(...companionsA) : Infinity;
  const young = !star.real && !star.brownDwarf && !star.whiteDwarf && r() < 0.04;       // rare: a system still forming
  const stableMax = minCompA * 0.3; // planets must stay well inside the binary orbit
  const planetDefs = [];
  for (const p of star.planets || []) planetDefs.push({ ...p, known: true });
  // Fill with fictional planets only for procedural stars (real systems keep their known planets,
  // plus fictional outer worlds only when there's clearly room)
  if (!star.real || opts.fillPlanets) {
    const n = star.brownDwarf ? Math.floor(r() * 4) : star.whiteDwarf ? Math.floor(r() * 3) : 3 + Math.floor(r() * 7);
    let a = (0.03 + r() * 0.3) * Math.sqrt(M);
    let giantsBeyond = 0;
    for (let k = 0; k < n; k++) {
      if (a > stableMax || a > 200) break;
      const beyondSnow = a > snow;
      let mass, gas = false;
      if (beyondSnow) {
        // the first worlds past the snow line are usually gas giants, further out ice giants
        const pGiant = giantsBeyond === 0 ? 0.8 : giantsBeyond === 1 ? 0.6 : 0.4;
        if (r() < pGiant) { mass = giantsBeyond < 2 && r() < 0.7 ? Math.pow(10, 1.7 + r() * 1.6) : Math.pow(10, 1.1 + r() * 0.6); giantsBeyond++; }
        else mass = Math.pow(10, -1.3 + r() * 1.6);
      } else if (k < 2 && a < 0.1 * Math.sqrt(M) && r() < 0.05) mass = Math.pow(10, 1.9 + r() * 1.3);     // hot Jupiter
      else { const x = r(); if (x < 0.1) { mass = 2 + r() * 10; gas = true; } else if (x < 0.4) mass = 1.5 + r() * 7; else mass = Math.pow(10, -1.4 + r() * 1.5); } // mini-Neptunes, super-Earths, rocky
      if (!planetDefs.some(q => Math.abs(Math.log(q.a / a)) < 0.25)) planetDefs.push({ name: null, a, mass, gas, e: r() * 0.12 });
      a *= 1.35 + r() * 0.85;
    }
    // most systems end up with at least one giant somewhere
    if (!star.brownDwarf && !star.whiteDwarf && !planetDefs.some(q => q.mass > 10) && r() < 0.75 && snow * 1.4 < stableMax) planetDefs.push({ name: null, a: snow * (1.2 + r() * 1.5), mass: Math.pow(10, 1.8 + r() * 1.4), e: r() * 0.08 });
  }
  planetDefs.sort((p, q) => p.a - q.a);
  const letters = 'bcdefghijklmnopq';
  let li = 0;
  const base = star.name;
  const planets = [];
  planetDefs.forEach((p) => {
    const T = Teq(p.a);
    let cls = p.cls || classify(r, T, p.mass, p.gas);
    if (young && cls !== 'hotjupiter' && p.mass < 10 && r() < 0.6) cls = 'molten';   // still-forming worlds glowing from impacts
    let radius = (p.radius ?? radiusFor(p.mass, cls)) * RE;
    const puffy = !p.radius && p.mass > 10 && p.mass < 90 && r() < 0.06;             // super-puff: tiny density, huge radius
    if (puffy) radius *= 1.8 + r() * 0.8;
    const mass = p.mass * ME;
    const name = p.name || `${base} ${letters[li] || 'x'}`; li++;
    const style = { ...styleFor(cls, r, T), seed: Math.floor(r() * 1e6) };
    const g = Gc * mass / radius ** 2;
    const tidalLock = p.a < 0.08 * Math.sqrt(M) + 0.02;
    if (cls === 'hotjupiter' && p.a < 0.035 * Math.sqrt(M) && r() < 0.35) style.stretch = 0.12 + r() * 0.15; // tidally stretched into an egg (WASP-12b)
    if (puffy) style.puffy = true;
    const pl = push({ name, type: 'planet', parent: star.name, radius, mass, style, class: cls, Teq: T, known: !!p.known, candidate: !!p.candidate, fictional: !p.known,
      atmo: atmoFor(cls, r, radius, g), locked: tidalLock, rotPeriod: tidalLock ? null : (8 + r() * 40) * 3600 * (r() < 0.1 ? -1 : 1), tilt: r() < 0.9 ? r() * 35 : r() * 180,
      elements: { a: p.a * AU, e: p.e ?? r() * 0.08, i: r() * 3, Om: r() * 360, om: r() * 360, M: r() * 360, frame: 'ecliptic' } });
    pl.traits = [];
    if (puffy) pl.traits.push('Super-puff: density lower than candy floss');
    if (style.stretch) pl.traits.push('Tidally stretched into an egg shape by its star');
    if (cls === 'minineptune') pl.traits.push('Mini-Neptune');
    if (cls !== 'minineptune' && p.mass > 1.5 && p.mass < 10 && !style.kind?.startsWith?.('gas')) pl.traits.push('Super-Earth');
    if (tidalLock && (cls === 'terra' || cls === 'ocean')) pl.traits.push('Tidally locked "eyeball" world');
    if (cls === 'molten') pl.traits.push('Young world still glowing from giant impacts');
    if (cls === 'carbon') pl.traits.push('Carbon world: graphite plains and tar seas');
    if (cls === 'iron') pl.traits.push('Iron planet: an exposed metallic core');
    planets.push(pl);
  });
  // Moons (fictional) — sized so they fit in the Hill sphere
  for (const pl of planets) {
    const hill = pl.elements.a * (1 - pl.elements.e) * Math.cbrt(pl.mass / (3 * star.mass * MSUN));
    const giant = pl.mass > 10 * ME;
    const count = pl.locked && pl.elements.a < 0.05 * AU ? 0 : giant ? 4 + Math.floor(r() * 14) : Math.floor(r() * 3);
    for (const m of moonList(r, pl.name, pl.mass, pl.radius, count, pl.Teq, giant, base)) {
      m.elements.a = Math.min(m.elements.a, hill * (m.locked ? 0.3 : 0.5));
      if (m.elements.a < pl.radius * 2.5) continue;
      // close-in moons of giants can be tidally stretched into eggs (long axis points at the planet)
      if (giant && m.locked && m.elements.a < pl.radius * 4 && m.radius > 50e3 && r() < 0.3) { const e = 0.12 + r() * 0.2; m.style = { ...m.style, shape: [1 + e, 1 - e * 0.15, 1 - e * 0.35], stretched: true }; m.traits = ['Tidally stretched into an egg shape']; }
      push(m);
    }
    // rare double planets: a companion so massive the pair circles a point between them
    if (!giant && pl.mass > 0.05 * ME && !pl.locked && r() < 0.035 && hill > pl.radius * 30) {
      const q = 0.3 + r() * 0.6; const mr = pl.radius * Math.cbrt(q) * (0.9 + r() * 0.2);
      const cls2 = ['selena', 'desert', 'ice'][Math.floor(r() * 3)];
      const comp = push({ name: pl.name + ' II', type: 'moon', fictional: true, parent: pl.name, radius: mr, mass: pl.mass * q, locked: true, class: cls2, style: { ...styleFor(cls2, r, pl.Teq), seed: Math.floor(r() * 1e6) },
        elements: { a: Math.min(hill * 0.25, pl.radius * (12 + r() * 20)), e: r() * 0.05, i: r() * 5, Om: r() * 360, om: r() * 360, M: r() * 360, frame: 'equator' } });
      comp.binaryOf = pl.name; pl.binaryWith = comp.name; pl.locked = true; pl.rotPeriod = null;
      pl.traits.push('Double planet with ' + comp.name + ' (they orbit a shared centre)');
    }
  }
  // Asteroid belt (between the last rocky and first giant, or at the snow line) with named members + dwarfs
  const belts = [];
  const beltA = Math.min(snow * 0.9, stableMax * 0.8);
  if (beltA > 0.05 && !star.brownDwarf) {
    belts.push({ name: base + ' Belt', parent: star.name, a: [beltA * 0.75, beltA * 1.2], e: 0.1, i: 8, count: 2500, color: [0.5, 0.46, 0.42] });
    const nAst = 6 + Math.floor(r() * 10);
    for (let k = 0; k < nAst; k++) {
      const big = k < 2;
      const R = big ? (150 + r() * 350) * 1e3 : (2 + r() * 80) * 1e3;
      push({ name: makeName(r) + (big ? '' : ` (${1000 + Math.floor(r() * 9000)})`), type: big ? 'dwarf' : 'asteroid', fictional: true, parent: star.name, radius: R, mass: 2200 * 4 / 3 * Math.PI * R ** 3,
        rotPeriod: (3 + r() * 20) * 3600, tilt: r() * 90, style: { ...styleFor(big ? (r() < 0.5 ? 'selena' : 'kbo') : 'asteroid', r, 200), seed: Math.floor(r() * 1e6), ...(big ? {} : {}) },
        elements: { a: (beltA * (0.75 + r() * 0.45)) * AU, e: r() * 0.2, i: r() * 15, Om: r() * 360, om: r() * 360, M: r() * 360, frame: 'ecliptic' } });
    }
  }
  // Outer "Kuiper" belt with dwarf planets that have their own moons
  const outer = planets.length ? planets[planets.length - 1].elements.a / AU * 1.6 : 30 * Math.sqrt(L + 0.1);
  if (outer < stableMax && !star.whiteDwarf) {
    belts.push({ name: base + ' Outer Belt', parent: star.name, a: [outer, outer * 1.8], e: 0.12, i: 12, count: 2500, color: [0.58, 0.5, 0.46] });
    const nd = 2 + Math.floor(r() * 5);
    for (let k = 0; k < nd; k++) {
      const R = (200 + r() * 1000) * 1e3;
      const dn = makeName(r);
      const d = push({ name: dn, type: 'dwarf', fictional: true, parent: star.name, radius: R, mass: 1900 * 4 / 3 * Math.PI * R ** 3, rotPeriod: (5 + r() * 100) * 3600, tilt: r() * 120,
        style: { ...styleFor(r() < 0.8 ? 'kbo' : 'ice', r, 40), seed: Math.floor(r() * 1e6) },
        elements: { a: outer * (1 + r() * 0.8) * AU, e: r() * 0.35, i: r() * 30, Om: r() * 360, om: r() * 360, M: r() * 360, frame: 'ecliptic' } });
      const nm = Math.floor(r() * 3);
      for (let j = 0; j < nm; j++) {
        const mr = R * (0.1 + r() * 0.4);
        push({ name: `${dn} ${roman(j + 1)}`, type: 'moon', fictional: true, parent: dn, radius: mr, mass: 1500 * 4 / 3 * Math.PI * mr ** 3, locked: true, style: { ...styleFor('kbo', r, 40), seed: Math.floor(r() * 1e6) },
          elements: { a: R * (8 + r() * 40), e: r() * 0.1, i: r() * 40, Om: r() * 360, om: r() * 360, M: r() * 360, frame: 'equator' } });
      }
    }
  }
  if (young) belts.push({ name: base + ' protoplanetary disc', parent: star.name, a: [0.05 * Math.sqrt(L + 0.05), Math.min(stableMax, 60 * Math.sqrt(M))], e: 0, i: 2, count: 0, disc: true, gaps: planets.map(pl => pl.elements.a / AU), color: [0.9, 0.72, 0.52], seed: Math.floor(r() * 1e6) });
  if (star.debris) for (const d of star.debris) belts.push({ name: base + ` debris ring (${d} AU)`, parent: star.name, a: [d * 0.9, d * 1.1], e: 0.03, i: 3, count: 1500, color: [0.6, 0.55, 0.5] });
  return { name: star.name + ' System', star: star.name, bodies, byName, belts, starInfo: star, young };
}

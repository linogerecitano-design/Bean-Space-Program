// The real Solar System. Planet elements: JPL approximate mean elements at J2000.
// Moon orbits: semi-major axis (km), eccentricity, inclination to parent equator/Laplace plane.
// Where node / periapsis / mean anomaly aren't catalogued here, deterministic pseudo-random angles
// (seeded by name) are used;
// their dynamical group so every parent has its known moon count.
import { hashStr, rng } from '../core/math.js';

// ---------- Styles --------------------------------------------------------------------------
const S = {
  sun: { kind: 'star', temp: 5772 },
  mercury: { kind: 'rocky', colors: { low: [0.36, 0.34, 0.32], mid: [0.52, 0.5, 0.47], high: [0.66, 0.64, 0.6] }, relief: 4000, craters: 1.0, maria: 0.25, rays: 0.5 },
  venus: { kind: 'rocky', colors: { low: [0.45, 0.33, 0.2], mid: [0.6, 0.45, 0.28], high: [0.72, 0.6, 0.42] }, relief: 5000, craters: 0.08, volcanic: 0.6,
    clouds: { coverage: 1.0, color: [0.93, 0.85, 0.66], height: 48000, thickness: 22000, opaque: true, speed: 100 } },
  earth: { kind: 'earth', colors: { low: [0.17, 0.25, 0.1], mid: [0.33, 0.33, 0.2], high: [0.5, 0.45, 0.4], desert: [0.76, 0.64, 0.45], ice: [0.92, 0.95, 1], ocean: [0.02, 0.07, 0.18], shallow: [0.05, 0.25, 0.35] },
    relief: 6000, seaLevel: 0, iceCaps: 0.82, clouds: { coverage: 0.52, color: [1, 1, 1], height: 2200, thickness: 7000, speed: 12 } },
  moon: { kind: 'rocky', colors: { low: [0.33, 0.33, 0.33], mid: [0.5, 0.5, 0.49], high: [0.66, 0.66, 0.64] }, relief: 6000, craters: 1.0, maria: 0.8, rays: 0.6, mariaColor: [0.2, 0.2, 0.21] },
  mars: { kind: 'rocky', colors: { low: [0.45, 0.22, 0.1], mid: [0.64, 0.34, 0.18], high: [0.76, 0.52, 0.36], ice: [0.95, 0.93, 0.9] }, relief: 12000, craters: 0.55, maria: 0.4, mariaColor: [0.3, 0.18, 0.12], iceCaps: 0.88, dunes: 0.5, volcanic: 0.3,
    clouds: { coverage: 0.06, color: [0.95, 0.85, 0.75], height: 18000, thickness: 5000, speed: 20 } },
  phobos: { kind: 'asteroid', colors: { low: [0.23, 0.2, 0.18], mid: [0.33, 0.3, 0.27], high: [0.42, 0.38, 0.34] }, craters: 1, irregular: 0.25, shape: [1.18, 0.95, 0.83] },
  deimos: { kind: 'asteroid', colors: { low: [0.35, 0.3, 0.26], mid: [0.45, 0.4, 0.34], high: [0.55, 0.49, 0.43] }, craters: 0.6, irregular: 0.2, shape: [1.2, 0.97, 0.83] },
  jupiter: { kind: 'gas', bands: [[0.84, 0.76, 0.66], [0.66, 0.46, 0.33], [0.93, 0.9, 0.84], [0.72, 0.56, 0.42], [0.88, 0.82, 0.72], [0.55, 0.42, 0.34]], bandCount: 14, turbulence: 1.0,
    storms: [{ lat: -20.5, lon: -47.5, size: 0.11, color: [0.8, 0.38, 0.22], strength: 1.0 }, { lat: -40, lon: -20, size: 0.03, color: [0.95, 0.93, 0.9], strength: 0.6 }, { lat: -40, lon: 60, size: 0.03, color: [0.95, 0.93, 0.9], strength: 0.5 }] },
  saturn: { kind: 'gas', bands: [[0.9, 0.82, 0.62], [0.8, 0.68, 0.48], [0.94, 0.88, 0.7], [0.76, 0.66, 0.5], [0.86, 0.78, 0.58]], bandCount: 18, turbulence: 0.45, hexagon: true,
    storms: [{ lat: 42, lon: 30, size: 0.03, color: [0.95, 0.92, 0.8], strength: 0.4 }], rings: { inner: 1.11, outer: 2.33, profile: 'saturn', color: [0.84, 0.76, 0.62] } },
  uranus: { kind: 'gas', bands: [[0.62, 0.84, 0.88], [0.58, 0.8, 0.85], [0.66, 0.86, 0.9]], bandCount: 6, turbulence: 0.12, rings: { inner: 1.64, outer: 2.01, profile: 'uranus', color: [0.4, 0.42, 0.45] } },
  neptune: { kind: 'gas', bands: [[0.25, 0.4, 0.85], [0.2, 0.33, 0.75], [0.32, 0.5, 0.9]], bandCount: 8, turbulence: 0.5,
    storms: [{ lat: -22, lon: 30, size: 0.06, color: [0.1, 0.16, 0.45], strength: 0.9 }, { lat: -42, lon: 200, size: 0.02, color: [0.9, 0.95, 1], strength: 0.4 }], rings: { inner: 1.69, outer: 2.54, profile: 'faint', color: [0.3, 0.3, 0.32] } },
  io: { kind: 'rocky', colors: { low: [0.75, 0.62, 0.22], mid: [0.9, 0.82, 0.4], high: [0.95, 0.92, 0.7] }, relief: 5000, craters: 0.0, volcanic: 1.0, sulfur: 1.0 },
  europa: { kind: 'icy', colors: { low: [0.66, 0.58, 0.5], mid: [0.85, 0.8, 0.74], high: [0.95, 0.94, 0.9], crack: [0.55, 0.35, 0.22] }, relief: 800, craters: 0.05, cracks: 1.0 },
  ganymede: { kind: 'icy', colors: { low: [0.35, 0.32, 0.3], mid: [0.55, 0.52, 0.48], high: [0.8, 0.78, 0.75] }, relief: 2500, craters: 0.7, maria: 0.6, mariaColor: [0.3, 0.28, 0.26], grooves: 0.8 },
  callisto: { kind: 'icy', colors: { low: [0.22, 0.2, 0.18], mid: [0.35, 0.32, 0.29], high: [0.7, 0.68, 0.65] }, relief: 2500, craters: 1.0, rays: 0.8 },
  titan: { kind: 'rocky', colors: { low: [0.28, 0.2, 0.1], mid: [0.45, 0.33, 0.18], high: [0.62, 0.5, 0.32], ocean: [0.05, 0.04, 0.03], shallow: [0.1, 0.08, 0.05] }, relief: 1500, craters: 0.05, dunes: 0.8, seaLevel: -300, lakesNorth: true,
    clouds: { coverage: 1.0, color: [0.85, 0.6, 0.25], height: 60000, thickness: 150000, opaque: true, haze: true, speed: 30 } },
  enceladus: { kind: 'icy', colors: { low: [0.85, 0.88, 0.9], mid: [0.94, 0.96, 0.98], high: [1, 1, 1], crack: [0.6, 0.75, 0.85] }, relief: 1500, craters: 0.5, cracks: 0.6 },
  iapetus: { kind: 'icy', colors: { low: [0.15, 0.1, 0.07], mid: [0.5, 0.45, 0.4], high: [0.9, 0.88, 0.85] }, relief: 10000, craters: 0.9, twoTone: true },
  mimas: { kind: 'icy', colors: { low: [0.6, 0.6, 0.6], mid: [0.75, 0.75, 0.74], high: [0.88, 0.88, 0.87] }, relief: 5000, craters: 1.0, bigCrater: { lat: 0, lon: -100, size: 0.33 } },
  icyGrey: { kind: 'icy', colors: { low: [0.6, 0.6, 0.6], mid: [0.78, 0.78, 0.77], high: [0.9, 0.9, 0.9] }, relief: 3000, craters: 0.9 },
  triton: { kind: 'icy', colors: { low: [0.7, 0.6, 0.55], mid: [0.85, 0.78, 0.74], high: [0.95, 0.92, 0.9], crack: [0.5, 0.4, 0.38] }, relief: 1000, craters: 0.1, cracks: 0.4, cantaloupe: true },
  pluto: { kind: 'icy', colors: { low: [0.45, 0.28, 0.18], mid: [0.72, 0.6, 0.5], high: [0.95, 0.93, 0.9] }, relief: 4000, craters: 0.5, heart: true, maria: 0.4, mariaColor: [0.3, 0.16, 0.1] },
  charon: { kind: 'icy', colors: { low: [0.4, 0.38, 0.37], mid: [0.6, 0.58, 0.56], high: [0.75, 0.73, 0.7] }, relief: 5000, craters: 0.6, polarRed: true },
  ceres: { kind: 'rocky', colors: { low: [0.25, 0.25, 0.25], mid: [0.36, 0.36, 0.35], high: [0.45, 0.45, 0.44] }, relief: 6000, craters: 0.8, brightSpots: true },
  vesta: { kind: 'asteroid', colors: { low: [0.4, 0.38, 0.35], mid: [0.55, 0.52, 0.48], high: [0.7, 0.68, 0.64] }, relief: 20000, craters: 1, irregular: 0.12, shape: [1.1, 1.05, 0.86] },
  rockAst: { kind: 'asteroid', colors: { low: [0.3, 0.28, 0.26], mid: [0.42, 0.4, 0.37], high: [0.55, 0.52, 0.48] }, craters: 0.9, irregular: 0.3 },
  darkAst: { kind: 'asteroid', colors: { low: [0.12, 0.11, 0.1], mid: [0.2, 0.19, 0.18], high: [0.28, 0.27, 0.26] }, craters: 0.8, irregular: 0.3 },
  metalAst: { kind: 'asteroid', colors: { low: [0.4, 0.4, 0.42], mid: [0.55, 0.55, 0.57], high: [0.68, 0.68, 0.7] }, craters: 0.7, irregular: 0.25, metallic: true },
  kbo: { kind: 'icy', colors: { low: [0.5, 0.35, 0.28], mid: [0.7, 0.55, 0.45], high: [0.85, 0.78, 0.72] }, relief: 3000, craters: 0.6 },
  redKbo: { kind: 'icy', colors: { low: [0.55, 0.28, 0.18], mid: [0.72, 0.42, 0.3], high: [0.85, 0.6, 0.48] }, relief: 3000, craters: 0.5 },
  whiteKbo: { kind: 'icy', colors: { low: [0.75, 0.74, 0.72], mid: [0.88, 0.87, 0.85], high: [0.97, 0.97, 0.96] }, relief: 2500, craters: 0.4 },
  comet: { kind: 'asteroid', colors: { low: [0.08, 0.08, 0.08], mid: [0.14, 0.13, 0.12], high: [0.22, 0.21, 0.2] }, craters: 0.3, irregular: 0.45, comet: true },
};

// ---------- Primary bodies -------------------------------------------------------------------
// planet: [name, aAU, e, i, Ω, ϖ, L, R_km, mass_kg, rotH, tiltDeg, style, extra]
const PLANETS = [
  ['Mercury', 0.38709927, 0.20563593, 7.00497902, 48.33076593, 77.45779628, 252.2503235, 2439.7, 3.3011e23, 1407.6, 0.03, 'mercury'],
  ['Venus', 0.72333566, 0.00677672, 3.39467605, 76.67984255, 131.60246718, 181.9790995, 6051.8, 4.8675e24, -5832.5, 177.4, 'venus',
    { atmo: { height: 145000, H: 15900, P0: 9200, rayleigh: [0.9e-5, 0.8e-5, 0.45e-5], mie: 2e-5, mieG: 0.7, mieColor: [1, 0.85, 0.55] } }],
  ['Earth', 1.00000261, 0.01671123, 0.00001531, 0, 102.93768193, 100.46457166, 6371.0, 5.97237e24, 23.9345, 23.44, 'earth',
    { atmo: { height: 100000, H: 8500, P0: 101.325, rayleigh: [5.8e-6, 13.5e-6, 33.1e-6], mie: 2.1e-5, mieG: 0.76, HM: 1200 }, poleLon: 90 }],
  ['Mars', 1.52371034, 0.0933941, 1.84969142, 49.55953891, -23.94362959, -4.55343205, 3389.5, 6.4171e23, 24.6229, 25.19, 'mars',
    { atmo: { height: 80000, H: 11100, P0: 0.61, rayleigh: [1.9e-5, 1.25e-5, 0.7e-5], mie: 2.5e-5, mieG: 0.8, mieColor: [1, 0.75, 0.55], HM: 3000 }, poleLon: 352 }],
  ['Jupiter', 5.202887, 0.04838624, 1.30439695, 100.47390909, 14.72847983, 34.39644051, 69911, 1.8982e27, 9.925, 3.13, 'jupiter',
    { atmo: { height: 1200000, H: 27000, P0: 1e6, rayleigh: [3.5e-6, 7e-6, 1.6e-5], mie: 2e-6, mieG: 0.7, gas: true } }],
  ['Saturn', 9.53667594, 0.05386179, 2.48599187, 113.66242448, 92.59887831, 49.95424423, 58232, 5.6834e26, 10.656, 26.73, 'saturn',
    { atmo: { height: 1200000, H: 59500, P0: 1e6, rayleigh: [3e-6, 5e-6, 1e-5], mie: 2e-6, mieG: 0.7, gas: true }, poleLon: 350 }],
  ['Uranus', 19.18916464, 0.04725744, 0.77263783, 74.01692503, 170.9542763, 313.23810451, 25362, 8.681e25, -17.24, 97.77, 'uranus',
    { atmo: { height: 800000, H: 27700, P0: 1e6, rayleigh: [3e-6, 6e-6, 8e-6], mie: 1e-6, mieG: 0.7, gas: true }, poleLon: 167 }],
  ['Neptune', 30.06992276, 0.00859048, 1.77004347, 131.78422574, 44.96476227, -55.12002969, 24622, 1.02413e26, 16.11, 28.32, 'neptune',
    { atmo: { height: 800000, H: 19700, P0: 1e6, rayleigh: [3e-6, 7e-6, 1.6e-5], mie: 1e-6, mieG: 0.7, gas: true }, poleLon: 210 }],
];
// dwarf planets / asteroids / KBOs / comets: [name, type, aAU, e, i, Ω, ω, M, R_km, mass|null, rotH, style, extra]
const MINOR = [
  ['Ceres', 'dwarf', 2.7675, 0.0785, 10.59, 80.3, 73.6, 95.99, 469.7, 9.3835e20, 9.074, 'ceres'],
  ['Pluto', 'dwarf', 39.48211675, 0.2488273, 17.14001206, 110.30393684, 113.76498, 14.86, 1188.3, 1.303e22, -153.29, 'pluto',
    { atmo: { height: 200000, H: 50000, P0: 0.001, rayleigh: [1e-6, 2.5e-6, 6e-6], mie: 1e-6, mieG: 0.6, thin: true }, tilt: 122.5 }],
  ['Eris', 'dwarf', 67.78, 0.44, 44.04, 35.95, 151.64, 205.99, 1163, 1.6466e22, 25.9, 'whiteKbo'],
  ['Haumea', 'dwarf', 43.12, 0.1954, 28.21, 122.17, 239.04, 218.2, 780, 4.006e21, 3.915, 'whiteKbo', { shape: [1.34, 1.04, 0.6], rings: { inner: 2.9, outer: 3.0, profile: 'faint', color: [0.6, 0.6, 0.6] } }],
  ['Makemake', 'dwarf', 45.43, 0.161, 28.98, 79.62, 298.4, 165.5, 715, 3.1e21, 22.8, 'redKbo'],
  ['Gonggong', 'dwarf', 67.49, 0.5, 30.7, 336.84, 207.25, 106.9, 615, 1.75e21, 22.4, 'redKbo'],
  ['Quaoar', 'dwarf', 43.69, 0.04, 7.99, 188.9, 147.5, 301.1, 555, 1.2e21, 17.7, 'redKbo', { rings: { inner: 7.4, outer: 7.5, profile: 'faint', color: [0.5, 0.45, 0.4] } }],
  ['Sedna', 'dwarf', 506, 0.855, 11.93, 144.4, 311.3, 358.1, 500, 1e21, 10.3, 'redKbo'],
  ['Orcus', 'dwarf', 39.17, 0.227, 20.59, 268.8, 72.3, 181.7, 455, 6.3e20, 13.2, 'kbo'],
  ['Salacia', 'dwarf', 42.18, 0.103, 23.93, 280.3, 309.5, 130.4, 423, 4.9e20, 6.1, 'kbo'],
  ['Varuna', 'dwarf', 43.18, 0.051, 17.2, 97.3, 262.2, 117.8, 339, 1.55e20, 6.34, 'redKbo', { shape: [1.25, 1.0, 0.8] }],
  ['Ixion', 'dwarf', 39.35, 0.242, 19.6, 71.1, 300.6, 290.0, 355, 2.5e20, 12.4, 'kbo'],
  ['2002 MS4', 'dwarf', 41.93, 0.141, 17.7, 216.2, 213.3, 219.0, 400, 3e20, 7.3, 'kbo'],
  ['Arrokoth', 'kbo', 44.58, 0.042, 2.45, 159.0, 174.0, 316.5, 18, 7.5e14, 15.9, 'redKbo', { contactBinary: true, irregular: 0.2 }],
  ['Vesta', 'asteroid', 2.3615, 0.0887, 7.14, 103.85, 151.2, 20.86, 262.7, 2.589e20, 5.342, 'vesta'],
  ['Pallas', 'asteroid', 2.7724, 0.2305, 34.84, 173.08, 310.05, 78.23, 256, 2.04e20, 7.813, 'rockAst', { irregular: 0.08 }],
  ['Hygiea', 'asteroid', 3.1415, 0.1125, 3.83, 283.2, 312.3, 152.2, 217, 8.3e19, 13.8, 'darkAst', { irregular: 0.04 }],
  ['Juno', 'asteroid', 2.6692, 0.2562, 12.99, 169.85, 248.1, 33.1, 127, 2.7e19, 7.21, 'rockAst', { irregular: 0.15 }],
  ['Interamnia', 'asteroid', 3.0562, 0.1553, 17.31, 280.3, 95.1, 250.2, 166, 3.5e19, 8.73, 'darkAst', { irregular: 0.08 }],
  ['52 Europa', 'asteroid', 3.0958, 0.1107, 7.48, 128.6, 343.8, 12.4, 160, 2.4e19, 5.63, 'darkAst', { irregular: 0.12 }],
  ['Davida', 'asteroid', 3.1665, 0.1886, 15.94, 107.6, 338.3, 191.2, 150, 2.7e19, 5.13, 'darkAst', { irregular: 0.12 }],
  ['Sylvia', 'asteroid', 3.4882, 0.0925, 10.87, 73.0, 263.4, 350.5, 136, 1.48e19, 5.18, 'darkAst', { irregular: 0.2 }],
  ['Eunomia', 'asteroid', 2.6436, 0.1866, 11.75, 293.2, 97.6, 272.5, 116, 3.1e19, 6.08, 'rockAst', { irregular: 0.2 }],
  ['Psyche', 'asteroid', 2.9245, 0.134, 3.1, 150.0, 229.4, 38.2, 111, 2.29e19, 4.196, 'metalAst', { shape: [1.2, 1.0, 0.8] }],
  ['Cybele', 'asteroid', 3.4336, 0.112, 3.56, 155.6, 102.2, 200.0, 118, 1.4e19, 6.08, 'darkAst', { irregular: 0.1 }],
  ['Kalliope', 'asteroid', 2.9106, 0.0985, 13.7, 66.0, 355.2, 71.5, 81, 8.2e18, 4.15, 'metalAst', { irregular: 0.15 }],
  ['Kleopatra', 'asteroid', 2.7948, 0.2508, 13.11, 215.5, 180.0, 115.0, 60, 2.97e18, 5.385, 'metalAst', { contactBinary: true, shape: [2.2, 0.9, 0.8] }],
  ['Ida', 'asteroid', 2.8622, 0.0451, 1.13, 324.0, 110.0, 238.0, 15.7, 4.2e16, 4.63, 'rockAst', { shape: [1.9, 0.8, 0.65] }],
  ['Mathilde', 'asteroid', 2.6484, 0.2658, 6.74, 179.6, 157.4, 76.0, 26.4, 1.03e17, 417.7, 'darkAst', { irregular: 0.35 }],
  ['Gaspra', 'asteroid', 2.2097, 0.1734, 4.1, 253.2, 129.5, 330.0, 6.1, 2e16, 7.04, 'rockAst', { shape: [1.9, 0.9, 0.7] }],
  ['Lutetia', 'asteroid', 2.4354, 0.1636, 3.06, 80.9, 250.2, 330.0, 49, 1.7e18, 8.17, 'rockAst', { shape: [1.2, 1.0, 0.8] }],
  ['Eros', 'asteroid', 1.4583, 0.2227, 10.83, 304.3, 178.9, 320.0, 8.4, 6.687e15, 5.27, 'rockAst', { shape: [2.0, 0.7, 0.62] }],
  ['Itokawa', 'asteroid', 1.3241, 0.2801, 1.62, 69.1, 162.8, 100.0, 0.165, 3.51e10, 12.13, 'rockAst', { contactBinary: true, shape: [1.6, 0.8, 0.6] }],
  ['Ryugu', 'asteroid', 1.1896, 0.1902, 5.88, 251.6, 211.4, 20.0, 0.45, 4.5e11, 7.63, 'darkAst', { spinningTop: true }],
  ['Bennu', 'asteroid', 1.1264, 0.2037, 6.03, 2.06, 66.2, 101.7, 0.245, 7.33e10, 4.297, 'darkAst', { spinningTop: true }],
  ['Apophis', 'asteroid', 0.9224, 0.1914, 3.34, 204.0, 126.4, 180.0, 0.17, 6.1e10, 30.4, 'rockAst', { shape: [1.4, 0.9, 0.7] }],
  ['Didymos', 'asteroid', 1.6427, 0.3839, 3.41, 73.2, 319.3, 150.0, 0.39, 5.2e11, 2.26, 'rockAst', { spinningTop: true }],
  ['Dinkinesh', 'asteroid', 2.1914, 0.1121, 2.09, 21.4, 66.6, 300.0, 0.4, 5e11, 52.7, 'rockAst', { irregular: 0.2 }],
  ['Patroclus', 'asteroid', 5.2129, 0.1399, 22.05, 44.3, 308.0, 94.0, 56, 1.36e18, 102.8, 'darkAst', { trojan: 'L5' }],
  ['Hektor', 'asteroid', 5.2645, 0.0237, 18.17, 342.8, 180.9, 94.0, 100, 7.9e18, 6.92, 'darkAst', { contactBinary: true, trojan: 'L4' }],
  ['Eurybates', 'asteroid', 5.2074, 0.0908, 8.06, 43.5, 27.8, 70.0, 32, 1e17, 8.7, 'darkAst'],
  ['Polymele', 'asteroid', 5.1667, 0.0957, 12.99, 50.3, 5.5, 350.0, 10.5, 1e16, 5.86, 'darkAst'],
  ['Leucus', 'asteroid', 5.2842, 0.0646, 11.55, 251.1, 162.0, 80.0, 17, 1e16, 445.7, 'darkAst', { shape: [1.6, 1.0, 0.7] }],
  ['Orus', 'asteroid', 5.1307, 0.0376, 8.47, 258.6, 180.0, 60.0, 29, 1e17, 13.45, 'darkAst'],
  ['Chiron', 'centaur', 13.692, 0.3789, 6.94, 209.2, 339.5, 60.0, 100, 4e18, 5.92, 'darkAst', { irregular: 0.08, rings: { inner: 3.2, outer: 3.4, profile: 'faint', color: [0.4, 0.4, 0.4] } }],
  ['Chariklo', 'centaur', 15.87, 0.171, 23.4, 300.4, 241.2, 250.0, 124, 6e18, 7.0, 'darkAst', { irregular: 0.06, rings: { inner: 3.2, outer: 3.4, profile: 'faint', color: [0.45, 0.43, 0.4] } }],
  ["Halley's Comet", 'comet', 17.834, 0.96714, 162.26, 58.42, 111.33, 38.38, 5.5, 2.2e14, 52.8, 'comet', { shape: [1.5, 0.75, 0.75] }],
  ['67P/Churyumov–Gerasimenko', 'comet', 3.4630, 0.6410, 7.04, 50.14, 12.78, 300.0, 2.0, 1e13, 12.4, 'comet', { contactBinary: true }],
  ['Hale–Bopp', 'comet', 186, 0.9951, 89.43, 282.47, 130.59, 0.08, 30, 1.3e16, 11.3, 'comet'],
  ['Encke', 'comet', 2.2178, 0.8483, 11.78, 334.57, 186.54, 200.0, 2.4, 9.2e13, 11.0, 'comet'],
  ['Tempel 1', 'comet', 3.1447, 0.5097, 10.47, 68.75, 179.2, 250.0, 3.0, 7.2e13, 40.7, 'comet'],
  ['Wild 2', 'comet', 3.4491, 0.5381, 3.24, 136.1, 41.7, 100.0, 2.0, 2.3e13, 13.5, 'comet'],
];

// moons: parent -> list of [name, a_km, e, i, R_km, mass|null, style, extra]
// i > 90 means retrograde.
const MOONS = {
  Earth: [['Moon', 384400, 0.0549, 5.145, 1737.4, 7.342e22, 'moon', { eclipticRef: true, Om: 125.08, om: 318.15, M: 135.27 }]],
  Mars: [['Phobos', 9376, 0.0151, 1.08, 11.1, 1.0659e16, 'phobos'], ['Deimos', 23463, 0.00033, 1.79, 6.2, 1.4762e15, 'deimos']],
  Jupiter: [
    ['Metis', 128000, 0.0002, 0.06, 21.5, 3.6e16, 'darkAst'], ['Adrastea', 129000, 0.0015, 0.03, 8.2, 2e15, 'darkAst'],
    ['Amalthea', 181366, 0.0032, 0.37, 83.5, 2.08e18, 'redKbo', { shape: [1.5, 0.9, 0.8] }], ['Thebe', 221889, 0.0175, 1.08, 49.3, 4.3e17, 'redKbo', { irregular: 0.3 }],
    ['Io', 421700, 0.0041, 0.05, 1821.6, 8.9319e22, 'io', { atmo: { height: 60000, H: 8000, P0: 1e-6, rayleigh: [1e-7, 1e-7, 2e-7], mie: 1e-7, mieG: 0.5, thin: true } }],
    ['Europa', 671034, 0.009, 0.47, 1560.8, 4.7998e22, 'europa'], ['Ganymede', 1070412, 0.0013, 0.2, 2634.1, 1.4819e23, 'ganymede'], ['Callisto', 1882709, 0.0074, 0.19, 2410.3, 1.0759e23, 'callisto'],
    ['Themisto', 7507000, 0.24, 43.1, 4.5, 6.9e14, 'rockAst'], ['Leda', 11165000, 0.16, 27.5, 10.75, 1.1e16, 'darkAst'], ['Ersa', 11401000, 0.09, 30.6, 1.5, null, 'darkAst'],
    ['Himalia', 11461000, 0.16, 27.5, 85, 4.2e18, 'darkAst'], ['Pandia', 11525000, 0.18, 28.2, 1.5, null, 'darkAst'], ['Lysithea', 11717000, 0.11, 28.3, 18, 6.3e16, 'darkAst'],
    ['Elara', 11741000, 0.21, 26.6, 43, 8.7e17, 'darkAst'], ['Dia', 12118000, 0.21, 28.3, 2, null, 'darkAst'], ['Carpo', 17058000, 0.43, 51.4, 1.5, null, 'rockAst'],
    ['Valetudo', 18928000, 0.22, 34.0, 0.5, null, 'rockAst'], ['Euporie', 19302000, 0.14, 145.8, 1, null, 'darkAst'], ['Eupheme', 19622000, 0.25, 146.0, 1, null, 'darkAst'],
    ['Thelxinoe', 20454000, 0.22, 151.4, 1, null, 'darkAst'], ['Euanthe', 20799000, 0.23, 148.9, 1.5, null, 'darkAst'], ['Helike', 20540000, 0.16, 154.8, 2, null, 'darkAst'],
    ['Orthosie', 20721000, 0.28, 145.9, 1, null, 'darkAst'], ['Iocaste', 21269000, 0.22, 149.4, 2.6, null, 'darkAst'], ['Praxidike', 21147000, 0.23, 149.0, 3.5, null, 'darkAst'],
    ['Harpalyke', 21105000, 0.23, 148.6, 2.2, null, 'darkAst'], ['Mneme', 21069000, 0.23, 148.6, 1, null, 'darkAst'], ['Hermippe', 21131000, 0.21, 150.7, 2, null, 'darkAst'],
    ['Thyone', 20940000, 0.23, 148.5, 2, null, 'darkAst'], ['Ananke', 21276000, 0.24, 148.9, 14.5, 3e16, 'darkAst'], ['Herse', 22992000, 0.2, 164.2, 1, null, 'darkAst'],
    ['Aitne', 23231000, 0.26, 165.1, 1.5, null, 'darkAst'], ['Kale', 23217000, 0.26, 165.0, 1, null, 'darkAst'], ['Taygete', 23360000, 0.25, 165.2, 2.5, null, 'darkAst'],
    ['Chaldene', 23179000, 0.25, 165.2, 1.9, null, 'darkAst'], ['Erinome', 23279000, 0.27, 164.9, 1.6, null, 'darkAst'], ['Kalyke', 23583000, 0.25, 165.2, 2.6, null, 'redKbo'],
    ['Eukelade', 23661000, 0.27, 165.5, 2, null, 'darkAst'], ['Kallichore', 24043000, 0.26, 165.5, 1, null, 'darkAst'], ['Isonoe', 23217000, 0.25, 165.2, 1.9, null, 'darkAst'],
    ['Pasithee', 23004000, 0.27, 165.1, 1, null, 'darkAst'], ['Arche', 23717000, 0.26, 165.0, 1.5, null, 'darkAst'], ['Carme', 23404000, 0.25, 164.9, 23, 1.3e17, 'redKbo'],
    ['Eurydome', 22865000, 0.28, 150.3, 1.5, null, 'darkAst'], ['Autonoe', 24046000, 0.32, 152.9, 2, null, 'darkAst'], ['Sponde', 23487000, 0.31, 151.0, 1, null, 'darkAst'],
    ['Pasiphae', 23624000, 0.41, 151.4, 30, 3e17, 'darkAst'], ['Megaclite', 23806000, 0.42, 152.8, 2.7, null, 'darkAst'], ['Hegemone', 23577000, 0.33, 155.2, 1.5, null, 'darkAst'],
    ['Cyllene', 23951000, 0.41, 149.3, 1, null, 'darkAst'], ['Callirrhoe', 24102000, 0.28, 147.1, 4.3, 8.7e14, 'darkAst'], ['Sinope', 23939000, 0.25, 158.1, 19, 7.5e16, 'redKbo'],
    ['Aoede', 23981000, 0.43, 158.3, 2, null, 'darkAst'], ['Kore', 24543000, 0.33, 145.0, 1, null, 'darkAst'], ['Philophrosyne', 22604000, 0.23, 146.0, 1, null, 'darkAst'],
  ],
  Saturn: [
    ['Pan', 133584, 0.00001, 0.0001, 14.1, 4.95e15, 'icyGrey', { shape: [1.4, 1.35, 0.7] }], ['Daphnis', 136505, 0.0000331, 0.0036, 3.8, 7.7e13, 'icyGrey'],
    ['Atlas', 137670, 0.0012, 0.003, 15.1, 6.6e15, 'icyGrey', { shape: [1.4, 1.3, 0.6] }], ['Prometheus', 139380, 0.0022, 0.007, 43.1, 1.6e17, 'icyGrey', { shape: [1.6, 0.9, 0.7] }],
    ['Pandora', 141720, 0.0042, 0.05, 40.7, 1.37e17, 'icyGrey', { irregular: 0.2 }], ['Epimetheus', 151422, 0.0098, 0.35, 58.1, 5.27e17, 'icyGrey', { irregular: 0.2 }],
    ['Janus', 151472, 0.0068, 0.16, 89.5, 1.9e18, 'icyGrey', { irregular: 0.2 }], ['Aegaeon', 167500, 0.0002, 0.001, 0.33, null, 'icyGrey'],
    ['Mimas', 185539, 0.0196, 1.57, 198.2, 3.7493e19, 'mimas'], ['Methone', 194440, 0.0001, 0.007, 1.6, null, 'whiteKbo'], ['Anthe', 197700, 0.0011, 0.1, 0.9, null, 'whiteKbo'],
    ['Pallene', 212280, 0.004, 0.18, 2.5, null, 'whiteKbo'], ['Enceladus', 237948, 0.0047, 0.009, 252.1, 1.08e20, 'enceladus'],
    ['Tethys', 294619, 0.0001, 1.12, 531.1, 6.17e20, 'icyGrey'], ['Telesto', 294619, 0.0, 1.18, 12.4, null, 'whiteKbo', { M: 60 }], ['Calypso', 294619, 0.0, 1.5, 10.7, null, 'whiteKbo', { M: -60 }],
    ['Dione', 377396, 0.0022, 0.019, 561.4, 1.095e21, 'icyGrey'], ['Helene', 377396, 0.0, 0.2, 18, null, 'whiteKbo', { M: 60 }], ['Polydeuces', 377396, 0.019, 0.18, 1.3, null, 'whiteKbo', { M: -60 }],
    ['Rhea', 527108, 0.001, 0.345, 763.8, 2.307e21, 'icyGrey'],
    ['Titan', 1221870, 0.0288, 0.348, 2574.7, 1.3452e23, 'titan', { atmo: { height: 600000, H: 21000, P0: 146.7, rayleigh: [2.5e-6, 5e-6, 1.1e-5], mie: 3.5e-5, mieG: 0.7, mieColor: [1, 0.62, 0.25], HM: 30000 } }],
    ['Hyperion', 1500880, 0.123, 0.43, 135, 5.6e18, 'icyGrey', { irregular: 0.3, spongy: true }], ['Iapetus', 3560820, 0.0286, 15.47, 734.5, 1.806e21, 'iapetus'],
    ['Kiviuq', 11110000, 0.33, 45.7, 8, null, 'redKbo'], ['Ijiraq', 11124000, 0.32, 46.4, 6, null, 'redKbo'], ['Phoebe', 12947780, 0.1562, 175.3, 106.5, 8.3e18, 'darkAst', { irregular: 0.08 }],
    ['Paaliaq', 15200000, 0.36, 45.1, 11, null, 'redKbo'], ['Skathi', 15540000, 0.27, 152.6, 4, null, 'darkAst'], ['Albiorix', 16182000, 0.48, 34.2, 16, null, 'redKbo'],
    ['Bebhionn', 17119000, 0.47, 35.1, 3, null, 'redKbo'], ['Erriapus', 17343000, 0.47, 34.6, 5, null, 'redKbo'], ['Skoll', 17665000, 0.46, 161.2, 3, null, 'darkAst'],
    ['Siarnaq', 17531000, 0.3, 45.8, 20, null, 'redKbo'], ['Tarqeq', 17910000, 0.16, 49.9, 3.5, null, 'redKbo'], ['Greip', 18206000, 0.33, 172.7, 3, null, 'darkAst'],
    ['Hyrrokkin', 18437000, 0.33, 151.4, 4, null, 'darkAst'], ['Jarnsaxa', 18811000, 0.22, 163.3, 3, null, 'darkAst'], ['Tarvos', 18562000, 0.53, 33.8, 7.5, null, 'redKbo'],
    ['Mundilfari', 18685000, 0.21, 167.3, 3.5, null, 'darkAst'], ['Bergelmir', 19336000, 0.14, 158.5, 3, null, 'darkAst'], ['Narvi', 19007000, 0.43, 145.8, 3.5, null, 'darkAst'],
    ['Suttungr', 19459000, 0.11, 175.8, 3.5, null, 'darkAst'], ['Hati', 19846000, 0.37, 165.8, 3, null, 'darkAst'], ['Farbauti', 20390000, 0.21, 156.4, 2.5, null, 'darkAst'],
    ['Thrymr', 20314000, 0.47, 176.0, 3.5, null, 'darkAst'], ['Aegir', 20751000, 0.25, 166.7, 3, null, 'darkAst'], ['Bestla', 20192000, 0.52, 145.2, 3.5, null, 'darkAst'],
    ['Fenrir', 22454000, 0.13, 164.9, 2, null, 'darkAst'], ['Surtur', 22707000, 0.45, 177.5, 3, null, 'darkAst'], ['Kari', 22089000, 0.48, 156.3, 3.5, null, 'darkAst'],
    ['Ymir', 23040000, 0.33, 173.1, 9, null, 'darkAst'], ['Loge', 23065000, 0.19, 167.9, 3, null, 'darkAst'], ['Fornjot', 25146000, 0.21, 170.4, 3, null, 'darkAst'],
    ['Gridr', 19418000, 0.19, 163.9, 2, null, 'darkAst'], ['Angrboda', 20636000, 0.22, 177.4, 1.5, null, 'darkAst'], ['Skrymir', 21163000, 0.44, 176.6, 2, null, 'darkAst'],
    ['Gerd', 21174000, 0.52, 173.3, 2, null, 'darkAst'], ['Eggther', 19976000, 0.16, 167.6, 3, null, 'darkAst'], ['Beli', 20448000, 0.09, 158.5, 1, null, 'darkAst'],
    ['Gunnlod', 21564000, 0.25, 158.5, 2, null, 'darkAst'], ['Thiazzi', 23577000, 0.51, 159.6, 2, null, 'darkAst'], ['Alvaldi', 21968000, 0.24, 152.1, 2.5, null, 'darkAst'],
    ['Geirrod', 21999000, 0.54, 154.3, 2, null, 'darkAst'],
  ],
  Uranus: [
    ['Cordelia', 49770, 0.00026, 0.08, 20, null, 'darkAst'], ['Ophelia', 53790, 0.0099, 0.1, 21, null, 'darkAst'], ['Bianca', 59170, 0.0009, 0.19, 25.7, null, 'darkAst'],
    ['Cressida', 61780, 0.0004, 0.01, 39.8, null, 'darkAst'], ['Desdemona', 62680, 0.0001, 0.11, 32, null, 'darkAst'], ['Juliet', 64350, 0.0007, 0.07, 46.8, null, 'darkAst'],
    ['Portia', 66090, 0.0001, 0.06, 67.6, null, 'darkAst'], ['Rosalind', 69940, 0.0001, 0.28, 36, null, 'darkAst'], ['Cupid', 74800, 0.0013, 0.1, 9, null, 'darkAst'],
    ['Belinda', 75260, 0.0001, 0.03, 45, null, 'darkAst'], ['Perdita', 76400, 0.0116, 0.47, 15, null, 'darkAst'], ['Puck', 86010, 0.0001, 0.32, 81, null, 'darkAst'],
    ['Mab', 97700, 0.0025, 0.13, 12, null, 'darkAst'],
    ['Miranda', 129390, 0.0013, 4.23, 235.8, 6.4e19, 'icyGrey', { patchwork: true }], ['Ariel', 191020, 0.0012, 0.26, 578.9, 1.251e21, 'icyGrey'],
    ['Umbriel', 266300, 0.0039, 0.128, 584.7, 1.275e21, 'callisto'], ['Titania', 435910, 0.0011, 0.34, 788.4, 3.4e21, 'icyGrey'], ['Oberon', 583520, 0.0014, 0.058, 761.4, 3.076e21, 'callisto'],
    ['Francisco', 4276000, 0.146, 147.5, 11, null, 'darkAst'], ['Caliban', 7231000, 0.159, 141.5, 36, null, 'redKbo'], ['Stephano', 8004000, 0.229, 143.8, 16, null, 'darkAst'],
    ['Trinculo', 8504000, 0.22, 167.0, 9, null, 'darkAst'], ['Sycorax', 12179000, 0.522, 159.4, 75, null, 'redKbo'], ['Margaret', 14345000, 0.661, 56.6, 10, null, 'darkAst'],
    ['Prospero', 16256000, 0.445, 152.0, 25, null, 'darkAst'], ['Setebos', 17418000, 0.591, 158.2, 24, null, 'darkAst'], ['Ferdinand', 20901000, 0.368, 169.8, 10, null, 'darkAst'],
    ['S/2023 U 1', 7976000, 0.25, 145.0, 4, null, 'darkAst'],
  ],
  Neptune: [
    ['Naiad', 48227, 0.0003, 4.69, 33, null, 'darkAst'], ['Thalassa', 50074, 0.0002, 0.14, 41, null, 'darkAst'], ['Despina', 52526, 0.0002, 0.07, 75, null, 'darkAst'],
    ['Galatea', 61953, 0.0001, 0.05, 88, null, 'darkAst'], ['Larissa', 73548, 0.0014, 0.2, 97, null, 'darkAst', { irregular: 0.2 }], ['Hippocamp', 105283, 0.0, 0.0, 17, null, 'darkAst'],
    ['Proteus', 117646, 0.0005, 0.08, 210, 4.4e19, 'darkAst', { irregular: 0.12 }],
    ['Triton', 354759, 0.000016, 156.885, 1353.4, 2.14e22, 'triton', { atmo: { height: 120000, H: 14000, P0: 0.0014, rayleigh: [1e-6, 2e-6, 5e-6], mie: 1e-6, mieG: 0.6, thin: true } }],
    ['Nereid', 5513818, 0.7507, 7.09, 170, 3.1e19, 'rockAst'], ['Halimede', 16611000, 0.571, 134.1, 31, null, 'darkAst'], ['Sao', 22228000, 0.293, 48.5, 22, null, 'darkAst'],
    ['Laomedeia', 23567000, 0.424, 34.7, 21, null, 'darkAst'], ['Psamathe', 46695000, 0.45, 137.4, 20, null, 'darkAst'], ['Neso', 48387000, 0.495, 132.6, 30, null, 'darkAst'],
    ['S/2002 N 5', 23400000, 0.4, 49, 12, null, 'darkAst'], ['S/2021 N 1', 50700000, 0.5, 133, 7, null, 'darkAst'],
  ],
  Pluto: [['Charon', 19591, 0.0002, 0.08, 606, 1.586e21, 'charon'], ['Styx', 42656, 0.0058, 0.81, 8, null, 'whiteKbo'], ['Nix', 48694, 0.002, 0.13, 25, null, 'whiteKbo', { shape: [1.6, 1.0, 0.9] }],
    ['Kerberos', 57783, 0.0033, 0.39, 9, null, 'whiteKbo'], ['Hydra', 64738, 0.0059, 0.24, 25, null, 'whiteKbo', { shape: [1.4, 1.0, 0.9] }]],
  Haumea: [["Hi'iaka", 49880, 0.051, 126.4, 160, 1.79e19, 'whiteKbo'], ['Namaka', 25657, 0.249, 113.0, 85, 1.8e18, 'whiteKbo']],
  Eris: [['Dysnomia', 37273, 0.0062, 78.3, 350, 8.2e19, 'darkAst']],
  Makemake: [['MK2', 21000, 0.0, 83, 80, null, 'darkAst']],
  Quaoar: [['Weywot', 13300, 0.02, 14, 85, null, 'kbo']],
  Orcus: [['Vanth', 9000, 0.007, 105, 220, 8.7e19, 'kbo']],
  Gonggong: [['Xiangliu', 24000, 0.29, 83, 50, null, 'kbo']],
  Salacia: [['Actaea', 5700, 0.01, 23.6, 150, 1.2e19, 'kbo']],
  Varuna: [], Ixion: [],
  Ida: [['Dactyl', 90, 0.1, 8, 0.7, 4e12, 'rockAst']],
  Didymos: [['Dimorphos', 1.19, 0.0, 0, 0.0755, 4.3e9, 'rockAst', { shape: [1.2, 1.0, 0.8] }]],
  Kalliope: [['Linus', 1065, 0.007, 99, 14, 6e16, 'metalAst']],
  Sylvia: [['Romulus', 1357, 0.006, 8, 5.4, null, 'darkAst'], ['Remus', 706, 0.016, 8, 3.5, null, 'darkAst']],
  Kleopatra: [['Alexhelios', 678, 0.0, 3, 4.4, null, 'metalAst'], ['Cleoselene', 499, 0.0, 3, 3.5, null, 'metalAst']],
  Patroclus: [['Menoetius', 680, 0.0, 0, 52, 1.2e18, 'darkAst']],
  Hektor: [['Skamandrios', 623, 0.3, 50, 6, null, 'darkAst']],
  Dinkinesh: [['Selam', 3.1, 0.0, 0, 0.11, null, 'rockAst', { contactBinary: true }]],
  Eurybates: [['Queta', 2350, 0.1, 0, 0.5, null, 'darkAst']],
  Polymele: [['Shaun', 200, 0.0, 0, 2.5, null, 'darkAst']],
  Orus: [],
};
// Known totals (as of 2025 counts) — the remainder is filled with representative unnamed irregulars.
const KNOWN_COUNTS = { Jupiter: 95, Saturn: 274, Uranus: 28, Neptune: 16 };
const IRREGULAR_GROUPS = {
  Jupiter: [{ a: [21.0e6, 21.4e6], i: [145, 152], e: [0.2, 0.26] }, { a: [22.9e6, 23.6e6], i: [163, 166], e: [0.24, 0.28] }, { a: [23.4e6, 24.2e6], i: [145, 158], e: [0.3, 0.42] }, { a: [11.2e6, 12.1e6], i: [26, 30], e: [0.1, 0.2] }],
  Saturn: [{ a: [11e6, 18e6], i: [44, 48], e: [0.15, 0.4] }, { a: [15e6, 19e6], i: [33, 36], e: [0.4, 0.5] }, { a: [15e6, 26e6], i: [150, 178], e: [0.1, 0.55] }],
};

// ---------- builder --------------------------------------------------------------------------
const GYR = 6.674e-11;
function estMass(Rkm, style) {
  const rho = /icy|Kbo|kbo/.test(style) ? 1400 : style === 'metalAst' ? 4000 : 2000;
  const r = Rkm * 1000; return rho * 4 / 3 * Math.PI * r * r * r;
}

export function buildSolarSystem() {
  const bodies = [];
  const byName = {};
  const push = (b) => { bodies.push(b); byName[b.name] = b; return b; };
  push({ name: 'Sun', type: 'star', radius: 695700e3, mass: 1.98847e30, rotPeriod: 609.12 * 3600, tilt: 7.25, style: S.sun, lum: 1, temp: 5772 });
  for (const p of PLANETS) {
    const [name, a, e, i, Om, varpi, L, R, M, rot, tilt, st, extra = {}] = p;
    push({ name, type: 'planet', parent: 'Sun', radius: R * 1e3, mass: M, rotPeriod: rot * 3600, tilt, style: S[st], ...extra,
      elements: { a: a * 1.495978707e11, e, i, Om, om: varpi - Om, M: L - varpi } });
  }
  for (const m of MINOR) {
    const [name, type, a, e, i, Om, om, M, R, mass, rot, st, extra = {}] = m;
    const style = { ...S[st], ...(extra.shape ? { shape: extra.shape } : {}), ...(extra.irregular ? { irregular: extra.irregular } : {}), ...(extra.contactBinary ? { contactBinary: true } : {}), ...(extra.spinningTop ? { spinningTop: true } : {}), ...(extra.rings ? { rings: extra.rings } : {}) };
    push({ name, type, parent: 'Sun', radius: R * 1e3, mass: mass || estMass(R, st), rotPeriod: rot * 3600, tilt: extra.tilt ?? (hashStr(name) % 40), style, atmo: extra.atmo,
      elements: { a: a * 1.495978707e11, e, i, Om, om, M } });
  }
  for (const parent in MOONS) {
    const list = MOONS[parent];
    const pb = byName[parent];
    if (!pb) continue;
    for (const m of list) {
      const [name, akm, e, i, R, mass, st, extra = {}] = m;
      const r = rng(hashStr(name));
      const style = { ...S[st], ...(extra.shape ? { shape: extra.shape } : {}), ...(extra.irregular ? { irregular: extra.irregular } : {}), ...(extra.contactBinary ? { contactBinary: true } : {}) };
      // tidally locked: every close, prograde moon (the Moon sits at 60.3 Earth radii) except known chaotic rotators
      const regular = akm < 150 * pb.radius / 1e3 && i < 60 && !['Hyperion', 'Phoebe', 'Nereid'].includes(name);
      push({ name, type: 'moon', parent, radius: R * 1e3, mass: mass || estMass(R, st), style, atmo: extra.atmo, locked: regular, rotPeriod: regular ? null : (5 + r() * 20) * 3600, tilt: regular ? 0 : r() * 60,
        elements: { a: akm * 1e3, e, i, Om: extra.Om ?? r() * 360, om: extra.om ?? r() * 360, M: extra.M ?? r() * 360, frame: extra.eclipticRef ? 'ecliptic' : 'equator' } });
    }
  }
  // Pluto and Charon orbit a barycentre outside Pluto and keep the same faces toward each other
  if (byName.Pluto && byName.Charon) { Object.assign(byName.Pluto, { binaryWith: 'Charon', locked: true, rotPeriod: null }); byName.Charon.locked = true; byName.Pluto.traits = ['Double dwarf planet with Charon (barycentre lies outside Pluto)']; }
  for (const b of bodies) b.mu = GYR * b.mass;
  return { name: 'Solar System', star: 'Sun', bodies, byName, real: true,
    belts: [
      { name: 'Main Belt', parent: 'Sun', a: [2.1, 3.3], e: 0.12, i: 10, count: 6000, color: [0.55, 0.5, 0.45] },
      { name: 'Jupiter Trojans', parent: 'Sun', a: [5.1, 5.3], e: 0.07, i: 15, count: 1600, color: [0.4, 0.36, 0.33], trojanOf: 'Jupiter' },
      { name: 'Kuiper Belt', parent: 'Sun', a: [30, 50], e: 0.1, i: 12, count: 5000, color: [0.6, 0.52, 0.48] },
      { name: 'Scattered Disc', parent: 'Sun', a: [50, 150], e: 0.4, i: 25, count: 1500, color: [0.55, 0.5, 0.5] },
    ] };
}
export const STYLES = S;

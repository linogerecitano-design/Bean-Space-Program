// Real stars near the Sun (and a few famous bright ones) with their confirmed / candidate planets.
// Positions: RA (hours), Dec (degrees), distance (light years) -> galactic -> engine galaxy frame.
// Planet data: a (AU), mass (Earth masses), radius (Earth radii, estimated if unknown), e.
import { DEG } from '../core/math.js';

export const SUN_GALPOS = [0, 65, 26750]; // ly; galactic centre at origin, engine Y = galactic north

const EQ2GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.44482963, 0.7469822445],
  [-0.867666149, -0.1980763734, 0.4559837762],
];
// equatorial unit vector -> galactic xyz -> engine galaxy frame (x=-Yg, y=Zg, z=-Xg)
export function eqToGalaxyEngine(x, y, z) {
  const gx = EQ2GAL[0][0] * x + EQ2GAL[0][1] * y + EQ2GAL[0][2] * z;
  const gy = EQ2GAL[1][0] * x + EQ2GAL[1][1] * y + EQ2GAL[1][2] * z;
  const gz = EQ2GAL[2][0] * x + EQ2GAL[2][1] * y + EQ2GAL[2][2] * z;
  return [-gy, gz, -gx];
}
const EPS = 23.4392911 * DEG;
// Ecliptic-engine (physics frame: x, y=ecliptic north, z) -> galaxy-engine frame
export function eclEngineToGalaxy(v) {
  const ex = v[0], ey = -v[2], ez = v[1]; // world -> ecliptic
  const qx = ex, qy = ey * Math.cos(EPS) - ez * Math.sin(EPS), qz = ey * Math.sin(EPS) + ez * Math.cos(EPS);
  return eqToGalaxyEngine(qx, qy, qz);
}
// inverse (orthonormal => transpose)
export function galaxyToEclEngine(v) {
  // columns of the forward map applied to basis vectors
  const bx = eclEngineToGalaxy([1, 0, 0]), by = eclEngineToGalaxy([0, 1, 0]), bz = eclEngineToGalaxy([0, 0, 1]);
  return [bx[0] * v[0] + bx[1] * v[1] + bx[2] * v[2], by[0] * v[0] + by[1] * v[1] + by[2] * v[2], bz[0] * v[0] + bz[1] * v[1] + bz[2] * v[2]];
}
function radec(raH, raM, raS, decD, decM, distLy) {
  const ra = (raH + raM / 60 + raS / 3600) * 15 * DEG;
  const sgn = decD < 0 || Object.is(decD, -0) ? -1 : 1;
  const dec = sgn * (Math.abs(decD) + decM / 60) * DEG;
  const x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
  const g = eqToGalaxyEngine(x, y, z);
  return [SUN_GALPOS[0] + g[0] * distLy, SUN_GALPOS[1] + g[1] * distLy, SUN_GALPOS[2] + g[2] * distLy];
}
const pl = (name, a, mass, radius, e = 0.02, extra = {}) => ({ name, a, mass, radius: radius ?? Math.min(11, mass < 2 ? Math.pow(mass, 0.28) : mass < 120 ? 0.8 * Math.pow(mass, 0.55) : 11), e, ...extra });
const comp = (name, spec, mass, radius, temp, lum, a, e, extra = {}) => ({ name, spec, mass, radius, temp, lum, a, e, ...extra });

export const REAL_STARS = [
  { name: 'Proxima Centauri', pos: radec(14, 29, 43, -62, 40, 4.2465), spec: 'M5.5V', mass: 0.122, radius: 0.154, temp: 3042, lum: 0.0017, flare: true,
    planets: [pl('Proxima d', 0.02885, 0.26), pl('Proxima b', 0.04857, 1.07, 1.03, 0.02)] },
  { name: 'Alpha Centauri A', pos: radec(14, 39, 36, -60, 50, 4.344), spec: 'G2V', mass: 1.079, radius: 1.2175, temp: 5790, lum: 1.519,
    companions: [comp('Alpha Centauri B', 'K1V', 0.909, 0.8591, 5260, 0.5, 23.4, 0.52, { planets: [] })],
    planets: [pl('Alpha Centauri Ab (candidate)', 2.0, 90, 9.5, 0.3, { candidate: true })] },
  { name: "Barnard's Star", pos: radec(17, 57, 48, 4, 41, 5.963), spec: 'M4V', mass: 0.162, radius: 0.187, temp: 3195, lum: 0.0035,
    planets: [pl("Barnard's d", 0.0188, 0.26), pl("Barnard's b", 0.0229, 0.3), pl("Barnard's c", 0.0274, 0.34), pl("Barnard's e", 0.038, 0.19)] },
  { name: 'Luhman 16 A', pos: radec(10, 49, 19, -53, 19, 6.5), spec: 'L7.5', mass: 0.0325, radius: 0.1, temp: 1350, lum: 0.0000219, brownDwarf: true,
    companions: [comp('Luhman 16 B', 'T0.5', 0.0272, 0.1, 1210, 0.0000209, 3.5, 0.34)] },
  { name: 'WISE 0855−0714', pos: radec(8, 55, 10, -7, 14, 7.43), spec: 'Y4', mass: 0.005, radius: 0.1, temp: 285, lum: 0.0000000014, brownDwarf: true },
  { name: 'Wolf 359', pos: radec(10, 56, 29, 7, 1, 7.86), spec: 'M6V', mass: 0.11, radius: 0.144, temp: 2749, lum: 0.0011, flare: true, planets: [pl('Wolf 359 b (candidate)', 0.018, 4.4, null, 0.05, { candidate: true })] },
  { name: 'Lalande 21185', pos: radec(11, 3, 20, 35, 58, 8.31), spec: 'M2V', mass: 0.39, radius: 0.39, temp: 3547, lum: 0.022, planets: [pl('Lalande 21185 b', 0.0789, 2.7), pl('Lalande 21185 c', 2.94, 14.2, null, 0.07)] },
  { name: 'Sirius A', pos: radec(6, 45, 9, -16, 43, 8.6), spec: 'A1V', mass: 2.063, radius: 1.711, temp: 9940, lum: 25.4, companions: [comp('Sirius B', 'DA2', 1.018, 0.0084, 25000, 0.056, 19.8, 0.592, { whiteDwarf: true })] },
  { name: 'Luyten 726-8 A', pos: radec(1, 39, 1, -17, 57, 8.73), spec: 'M5.5V', mass: 0.12, radius: 0.14, temp: 2670, lum: 0.0006, flare: true, companions: [comp('UV Ceti (726-8 B)', 'M6V', 0.1, 0.13, 2650, 0.0004, 5.5, 0.62)] },
  { name: 'Ross 154', pos: radec(18, 49, 49, -23, 50, 9.7), spec: 'M3.5V', mass: 0.18, radius: 0.24, temp: 3248, lum: 0.0038 },
  { name: 'Ross 248', pos: radec(23, 41, 55, 44, 10, 10.3), spec: 'M6V', mass: 0.136, radius: 0.16, temp: 2799, lum: 0.0018 },
  { name: 'Epsilon Eridani', pos: radec(3, 32, 56, -9, 27, 10.47), spec: 'K2V', mass: 0.82, radius: 0.735, temp: 5084, lum: 0.32, planets: [pl('Epsilon Eridani b (AEgir)', 3.48, 200, 11, 0.07)], debris: [3, 20, 64] },
  { name: 'Lacaille 9352', pos: radec(23, 5, 52, -35, 51, 10.72), spec: 'M0.5V', mass: 0.47, radius: 0.47, temp: 3688, lum: 0.037, planets: [pl('Gliese 887 b', 0.068, 4.2), pl('Gliese 887 c', 0.12, 7.6)] },
  { name: 'Ross 128', pos: radec(11, 47, 44, 0, 48, 11.0), spec: 'M4V', mass: 0.168, radius: 0.197, temp: 3192, lum: 0.0036, planets: [pl('Ross 128 b', 0.0496, 1.4, 1.1, 0.04)] },
  { name: 'EZ Aquarii A', pos: radec(22, 38, 33, -15, 18, 11.1), spec: 'M5V', mass: 0.11, radius: 0.13, temp: 2800, lum: 0.0007, companions: [comp('EZ Aquarii C', 'M6.5V', 0.1, 0.12, 2700, 0.0005, 1.1, 0.1)] },
  { name: 'Procyon A', pos: radec(7, 39, 18, 5, 13, 11.46), spec: 'F5IV-V', mass: 1.499, radius: 2.048, temp: 6530, lum: 6.93, companions: [comp('Procyon B', 'DQZ', 0.602, 0.0123, 7740, 0.00049, 15.0, 0.407, { whiteDwarf: true })] },
  { name: '61 Cygni A', pos: radec(21, 6, 54, 38, 45, 11.4), spec: 'K5V', mass: 0.7, radius: 0.665, temp: 4526, lum: 0.153, companions: [comp('61 Cygni B', 'K7V', 0.63, 0.595, 4077, 0.085, 84, 0.4)] },
  { name: 'Struve 2398 A', pos: radec(18, 42, 47, 59, 37, 11.5), spec: 'M3V', mass: 0.33, radius: 0.35, temp: 3400, lum: 0.013, companions: [comp('Struve 2398 B', 'M3.5V', 0.25, 0.28, 3300, 0.0078, 56, 0.5)] },
  { name: 'Groombridge 34 A', pos: radec(0, 18, 23, 44, 1, 11.6), spec: 'M1.5V', mass: 0.38, radius: 0.38, temp: 3567, lum: 0.021, planets: [pl('Groombridge 34 Ab', 0.072, 3.0), pl('Groombridge 34 Ac', 5.4, 36, null, 0.27)],
    companions: [comp('Groombridge 34 B', 'M3.5V', 0.16, 0.18, 3200, 0.0035, 147, 0.4)] },
  { name: 'Epsilon Indi A', pos: radec(22, 3, 22, -56, 47, 11.87), spec: 'K5V', mass: 0.76, radius: 0.711, temp: 4649, lum: 0.21, planets: [pl('Epsilon Indi Ab', 11.5, 2000, 11.5, 0.4)] },
  { name: 'DX Cancri', pos: radec(8, 29, 49, 26, 47, 11.68), spec: 'M6.5V', mass: 0.09, radius: 0.11, temp: 2840, lum: 0.00065 },
  { name: 'Tau Ceti', pos: radec(1, 44, 4, -15, 56, 11.91), spec: 'G8V', mass: 0.783, radius: 0.793, temp: 5344, lum: 0.52,
    planets: [pl('Tau Ceti g', 0.133, 1.75), pl('Tau Ceti h', 0.243, 1.83), pl('Tau Ceti e', 0.538, 3.93, null, 0.18), pl('Tau Ceti f', 1.334, 3.93, null, 0.16)], debris: [6, 52] },
  { name: 'GJ 1061', pos: radec(3, 36, 0, -44, 31, 11.98), spec: 'M5.5V', mass: 0.12, radius: 0.156, temp: 2953, lum: 0.0017, planets: [pl('GJ 1061 b', 0.021, 1.37), pl('GJ 1061 c', 0.035, 1.74), pl('GJ 1061 d', 0.054, 1.64)] },
  { name: 'YZ Ceti', pos: radec(1, 12, 30, -16, 59, 12.1), spec: 'M4.5V', mass: 0.13, radius: 0.157, temp: 3151, lum: 0.0022, planets: [pl('YZ Ceti b', 0.01634, 0.7), pl('YZ Ceti c', 0.02156, 1.14), pl('YZ Ceti d', 0.02851, 1.09)] },
  { name: "Luyten's Star", pos: radec(7, 27, 24, 5, 14, 12.35), spec: 'M3.5V', mass: 0.26, radius: 0.35, temp: 3382, lum: 0.0088, planets: [pl('GJ 273 c', 0.036, 1.18), pl('GJ 273 b', 0.091, 2.89, null, 0.1)] },
  { name: "Teegarden's Star", pos: radec(2, 53, 1, 16, 53, 12.5), spec: 'M7V', mass: 0.097, radius: 0.107, temp: 2904, lum: 0.00073, planets: [pl("Teegarden's b", 0.0259, 1.05), pl("Teegarden's c", 0.0455, 1.11), pl("Teegarden's d", 0.0791, 0.82)] },
  { name: "Kapteyn's Star", pos: radec(5, 11, 40, -45, 1, 12.83), spec: 'sdM1', mass: 0.27, radius: 0.29, temp: 3570, lum: 0.012 },
  { name: 'Lacaille 8760', pos: radec(21, 17, 15, -38, 52, 12.95), spec: 'M0V', mass: 0.6, radius: 0.51, temp: 3800, lum: 0.072, flare: true },
  { name: 'Kruger 60 A', pos: radec(22, 28, 0, 57, 41, 13.07), spec: 'M3V', mass: 0.27, radius: 0.35, temp: 3180, lum: 0.01, companions: [comp('Kruger 60 B', 'M4V', 0.18, 0.24, 3100, 0.004, 9.5, 0.41)] },
  { name: 'Wolf 1061', pos: radec(16, 30, 18, -12, 40, 14.05), spec: 'M3V', mass: 0.29, radius: 0.31, temp: 3342, lum: 0.011, planets: [pl('Wolf 1061 b', 0.0375, 1.9), pl('Wolf 1061 c', 0.089, 3.4), pl('Wolf 1061 d', 0.47, 7.7, null, 0.55)] },
  { name: 'Gliese 876', pos: radec(22, 53, 17, -14, 15, 15.2), spec: 'M4V', mass: 0.37, radius: 0.37, temp: 3348, lum: 0.0122, planets: [pl('Gliese 876 d', 0.0208, 6.8), pl('Gliese 876 c', 0.13, 226, 11), pl('Gliese 876 b', 0.208, 723, 11), pl('Gliese 876 e', 0.334, 14.6)] },
  { name: '40 Eridani A (Keid)', pos: radec(4, 15, 16, -7, 39, 16.3), spec: 'K0.5V', mass: 0.84, radius: 0.81, temp: 5100, lum: 0.46,
    companions: [comp('40 Eridani B', 'DA4', 0.573, 0.014, 16500, 0.013, 400, 0.4, { whiteDwarf: true }), comp('40 Eridani C', 'M4.5V', 0.2, 0.31, 3100, 0.008, 420, 0.4)] },
  { name: 'Altair', pos: radec(19, 50, 47, 8, 52, 16.73), spec: 'A7V', mass: 1.86, radius: 1.8, temp: 7670, lum: 10.6, oblate: 0.2 },
  { name: 'Gliese 581', pos: radec(15, 19, 26, -7, 43, 20.5), spec: 'M3V', mass: 0.31, radius: 0.3, temp: 3480, lum: 0.013, planets: [pl('Gliese 581 e', 0.028, 1.7), pl('Gliese 581 b', 0.041, 15.8), pl('Gliese 581 c', 0.073, 5.5)] },
  { name: 'Vega', pos: radec(18, 36, 56, 38, 47, 25.04), spec: 'A0V', mass: 2.14, radius: 2.36, temp: 9602, lum: 40.1, debris: [70, 170] },
  { name: 'Fomalhaut', pos: radec(22, 57, 39, -29, 37, 25.1), spec: 'A3V', mass: 1.92, radius: 1.84, temp: 8590, lum: 16.6, debris: [133, 143] },
  { name: 'Pollux', pos: radec(7, 45, 19, 28, 2, 33.8), spec: 'K0III', mass: 1.91, radius: 9.06, temp: 4586, lum: 32.7, planets: [pl('Pollux b (Thestias)', 1.64, 730, 11, 0.02)] },
  { name: 'Arcturus', pos: radec(14, 15, 40, 19, 11, 36.7), spec: 'K1.5III', mass: 1.08, radius: 25.4, temp: 4286, lum: 170 },
  { name: 'TRAPPIST-1', pos: radec(23, 6, 29, -5, 2, 40.66), spec: 'M8V', mass: 0.0898, radius: 0.1192, temp: 2566, lum: 0.00055,
    planets: [pl('TRAPPIST-1b', 0.01154, 1.374, 1.116), pl('TRAPPIST-1c', 0.0158, 1.308, 1.097), pl('TRAPPIST-1d', 0.02227, 0.388, 0.788), pl('TRAPPIST-1e', 0.02925, 0.692, 0.92),
      pl('TRAPPIST-1f', 0.03849, 1.039, 1.045), pl('TRAPPIST-1g', 0.04683, 1.321, 1.129), pl('TRAPPIST-1h', 0.06189, 0.326, 0.755)] },
  { name: '55 Cancri A', pos: radec(8, 52, 36, 28, 20, 41.0), spec: 'G8V', mass: 0.905, radius: 0.943, temp: 5196, lum: 0.582,
    planets: [pl('55 Cancri e (Janssen)', 0.01544, 8.0, 1.88), pl('55 Cancri b (Galileo)', 0.1134, 263, 11), pl('55 Cancri c (Brahe)', 0.2373, 54), pl('55 Cancri f (Harriot)', 0.7708, 47), pl('55 Cancri d (Lipperhey)', 5.957, 1232, 11, 0.13)] },
  { name: 'Capella Aa', pos: radec(5, 16, 41, 45, 59, 42.9), spec: 'K0III', mass: 2.57, radius: 11.98, temp: 4970, lum: 78.7, companions: [comp('Capella Ab', 'G1III', 2.48, 8.83, 5730, 72.7, 0.74, 0.0)] },
  { name: '51 Pegasi', pos: radec(22, 57, 28, 20, 46, 50.6), spec: 'G2IV', mass: 1.11, radius: 1.15, temp: 5790, lum: 1.36, planets: [pl('51 Pegasi b (Dimidium)', 0.0527, 150, 13)] },
  { name: 'Aldebaran', pos: radec(4, 35, 55, 16, 30, 65.3), spec: 'K5III', mass: 1.16, radius: 45.1, temp: 3910, lum: 439 },
  { name: 'Regulus', pos: radec(10, 8, 22, 11, 58, 79.3), spec: 'B8IVn', mass: 3.8, radius: 4.35, temp: 12460, lum: 316, oblate: 0.3 },
  { name: 'Spica', pos: radec(13, 25, 11, -11, 9, 250), spec: 'B1III-IV', mass: 11.43, radius: 7.47, temp: 25300, lum: 20512 },
  { name: 'Canopus', pos: radec(6, 23, 57, -52, 41, 310), spec: 'A9II', mass: 8, radius: 71, temp: 7400, lum: 10700 },
  { name: 'Polaris', pos: radec(2, 31, 49, 89, 15, 433), spec: 'F7Ib', mass: 5.4, radius: 37.5, temp: 6015, lum: 1260 },
  { name: 'Betelgeuse', pos: radec(5, 55, 10, 7, 24, 548), spec: 'M1-2Ia', mass: 16.5, radius: 764, temp: 3600, lum: 126000 },
  { name: 'Antares', pos: radec(16, 29, 24, -26, 25, 550), spec: 'M1.5Iab', mass: 13, radius: 680, temp: 3660, lum: 75900 },
  { name: 'Rigel', pos: radec(5, 14, 32, -8, 12, 860), spec: 'B8Ia', mass: 21, radius: 78.9, temp: 12100, lum: 120000 },
  { name: 'Deneb', pos: radec(20, 41, 26, 45, 17, 2600), spec: 'A2Ia', mass: 19, radius: 203, temp: 8525, lum: 196000 },
];
REAL_STARS.forEach((s, i) => { s.id = 'real:' + i; s.real = true; });

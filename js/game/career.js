// Career mode: money, Tech Points (TP), the tech tree, science experiments, contracts and achievements.
// Pure game logic (no rendering); scenes call into it and it mutates G.game.
import { PARTS, PART } from '../data/parts.js';
import { designStats } from '../core/vessel.js';

export const isCareer = (game) => !!game && game.mode === 'career';

// ---------------------------------------------------------------- facilities
export const FACILITY = [
  { name: 'Bean Field Launch Site', maxMass: 140, maxParts: 40, maxHeight: 45, desc: 'A gravel pad, a tin hangar and a portakabin. Small rockets only.' },
  { name: 'Bean Space Centre', maxMass: Infinity, maxParts: Infinity, maxHeight: Infinity, desc: 'The full space centre: giant VAB, Launch Pad 39B, mission control and tracking station.' },
];
export const UPGRADE_COST = 500000;
export const facility = (game) => FACILITY[isCareer(game) ? (game.facility || 0) : 1];

// ---------------------------------------------------------------- tech tree
// [id, name, tier, row, cost (TP), requires[], icon, parts[]]  (rows lay the tree out top to bottom)
const T = [
  ['start', 'Start', 0, 3, 0, [], '🌱', ['pod_mercury', 'probe_sputnik', 'tank_Electron_2', 'tank_Electron_6', 'eng_rutherford', 'eng_kestrel', 'srb_castor4', 'srb_blackbrant', 'srb_star48', 'srb_sep', 'srb_ullage', 'srb_castor30', 'dec_0.625', 'dec_1.25', 'nose_0.625', 'nose_1.25', 'fin_delta', 'chute_main', 'chute_drogue', 'heat_1.25', 'sci_thermo', 'sci_baro', 'clamp', 'battery_s', 'ant_whip', 'util_ladder', 'util_flagpole', 'adapt_0.625_1.25']],
  ['basicRocketry', 'Basic Rocketry', 1, 1, 5, ['start'], '🚀', ['tank_Falcon_4', 'eng_merlin', 'eng_rd0124', 'srb_gem40', 'dec_2.5', 'adapt_1.25_2.5', 'nose_2.5']],
  ['basicScience', 'Basic Science', 1, 3, 5, ['start'], '🔬', ['sci_geiger', 'sci_camera', 'sci_mag', 'ant_patch', 'probe_cube']],
  ['survivability', 'Survivability', 1, 5, 8, ['start'], '🪂', ['heat_2.5', 'chute_radial', 'legs_small', 'util_light']],
  ['engineering', 'Engineering 101', 1, 6, 8, ['start'], '🔧', ['rcs_n2', 'rw_small', 'battery_l', 'solar_fixed', 'struct_truss_s', 'dec_radial']],
  ['generalRocketry', 'General Rocketry', 2, 0, 20, ['basicRocketry'], '🔥', ['tank_Falcon_12', 'tank_Soyuz_6', 'tank_Soyuz_20', 'eng_rd107', 'eng_h1', 'eng_mvac', 'eng_rutherford9', 'srb_gem63', 'fin_large']],
  ['stability', 'Stability', 2, 2, 15, ['basicRocketry', 'engineering'], '🎯', ['fin_grid', 'rcs_quad', 'rw_large', 'fairing_2', 'nose_3.75']],
  ['spaceExploration', 'Space Exploration', 2, 3, 25, ['basicScience'], '🛰', ['pod_gemini', 'pod_soyuz', 'probe_octo', 'sci_spec', 'sci_seis', 'solar_juno', 'ant_hga', 'tank_Small_0.8', 'tank_Small_1.6', 'eng_aj10', 'eng_r4d', 'tank_monoprop', 'tank_monoprop_r', 'tank_Mini_0.4', 'tank_Mini_0.8', 'adapt_0.625_1.25']],
  ['landing', 'Landing', 2, 5, 20, ['survivability'], '🦵', ['legs_lm', 'chute_cluster', 'chute_super', 'heat_3.9', 'probe_lander']],
  ['advRocketry', 'Advanced Rocketry', 3, 0, 45, ['generalRocketry'], '💥', ['tank_Falcon_24', 'tank_Falcon_36', 'tank_Atlas_10', 'tank_Atlas_25', 'eng_rd180', 'eng_nk33', 'eng_yf100', 'dec_3.75', 'adapt_2.5_3.75', 'adapt_3.66_5.2', 'adapt_1.25_3.66', 'dec_radial_l', 'srb_p120']],
  ['cryogenics', 'Cryogenics', 3, 1, 55, ['generalRocketry'], '❄️', ['eng_rl10', 'eng_rl10b', 'eng_j2', 'tank_Centaur_4', 'tank_Centaur_10', 'tank_SIVB_8', 'tank_SIVB_16', 'eng_vinci', 'tank_Ariane_12', 'tank_HII_12', 'eng_be3u']],
  ['crewedFlight', 'Crewed Flight', 3, 3, 50, ['spaceExploration', 'landing'], '👨‍🚀', ['pod_apollo', 'pod_lm', 'eng_dps', 'eng_aps', 'eng_oms', 'tank_Service_2', 'tank_Service_4', 'les_tower', 'hab_airlock', 'dock_ids']],
  ['advScience', 'Advanced Science', 3, 4, 45, ['spaceExploration'], '🧪', ['sci_ms', 'sci_grav', 'sci_dust', 'sci_radar', 'sci_lidar', 'sci_sample']],
  ['electrics', 'Electrics', 3, 6, 40, ['engineering', 'spaceExploration'], '⚡', ['solar_rosa', 'fuelcell', 'radiator_s', 'ant_hga_l']],
  ['aerodynamics', 'Aerodynamics', 3, 2, 35, ['stability'], '✈️', ['fin_flap', 'fairing_5', 'nose_5.4', 'heat_5']],
  ['heavyRocketry', 'Heavy Rocketry', 4, 0, 90, ['advRocketry'], '🏗', ['eng_merlin9', 'eng_f1', 'eng_rd170', 'eng_rs25', 'eng_rs68', 'eng_le7', 'eng_vulcain', 'tank_SaturnSIC_10', 'tank_SLSCore_16', 'tank_SLSCore_40', 'tank_Vulcan_10', 'tank_Vulcan_30', 'tank_Ariane_25', 'tank_HII_30', 'dec_5.4', 'dec_7', 'adapt_3.75_5.4', 'adapt_5.4_7', 'dec_interstage', 'srb_shuttle']],
  ['methalox', 'Methalox Engines', 4, 1, 110, ['cryogenics', 'advRocketry'], '🌀', ['eng_raptor', 'eng_rvac', 'eng_be4', 'eng_archimedes', 'tank_Neutron_10', 'tank_Neutron_25', 'tank_NewGlenn_15', 'tank_Starship_6']],
  ['modernCapsules', 'Modern Capsules', 4, 3, 110, ['crewedFlight'], '🛸', ['pod_dragon', 'pod_starliner', 'pod_orion', 'eng_superdraco_r', 'rcs_draco', 'heat_hiad', 'legs_f9']],
  ['ionPropulsion', 'Ion Propulsion', 4, 5, 100, ['electrics', 'advScience'], '🔷', ['eng_nstar', 'eng_nextc', 'eng_spt140', 'tank_xenon_s', 'tank_xenon_l', 'probe_ring', 'probe_voyager', 'rtg']],
  ['stations', 'Space Stations', 4, 4, 100, ['crewedFlight', 'electrics'], '🏠', ['hab_node', 'hab_cupola', 'hab_beam', 'dock_cbm', 'solar_iss', 'util_whipple', 'struct_truss', 'pod_cupola_hab', 'util_rover']],
  ['superHeavy', 'Super-Heavy Lift', 5, 0, 200, ['heavyRocketry'], '🗼', ['eng_f1x5', 'eng_j2x5', 'eng_rs25x4', 'eng_archimedes7', 'tank_SaturnSIC_30', 'tank_SLSCore_64', 'tank_NewGlenn_40', 'srb_sls', 'dec_9', 'dec_10.1', 'adapt_7_9', 'adapt_9_10.1', 'adapt_8.4_5.4', 'fairing_8', 'rw_huge']],
  ['nuclear', 'Nuclear Propulsion', 5, 2, 220, ['heavyRocketry', 'cryogenics'], '☢️', ['eng_nerva', 'eng_timberwind', 'tank_lh2_ntr', 'tank_lh2_ntr_s', 'kilopower', 'eng_kilopower_ep']],
  ['observatories', 'Observatories', 5, 4, 200, ['advScience', 'stations'], '🔭', ['sci_telescope', 'sci_lab', 'ant_laser']],
  ['advElectric', 'Plasma Propulsion', 5, 5, 240, ['ionPropulsion'], '🟣', ['eng_x3', 'eng_vasimr', 'eng_mpd', 'tank_argon', 'reactor_mw']],
  ['habitats', 'Deep-Space Habitats', 5, 6, 180, ['stations'], '🛏', ['hab_b330', 'util_storm']],
  ['starship', 'Fully Reusable', 6, 0, 450, ['superHeavy', 'methalox', 'modernCapsules'], '⭐', ['pod_starship', 'eng_raptor33', 'tank_Starship_18', 'tank_Starship_36', 'tank_Starship_50']],
  ['sails', 'Light Sails', 6, 4, 400, ['observatories'], '⛵', ['isd_solarsail', 'isd_solarsail_l', 'isd_lightsail', 'isd_magsail', 'sci_jwst']],
  ['nuclearPulse', 'Nuclear Pulse', 6, 2, 600, ['nuclear'], '💣', ['eng_nswr', 'tank_water', 'isd_orion', 'tank_pulse']],
  ['fusion', 'Fusion Drives', 7, 2, 1000, ['nuclearPulse', 'advElectric'], '☀️', ['reactor_fusion', 'isd_daedalus', 'isd_daedalus2', 'isd_firefly', 'tank_dhe3', 'tank_dhe3_s', 'isd_cryo', 'isd_shield', 'isd_radiator', 'ant_interstellar']],
  ['aviation', 'Aviation', 1, 7, 6, ['start'], '🛩', ['pod_cockpit', 'wing_small', 'tailplane', 'tail_fin', 'canard', 'gear_nose', 'gear_main', 'eng_j85', 'tank_Fuselage_2', 'tank_Fuselage_4']],
  ['jetAge', 'Jet Age', 2, 7, 22, ['aviation'], '✈️', ['eng_f404', 'eng_cfm56', 'wing_large', 'pod_cockpit_l', 'tank_WideFuselage_4', 'tank_WideFuselage_8']],
  ['hypersonics', 'Hypersonics', 4, 7, 120, ['jetAge', 'aerodynamics'], '🌡', ['wing_delta_s', 'eng_sabre', 'gear_nose_l']],
  ['spaceplanes', 'Spaceplanes', 5, 7, 220, ['hypersonics', 'cryogenics'], '🛫', ['pod_orbiter', 'wing_delta', 'tail_orbiter', 'gear_heavy']],
  ['interstellar', 'Interstellar', 8, 3, 1500, ['fusion', 'sails'], '🌌', ['isd_orion_big', 'isd_antimatter', 'tank_antimatter', 'isd_bussard', 'isd_ring', 'isd_warp']],
];
export const TECH = T.map(([id, name, tier, row, cost, req, icon, parts]) => ({ id, name, tier, row, cost, req, icon, parts: parts.filter(p => PART[p]) }));
export const TECH_BY_ID = Object.fromEntries(TECH.map(t => [t.id, t]));
// any catalogue part not placed by hand goes to a node by category and price, so nothing is lost
{
  const placed = new Set(TECH.flatMap(t => t.parts));
  const byCat = { pods: 'crewedFlight', probes: 'spaceExploration', tanks: 'generalRocketry', engines: 'advRocketry', boosters: 'generalRocketry', advanced: 'ionPropulsion', interstellar: 'fusion', coupling: 'basicRocketry', aero: 'stability', control: 'engineering', landing: 'landing', power: 'electrics', comms: 'basicScience', science: 'advScience', utility: 'stations' };
  for (const p of PARTS) if (!p.hidden && !placed.has(p.id)) TECH_BY_ID[byCat[p.cat] || 'engineering'].parts.push(p.id);
}
const PART_NODE = {}; for (const t of TECH) for (const p of t.parts) PART_NODE[p] ??= t.id;
export const nodeOfPart = (id) => PART_NODE[id];
export function partUnlocked(game, id) {
  if (!isCareer(game)) return true;
  const p = PART[id]; if (!p || p.hidden) return true;
  return (game.tech || []).includes(PART_NODE[id] || 'start');
}
export const canResearch = (game, t) => !game.tech.includes(t.id) && t.req.every(r => game.tech.includes(r));
export function research(game, id) {
  const t = TECH_BY_ID[id]; if (!t || !canResearch(game, t) || game.tp < t.cost) return false;
  game.tp -= t.cost; game.tech.push(id); return true;
}

// ---------------------------------------------------------------- situations & science
export const SITUATIONS = { landed: 'Landed', splashed: 'Splashed down', flyingLow: 'Flying low', flyingHigh: 'Flying high', spaceLow: 'In space near', spaceHigh: 'In space high over' };
const SIT_PHRASE = { landed: 'landed on', splashed: 'splashed down on', flyingLow: 'flying low over', flyingHigh: 'flying high over', spaceLow: 'in space near', spaceHigh: 'in space high above' };
export const sitText = (sit, body) => `${SIT_PHRASE[sit] || sit} ${body}`;
const SIT_MULT = { landed: 1.5, splashed: 1.0, flyingLow: 0.7, flyingHigh: 0.9, spaceLow: 1.2, spaceHigh: 1.0 };
// how hard a body is to reach (sets how much its science is worth)
const BODY_MULT = { Earth: 1, Moon: 4, Mars: 7, Phobos: 7, Deimos: 7, Venus: 7, Mercury: 9, Sun: 8, Ceres: 10, Vesta: 10, Jupiter: 12, Io: 13, Europa: 13, Ganymede: 13, Callisto: 12, Saturn: 15, Titan: 16, Enceladus: 16, Uranus: 18, Neptune: 20, Triton: 21, Pluto: 25, Charon: 25 };
export function bodyMult(body) {
  if (!body) return 1;
  if (!body.sys.real) return 30;
  if (BODY_MULT[body.name] !== undefined) return BODY_MULT[body.name];
  const p = body.parentBody; if (p && BODY_MULT[p.name] !== undefined && p.type !== 'star') return BODY_MULT[p.name] + 1; // other moons of a planet
  return 10;
}
export function situationOf(v) {
  const B = v.body; if (!B) return null;
  const alt = v.r.len() - B.radius;
  if (v.situation === 'splashed') return 'splashed';
  if (v.landed || v.contact || v.situation === 'landed' || v.situation === 'prelaunch') return 'landed';
  if (B.atmo && alt < B.atmo.height) return alt < B.atmo.height * 0.2 ? 'flyingLow' : 'flyingHigh';
  return alt < Math.max(B.radius * 0.5, (B.atmo ? B.atmo.height : 0) + 150e3) ? 'spaceLow' : 'spaceHigh';
}
// experiment kinds: base TP and where they work. `need`: 'atmo' | 'landed' | 'space' | 'surfaceOrAtmo'
export const EXPERIMENTS = {
  temperature: { name: 'Temperature scan', tp: 3 },
  pressure: { name: 'Atmospheric pressure reading', tp: 3, need: 'atmo' },
  magnetic: { name: 'Magnetic field survey', tp: 4 },
  radiation: { name: 'Radiation count', tp: 4 },
  spectra: { name: 'Surface spectroscopy', tp: 6 },
  imaging: { name: 'High-resolution imaging', tp: 5 },
  seismic: { name: 'Seismic measurement', tp: 8, need: 'landed' },
  composition: { name: 'Atmosphere / regolith composition', tp: 6, need: 'surfaceOrAtmo' },
  gravity: { name: 'Gravity scan', tp: 7 },
  dust: { name: 'Dust particle analysis', tp: 6 },
  subsurface: { name: 'Ground-penetrating radar sounding', tp: 8, need: 'lowOnly' },
  topography: { name: 'Laser altimetry', tp: 6, need: 'lowOnly' },
  astronomy: { name: 'Deep-sky observation', tp: 25, need: 'space' },
  infrared: { name: 'Infrared survey', tp: 40, need: 'space' },
  sample: { name: 'Sample capsule study', tp: 10 },
  lab: { name: 'Orbital laboratory research', tp: 15, need: 'space' },
  crew: { name: 'Crew report', tp: 3 },
  eva: { name: 'EVA report', tp: 4 },
};
export function expAllowed(kind, sit, body) {
  const e = EXPERIMENTS[kind]; if (!e || !sit) return false;
  switch (e.need) {
    case 'atmo': return !!body.atmo && (sit === 'flyingLow' || sit === 'flyingHigh' || ((sit === 'landed' || sit === 'splashed') && body.atmo.P0 > 0.1));
    case 'landed': return sit === 'landed';
    case 'space': return sit === 'spaceLow' || sit === 'spaceHigh';
    case 'surfaceOrAtmo': return sit === 'landed' || sit === 'splashed' || (!!body.atmo && sit.startsWith('flying'));
    case 'lowOnly': return sit !== 'spaceHigh';
    default: return true;
  }
}
export const sciKey = (kind, body, sit) => `${kind}@${body.sys.starId}/${body.name}@${sit}`;
export function sciValue(game, kind, body, sit) {
  const e = EXPERIMENTS[kind]; if (!e || !expAllowed(kind, sit, body)) return 0;
  if ((game.science || {})[sciKey(kind, body, sit)]) return 0; // already studied there
  let k = bodyMult(body) * SIT_MULT[sit];
  if (body.name === 'Earth' && body.sys.real && (sit === 'landed' || sit === 'splashed')) k = 0.3; // home ground
  return Math.max(1, Math.round(e.tp * k));
}
export function runScience(game, kind, body, sit) {
  const tp = sciValue(game, kind, body, sit); if (!tp) return 0;
  game.science ||= {}; game.science[sciKey(kind, body, sit)] = tp; game.tp += tp;
  (game.log ||= []).push({ t: game.t, text: `${EXPERIMENTS[kind].name} — ${sitText(sit, body.name)}: +${tp} TP` });
  return tp;
}

// ---------------------------------------------------------------- achievements
// Checked a few times a second against the live vessel (and a per-flight record).
const A = [];
const add = (id, name, desc, tp, test, group) => A.push({ id, name, desc, tp, test, group });
for (const [km, tp] of [[1, 5], [5, 8], [10, 10], [20, 10], [30, 12], [50, 15], [100, 25], [250, 15], [1000, 20], [10000, 25], [100000, 30]])
  add('alt' + km, km >= 100 ? `${km.toLocaleString()} km up` : `${km} km up`, `Climb ${km.toLocaleString()} km above Earth's surface`, tp, (s) => s.home && s.maxAlt >= km * 1000, 'Height');
for (const [ms, tp] of [[100, 5], [250, 8], [500, 10], [1000, 15], [2000, 20]])
  add('vs' + ms, `Climbing at ${ms} m/s`, `Reach a vertical speed of ${ms} m/s through Earth's air`, tp, (s) => s.home && s.maxVsAir >= ms, 'Vertical airspeed');
for (const [ms, tp, n] of [[100, 5, 'Taxiing'], [343, 10, 'Sound barrier'], [1000, 12, 'Hypersonic dash'], [2000, 15, 'Mach 6'], [4000, 20, 'Mach 12']])
  add('hs' + ms, n, `Fly ${ms} m/s horizontally inside Earth's atmosphere`, tp, (s) => s.home && s.maxHsAir >= ms, 'Horizontal airspeed');
add('orbitEarth', 'Orbit!', 'Reach a stable orbit around Earth', 40, (s) => s.orbited.includes('Earth'), 'Milestones');
add('v7', '7 km/s', 'Reach an orbital speed of 7 km/s', 15, (s) => s.maxOrbV >= 7000, 'Milestones');
add('escape', 'Escape velocity', 'Go faster than 11.2 km/s', 30, (s) => s.maxOrbV >= 11200, 'Milestones');
add('firstLaunch', 'Liftoff', 'Leave the launch pad', 5, (s) => s.launched, 'Milestones');
add('firstScience', 'Curiosity', 'Run your first experiment', 5, (s, g) => Object.keys(g.science || {}).length > 0, 'Milestones');
add('firstEva', 'Out the hatch', 'Take a Bean on an EVA', 15, (s) => s.eva, 'Milestones');
add('firstDock', 'Docking!', 'Dock two vessels together', 30, (s) => s.docked, 'Milestones');
add('flag', 'Plant a flag', 'Plant a flag anywhere', 10, (s, g) => (g.flags || []).length > 0, 'Milestones');
add('chuteLanding', 'Soft landing', 'Land or splash down under parachutes', 10, (s) => s.chuteLanding, 'Milestones');
add('reentry', 'Fire from the sky', 'Survive re-entry heating of 1000+', 20, (s) => s.maxHeat >= 1000 && s.survivedHeat, 'Milestones');
add('flight1h', 'One-hour mission', 'Keep a mission flying for an hour', 10, (s) => s.flightTime >= 3600, 'Milestones');
add('flight1d', 'Long-duration flight', 'Keep a mission going for a day', 15, (s) => s.flightTime >= 86400, 'Milestones');
add('interstellar', 'Beyond the Sun', 'Leave the Solar System', 150, (s) => s.interstellar, 'Milestones');
for (const [b, k] of Object.entries(BODY_MULT)) {
  if (b === 'Earth') continue;
  const soi = Math.round(8 * k), orb = Math.round(12 * k), land = Math.round(20 * k);
  if (b !== 'Sun') add('soi_' + b, `Reach ${b}`, `Enter ${b}'s sphere of influence`, soi, (s) => s.soi.includes(b), 'Exploration');
  if (b !== 'Sun') add('orbit_' + b, `Orbit ${b}`, `Enter a stable orbit around ${b}`, orb, (s) => s.orbited.includes(b), 'Exploration');
  if (!['Sun', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(b)) add('land_' + b, `Land on ${b}`, `Touch down on ${b}`, land, (s) => s.landedOn.includes(b), 'Exploration');
}
add('firstFlight', 'First flight', 'Take off in a winged aircraft', 10, (s) => s.wingAir > 0, 'Aviation');
add('wingSupersonic', 'Supersonic jet', 'Break the sound barrier in a winged aircraft', 15, (s) => s.wingSpeed >= 343, 'Aviation');
add('wingHigh', 'Edge of the sky', 'Climb 20 km in a winged aircraft', 15, (s) => s.wingAlt >= 20000, 'Aviation');
add('wingLanding', 'Greaser', 'Fly a winged aircraft and land it on its wheels', 15, (s) => s.wingLanded, 'Aviation');
add('spaceplane', 'Spaceplane', 'Fly a winged vessel above 70 km', 30, (s) => s.wingAlt >= 70000, 'Aviation');
add('reusable', 'Fly it again', 'Take a winged vessel to space and land it on its wheels', 50, (s) => s.wingAlt >= 70000 && s.wingLanded, 'Aviation');
export const ACHIEVEMENTS = A;

// per-flight record (lives on the flight scene)
export const newFlightRecord = () => ({ maxAlt: 0, maxVsAir: 0, maxHsAir: 0, maxOrbV: 0, maxHeat: 0, survivedHeat: false, orbited: [], soi: [], landedOn: [], launched: false, eva: false, chuteLanding: false, flightTime: 0, interstellar: false, home: false, docked: false, wingAir: 0, wingSpeed: 0, wingAlt: 0, wingLanded: false });
export function trackFlight(rec, v, dt) {
  if (!v) return;
  if (v.galactic) { rec.interstellar = true; return; }
  const B = v.body; const alt = v.r.len() - B.radius;
  rec.home = B.name === 'Earth' && B.sys.real;
  rec.flightTime += dt;
  if (!v.clamped && v.situation !== 'prelaunch') rec.launched = true;
  if (rec.home) rec.maxAlt = Math.max(rec.maxAlt, alt);
  const surf = v.v.clone().sub(B.surfaceVel(v.r)); const up = v.r.clone().norm();
  const vs = surf.dot(up), hs = Math.sqrt(Math.max(0, surf.len2() - vs * vs));
  if (rec.home && B.atmo && alt < B.atmo.height && rec.launched) { rec.maxVsAir = Math.max(rec.maxVsAir, vs); rec.maxHsAir = Math.max(rec.maxHsAir, hs); }
  rec.maxOrbV = Math.max(rec.maxOrbV, v.v.len());
  if ((v.heat || 0) > rec.maxHeat) rec.maxHeat = v.heat;
  if (rec.maxHeat >= 1000 && (v.heat || 0) < 50 && v.livingParts().some(p => p.part.crew || p.part.probe)) rec.survivedHeat = true;
  if (!rec.soi.includes(B.name)) rec.soi.push(B.name);
  if ((v.landed || v.situation === 'landed' || v.situation === 'splashed') && rec.launched && !rec.landedOn.includes(B.name)) {
    rec.landedOn.push(B.name);
    if (v.livingParts().some(p => p.part.chute && p.deployed)) rec.chuteLanding = true;
  }
  if (v.type === 'eva') rec.eva = true;
  // aircraft: a vessel with real wings (not just fins)
  if (rec.home && v.wings && v.wings.some(w => !w.w.grid && w.w.area >= 2 && w.w.ctrl < 1)) {
    rec.wingAir ??= 0; rec.wingSpeed ??= 0; rec.wingAlt ??= 0;
    if (!v.contact && !v.landed && rec.launched && alt - (B.surfaceHeightAt ? B.surfaceHeightAt(v.r, 0) : 0) > 5) { rec.wingAir += dt; rec.wingAlt = Math.max(rec.wingAlt, alt); if (B.atmo && alt < B.atmo.height) rec.wingSpeed = Math.max(rec.wingSpeed, surf.len()); }
    if (rec.wingAir > 5 && (v.contact || v.landed) && surf.len() < 3 && v.wheels && !v.gearUp && v.livingParts().some(p => p.part.gear)) rec.wingLanded = true;
  }
  if (!v.landed && rec.launched) { // stable orbit: periapsis above the atmosphere / surface
    const mu = B.mu, r = v.r.len(), vv = v.v.len2(); const E = vv / 2 - mu / r;
    if (E < 0) { const h = v.r.clone().cross(v.v).len(); const a = -mu / (2 * E); const e = Math.sqrt(Math.max(0, 1 + 2 * E * h * h / (mu * mu))); const pe = a * (1 - e) - B.radius;
      if (pe > (B.atmo ? B.atmo.height : 5000) && !rec.orbited.includes(B.name)) rec.orbited.push(B.name); }
  }
}
// award whatever the record now satisfies; returns the newly earned achievements
export function checkAchievements(game, rec) {
  const got = [];
  game.achievements ||= {};
  for (const a of A) if (!game.achievements[a.id] && a.test(rec, game)) { game.achievements[a.id] = game.t; game.tp += a.tp; got.push(a); }
  return got;
}

// ---------------------------------------------------------------- contract givers & contracts
// Each giver is a Bean with their own outfit (see render/astronaut.js dressBean) and mannerisms.
export const GIVERS = [
  { id: 'tycoon', name: 'Sir Barnaby Bean', role: 'Aerospace tycoon', outfit: 'tycoon', idle: 'tiphat', line: 'Money is no object — results are!' },
  { id: 'scientist', name: 'Dr. Beatrix Beanstein', role: 'Chief scientist', outfit: 'scientist', idle: 'think', line: 'Fascinating. Bring me data. Lots of data.' },
  { id: 'general', name: 'General Rupert Bean-Rogers', role: 'Defence ministry', outfit: 'general', idle: 'salute', line: 'Punctual rockets win wars. And contracts.' },
  { id: 'farmer', name: 'Uncle Bean', role: 'Local farmer & investor', outfit: 'farmer', idle: 'wave', line: "Built this pad on my turnip field, I did." },
  { id: 'professor', name: 'Prof. Humphrey Beanwick', role: 'Royal Astronomer', outfit: 'professor', idle: 'point', line: "The heavens, my dear Bean — go and look!" },
  { id: 'aviator', name: 'Capt. Amelia Beanhart', role: 'Air racer & test pilot', outfit: 'aviator', idle: 'salute', line: 'Wings first, rockets later — trust me!', planes: true },
  { id: 'chef', name: 'Chef Beanoît', role: 'Space-food entrepreneur', outfit: 'chef', idle: 'talk', line: 'Zero-g soufflé needs zero-g testing, non?' },
];
export const GIVER_BY_ID = Object.fromEntries(GIVERS.map(g => [g.id, g]));

function rngFor(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const round = (x, k = 1000) => Math.round(x / k) * k;
// progress tier from what the space program has already done
function progressTier(game) {
  const a = game.achievements || {};
  if (a.land_Mars || a.orbit_Jupiter) return 5; if (a.land_Moon) return 4; if (a.orbit_Moon || a.soi_Moon) return 3; if (a.orbitEarth) return 2; if (a.alt30) return 1; return 0;
}
const REACH = [['Moon', 3], ['Mars', 4], ['Venus', 4], ['Mercury', 5], ['Jupiter', 5], ['Saturn', 5]];
export function makeContract(game, r) {
  const tier = progressTier(game), g = GIVERS[Math.floor(r() * GIVERS.length)];
  if (g.planes) return planeContract(game, r, g, tier);
  const types = ['altitude', 'speed', 'science', 'recover'];
  if (tier >= 1) types.push('orbit'); if (tier >= 2) types.push('soi', 'orbit', 'science', 'dock'); if (tier >= 3) types.push('land', 'soi'); if (tier >= 4) types.push('land', 'orbit');
  const type = types[Math.floor(r() * types.length)];
  const bodies = REACH.filter(([, t]) => t <= tier + 1).map(([b]) => b);
  const pickBody = () => bodies.length ? bodies[Math.floor(r() * bodies.length)] : 'Moon';
  let c;
  if (type === 'altitude') { const km = [[3, 10, 20, 35], [50, 80, 120], [200, 500, 1000]][Math.min(2, tier)]; const k = km[Math.floor(r() * km.length)]; c = { type, km: k, title: `Reach ${k} km`, text: `Take any vessel at least ${k} km above Earth.`, pay: 8000 + k * 900 }; }
  else if (type === 'speed') { const ms = [150, 300, 500, 800, 1200][Math.min(4, tier + Math.floor(r() * 2))]; c = { type, ms, title: `Go ${ms} m/s in the air`, text: `Fly faster than ${ms} m/s inside Earth's atmosphere.`, pay: 6000 + ms * 40 }; }
  else if (type === 'recover') { const km = tier === 0 ? 5 : tier === 1 ? 30 : 100; c = { type, km, crew: tier >= 1 && r() < 0.6, title: `${tier >= 1 ? 'Bring a Bean back' : 'Test flight'} from ${km} km`, text: `Reach ${km} km, then land and recover the vessel${tier >= 1 ? ' with its crew' : ''}.`, pay: 15000 + km * 1200 }; }
  else if (type === 'dock') { c = { type, title: 'Dock two vessels', text: 'Launch two vessels with docking ports and dock them together in orbit.', pay: 140000 }; }
  else if (type === 'orbit') { const b = tier >= 2 && r() < 0.6 ? pickBody() : 'Earth'; c = { type, body: b, title: `Orbit ${b}`, text: `Put a vessel into a stable orbit around ${b}.`, pay: b === 'Earth' ? 90000 : round(180000 * bodyMult({ name: b, sys: { real: true } }) * 0.6) }; }
  else if (type === 'soi') { const b = pickBody(); c = { type, body: b, title: `Fly to ${b}`, text: `Reach ${b}'s sphere of influence.`, pay: round(120000 * bodyMult({ name: b, sys: { real: true } }) * 0.5) }; }
  else if (type === 'land') { const b = pickBody(); c = { type, body: b, title: `Land on ${b}`, text: `Touch down safely on ${b}.`, pay: round(300000 * bodyMult({ name: b, sys: { real: true } }) * 0.5) }; }
  else { // science
    const kinds = ['temperature', 'pressure', 'radiation', 'magnetic', 'imaging'].concat(tier >= 2 ? ['spectra', 'gravity', 'seismic'] : []);
    const kind = kinds[Math.floor(r() * kinds.length)];
    const b = tier >= 3 && r() < 0.5 ? pickBody() : 'Earth';
    const sits = Object.keys(SITUATIONS).filter(s => b !== 'Earth' || s !== 'landed').filter(s => expAllowed(kind, s, { atmo: b === 'Earth' || b === 'Mars' || b === 'Venus' ? { P0: 1 } : null }));
    const sit = sits[Math.floor(r() * sits.length)] || 'spaceLow';
    c = { type: 'science', kind, body: b, sit, title: `${EXPERIMENTS[kind].name}`, text: `Collect ${EXPERIMENTS[kind].name.toLowerCase()} data while ${sitText(sit, b)}.`, pay: 12000 + round(20000 * bodyMult({ name: b, sys: { real: true } }) * (sit === 'landed' ? 1.5 : 1), 500) };
  }
  c.pay = round(c.pay, 500); c.advance = round(c.pay * 0.2, 500); c.tp = Math.max(1, Math.round(c.pay / 25000));
  c.id = 'c' + Math.floor(r() * 1e9).toString(36); c.giver = g.id;
  return c;
}
// the test pilot's jobs: fly winged aircraft, land them, and (later) take them to space and back
function planeContract(game, r, g, tier) {
  const a = game.achievements || {}; const types = ['wingAlt', 'wingSpeed', 'wingLand'];
  if (a.wingSupersonic || a.wingHigh || tier >= 2) types.push('wingSpeed', 'wingAlt', 'spaceplane');
  if (a.spaceplane) types.push('spaceplane');
  const type = types[Math.floor(r() * types.length)]; let c;
  if (type === 'wingAlt') { const k = [1, 3, 6, 10, 15, 20, 30][Math.min(6, Math.floor(r() * 3) + (a.firstFlight ? 2 : 0) + (a.wingSupersonic ? 2 : 0))]; c = { type, km: k, title: `Fly an aircraft to ${k} km`, text: `Climb to ${k} km in a winged aircraft (wings, not just fins).`, pay: 6000 + k * 1500 }; }
  else if (type === 'wingSpeed') { const ms = [80, 150, 250, 340, 500, 800, 1200][Math.min(6, Math.floor(r() * 3) + (a.firstFlight ? 2 : 0) + (a.wingSupersonic ? 2 : 0))]; c = { type, ms, title: `Fly an aircraft at ${ms} m/s`, text: `Reach ${ms} m/s through Earth's air in a winged aircraft${ms >= 343 ? ' — that is supersonic!' : '.'}`, pay: 5000 + ms * 60 }; }
  else if (type === 'wingLand') { const km = [0.5, 2, 5, 10][Math.min(3, Math.floor(r() * 2) + (a.firstFlight ? 1 : 0) + (a.wingHigh ? 1 : 0))]; c = { type, km, title: `Fly to ${km} km and land`, text: `Take off in a winged aircraft, climb to ${km} km, then land it on its wheels and recover it.`, pay: 12000 + km * 3000 }; }
  else { c = { type: 'spaceplane', km: 70, crew: r() < 0.5, title: 'Reusable spaceplane', text: `Fly a winged vessel above 70 km, glide it home and land it on its wheels${''}. Recover it to be paid.`, pay: 350000 }; }
  c.pay = round(c.pay, 500); c.advance = round(c.pay * 0.2, 500); c.tp = Math.max(1, Math.round(c.pay / 25000));
  c.id = 'c' + Math.floor(r() * 1e9).toString(36); c.giver = g.id;
  return c;
}
export function refreshOffers(game, n = 4) {
  game.contracts ||= { offered: [], active: [], done: 0 };
  const r = rngFor((game.contractSeed = (game.contractSeed || 1234) + 1) * 7919);
  let guard = 0;
  while (game.contracts.offered.length < n && guard++ < 40) {
    const c = makeContract(game, r);
    const dup = [...game.contracts.offered, ...game.contracts.active].some(x => x.title === c.title);
    if (!dup) game.contracts.offered.push(c);
  }
}
export function acceptContract(game, id) {
  const C = game.contracts; const i = C.offered.findIndex(c => c.id === id); if (i < 0) return null;
  if (C.active.length >= 5) return null;
  const c = C.offered.splice(i, 1)[0]; C.active.push(c); game.funds += c.advance; return c;
}
export function declineContract(game, id) { const C = game.contracts; C.offered = C.offered.filter(c => c.id !== id); refreshOffers(game); }
// during flight: which active contracts does this record / vessel state satisfy? (recover ones need recover())
export function checkContracts(game, rec, v, event) {
  const C = game.contracts; if (!C || !C.active.length) return [];
  const done = [];
  for (const c of C.active) {
    let ok = false;
    if (c.type === 'altitude') ok = rec.home && rec.maxAlt >= c.km * 1000;
    else if (c.type === 'speed') ok = rec.home && Math.hypot(rec.maxHsAir, rec.maxVsAir) >= c.ms;
    else if (c.type === 'orbit') ok = rec.orbited.includes(c.body);
    else if (c.type === 'soi') ok = rec.soi.includes(c.body);
    else if (c.type === 'land') ok = rec.landedOn.includes(c.body);
    else if (c.type === 'science') ok = event && event.science && event.science.kind === c.kind && event.science.body === c.body && event.science.sit === c.sit;
    else if (c.type === 'dock') ok = !!rec.docked || !!(event && event.docked);
    else if (c.type === 'wingAlt') ok = (rec.wingAlt || 0) >= c.km * 1000;
    else if (c.type === 'wingSpeed') ok = (rec.wingSpeed || 0) >= c.ms;
    else if (c.type === 'wingLand' || c.type === 'spaceplane') ok = event && event.recovered && (rec.wingAlt || 0) >= c.km * 1000 && rec.wingLanded;
    else if (c.type === 'recover') ok = event && event.recovered && rec.maxAlt >= c.km * 1000 && (!c.crew || event.crewed);
    if (ok) done.push(c);
  }
  for (const c of done) { C.active = C.active.filter(x => x !== c); C.done = (C.done || 0) + 1; game.funds += c.pay; game.tp += c.tp; (game.log ||= []).push({ t: game.t, text: `Contract complete: ${c.title} (+${c.pay.toLocaleString()} funds, +${c.tp} TP)` }); }
  if (done.length) refreshOffers(game);
  return done;
}

// ---------------------------------------------------------------- money
export function designCost(design) { return designStats(design).cost; }
// what the launch site says about a design: price, size, and anything that stops it launching
export function launchCheck(game, design) {
  const st = designStats(design); let top = -Infinity, bot = Infinity, locked = 0;
  for (const pl of st.placed) {
    const h = pl.part.h || 1, y = pl.pos[1];
    if (pl.radial) { top = Math.max(top, y + h / 2); bot = Math.min(bot, y - h / 2); } else { top = Math.max(top, y); bot = Math.min(bot, y - h); }
    if (!partUnlocked(game, pl.node.id)) locked++;
  }
  const out = { cost: st.cost, mass: st.wet, parts: st.parts, height: top - bot, locked, problems: [] };
  if (!isCareer(game)) return out;
  const F = facility(game), P = out.problems;
  if (locked) P.push(`${locked} part${locked > 1 ? 's' : ''} not researched yet`);
  if (out.mass > F.maxMass) P.push(`too heavy for ${F.name} (${out.mass.toFixed(1)} t, max ${F.maxMass} t)`);
  if (out.parts > F.maxParts) P.push(`too many parts (${out.parts}, max ${F.maxParts})`);
  if (out.height > F.maxHeight) P.push(`too tall (${out.height.toFixed(1)} m, max ${F.maxHeight} m)`);
  if (out.cost > game.funds) P.push(`costs ${fmtFunds(out.cost)} but you have ${fmtFunds(game.funds)}`);
  return out;
}
export const fmtFunds = (x) => (x === Infinity ? '∞' : '£' + Math.round(x).toLocaleString());
export function initCareer(game) {
  game.funds = 60000; game.tp = 0; game.tech = ['start']; game.facility = 0; game.science = {}; game.achievements = {};
  game.contracts = { offered: [], active: [], done: 0 }; game.contractSeed = Math.floor(Math.random() * 1e6);
  refreshOffers(game);
}

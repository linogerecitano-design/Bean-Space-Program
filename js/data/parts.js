// Part catalogue. Every part is based on real hardware or a published engineering concept;
// numbers are rounded from public data (thrust in kN, Isp in s, masses in tonnes, sizes in m).
export const PROPS = {
  kerolox: { name: 'RP-1 / LOX', density: 1030, dry: 0.045, color: 0xe8e6e0 },
  methalox: { name: 'CH4 / LOX', density: 830, dry: 0.045, color: 0xd9dadb },
  hydrolox: { name: 'LH2 / LOX', density: 360, dry: 0.09, color: 0xd87a2a },
  hypergolic: { name: 'MMH / NTO', density: 1180, dry: 0.07, color: 0xe0e0e0 },
  monoprop: { name: 'Hydrazine', density: 1004, dry: 0.12, color: 0xdddddd },
  xenon: { name: 'Xenon', density: 1600, dry: 0.15, color: 0x9aa4b0 },
  argon: { name: 'Argon', density: 1400, dry: 0.15, color: 0x9aa4b0 },
  hydrogen: { name: 'Liquid H2', density: 71, dry: 0.15, color: 0xd8d8d0 },
  solid: { name: 'APCP solid', density: 1750, dry: 0.12, color: 0xdddddd },
  dhe3: { name: 'D / He-3 pellets', density: 180, dry: 0.08, color: 0xb8c8d8 },
  pulse: { name: 'Nuclear pulse units', density: 1500, dry: 0.05, color: 0x888888 },
  antimatter: { name: 'Antihydrogen (Penning trap)', density: 70, dry: 3.0, color: 0x8844ff },
  water: { name: 'Water (salt solution)', density: 1100, dry: 0.08, color: 0x6688aa },
  jetfuel: { name: 'Jet-A kerosene', density: 800, dry: 0.1, color: 0xe8e8e8 },
};
// Propellant consumed per engine type
const ENGINE_PROP = { jetfuel: 'jetfuel', kerolox: 'kerolox', methalox: 'methalox', hydrolox: 'hydrolox', hypergolic: 'hypergolic', monoprop: 'monoprop', xenon: 'xenon', argon: 'argon', hydrogen: 'hydrogen', solid: 'solid', dhe3: 'dhe3', pulse: 'pulse', antimatter: 'antimatter', water: 'water' };

export const CATEGORIES = [
  ['pods', 'Command & Crew'], ['probes', 'Probe Cores'], ['tanks', 'Propellant Tanks'], ['engines', 'Engines'], ['boosters', 'Solid Boosters'],
  ['advanced', 'Advanced Propulsion'], ['interstellar', 'Interstellar'], ['coupling', 'Decouplers & Adapters'], ['aero', 'Aerodynamics'], ['planes', 'Aircraft'],
  ['control', 'Control & RCS'], ['landing', 'Landing & Recovery'], ['power', 'Power & Thermal'], ['comms', 'Communication'],
  ['science', 'Science'], ['utility', 'Habitation & Utility'],
];

const P = [];
const add = (p) => { P.push(p); return p; };

// ---------------------------------------------------------------- Command pods
add({ id: 'pod_mercury', cat: 'pods', name: 'Bean-1 Capsule', basis: 'Mercury spacecraft', mass: 1.35, cost: 3500, d: 1.9, dTop: 0.6, h: 2.9, crew: 1, torque: 5, mesh: { t: 'pod', style: 'mercury' }, heatshield: 1, monoprop: 0.05, battery: 3 });
add({ id: 'pod_gemini', cat: 'pods', name: 'Bean-2 Twin Capsule', basis: 'Gemini spacecraft', mass: 2.3, cost: 6000, d: 2.3, dTop: 0.9, h: 3.4, crew: 2, torque: 8, mesh: { t: 'pod', style: 'gemini' }, heatshield: 1, monoprop: 0.12, battery: 5 });
add({ id: 'pod_apollo', cat: 'pods', name: 'Odyssey Command Module', basis: 'Apollo CM', mass: 5.8, cost: 14000, d: 3.9, dTop: 0.85, h: 3.5, crew: 3, torque: 20, mesh: { t: 'pod', style: 'apollo' }, heatshield: 1, monoprop: 0.12, battery: 12 });
add({ id: 'pod_soyuz', cat: 'pods', name: 'Sokol Descent Module', basis: 'Soyuz descent module', mass: 2.95, cost: 8000, d: 2.17, dTop: 1.0, h: 2.24, crew: 3, torque: 10, mesh: { t: 'pod', style: 'soyuz' }, heatshield: 1, monoprop: 0.03, battery: 8 });
add({ id: 'pod_orion', cat: 'pods', name: 'Artemis Crew Capsule', basis: 'Orion MPCV', mass: 9.3, cost: 30000, d: 5.02, dTop: 1.3, h: 3.3, crew: 4, torque: 30, mesh: { t: 'pod', style: 'orion' }, heatshield: 1, monoprop: 0.2, battery: 20 });
add({ id: 'pod_dragon', cat: 'pods', name: 'Dragonfly Crew Capsule', basis: 'Crew Dragon (SuperDracos integrated)', mass: 9.5, cost: 26000, d: 4.0, dTop: 1.3, h: 4.4, crew: 4, torque: 30, mesh: { t: 'pod', style: 'dragon' }, heatshield: 1, monoprop: 1.3, battery: 20, abort: { thrust: 8 * 71, isp: 235 } });
add({ id: 'pod_starliner', cat: 'pods', name: 'Liner Crew Capsule', basis: 'CST-100 Starliner', mass: 10.0, cost: 27000, d: 4.56, dTop: 1.4, h: 5.0, crew: 5, torque: 30, mesh: { t: 'pod', style: 'starliner' }, heatshield: 1, monoprop: 0.9, battery: 20 });
add({ id: 'pod_lm', cat: 'pods', name: 'Lunar Excursion Cabin', basis: 'Apollo LM ascent stage', mass: 2.15, cost: 12000, d: 4.0, dTop: 2.0, h: 2.8, crew: 2, torque: 15, mesh: { t: 'pod', style: 'lm' }, monoprop: 0.29, battery: 10 });
add({ id: 'pod_starship', cat: 'pods', name: 'Starship-class Crew Nose', basis: 'SpaceX Starship crew section', mass: 40, cost: 90000, d: 9, dTop: 0.5, h: 20, crew: 100, torque: 400, mesh: { t: 'pod', style: 'starship' }, monoprop: 0, battery: 150, heatshield: 0.8, flaps: true });
add({ id: 'pod_cupola_hab', cat: 'pods', name: 'Bean Deep-Space Habitat Pod', basis: 'Gateway HALO-derived crew module', mass: 8, cost: 22000, d: 3.0, dTop: 3.0, h: 6.0, crew: 4, torque: 20, mesh: { t: 'hab', color: 0xe8e8e0 }, battery: 30 });

// ---------------------------------------------------------------- Probes
add({ id: 'probe_sputnik', cat: 'probes', name: 'PS-1 Sphere Core', basis: 'Sputnik 1', mass: 0.084, cost: 300, d: 0.58, h: 0.58, torque: 0.3, probe: true, mesh: { t: 'sphere', antennas: 4 }, battery: 1 });
add({ id: 'probe_cube', cat: 'probes', name: 'CubeSat 3U Core', basis: '3U CubeSat', mass: 0.004, cost: 150, d: 0.1, h: 0.34, torque: 0.01, probe: true, mesh: { t: 'box', w: 0.1, color: 0x222222, panels: true }, battery: 0.1 });
add({ id: 'probe_octo', cat: 'probes', name: 'Octagonal Guidance Unit', basis: 'Generic avionics ring', mass: 0.1, cost: 450, d: 0.625, h: 0.25, torque: 0.5, probe: true, mesh: { t: 'octo' }, battery: 2 });
add({ id: 'probe_ring', cat: 'probes', name: 'Avionics Ring 2.5m', basis: 'Launch-vehicle instrument unit (Saturn IU)', mass: 0.6, cost: 900, d: 2.5, h: 0.5, torque: 3, probe: true, mesh: { t: 'ring', color: 0xdedede }, battery: 5 });
add({ id: 'probe_voyager', cat: 'probes', name: 'Deep Probe Bus', basis: 'Voyager / Cassini bus', mass: 0.72, cost: 2500, d: 1.8, h: 0.5, torque: 2, probe: true, mesh: { t: 'bus', dish: 3.7, rtg: true }, battery: 5, power: 0.47, antennaRange: 3e13 });
add({ id: 'probe_lander', cat: 'probes', name: 'Venera Lander Core', basis: 'Venera lander pressure sphere', mass: 0.66, cost: 1500, d: 1.0, h: 1.4, torque: 1, probe: true, mesh: { t: 'sphere', antennas: 2 }, pressureTolerance: 10000, battery: 3 });

// ---------------------------------------------------------------- Tanks (generated from real stage diameters)
const TANK_SETS = [
  // [prefix, basis, prop, diameter, lengths[], color]
  ['Electron', 'Rocket Lab Electron (carbon composite)', 'kerolox', 1.2, [2, 6], 0x1a1a1a],
  ['Falcon', 'Falcon 9 stage tanks', 'kerolox', 3.66, [4, 12, 24, 36], 0xf2f2f2],
  ['Atlas', 'Atlas V CCB (RP-1)', 'kerolox', 3.81, [10, 25], 0xf0f0ea],
  ['Saturn S-IC', 'Saturn V S-IC', 'kerolox', 10.1, [10, 30], 0xf4f4f0],
  ['Soyuz', 'Soyuz core / strap-on', 'kerolox', 2.95, [6, 20], 0x9ba08a],
  ['Starship', 'Starship stainless tanks', 'methalox', 9, [6, 18, 36, 50], 0xbfc2c4],
  ['Neutron', 'Rocket Lab Neutron', 'methalox', 7.0, [10, 25], 0x1b1b1b],
  ['New Glenn', 'New Glenn GS1', 'methalox', 7.0, [15, 40], 0x2d2f33],
  ['Vulcan', 'Vulcan Centaur booster', 'methalox', 5.4, [10, 30], 0xe8e8e0],
  ['SLS Core', 'SLS core stage (orange foam)', 'hydrolox', 8.4, [16, 40, 64], 0xc86a26],
  ['Centaur', 'Centaur V upper stage', 'hydrolox', 5.4, [4, 10], 0xdcdcdc],
  ['S-IVB', 'Saturn S-IVB', 'hydrolox', 6.6, [8, 16], 0xf2f2f0],
  ['Ariane', 'Ariane 6 core (LH2)', 'hydrolox', 5.4, [12, 25], 0xebebe6],
  ['H-II', 'H3 first stage', 'hydrolox', 5.2, [12, 30], 0xf2f2f2],
  ['Small', 'Spacecraft propellant tank', 'hypergolic', 1.25, [0.8, 1.6], 0xd8d8d8],
  ['Service', 'Apollo SM / ESM-style bay', 'hypergolic', 3.9, [2, 4], 0xcfd2d6],
  ['Mini', 'Upper-stage kick tank', 'hypergolic', 0.625, [0.4, 0.8], 0xd8d8d8],
  ['Fuselage', 'Aircraft fuselage fuel tank', 'jetfuel', 1.25, [2, 4], 0xeeeeee],
  ['Wide Fuselage', 'Airliner fuselage fuel tank', 'jetfuel', 2.5, [4, 8], 0xeeeeee],
];
for (const [pre, basis, prop, d, lens, color] of TANK_SETS) {
  for (const L of lens) {
    const vol = Math.PI * (d / 2) ** 2 * L * 0.88;
    const pm = vol * PROPS[prop].density / 1000;
    add({ id: `tank_${pre.replace(/\W/g, '')}_${L}`, cat: 'tanks', name: `${pre} Tank ${d}m × ${L}m`, basis, mass: +(pm * PROPS[prop].dry).toFixed(3), cost: Math.round(200 + pm * 12), d, h: L, prop: { type: prop, mass: +pm.toFixed(2) }, mesh: { t: 'tank', color, prop } });
  }
}
// Special tanks
const special = [
  ['tank_xenon_s', 'Xenon Pressure Sphere', 'Dawn xenon tank (COPV)', 'xenon', 0.9, 0.9, 0.425, 0xc0c4c8, 'sphere'],
  ['tank_xenon_l', 'Xenon Tank Array 2.5m', 'Psyche-class xenon tanks', 'xenon', 2.5, 1.5, 3.0, 0xc0c4c8, 'multi'],
  ['tank_lh2_ntr', 'NTR Hydrogen Tank 7m', 'NASA DRA 5.0 in-line LH2 tank', 'hydrogen', 7.4, 20, null, 0xe6dfcc, 'tank'],
  ['tank_lh2_ntr_s', 'NTR Hydrogen Tank 3.75m', 'Scaled NERVA stage tank', 'hydrogen', 3.75, 12, null, 0xe6dfcc, 'tank'],
  ['tank_monoprop_r', 'Radial Hydrazine Tank', 'Spacecraft RCS tank', 'monoprop', 0.6, 1.0, null, 0xd0d0d0, 'radialtank'],
  ['tank_monoprop', 'Hydrazine Tank 1.25m', 'Spacecraft RCS tank', 'monoprop', 1.25, 0.6, null, 0xd0d0d0, 'tank'],
  ['tank_argon', 'Argon Tank 3.75m', 'VASIMR propellant tank', 'argon', 3.75, 4, null, 0xb8bcc0, 'tank'],
  ['tank_dhe3', 'D/He-3 Pellet Tank', 'Project Daedalus propellant tank', 'dhe3', 20, 20, 2000, 0xbfcad6, 'sphere'],
  ['tank_dhe3_s', 'D/He-3 Pellet Tank (small)', 'Project Icarus drop tank', 'dhe3', 10, 10, 250, 0xbfcad6, 'sphere'],
  ['tank_pulse', 'Pulse Unit Magazine', 'Project Orion charge magazine', 'pulse', 10, 12, 800, 0x6b6e70, 'tank'],
  ['tank_antimatter', 'Antimatter Penning Trap', 'AIMStar / beam-core concept', 'antimatter', 2.5, 3, 0.05, 0x3a3f55, 'trap'],
  ['tank_water', 'Salt-Water Tank 7m', 'Zubrin nuclear salt-water rocket', 'water', 7, 25, null, 0x6f8090, 'tank'],
];
for (const [id, name, basis, prop, d, h, pmFixed, color, shape] of special) {
  const vol = Math.PI * (d / 2) ** 2 * h * 0.88;
  const pm = pmFixed ?? vol * PROPS[prop].density / 1000;
  add({ id, cat: 'tanks', name, basis, mass: +(pm * PROPS[prop].dry).toFixed(3), cost: Math.round(500 + pm * 20), d, h, prop: { type: prop, mass: +pm.toFixed(3) }, radial: shape === 'radialtank', mesh: { t: shape === 'sphere' ? 'spheretank' : shape === 'multi' ? 'multitank' : shape === 'trap' ? 'trap' : shape === 'radialtank' ? 'radialtank' : 'tank', color, prop } });
}

// ---------------------------------------------------------------- Engines
// [id, name, basis, prop, thrustVac, thrustSL, ispVac, ispSL, mass, diameter(mount), height, nozzleExit, gimbal, nozzles, color, extra]
const ENG = [
  ['eng_merlin', 'Kestrel-9 Sea-Level Engine', 'Merlin 1D+', 'kerolox', 914, 845, 311, 282, 0.47, 1.25, 2.3, 0.92, 5, 1, 0x333333],
  ['eng_merlin9', 'Octaweb 9× Engine Cluster', 'Falcon 9 Octaweb (9× Merlin 1D+)', 'kerolox', 8226, 7605, 311, 282, 4.7, 3.66, 2.6, 0.92, 5, 9, 0x333333],
  ['eng_mvac', 'Kestrel-V Vacuum Engine', 'Merlin 1D Vacuum', 'kerolox', 981, 300, 348, 100, 0.49, 1.25, 4.5, 3.3, 5, 1, 0x2a2a2a],
  ['eng_raptor', 'Raptor-class Sea-Level Engine', 'Raptor 3', 'methalox', 2940, 2746, 350, 327, 1.525, 1.3, 3.1, 1.3, 15, 1, 0x555555],
  ['eng_raptor33', 'Super Heavy 33× Engine Array', 'Super Heavy booster (33× Raptor)', 'methalox', 97000, 90600, 350, 327, 55, 9, 4.0, 1.3, 15, 33, 0x555555],
  ['eng_rvac', 'Raptor-class Vacuum Engine', 'Raptor Vacuum', 'methalox', 2530, 900, 380, 150, 2.3, 2.3, 4.6, 2.3, 3, 1, 0x444444],
  ['eng_be4', 'Glennfire Engine', 'Blue Origin BE-4', 'methalox', 2700, 2450, 340, 310, 2.1, 1.8, 5.5, 1.5, 6, 1, 0x333333],
  ['eng_rs25', 'Orbiter Main Engine', 'RS-25 (SSME)', 'hydrolox', 2279, 1860, 452, 366, 3.527, 2.4, 4.3, 2.4, 10, 1, 0xdddddd],
  ['eng_rs25x4', 'SLS 4× Main Engine Cluster', 'SLS core stage (4× RS-25)', 'hydrolox', 9116, 7440, 452, 366, 14.1, 8.4, 4.5, 2.4, 10, 4, 0xdddddd],
  ['eng_rs68', 'Delta Heavy Engine', 'RS-68A', 'hydrolox', 3560, 3137, 414, 362, 6.7, 2.4, 5.2, 2.4, 6, 1, 0x333333],
  ['eng_j2', 'Saturn Upper Engine', 'Rocketdyne J-2', 'hydrolox', 1033, 486, 421, 200, 1.788, 2.0, 3.4, 2.0, 7, 1, 0x222222],
  ['eng_j2x5', 'S-II 5× J-2 Cluster', 'Saturn V S-II (5× J-2)', 'hydrolox', 5165, 2430, 421, 200, 8.9, 10.1, 3.4, 2.0, 7, 5, 0x222222],
  ['eng_f1', 'Colossus Engine', 'Rocketdyne F-1', 'kerolox', 7770, 6770, 304, 263, 8.4, 3.7, 5.8, 3.7, 6, 1, 0x1d1d1d],
  ['eng_f1x5', 'S-IC 5× F-1 Cluster', 'Saturn V S-IC (5× F-1)', 'kerolox', 38850, 33850, 304, 263, 42, 10.1, 6.0, 3.7, 6, 5, 0x1d1d1d],
  ['eng_rd180', 'Twin-Chamber Heavy Engine', 'RD-180', 'kerolox', 4150, 3830, 338, 311, 5.48, 3.2, 3.6, 1.4, 8, 2, 0x5b5040],
  ['eng_rd170', 'Quad-Chamber Heavy Engine', 'RD-170 (Energia/Zenit)', 'kerolox', 7900, 7550, 337, 309, 9.75, 3.9, 4.0, 1.4, 8, 4, 0x5b5040],
  ['eng_rd107', 'Korolev Cross Booster Engine', 'RD-107A (Soyuz)', 'kerolox', 1020, 839, 320, 263, 1.19, 2.0, 2.9, 0.7, 0, 4, 0x6c6250],
  ['eng_rd0124', 'Fregat-class Upper Engine', 'RD-0124', 'kerolox', 294, 100, 359, 150, 0.48, 1.25, 1.6, 0.9, 5, 4, 0x6c6250],
  ['eng_nk33', 'Lunar N1 Engine', 'NK-33', 'kerolox', 1680, 1510, 331, 297, 1.24, 1.5, 3.7, 1.5, 4, 1, 0x3e3e3e],
  ['eng_h1', 'Saturn IB Booster Engine', 'Rocketdyne H-1', 'kerolox', 1030, 947, 289, 263, 0.83, 1.5, 2.7, 1.2, 8, 1, 0x252525],
  ['eng_yf100', 'Long March Booster Engine', 'YF-100', 'kerolox', 1340, 1200, 335, 300, 2.1, 1.8, 4.1, 1.3, 5, 1, 0x2e2e2e],
  ['eng_rl10', 'Centaur Upper Engine', 'RL10C-1', 'hydrolox', 101.8, 20, 449.7, 150, 0.19, 1.25, 2.2, 1.45, 4, 1, 0xdcc080],
  ['eng_rl10b', 'Centaur Extended-Nozzle Engine', 'RL10B-2', 'hydrolox', 110, 10, 465.5, 100, 0.301, 1.25, 4.15, 2.15, 4, 1, 0xdcc080],
  ['eng_vulcain', 'Ariane Core Engine', 'Vulcain 2.1', 'hydrolox', 1359, 960, 434, 318, 2.1, 2.1, 3.7, 2.1, 6, 1, 0x7a7a7a],
  ['eng_vinci', 'Ariane Restartable Upper Engine', 'Vinci', 'hydrolox', 180, 30, 457, 150, 0.55, 1.25, 4.2, 2.2, 5, 1, 0x7a7a7a],
  ['eng_le7', 'H-series Core Engine', 'LE-9', 'hydrolox', 1471, 1100, 425, 330, 2.4, 2.4, 3.8, 1.8, 6, 1, 0x7a7a7a],
  ['eng_be3u', 'Glenn Upper Engine', 'BE-3U', 'hydrolox', 710, 200, 445, 180, 1.4, 2.0, 4.0, 2.0, 6, 1, 0x333333],
  ['eng_rutherford', 'Electric-Pump Mini Engine', 'Rutherford', 'kerolox', 25.8, 24.9, 343, 311, 0.035, 0.625, 0.9, 0.3, 5, 1, 0x333333],
  ['eng_rutherford9', 'Electron 9× Cluster', 'Electron first stage (9× Rutherford)', 'kerolox', 232, 224, 343, 311, 0.32, 1.2, 1.0, 0.3, 5, 9, 0x333333],
  ['eng_kestrel', 'Kestrel Pressure-Fed Engine', 'Kestrel (Falcon 1 upper)', 'kerolox', 31, 10, 317, 100, 0.052, 0.625, 1.1, 0.6, 0, 1, 0x999999],
  ['eng_archimedes', 'Archimedes Engine', 'Archimedes (Neutron)', 'methalox', 1100, 1000, 340, 320, 0.8, 1.25, 2.5, 1.0, 6, 1, 0x333333],
  ['eng_archimedes7', 'Neutron 7× Cluster', 'Neutron first stage (7× Archimedes)', 'methalox', 7700, 7000, 340, 320, 5.6, 7.0, 3.0, 1.0, 6, 7, 0x333333],
  ['eng_aj10', 'Service Propulsion Engine', 'AJ10 (Apollo SPS / Orion OMS-E)', 'hypergolic', 91, 20, 314, 150, 0.3, 1.25, 3.9, 2.5, 5, 1, 0xbfbfbf],
  ['eng_oms', 'Orbital Maneuvering Engine', 'AJ10-190 (Shuttle OMS)', 'hypergolic', 26.7, 10, 316, 150, 0.118, 0.625, 1.95, 1.2, 6, 1, 0x999999],
  ['eng_dps', 'Descent Throttleable Engine', 'Apollo LM Descent Engine (LMDE)', 'hypergolic', 45, 20, 311, 150, 0.18, 1.25, 1.6, 1.5, 6, 1, 0xa0a0a0, { throttleMin: 0.1 }],
  ['eng_aps', 'Ascent Fixed Engine', 'Apollo LM Ascent Engine', 'hypergolic', 16, 5, 311, 150, 0.1, 0.625, 1.2, 0.9, 0, 1, 0xa0a0a0],
  ['eng_r4d', 'Hypergolic Apogee Thruster', 'R-4D-15', 'hypergolic', 0.445, 0.1, 323, 100, 0.004, 0.3, 0.6, 0.15, 0, 1, 0xb0b0b0],
  ['eng_superdraco_r', 'Radial Abort Thruster Pod', 'SuperDraco (2× pod)', 'hypergolic', 142, 142, 240, 235, 0.08, 0.5, 1.2, 0.25, 0, 2, 0x888888, { radial: true }],
];
for (const e of ENG) {
  const [id, name, basis, prop, tv, ts, iv, is, mass, d, h, noz, gimbal, nozzles, color, extra = {}] = e;
  add({ id, cat: 'engines', name, basis, mass, cost: Math.round(500 + tv * 3), d, h, engine: { prop: ENGINE_PROP[prop], thrust: tv, thrustSL: ts, isp: iv, ispSL: is, gimbal, throttleMin: extra.throttleMin ?? (prop === 'solid' ? 1 : 0.4) }, radial: !!extra.radial, mesh: { t: 'engine', noz, nozzles, color, prop } });
}

// ---------------------------------------------------------------- Solid boosters
const SRB = [
  ['srb_shuttle', 'Shuttle Solid Rocket Booster', 'Space Shuttle RSRM', 14000, 12500, 268, 242, 88, 500, 3.71, 45.5],
  ['srb_sls', 'SLS 5-Segment Booster', 'SLS Five-Segment Booster', 16000, 14600, 269, 245, 99, 631, 3.71, 54],
  ['srb_gem63', 'GEM-63 Strap-On', 'Northrop GEM 63', 1663, 1500, 279, 250, 5.0, 44, 1.6, 20],
  ['srb_gem40', 'GEM-40 Strap-On', 'Delta II GEM 40', 499, 440, 274, 245, 1.3, 11.7, 1.02, 11],
  ['srb_p120', 'P120C Booster', 'Ariane 6 / Vega-C P120C', 4650, 4500, 279, 250, 13, 142, 3.4, 13.5],
  ['srb_castor4', 'Castor IV Sounding Motor', 'Thiokol Castor IVA', 478, 420, 266, 237, 1.4, 10.1, 1.02, 9.1],
  ['srb_blackbrant', 'Black Brant Sounding Motor', 'Bristol Aerospace Black Brant V', 80, 72, 255, 230, 0.28, 0.99, 0.625, 5.3],
  ['srb_castor30', 'Castor 30 Upper Solid', 'Castor 30XL', 474, 200, 294, 150, 1.4, 24.9, 2.34, 6],
  ['srb_star48', 'Star 48 Kick Motor', 'Star 48B (PAM-D)', 68, 20, 286, 150, 0.126, 2.0, 1.24, 2.0],
  ['srb_sep', 'Separation Motor', 'Booster separation motor', 80, 70, 250, 230, 0.03, 0.03, 0.4, 0.8],
  ['srb_ullage', 'Ullage Motor', 'Saturn S-IVB ullage motor', 15, 12, 250, 230, 0.03, 0.03, 0.3, 0.6],
];
for (const [id, name, basis, tv, ts, iv, is, dry, pm, d, h] of SRB) {
  const radial = id === 'srb_sep' || id === 'srb_ullage';
  add({ id, cat: 'boosters', name, basis, mass: dry, cost: Math.round(200 + pm * 30), d, h, radial, prop: { type: 'solid', mass: pm }, engine: { prop: 'solid', thrust: tv, thrustSL: ts, isp: iv, ispSL: is, gimbal: id.includes('shuttle') || id.includes('sls') ? 5 : 0, throttleMin: 1, solid: true }, mesh: { t: 'srb', color: id === 'srb_shuttle' || id === 'srb_sls' ? 0xefefef : 0xe6e6e6 } });
}

// ---------------------------------------------------------------- Advanced propulsion
add({ id: 'eng_nstar', cat: 'advanced', name: 'NSTAR Gridded Ion Engine', basis: 'NSTAR (Deep Space 1, Dawn)', mass: 0.0082, cost: 4000, d: 0.4, h: 0.4, engine: { prop: 'xenon', thrust: 0.092, thrustSL: 0.0, isp: 3100, ispSL: 100, gimbal: 0, throttleMin: 0, power: 2.3 }, mesh: { t: 'ion' } });
add({ id: 'eng_nextc', cat: 'advanced', name: 'NEXT-C Ion Engine', basis: 'NASA NEXT-C (DART)', mass: 0.0135, cost: 6000, d: 0.5, h: 0.45, engine: { prop: 'xenon', thrust: 0.236, thrustSL: 0, isp: 4190, ispSL: 100, gimbal: 0, throttleMin: 0, power: 6.9 }, mesh: { t: 'ion' } });
add({ id: 'eng_spt140', cat: 'advanced', name: 'SPT-140 Hall Thruster', basis: 'SPT-140 (Psyche)', mass: 0.0085, cost: 5000, d: 0.35, h: 0.3, engine: { prop: 'xenon', thrust: 0.28, thrustSL: 0, isp: 1800, ispSL: 100, gimbal: 0, throttleMin: 0, power: 4.5 }, mesh: { t: 'hall' } });
add({ id: 'eng_x3', cat: 'advanced', name: 'X3 Nested Hall Thruster', basis: 'University of Michigan X3', mass: 0.23, cost: 15000, d: 0.8, h: 0.5, engine: { prop: 'xenon', thrust: 5.4, thrustSL: 0, isp: 2650, ispSL: 100, gimbal: 0, throttleMin: 0, power: 100 }, mesh: { t: 'hall', big: true } });
add({ id: 'eng_vasimr', cat: 'advanced', name: 'VASIMR Plasma Engine', basis: 'Ad Astra VX-200', mass: 2.2, cost: 30000, d: 1.25, h: 3.0, engine: { prop: 'argon', thrust: 5.7, thrustSL: 0, isp: 5000, ispSL: 100, gimbal: 0, throttleMin: 0, power: 200 }, mesh: { t: 'vasimr' } });
add({ id: 'eng_mpd', cat: 'advanced', name: 'Lithium MPD Thruster', basis: 'Magnetoplasmadynamic thruster studies', mass: 1.5, cost: 25000, d: 1.25, h: 2.0, engine: { prop: 'argon', thrust: 25, thrustSL: 0, isp: 6000, ispSL: 100, gimbal: 0, throttleMin: 0, power: 1000 }, mesh: { t: 'vasimr' } });
add({ id: 'eng_nerva', cat: 'advanced', name: 'NERVA Nuclear Thermal Rocket', basis: 'NERVA XE', mass: 18.1, cost: 60000, d: 3.75, h: 6.9, engine: { prop: 'hydrogen', thrust: 246.6, thrustSL: 190, isp: 841, ispSL: 710, gimbal: 3, throttleMin: 0.3 }, mesh: { t: 'ntr', noz: 1.9 }, radiation: true });
add({ id: 'eng_timberwind', cat: 'advanced', name: 'Timberwind Particle-Bed NTR', basis: 'Timberwind 75 (SDI program)', mass: 2.7, cost: 50000, d: 1.9, h: 3.5, engine: { prop: 'hydrogen', thrust: 735, thrustSL: 600, isp: 1000, ispSL: 820, gimbal: 3, throttleMin: 0.3 }, mesh: { t: 'ntr', noz: 1.5 }, radiation: true });
add({ id: 'eng_nswr', cat: 'advanced', name: 'Nuclear Salt-Water Rocket', basis: 'Zubrin NSWR concept (1991)', mass: 33, cost: 120000, d: 7, h: 12, engine: { prop: 'water', thrust: 12900, thrustSL: 12000, isp: 6730, ispSL: 6000, gimbal: 2, throttleMin: 0.2 }, mesh: { t: 'ntr', noz: 5 }, radiation: true });
add({ id: 'eng_kilopower_ep', cat: 'advanced', name: 'Solar-Electric Propulsion Pod', basis: 'Gateway PPE (AEPS 12 kW Hall ×3)', mass: 5, cost: 20000, d: 3.0, h: 2.5, engine: { prop: 'xenon', thrust: 1.77, thrustSL: 0, isp: 2800, ispSL: 100, gimbal: 0, throttleMin: 0, power: 0 }, power: 60, mesh: { t: 'hall', big: true, panels: true } });

// ---------------------------------------------------------------- Interstellar
add({ id: 'isd_orion', cat: 'interstellar', name: 'Orion Nuclear Pulse Drive', basis: 'Project Orion (1958–65), 10 m pusher plate', mass: 300, cost: 800000, d: 10, h: 18, engine: { prop: 'pulse', thrust: 35000, thrustSL: 35000, isp: 6000, ispSL: 6000, gimbal: 0, throttleMin: 1 }, mesh: { t: 'pusher' }, radiation: true });
add({ id: 'isd_orion_big', cat: 'interstellar', name: 'Super Orion Pulse Drive', basis: 'Dyson interstellar Orion (heat-sink design)', mass: 4000, cost: 5e6, d: 20, h: 30, engine: { prop: 'pulse', thrust: 250000, thrustSL: 250000, isp: 30000, ispSL: 30000, gimbal: 0, throttleMin: 1 }, mesh: { t: 'pusher', big: true }, radiation: true });
add({ id: 'isd_daedalus', cat: 'interstellar', name: 'ICF Fusion Drive (Daedalus)', basis: 'Project Daedalus first stage, BIS 1978', mass: 1690, cost: 9e6, d: 30, h: 40, engine: { prop: 'dhe3', thrust: 7540, thrustSL: 0, isp: 1.08e6, ispSL: 1, gimbal: 0, throttleMin: 1 }, mesh: { t: 'fusion', size: 1 }, radiation: true });
add({ id: 'isd_daedalus2', cat: 'interstellar', name: 'ICF Fusion Drive Mk2 (Daedalus 2nd stage)', basis: 'Project Daedalus second stage', mass: 980, cost: 5e6, d: 16, h: 24, engine: { prop: 'dhe3', thrust: 663, thrustSL: 0, isp: 0.94e6, ispSL: 1, gimbal: 0, throttleMin: 1 }, mesh: { t: 'fusion', size: 0.55 }, radiation: true });
add({ id: 'isd_firefly', cat: 'interstellar', name: 'Z-Pinch Fusion Drive', basis: 'Project Icarus "Firefly" (2013)', mass: 450, cost: 4e6, d: 12, h: 30, engine: { prop: 'dhe3', thrust: 1500, thrustSL: 0, isp: 1.0e6, ispSL: 1, gimbal: 0, throttleMin: 0.5 }, mesh: { t: 'fusion', size: 0.45, zpinch: true }, radiation: true });
add({ id: 'isd_antimatter', cat: 'interstellar', name: 'Antimatter Beam-Core Engine', basis: 'Beam-core propulsion (Frisbee, 2003)', mass: 120, cost: 2e7, d: 8, h: 25, engine: { prop: 'antimatter', thrust: 400, thrustSL: 0, isp: 1.0e7, ispSL: 1, gimbal: 0, throttleMin: 0.1 }, mesh: { t: 'fusion', size: 0.3, beam: true }, radiation: true });
add({ id: 'isd_bussard', cat: 'interstellar', name: 'Bussard Ramscoop', basis: 'Bussard interstellar ramjet (1960) — theoretical', mass: 900, cost: 2.5e7, d: 40, h: 20, engine: { prop: null, ramjet: true, thrust: 2000, thrustSL: 0, isp: 1e7, ispSL: 1, gimbal: 0, throttleMin: 0 }, mesh: { t: 'scoop' }, theoretical: true });
add({ id: 'isd_solarsail', cat: 'interstellar', name: 'Solar Sail 20 m', basis: 'IKAROS (JAXA, 2010)', mass: 0.31, cost: 3000, d: 1.6, h: 0.5, sail: { area: 196 }, mesh: { t: 'sail', size: 20 } });
add({ id: 'isd_solarsail_l', cat: 'interstellar', name: 'Solar Sail 120 m', basis: 'Sunjammer (NASA TDM, planned)', mass: 3.2, cost: 12000, d: 2.5, h: 1.0, sail: { area: 1200 * 12 }, mesh: { t: 'sail', size: 120 } });
add({ id: 'isd_lightsail', cat: 'interstellar', name: 'Laser Light Sail', basis: 'Breakthrough Starshot (2016) — beamed 100 GW array', mass: 0.001, cost: 50000, d: 0.1, h: 0.05, sail: { area: 16, laser: 1e11 }, mesh: { t: 'sail', size: 4, laser: true } });
add({ id: 'isd_magsail', cat: 'interstellar', name: 'Magnetic Sail (Magsail)', basis: 'Zubrin & Andrews magsail (1991)', mass: 40, cost: 150000, d: 5, h: 2, magsail: { radius: 50000 }, mesh: { t: 'magsail' } });
add({ id: 'isd_warp', cat: 'interstellar', name: 'Alcubierre Warp Field Experiment', basis: 'Alcubierre metric (1994) — requires exotic matter. SANDBOX ONLY', mass: 800, cost: 1e8, d: 12, h: 10, warp: { max: 1000 }, mesh: { t: 'warp' }, theoretical: true });
add({ id: 'isd_cryo', cat: 'interstellar', name: 'Cryostasis Pod Bay', basis: 'NASA/SpaceWorks torpor habitat study (2014)', mass: 12, cost: 60000, d: 5, h: 6, crew: 12, cryo: true, mesh: { t: 'hab', color: 0xa8c0d0, windows: 0 } });
add({ id: 'isd_ring', cat: 'interstellar', name: 'Rotating Generation Habitat', basis: 'Stanford torus / O\'Neill-derived spin habitat', mass: 2400, cost: 3e7, d: 60, h: 10, crew: 1000, torque: 200, mesh: { t: 'torus', r: 30 } });
add({ id: 'isd_shield', cat: 'interstellar', name: 'Interstellar Dust Shield', basis: 'Daedalus beryllium erosion shield', mass: 50, cost: 40000, d: 30, h: 1, mesh: { t: 'shield' } });
add({ id: 'isd_radiator', cat: 'interstellar', name: 'Heat Radiator Array', basis: 'ISS EATCS radiators (scaled)', mass: 5, cost: 8000, d: 1, h: 12, radial: true, mesh: { t: 'radiator' } });

// ---------------------------------------------------------------- Decouplers & adapters
for (const d of [0.625, 1.25, 2.5, 3.75, 5.4, 7, 9, 10.1]) {
  add({ id: `dec_${d}`, cat: 'coupling', name: `Stage Separator ${d}m`, basis: 'Pneumatic / pyrotechnic separation joint', mass: +(0.02 * d * d).toFixed(3), cost: 100 + d * 80, d, h: Math.max(0.2, d * 0.08), decoupler: 'axial', mesh: { t: 'decoupler' } });
}
add({ id: 'dec_interstage', cat: 'coupling', name: 'Hot-Staging Interstage 9m', basis: 'Starship vented hot-stage ring', mass: 9, cost: 3000, d: 9, h: 2, decoupler: 'axial', mesh: { t: 'interstage' } });
add({ id: 'dec_radial', cat: 'coupling', name: 'Radial Decoupler', basis: 'Strap-on booster attach struts', mass: 0.05, cost: 300, d: 0.5, h: 1.2, radial: true, decoupler: 'radial', mesh: { t: 'radialdec' } });
add({ id: 'dec_radial_l', cat: 'coupling', name: 'Heavy Radial Decoupler', basis: 'Shuttle SRB / Falcon Heavy attach', mass: 0.4, cost: 800, d: 1.0, h: 2.5, radial: true, decoupler: 'radial', mesh: { t: 'radialdec' } });
for (const [a, b] of [[0.625, 1.25], [1.25, 2.5], [2.5, 3.75], [3.75, 5.4], [5.4, 7], [7, 9], [3.66, 5.2], [9, 10.1], [1.25, 3.66], [8.4, 5.4]]) {
  add({ id: `adapt_${a}_${b}`, cat: 'coupling', name: `Adapter ${a}m → ${b}m`, basis: 'Conical interstage adapter', mass: +(0.05 * (a + b)).toFixed(3), cost: 200, d: a, d2: b, h: Math.abs(b - a) * 0.9 + 0.4, mesh: { t: 'adapter' } });
}
add({ id: 'struct_truss', cat: 'coupling', name: 'Truss Segment 3m', basis: 'ISS Integrated Truss', mass: 1.2, cost: 400, d: 3, h: 5, mesh: { t: 'truss' } });
add({ id: 'struct_truss_s', cat: 'coupling', name: 'Truss Segment 1.25m', basis: 'Lattice spacer', mass: 0.1, cost: 120, d: 1.25, h: 2, mesh: { t: 'truss' } });

// ---------------------------------------------------------------- Aero
for (const d of [0.625, 1.25, 2.5, 3.75, 5.4]) add({ id: `nose_${d}`, cat: 'aero', name: `Ogive Nose Cone ${d}m`, basis: 'Tangent ogive nose', mass: +(0.025 * d * d).toFixed(3), cost: 80, d: 0, d2: d, h: d * 1.6, drag: -0.3, mesh: { t: 'nose' } });
add({ id: 'fairing_2', cat: 'aero', name: 'Payload Fairing 2.5m', basis: 'Delta II fairing', mass: 0.8, cost: 600, d: 0, d2: 2.5, h: 7, fairing: true, drag: -0.3, mesh: { t: 'fairing' } });
add({ id: 'fairing_5', cat: 'aero', name: 'Payload Fairing 5.2m', basis: 'Falcon 9 fairing', mass: 1.9, cost: 1800, d: 0, d2: 5.2, h: 13.1, fairing: true, drag: -0.3, mesh: { t: 'fairing' } });
add({ id: 'fairing_8', cat: 'aero', name: 'Payload Fairing 8.4m', basis: 'SLS Block 2 cargo fairing', mass: 6, cost: 4000, d: 0, d2: 8.4, h: 27, fairing: true, drag: -0.3, mesh: { t: 'fairing' } });
// Lifting surfaces share one planform description: span (outwards), root and tip chord, and how far the tip's
// leading edge sits behind the root's. The root is centred on the attach point. ac = aerodynamic centre (quarter
// chord of the mean chord), ctrl = movable fraction (ailerons, rudder; 1 = all-moving), defl = max deflection (rad),
// inc = incidence (rad) toward the aircraft's top (+Z; the gear side, -Z, is the belly): wings sit nose-up of the tail
// so a plane trims to fly level instead of needing constant stick.
export function wingData(span, root, tip, sweep, o = {}) {
  const xc = span * (root + 2 * tip) / (3 * (root + tip)), cx = root + (tip - root) * xc / span, le = root / 2 - sweep * xc / span;
  return { span, root, tip, sweep, area: +(span * (root + tip) / 2).toFixed(2), ac: [+xc.toFixed(3), +(le - cx / 4).toFixed(3)], ctrl: 0, defl: 0.3, ...o };
}
add({ id: 'fin_delta', cat: 'aero', name: 'Delta Fin', basis: 'Sounding-rocket stabiliser fin', mass: 0.05, cost: 60, d: 0.1, h: 1.6, radial: true, fin: 1, wing: wingData(0.9, 1.6, 0.56, 0.8), mesh: { t: 'fin' } });
add({ id: 'fin_large', cat: 'aero', name: 'Large Stabiliser Fin', basis: 'Saturn V S-IC fin', mass: 0.6, cost: 300, d: 0.3, h: 4.5, radial: true, fin: 4, wing: wingData(2.5, 4.5, 1.575, 2.25), mesh: { t: 'fin', big: true } });
add({ id: 'fin_grid', cat: 'aero', name: 'Titanium Grid Fin', basis: 'Falcon 9 grid fin', mass: 0.1, cost: 400, d: 0.2, h: 0.4, radial: true, wing: { ...wingData(1.4, 1.2, 1.2, 0), grid: true, ctrl: 1, defl: 0.35, area: 1.44, ac: [0.8, 0] }, mesh: { t: 'gridfin' } });
add({ id: 'fin_flap', cat: 'aero', name: 'Body Flap', basis: 'Starship forward/aft flap', mass: 1.5, cost: 1200, d: 0.3, h: 9, radial: true, fin: 8, mesh: { t: 'flap' } });

// ---------------------------------------------------------------- Aircraft
add({ id: 'pod_cockpit', cat: 'planes', name: 'Bean Jet Cockpit', basis: 'Single-seat fighter nose (F-16-style bubble canopy)', mass: 1.0, cost: 3000, d: 1.25, dTop: 0.15, h: 3.4, crew: 1, torque: 4, mesh: { t: 'cockpit' }, battery: 3 });
add({ id: 'pod_cockpit_l', cat: 'planes', name: 'Airliner Flight Deck', basis: 'Boeing 737 nose section', mass: 3.2, cost: 9000, d: 2.5, dTop: 0.3, h: 5, crew: 4, torque: 10, mesh: { t: 'cockpit', airliner: true }, battery: 8 });
add({ id: 'pod_orbiter', cat: 'planes', name: 'Orbiter Flight Deck', basis: 'Space Shuttle orbiter forward fuselage', mass: 7, cost: 30000, d: 5.2, dTop: 0.7, h: 8, crew: 5, torque: 30, heatTol: 30, monoprop: 0.4, mesh: { t: 'cockpit', orbiter: true }, battery: 25 });
add({ id: 'wing_small', cat: 'planes', name: 'Swept Wing', basis: 'Learjet 45 wing (half-span)', mass: 0.3, cost: 500, d: 0.2, h: 2.2, radial: true, wing: wingData(4.5, 2.2, 1.0, 1.2, { ctrl: 0.22, defl: 0.35, inc: 0.05 }), mesh: { t: 'wing', color: 0xf2f2f2 } });
add({ id: 'wing_large', cat: 'planes', name: 'Airliner Wing', basis: 'Boeing 737 wing (half-span)', mass: 2.6, cost: 3500, d: 0.4, h: 5.5, radial: true, wing: wingData(14, 5.5, 1.4, 5.5, { ctrl: 0.15, defl: 0.3, inc: 0.05 }), mesh: { t: 'wing', color: 0xe8ecf0 } });
add({ id: 'wing_delta', cat: 'planes', name: 'Orbiter Delta Wing', basis: 'Space Shuttle orbiter wing (half-span), RCC leading edge', mass: 6.5, cost: 12000, d: 0.6, h: 18, radial: true, heatTol: 30, wing: wingData(10, 18, 2.5, 14, { ctrl: 0.18, defl: 0.35, inc: 0.035 }), mesh: { t: 'wing', color: 0x222222, tile: true } });
add({ id: 'wing_delta_s', cat: 'planes', name: 'Small Delta Wing', basis: 'Dream Chaser-class lifting-body wing', mass: 0.6, cost: 2500, d: 0.3, h: 5, radial: true, heatTol: 20, wing: wingData(3, 5, 1, 3.6, { ctrl: 0.2, defl: 0.35, inc: 0.035 }), mesh: { t: 'wing', color: 0x222222, tile: true } });
add({ id: 'canard', cat: 'planes', name: 'All-Moving Canard', basis: 'Eurofighter Typhoon foreplane', mass: 0.06, cost: 600, d: 0.1, h: 1.5, radial: true, wing: wingData(1.6, 1.5, 0.6, 1.0, { ctrl: 1, defl: 0.35 }), mesh: { t: 'wing', color: 0xd8d8d8 } });
add({ id: 'tailplane', cat: 'planes', name: 'All-Moving Tailplane', basis: 'F-16 horizontal stabiliser', mass: 0.15, cost: 700, d: 0.15, h: 2.2, radial: true, wing: wingData(2.8, 2.2, 0.9, 1.4, { ctrl: 1, defl: 0.3, inc: -0.02 }), mesh: { t: 'wing', color: 0xe0e0e0 } });
add({ id: 'tail_fin', cat: 'planes', name: 'Vertical Tail + Rudder', basis: 'Learjet 45 fin and rudder', mass: 0.15, cost: 600, d: 0.15, h: 3, radial: true, wing: wingData(2.8, 3, 1.3, 2.0, { ctrl: 0.35, defl: 0.45 }), mesh: { t: 'wing', color: 0xf2f2f2, stripe: true } });
add({ id: 'tail_orbiter', cat: 'planes', name: 'Orbiter Tail + Rudder', basis: 'Space Shuttle vertical stabiliser', mass: 1.5, cost: 5000, d: 0.3, h: 9, radial: true, heatTol: 25, wing: wingData(7, 9, 3.5, 6.5, { ctrl: 0.3, defl: 0.45 }), mesh: { t: 'wing', color: 0xeeeeee } });
add({ id: 'gear_nose', cat: 'planes', name: 'Steerable Nose Gear', basis: 'Learjet nose landing gear', mass: 0.06, cost: 400, d: 0.3, h: 0.5, radial: true, gear: { len: 1.95, wheelR: 0.28, steer: true, spread: 0 , tol: 12 }, mesh: { t: 'gear' } });
add({ id: 'gear_main', cat: 'planes', name: 'Main Landing Gear (pair)', basis: 'Learjet main landing gear', mass: 0.2, cost: 800, d: 0.4, h: 0.6, radial: true, gear: { len: 1.6, wheelR: 0.36, spread: 1.4, brake: true , tol: 12 }, mesh: { t: 'gear' } });
add({ id: 'gear_heavy', cat: 'planes', name: 'Heavy Main Gear (pair)', basis: 'Space Shuttle main landing gear', mass: 1.3, cost: 3000, d: 0.8, h: 1.2, radial: true, heatTol: 20, gear: { len: 2.6, wheelR: 0.58, spread: 2.6, brake: true , tol: 14 }, mesh: { t: 'gear', heavy: true } });
add({ id: 'gear_nose_l', cat: 'planes', name: 'Heavy Nose Gear', basis: 'Space Shuttle nose landing gear', mass: 0.5, cost: 1500, d: 0.6, h: 1, radial: true, heatTol: 20, gear: { len: 3.6, wheelR: 0.5, steer: true, spread: 0.3 , tol: 14 }, mesh: { t: 'gear', heavy: true } });
// jets breathe air: thrust falls with density, and each has a top speed. isp here is per unit of fuel burned
add({ id: 'eng_j85', cat: 'planes', name: 'Small Afterburning Turbojet', basis: 'GE J85-21 (F-5, T-38)', mass: 0.31, cost: 2500, d: 0.625, h: 2.7, engine: { prop: 'jetfuel', air: { mach: 1.9 }, thrust: 22, thrustSL: 22, isp: 1900, ispSL: 1900, gimbal: 0, throttleMin: 0.05 }, mesh: { t: 'jet' } });
add({ id: 'eng_f404', cat: 'planes', name: 'Afterburning Turbofan', basis: 'GE F404 (F/A-18)', mass: 1.04, cost: 7000, d: 1.25, h: 4, engine: { prop: 'jetfuel', air: { mach: 2.2 }, thrust: 79, thrustSL: 79, isp: 1800, ispSL: 1800, gimbal: 0, throttleMin: 0.05 }, mesh: { t: 'jet' } });
add({ id: 'eng_cfm56', cat: 'planes', name: 'High-Bypass Turbofan', basis: 'CFM56-7B (Boeing 737)', mass: 2.4, cost: 9000, d: 2.5, h: 3.5, engine: { prop: 'jetfuel', air: { mach: 0.95, bypass: true }, thrust: 120, thrustSL: 120, isp: 6000, ispSL: 6000, gimbal: 0, throttleMin: 0.05 }, mesh: { t: 'jet', fan: true } });
add({ id: 'eng_sabre', cat: 'planes', name: 'Hybrid Air-Breathing Rocket', basis: 'Reaction Engines SABRE (Skylon concept)', mass: 7, cost: 60000, d: 2.5, h: 10, engine: { prop: 'hydrolox', air: { mach: 5.4, hybrid: true, thrust: 2000, isp: 3600 }, thrust: 2940, thrustSL: 2400, isp: 460, ispSL: 400, gimbal: 5, throttleMin: 0.1 }, mesh: { t: 'jet', sabre: true } });

// ---------------------------------------------------------------- Control
add({ id: 'rcs_quad', cat: 'control', name: 'Quad RCS Block', basis: 'Apollo SM RCS quad', mass: 0.03, cost: 250, d: 0.3, h: 0.4, radial: true, rcs: { thrust: 0.445, isp: 290 }, mesh: { t: 'rcs' } });
add({ id: 'rcs_draco', cat: 'control', name: 'Draco Thruster Block', basis: 'SpaceX Draco', mass: 0.02, cost: 300, d: 0.3, h: 0.3, radial: true, rcs: { thrust: 0.4, isp: 300 }, mesh: { t: 'rcs' } });
add({ id: 'rcs_n2', cat: 'control', name: 'Cold-Gas Thrusters', basis: 'Falcon 9 nitrogen cold gas', mass: 0.03, cost: 150, d: 0.3, h: 0.3, radial: true, rcs: { thrust: 0.9, isp: 70 }, mesh: { t: 'rcs' } });
add({ id: 'rw_small', cat: 'control', name: 'Reaction Wheel Assembly', basis: 'Honeywell HR16 reaction wheels', mass: 0.05, cost: 400, d: 0.625, h: 0.25, torque: 3, mesh: { t: 'ring', color: 0x444444 } });
add({ id: 'rw_large', cat: 'control', name: 'Control Moment Gyroscope Ring', basis: 'ISS CMGs', mass: 1.2, cost: 3000, d: 2.5, h: 0.6, torque: 40, mesh: { t: 'ring', color: 0x666666 } });
add({ id: 'rw_huge', cat: 'control', name: 'Heavy CMG Array', basis: 'Skylab ATM CMG cluster (scaled)', mass: 6, cost: 12000, d: 7, h: 1.2, torque: 400, mesh: { t: 'ring', color: 0x555555 } });

// ---------------------------------------------------------------- Landing & recovery
add({ id: 'chute_drogue', cat: 'landing', name: 'Drogue Parachute', basis: 'Apollo drogue (5 m)', mass: 0.05, cost: 200, d: 0.625, h: 0.4, chute: { area: 20, cd: 1.2, drogue: true }, mesh: { t: 'chute' } });
add({ id: 'chute_main', cat: 'landing', name: 'Main Parachute', basis: 'Apollo main (25.4 m)', mass: 0.12, cost: 400, d: 1.25, h: 0.5, chute: { area: 506, cd: 0.9 }, mesh: { t: 'chute' } });
add({ id: 'chute_cluster', cat: 'landing', name: 'Parachute Cluster (×3)', basis: 'Apollo / Orion three-main cluster', mass: 0.35, cost: 900, d: 2.5, h: 0.7, chute: { area: 1520, cd: 0.9 }, mesh: { t: 'chute' } });
add({ id: 'chute_radial', cat: 'landing', name: 'Radial Parachute', basis: 'Booster-recovery chute', mass: 0.1, cost: 300, d: 0.4, h: 0.8, radial: true, chute: { area: 300, cd: 0.9 }, mesh: { t: 'chute', radial: true } });
add({ id: 'chute_super', cat: 'landing', name: 'Supersonic Ringsail', basis: 'Mars 2020 disk-gap-band (21.5 m)', mass: 0.08, cost: 1500, d: 1.0, h: 0.5, chute: { area: 363, cd: 0.6, supersonic: true }, mesh: { t: 'chute' } });
add({ id: 'legs_small', cat: 'landing', name: 'Landing Leg', basis: 'Surveyor landing leg', mass: 0.05, cost: 250, d: 0.3, h: 1.2, radial: true, legs: 12, mesh: { t: 'leg' } });
add({ id: 'legs_lm', cat: 'landing', name: 'Lander Leg', basis: 'Apollo LM landing gear', mass: 0.15, cost: 600, d: 0.5, h: 3.0, radial: true, legs: 10, mesh: { t: 'leg', lm: true } });
add({ id: 'legs_f9', cat: 'landing', name: 'Booster Landing Leg', basis: 'Falcon 9 carbon/aluminium leg', mass: 0.6, cost: 1500, d: 0.6, h: 9, radial: true, legs: 10, mesh: { t: 'leg', f9: true } });
for (const d of [1.25, 2.5, 3.9, 5.0]) add({ id: `heat_${d}`, cat: 'landing', name: `Ablative Heat Shield ${d}m`, basis: d === 5.0 ? 'Orion AVCOAT shield' : 'PICA / AVCOAT ablator', mass: +(0.07 * d * d).toFixed(3), cost: 300 * d, d, h: 0.3, heatshield: 1, mesh: { t: 'heatshield' } });
add({ id: 'heat_hiad', cat: 'landing', name: 'Inflatable Decelerator 6m', basis: 'LOFTID (HIAD)', mass: 1.0, cost: 5000, d: 1.25, h: 0.8, heatshield: 1, hiad: 6, mesh: { t: 'heatshield', hiad: true } });
add({ id: 'clamp', cat: 'landing', name: 'Launch Clamp Tower', basis: 'Saturn V hold-down arm', mass: 0.1, cost: 0, d: 0.5, h: 4, radial: true, clamp: true, mesh: { t: 'clamp' } });
add({ id: 'les_tower', cat: 'landing', name: 'Launch Escape Tower', basis: 'Apollo LES', mass: 4.2, cost: 2000, d: 0, d2: 1.0, h: 10, prop: { type: 'solid', mass: 1.5 }, engine: { prop: 'solid', thrust: 667, thrustSL: 667, isp: 200, ispSL: 200, gimbal: 0, throttleMin: 1, solid: true, abort: true }, mesh: { t: 'les' } });

// ---------------------------------------------------------------- Power & thermal
add({ id: 'solar_fixed', cat: 'power', name: 'Body-Mounted Solar Panel', basis: 'Sputnik-3 / cubesat panel', mass: 0.005, cost: 80, d: 0.1, h: 0.6, radial: true, power: 0.05, solar: true, mesh: { t: 'panel', w: 0.6, l: 0.6 } });
add({ id: 'solar_juno', cat: 'power', name: 'Deployable Solar Wing', basis: 'Juno solar array (single wing)', mass: 0.12, cost: 900, d: 0.3, h: 1.0, radial: true, power: 0.5, solar: true, mesh: { t: 'panel', w: 2.7, l: 8.9, deploy: true } });
add({ id: 'solar_iss', cat: 'power', name: 'Photovoltaic Array Wing', basis: 'ISS solar array wing', mass: 1.1, cost: 5000, d: 0.5, h: 2, radial: true, power: 31, solar: true, mesh: { t: 'panel', w: 11.6, l: 35, deploy: true } });
add({ id: 'solar_rosa', cat: 'power', name: 'Roll-Out Solar Array', basis: 'iROSA', mass: 0.33, cost: 3000, d: 0.4, h: 1.5, radial: true, power: 20, solar: true, mesh: { t: 'panel', w: 6, l: 18.3, deploy: true, rosa: true } });
add({ id: 'rtg', cat: 'power', name: 'Radioisotope Generator', basis: 'MMRTG (Curiosity/Perseverance)', mass: 0.045, cost: 8000, d: 0.64, h: 0.66, radial: true, power: 0.11, mesh: { t: 'rtg' } });
add({ id: 'battery_s', cat: 'power', name: 'Li-ion Battery Pack', basis: 'ISS Li-ion ORU', mass: 0.2, cost: 200, d: 1.25, h: 0.2, battery: 5, mesh: { t: 'ring', color: 0x3a3a30 } });
add({ id: 'battery_l', cat: 'power', name: 'Battery Bank 2.5m', basis: 'ESM battery module', mass: 1.0, cost: 800, d: 2.5, h: 0.4, battery: 30, mesh: { t: 'ring', color: 0x3a3a30 } });
add({ id: 'fuelcell', cat: 'power', name: 'H2/O2 Fuel Cell', basis: 'Apollo / Shuttle fuel cell', mass: 0.12, cost: 600, d: 1.25, h: 0.5, power: 7, mesh: { t: 'ring', color: 0xcccccc } });
add({ id: 'kilopower', cat: 'power', name: 'Kilopower Fission Reactor', basis: 'NASA KRUSTY / Kilopower 10 kWe', mass: 1.5, cost: 25000, d: 1.25, h: 4, power: 10, mesh: { t: 'reactor' }, radiation: true });
add({ id: 'reactor_mw', cat: 'power', name: 'Megawatt Space Reactor', basis: 'SP-100 / Prometheus JIMO class', mass: 20, cost: 120000, d: 3.75, h: 8, power: 1000, mesh: { t: 'reactor', big: true }, radiation: true });
add({ id: 'reactor_fusion', cat: 'power', name: 'Compact Fusion Power Core', basis: 'Direct Fusion Drive (Princeton PFRC) power mode', mass: 10, cost: 200000, d: 3.75, h: 6, power: 2000, mesh: { t: 'reactor', fusion: true } });
add({ id: 'radiator_s', cat: 'power', name: 'Radiator Panel', basis: 'Spacecraft radiator', mass: 0.05, cost: 150, d: 0.1, h: 2, radial: true, mesh: { t: 'radiator', small: true } });

// ---------------------------------------------------------------- Communication
add({ id: 'ant_whip', cat: 'comms', name: 'Whip Antenna', basis: 'VHF whip antenna', mass: 0.005, cost: 50, d: 0.05, h: 1.2, radial: true, antennaRange: 5e6, mesh: { t: 'whip' } });
add({ id: 'ant_patch', cat: 'comms', name: 'S-Band Omni', basis: 'S-band low-gain antenna', mass: 0.01, cost: 120, d: 0.2, h: 0.2, radial: true, antennaRange: 1e8, mesh: { t: 'box', w: 0.2, color: 0xcccccc } });
add({ id: 'ant_hga', cat: 'comms', name: 'High-Gain Dish 2m', basis: 'Galileo / MRO HGA', mass: 0.09, cost: 1200, d: 0.5, h: 0.8, radial: true, antennaRange: 5e11, mesh: { t: 'dish', size: 2 } });
add({ id: 'ant_hga_l', cat: 'comms', name: 'Deep-Space Dish 3.7m', basis: 'Voyager HGA', mass: 0.1, cost: 3000, d: 0.6, h: 1.2, radial: true, antennaRange: 3e13, mesh: { t: 'dish', size: 3.7 } });
add({ id: 'ant_laser', cat: 'comms', name: 'Optical Laser Terminal', basis: 'Psyche DSOC', mass: 0.03, cost: 5000, d: 0.3, h: 0.4, radial: true, antennaRange: 5e14, mesh: { t: 'laser' } });
add({ id: 'ant_interstellar', cat: 'comms', name: 'Interstellar Beacon Array', basis: 'Starshot optical downlink study', mass: 5, cost: 80000, d: 3, h: 3, antennaRange: 1e17, mesh: { t: 'dish', size: 10 } });

// ---------------------------------------------------------------- Science
const SCI = [
  ['sci_thermo', 'Thermometer', 'Viking meteorology boom', 'temperature'], ['sci_baro', 'Barometer', 'Pathfinder ASI/MET', 'pressure'],
  ['sci_mag', 'Magnetometer Boom', 'Juno MAG', 'magnetic'], ['sci_geiger', 'Geiger Counter', 'Explorer 1 cosmic-ray detector', 'radiation'],
  ['sci_spec', 'Imaging Spectrometer', 'CRISM (MRO)', 'spectra'], ['sci_camera', 'HiRISE-class Camera', 'HiRISE', 'imaging'],
  ['sci_seis', 'Seismometer', 'InSight SEIS', 'seismic'], ['sci_ms', 'Mass Spectrometer', 'Rosetta ROSINA', 'composition'],
  ['sci_grav', 'Gravimeter', 'GRACE accelerometer', 'gravity'], ['sci_dust', 'Dust Analyzer', 'Cassini CDA', 'dust'],
  ['sci_radar', 'Ground-Penetrating Radar', 'MARSIS / RIMFAX', 'subsurface'], ['sci_lidar', 'Laser Altimeter', 'LOLA', 'topography'],
];
for (const [id, name, basis, kind] of SCI) add({ id, cat: 'science', name, basis, mass: 0.02, cost: 300, d: 0.3, h: 0.4, radial: true, science: kind, mesh: { t: 'science', kind } });
add({ id: 'sci_telescope', cat: 'science', name: 'Space Telescope Assembly', basis: 'Hubble OTA (2.4 m mirror)', mass: 11, cost: 90000, d: 4.2, h: 13, science: 'astronomy', mesh: { t: 'telescope' } });
add({ id: 'sci_jwst', cat: 'science', name: 'Segmented IR Observatory', basis: 'JWST (6.5 m, sunshield)', mass: 6.2, cost: 200000, d: 4.5, h: 8, science: 'infrared', mesh: { t: 'jwst' } });
add({ id: 'sci_sample', cat: 'science', name: 'Sample Return Capsule', basis: 'OSIRIS-REx SRC', mass: 0.046, cost: 2000, d: 0.81, h: 0.5, heatshield: 1, science: 'sample', mesh: { t: 'pod', style: 'src' } });
add({ id: 'sci_lab', cat: 'science', name: 'Orbital Laboratory Module', basis: 'ISS Destiny lab', mass: 14.5, cost: 40000, d: 4.3, h: 8.5, crew: 3, science: 'lab', mesh: { t: 'hab', color: 0xe8e8e0, windows: 1 } });

// ---------------------------------------------------------------- Habitation & utility
add({ id: 'hab_beam', cat: 'utility', name: 'Inflatable Habitat', basis: 'Bigelow BEAM', mass: 1.4, cost: 9000, d: 3.2, h: 4, crew: 2, mesh: { t: 'inflatable' } });
add({ id: 'hab_b330', cat: 'utility', name: 'Large Inflatable Habitat', basis: 'Bigelow B330', mass: 20, cost: 40000, d: 6.7, h: 13.7, crew: 6, mesh: { t: 'inflatable', big: true } });
add({ id: 'hab_node', cat: 'utility', name: 'Connecting Node', basis: 'ISS Unity node', mass: 11.6, cost: 15000, d: 4.57, h: 5.5, crew: 0, mesh: { t: 'hab', color: 0xdcdcd4, node: true } });
add({ id: 'hab_cupola', cat: 'utility', name: 'Observation Cupola', basis: 'ISS Cupola', mass: 1.8, cost: 7000, d: 2.95, h: 1.5, crew: 1, mesh: { t: 'cupola' } });
add({ id: 'hab_airlock', cat: 'utility', name: 'Crew Airlock', basis: 'Quest joint airlock', mass: 6, cost: 8000, d: 4, h: 5.5, crew: 0, airlock: true, mesh: { t: 'hab', color: 0xd8d8d0, airlock: true } });
add({ id: 'dock_ids', cat: 'utility', name: 'Docking Port (IDSS)', basis: 'NASA Docking System', mass: 0.33, cost: 800, d: 1.25, h: 0.5, dock: true, mesh: { t: 'dock' } });
add({ id: 'dock_cbm', cat: 'utility', name: 'Berthing Mechanism 2.5m', basis: 'Common Berthing Mechanism', mass: 0.6, cost: 1000, d: 2.5, h: 0.6, dock: true, mesh: { t: 'dock', big: true } });
add({ id: 'util_ladder', cat: 'utility', name: 'EVA Ladder', basis: 'LM ladder', mass: 0.01, cost: 30, d: 0.1, h: 3, radial: true, mesh: { t: 'ladder' } });
add({ id: 'util_light', cat: 'utility', name: 'Floodlight', basis: 'EVA work light', mass: 0.01, cost: 40, d: 0.2, h: 0.3, radial: true, light: true, mesh: { t: 'light' } });
add({ id: 'util_whipple', cat: 'utility', name: 'Whipple Shield Ring', basis: 'ISS micrometeoroid shielding', mass: 0.8, cost: 600, d: 3.75, h: 1, mesh: { t: 'ring', color: 0xbbbbbb } });
add({ id: 'util_storm', cat: 'utility', name: 'Radiation Storm Shelter', basis: 'Water-wall shelter (NASA HRP)', mass: 8, cost: 12000, d: 3.75, h: 3, crew: 4, mesh: { t: 'hab', color: 0x6c7a88 } });
add({ id: 'util_rover', cat: 'utility', name: 'Lunar Roving Vehicle (stowed)', basis: 'Apollo LRV', mass: 0.21, cost: 3000, d: 1.5, h: 1.5, radial: true, mesh: { t: 'box', w: 1.4, color: 0x9a8a60 } });
add({ id: 'util_flagpole', cat: 'utility', name: 'Flag Kit', basis: 'Lunar Flag Assembly', mass: 0.01, cost: 10, d: 0.1, h: 0.5, radial: true, mesh: { t: 'box', w: 0.15, color: 0xb0b0b0 } });

// Hidden pseudo-part used for astronauts on EVA
add({ id: 'eva_bean', cat: 'pods', hidden: true, name: 'Astronaut', basis: 'xEMU-style suit + SAFER jetpack', mass: 0.14, cost: 0, d: 0.6, h: 1.85, crew: 1, torque: 0.3, monoprop: 0.005, rcs: { thrust: 0.05, isp: 70 }, mesh: { t: 'eva' } });
export const PARTS = P;
export const PART = Object.fromEntries(P.map(p => [p.id, p]));
export const PART_COUNT = P.filter(p => !p.hidden).length;

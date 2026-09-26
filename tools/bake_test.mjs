import { bakeWorld } from '../js/gen/worlds.js';
import fs from 'fs';
const out = process.argv[2] || 'C:/Users/ofici/AppData/Local/Temp/claude/C--Users-ofici-Downloads-BSP/06297d91-2d6d-45a5-ba20-56bbb2c2b495/scratchpad';
const cases = [
  { name: 'moon', recipe: 'moon', R: 1500e3, colors: { low: [0.3, 0.29, 0.28], mid: [0.45, 0.43, 0.41], high: [0.6, 0.58, 0.55] } },
  { name: 'icy', recipe: 'icy', R: 800e3, colors: { low: [0.55, 0.6, 0.65], mid: [0.78, 0.82, 0.86], high: [0.95, 0.96, 0.98] }, crackColor: [0.5, 0.35, 0.25] },
  { name: 'terra', recipe: 'terra', R: 6800e3, Teq: 270, starTemp: 5600, clouds: true, cloudAmount: 0.5, oceanFrac: 0.6, gravity: 10 },
  { name: 'desert', recipe: 'desert', R: 3800e3, colors: { low: [0.45, 0.25, 0.15], mid: [0.65, 0.42, 0.25], high: [0.8, 0.62, 0.45] }, iceCaps: 0.85, gravity: 4 },
  { name: 'lava', recipe: 'lava', R: 5000e3, colors: { low: [0.08, 0.06, 0.05], mid: [0.15, 0.12, 0.1], high: [0.25, 0.22, 0.2] }, gravity: 9 },
];
for (const c of cases) {
  for (const seed of [1, 2]) {
    const t0 = Date.now();
    const r = await bakeWorld({ ...c, w: 1024, h: 512, seed: seed * 1000 + 7 }, () => {});
    let mn = Infinity, mx = -Infinity; for (const v of r.height) { if (v < mn) mn = v; if (v > mx) mx = v; }
    console.log(c.name, seed, (Date.now() - t0) + 'ms', 'h', mn.toFixed(0), mx.toFixed(0), r.features.join('; '));
    fs.writeFileSync(`${out}/bake_${c.name}_${seed}.rgba`, Buffer.from(r.color.buffer));
    if (r.clouds) fs.writeFileSync(`${out}/bake_${c.name}_${seed}_clouds.rgba`, Buffer.from(r.clouds.data.buffer));
  }
}

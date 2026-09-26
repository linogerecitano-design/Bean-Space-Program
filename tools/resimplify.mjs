// Re-simplify scatter GLBs to per-kind triangle budgets and join primitives by material.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, weld, join, flatten, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const budget = (n) => /rock|stone|boulder/.test(n) ? 2500 : /tree|sapling|searsia|othonna|trunk/.test(n) ? 7000 : 2500;
const count = (doc) => { let t = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3; } return Math.round(t); };
for (const f of fs.readdirSync('assets/scatter')) {
  const path = 'assets/scatter/' + f;
  const doc = await io.read(path);
  const before = count(doc); const target = budget(f);
  await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld());
  let t = count(doc);
  for (let k = 0; k < 6 && t > target * 1.15; k++) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.02, target / t), error: 0.02 * (k + 1), lockBorder: false }));
    t = count(doc);
  }
  await doc.transform(prune());
  await io.write(path, doc);
  const prims = doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().length, 0);
  console.log(f.padEnd(32), before, '->', t, 'prims', prims, Math.round(fs.statSync(path).size / 1024) + 'KB');
}

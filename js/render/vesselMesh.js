// Builds a THREE group for a vessel design (or runtime vessel) from its layout.
import * as THREE from 'three';
import { buildPartMesh, mat } from './partMesh.js';
import { makePlume } from './vfx.js';

const cache = new Map();
function partTemplate(p) {
  let t = cache.get(p.id);
  if (!t) { t = buildPartMesh(p); cache.set(p.id, t); }
  return t;
}
// placed: layout() output; returns group with per-part sub-groups (userData.placed)
export function buildVesselMesh(placed, opts = {}) {
  const g = new THREE.Group(); g.name = 'vessel';
  const parts = [];
  for (const pl of placed) {
    const tpl = partTemplate(pl.part);
    const m = tpl.clone(true);
    m.position.set(...pl.pos); m.rotation.y = pl.ang || 0;
    m.userData = { ...tpl.userData, placed: pl };
    m.traverse(o => { if (o.isMesh) { o.userData.placed = pl; o.castShadow = true; o.receiveShadow = true; } });
    g.add(m); parts.push(m);
    m.traverse(o => { if (o.name === 'wing' && pl.part.mesh?.deploy) m.userData.wing = o; if (o.name === 'flap') m.userData.flap = o; if (o.name === 'gearLeg') m.userData.gearLeg = o; });
    if (opts.plumes && pl.part.engine) {
      const noz = tpl.userData.nozzles || [[0, 0, (pl.part.d || 1) * 0.4]];
      const kind = pl.part.engine.solid ? 'solid' : pl.part.engine.power ? 'ion' : pl.part.id.startsWith('isd_') ? 'fusion' : pl.part.engine.prop;
      m.userData.plumes = noz.slice(0, 9).map(([x, z, r]) => { const pm = makePlume(Math.max(0.05, r), [1.0, 0.62, 0.3], kind); pm.position.set(x, -(pl.part.h || 1), z); m.add(pm); pm.visible = false; return pm; });
    }
  }
  // Engine shrouds: an engine with something stacked below it gets an interstage fairing from the
  // stage above's diameter down to the part below. It belongs to the lower part, so it drops away
  // with that stage and exposes the engine.
  const byKey = new Map(); placed.forEach((pl, i) => byKey.set(pl.node.uid + ':' + (pl.sideIndex || 0), i));
  placed.forEach((pl, i) => {
    if (!pl.part.engine || pl.radial || !pl.node.below || opts.noShrouds) return;
    const bi = byKey.get(pl.node.below.uid + ':' + (pl.sideIndex || 0)); if (bi === undefined) return;
    const below = placed[bi]; if (below.radial) return;
    const par = pl.parentPlaced && !pl.parentPlaced.radial ? pl.parentPlaced : null;
    const rt = ((par ? (par.part.d2 ?? par.part.d) : pl.part.d) || pl.part.d || 1) / 2, rb = (below.part.d || below.part.d2 || pl.part.d || 1) / 2;
    if (rt < 0.15 || rb < 0.15) return;
    const h = pl.part.h || 1;
    const geo = new THREE.CylinderGeometry(rt + 0.012, rb + 0.012, h, 48, 1, true); geo.translate(0, h / 2, 0);
    const sh = new THREE.Mesh(geo, shroudMat()); sh.castShadow = sh.receiveShadow = true; sh.userData.placed = below; sh.userData.shroud = true;
    parts[bi].add(sh); below.shroudH = h;
  });
  g.userData.parts = parts;
  return g;
}
let _shroud = null;
function shroudMat() { if (!_shroud) { _shroud = mat('paint', 0xe9e9e6).clone(); _shroud.side = THREE.DoubleSide; } return _shroud; }
export function highlight(group, nodeSet) {
  group.traverse(o => {
    if (!o.isMesh || !o.material || !o.userData.placed) return;
    const sel = nodeSet && nodeSet.has(o.userData.placed.node);
    if (sel) { if (!o.userData.origMat) { o.userData.origMat = o.material; o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x3a6aff); o.material.emissiveIntensity = 0.35; } }
    else if (o.userData.origMat) { o.material.dispose(); o.material = o.userData.origMat; delete o.userData.origMat; }
  });
}

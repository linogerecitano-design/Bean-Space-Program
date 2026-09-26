// Fills the colour of every transparent texel in the scatter foliage textures with the colour of the
// nearby leaves (pull-push: average the opaque texels down a pyramid, then push the averages back
// into the holes). The alpha channel is untouched. Without this, the black (keyed) background bleeds
// into the small mip levels and distant grass, bushes and trees render as dark blobs.
//
//   node tools/dilate_foliage.mjs        # all scatter GLBs with alpha-tested textures, in place
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DIR = 'assets/scatter';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function pullPush(rgba, W, H) {
  // level 0: premultiplied colour sums and weights (opaque texels only)
  const levels = [];
  let w = W, h = H, C = new Float32Array(W * H * 3), N = new Float32Array(W * H);
  // sources: solid leaf texels only (the half-transparent fringe of a black-keyed texture is near black)
  for (let i = 0; i < W * H; i++) if (rgba[i * 4 + 3] >= 250) { C[i * 3] = rgba[i * 4]; C[i * 3 + 1] = rgba[i * 4 + 1]; C[i * 3 + 2] = rgba[i * 4 + 2]; N[i] = 1; }
  levels.push({ w, h, C, N });
  while (w > 1 || h > 1) { // pull
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1); const nC = new Float32Array(nw * nh * 3), nN = new Float32Array(nw * nh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = y * w + x, d = Math.min(nh - 1, y >> 1) * nw + Math.min(nw - 1, x >> 1); nN[d] += N[s]; nC[d * 3] += C[s * 3]; nC[d * 3 + 1] += C[s * 3 + 1]; nC[d * 3 + 2] += C[s * 3 + 2]; }
    w = nw; h = nh; C = nC; N = nN; levels.push({ w, h, C, N });
  }
  for (let l = levels.length - 2; l >= 0; l--) { // push: empty texels take their parent's average colour
    const L = levels[l], P = levels[l + 1];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x; if (L.N[i] > 0) continue;
      const p = Math.min(P.h - 1, y >> 1) * P.w + Math.min(P.w - 1, x >> 1); const n = P.N[p] || 1;
      L.C[i * 3] = P.C[p * 3] / n; L.C[i * 3 + 1] = P.C[p * 3 + 1] / n; L.C[i * 3 + 2] = P.C[p * 3 + 2] / n; L.N[i] = 1;
    }
  }
  const L = levels[0]; const out = Buffer.from(rgba);
  for (let i = 0; i < W * H; i++) if (rgba[i * 4 + 3] < 128) { const n = L.N[i] || 1; out[i * 4] = L.C[i * 3] / n; out[i * 4 + 1] = L.C[i * 3 + 1] / n; out[i * 4 + 2] = L.C[i * 3 + 2] / n; }
  return out;
}

let n = 0;
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(DIR, f)); let changed = false;
  for (const m of doc.getRoot().listMaterials()) {
    const tex = m.getBaseColorTexture(); if (!tex) continue;
    const img = sharp(Buffer.from(tex.getImage())); const md = await img.metadata(); if (!md.hasAlpha) continue;
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let holes = 0; for (let i = 3; i < data.length; i += 4) if (data[i] < 128) holes++;
    if (!holes) continue;
    const filled = pullPush(data, info.width, info.height);
    // exact: keep the RGB of transparent texels (libwebp otherwise blanks them to save bytes)
    const webp = await sharp(filled, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 82, alphaQuality: 90, effort: 5, exact: true }).toBuffer();
    tex.setImage(new Uint8Array(webp)).setMimeType('image/webp'); changed = true; n++;
    console.log(`filled ${f} / ${m.getName()} (${(holes / (info.width * info.height) * 100).toFixed(0)}% transparent)`);
  }
  if (changed) await io.write(path.join(DIR, f), doc);
}
console.log(`${n} textures filled`);

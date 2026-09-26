// Repairs scatter GLBs whose foliage textures lost their alpha channel (an earlier texture pass
// re-encoded them as 3-channel WebP, so every grass tuft / leaf card rendered as a solid quad).
//
//   node tools/fix_foliage_alpha.mjs            # offline: rebuild alpha from black-keyed textures
//   node tools/fix_foliage_alpha.mjs --fetch    # re-download the Poly Haven originals and copy their alpha
//                                               # (needed for textures with padded/bled backgrounds:
//                                               #  shrubs, fern, pine twigs, quiver/othonna leaves...)
//
// Only materials with alphaMode MASK/BLEND whose base colour has no alpha are touched; fixed files
// are written in place. Safe to re-run.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DIR = 'assets/scatter';
const FETCH = process.argv.includes('--fetch');
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 BeanSpaceProgram-asset-fix' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

// Poly Haven original: the glTF (1k) and every texture it references, as {uri -> Buffer}
async function fetchOriginal(name) {
  const files = JSON.parse((await get(`https://api.polyhaven.com/files/${name}`)).toString());
  const g = files.gltf['1k'].gltf;
  const gltf = JSON.parse((await get(g.url)).toString());
  const inc = {};
  for (const [rel, info] of Object.entries(g.include || {})) if (/\.(png|jpe?g|webp)$/i.test(rel)) inc[rel] = await get(info.url);
  return { gltf, inc };
}
// texture of the original whose material matches ours by name
function originalImage(orig, matName) {
  const { gltf, inc } = orig;
  const mi = (gltf.materials || []).findIndex(m => m.name === matName);
  const m = gltf.materials?.[mi]; const ti = m?.pbrMetallicRoughness?.baseColorTexture?.index;
  if (ti == null) return null;
  const img = gltf.images[gltf.textures[ti].source];
  const key = Object.keys(inc).find(k => k === img.uri || k.endsWith(path.basename(img.uri || '')));
  return key ? inc[key] : null;
}

// alpha from a black background (min channel noise from lossy encoding is tolerated)
function keyAlpha(rgb, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    const m = Math.max(rgb[i], rgb[i + 1], rgb[i + 2]);
    // narrow ramp: only the (noisy) black background goes transparent; dark leaves stay fully opaque
    // (a wide ramp left them half see-through, which alpha-to-coverage renders as a grainy dither)
    const t = Math.min(1, Math.max(0, (m - 7) / 7)); const a = t * t * (3 - 2 * t);
    out[j] = rgb[i]; out[j + 1] = rgb[i + 1]; out[j + 2] = rgb[i + 2]; out[j + 3] = Math.round(a * 255);
  }
  return out;
}
// bleed colour into transparent texels so mipmaps don't pull dark/odd fringes into the leaves
function bleed(rgba, w, h, passes = 12) {
  let src = Buffer.from(rgba);
  const solid = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) solid[i] = rgba[i * 4 + 3] > 128 ? 1 : 0;
  for (let p = 0; p < passes; p++) {
    const dst = Buffer.from(src); const next = solid.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (solid[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx; if (!solid[k]) continue; r += src[k * 4]; g += src[k * 4 + 1]; b += src[k * 4 + 2]; n++;
      }
      if (n) { dst[i * 4] = r / n; dst[i * 4 + 1] = g / n; dst[i * 4 + 2] = b / n; next[i] = 1; }
    }
    src = dst; solid.set(next);
  }
  return src;
}

let fixed = 0, skipped = 0;
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.glb'))) {
  const name = f.replace(/\.glb$/, ''); if (only.length && !only.includes(name)) continue;
  const doc = await io.read(path.join(DIR, f));
  let changed = false, orig = null;
  for (const m of doc.getRoot().listMaterials()) {
    const tex = m.getBaseColorTexture(); if (!tex || m.getAlphaMode() === 'OPAQUE') continue;
    const img = sharp(Buffer.from(tex.getImage()));
    const md = await img.metadata(); if (md.hasAlpha) continue;
    const { data: rgb, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    let rgba = null, how = '';
    if (FETCH) {
      try {
        orig = orig || await fetchOriginal(name);
        const buf = originalImage(orig, m.getName());
        if (buf) {
          const o = await sharp(buf).ensureAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer();
          rgba = Buffer.alloc(W * H * 4);
          for (let i = 0; i < W * H; i++) { rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = o[i * 4 + 3]; }
          // our RGB was bled differently from the original: take theirs where the leaf is visible
          for (let i = 0; i < W * H; i++) if (o[i * 4 + 3] > 8) { rgba[i * 4] = o[i * 4]; rgba[i * 4 + 1] = o[i * 4 + 1]; rgba[i * 4 + 2] = o[i * 4 + 2]; }
          how = 'poly haven alpha';
        }
      } catch (e) { console.warn(`  ${name}: download failed (${e.message}), trying black key`); }
    }
    if (!rgba) {
      let dark = 0; for (let i = 0; i < rgb.length; i += 3) if (rgb[i] + rgb[i + 1] + rgb[i + 2] < 12) dark++;
      if (dark / (W * H) < 0.3) { console.log(`skip ${name} / ${m.getName()}: no alpha and no black background (run with --fetch)`); skipped++; continue; }
      rgba = keyAlpha(rgb, W, H); how = 'black key';
    }
    rgba = bleed(rgba, W, H);
    const webp = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 82, alphaQuality: 90, effort: 5 }).toBuffer();
    if (!(await sharp(webp).metadata()).hasAlpha) throw new Error(`${name}: encoder dropped alpha`);
    tex.setImage(new Uint8Array(webp)).setMimeType('image/webp');
    if (m.getAlphaMode() === 'BLEND') m.setAlphaMode('MASK');
    m.setAlphaCutoff(0.5);
    changed = true; fixed++;
    console.log(`fixed ${name} / ${m.getName()} (${how})`);
  }
  if (changed) await io.write(path.join(DIR, f), doc);
}
console.log(`${fixed} textures fixed, ${skipped} still without alpha`);

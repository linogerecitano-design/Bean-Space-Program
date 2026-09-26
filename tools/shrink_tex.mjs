// Downsize embedded textures of the largest scatter GLBs (and the astronaut) to keep the publish under 64 MB.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = process.argv.slice(2);
for (const path of files) {
  const before = fs.statSync(path).size;
  const doc = await io.read(path);
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80 }));
  await io.write(path, doc);
  console.log(path, Math.round(before / 1024) + 'KB ->', Math.round(fs.statSync(path).size / 1024) + 'KB');
}

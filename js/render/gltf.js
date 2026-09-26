// GLTFLoader that decodes embedded textures through <img> elements instead of fetch()+ImageBitmap.
// The Artifact host's content-security policy blocks fetch() of blob: URLs, which silently left
// every embedded texture (astronaut faces, trees, rocks) blank when published.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export function makeGLTFLoader() {
  const l = new GLTFLoader();
  l.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'BSP_img_textures' }; });
  return l;
}

// Astronaut Complex: the Bean corps in their suits.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { h, mount, clearUI, flash } from '../ui/ui.js';
import { Astronaut } from '../render/astronaut.js';
import { OrbitCam } from '../core/camera.js';
import { hireAstronaut } from '../game/save.js';

export class AstronautScene {
  constructor(G) {
    this.G = G; this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    this.cam = new OrbitCam(G.world.renderer.domElement); this.cam.enabled = false;
    const pm = new THREE.PMREMGenerator(G.world.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.background = new THREE.Color(0x0b0e14);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x20252e, roughness: 0.35, metalness: 0.3 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.8, 4.0, 96), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xf59e0b, emissiveIntensity: 2 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; this.scene.add(ring);
    const key = new THREE.SpotLight(0xffffff, 250, 40, 0.6, 0.5); key.position.set(4, 9, 7); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.5); rim.position.set(-5, 4, -6); this.scene.add(rim);
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202020, 0.6));
    this.crew = [];
  }
  async enter() {
    const G = this.G; this.cam.enabled = true; this.cam.dist = 9; this.cam.pitch = 0.12; this.cam.yaw = Math.PI / 2; this.cam.minDist = 2; this.cam.maxDist = 30;
    this.refresh(); this.buildUI();
  }
  refresh() {
    for (const a of this.crew) this.scene.remove(a.group);
    const roster = this.G.game.roster.filter(r => r.status !== 'lost').slice(0, 8);
    this.crew = roster.map((r, i) => { const a = new Astronaut({ suitColor: r.suit }); const n = roster.length; a.group.position.set((i - (n - 1) / 2) * 2.1, 0, -Math.abs(i - (n - 1) / 2) * 0.4); a.group.rotation.y = -(i - (n - 1) / 2) * 0.08; a.t = i * 1.3; a.info = r; this.scene.add(a.group); return a; });
  }
  buildUI() {
    clearUI(); const G = this.G;
    mount(h('div#topbar.panel', {}, h('button', { onclick: () => G.go('center') }, '← Space Centre'), h('b', { style: { padding: '0 8px' } }, 'Astronaut Complex'),
      h('button.primary', { onclick: () => { hireAstronaut(G.game); this.refresh(); this.buildUI(); flash('New astronaut hired!'); } }, '+ Hire astronaut')));
    const list = h('div.list', {}, G.game.roster.map((r, i) => h('div.item', { onclick: () => this.wave(r) }, h('b', {}, r.name), h('span.tag', {}, r.trait), h('div.small.dim', {}, `${r.status} · ${r.missions} missions · ${r.xp} XP`))));
    mount(h('div#side.panel', {}, h('b', {}, 'Roster'), h('div.small.dim', {}, 'Tap an astronaut to say hello.'), list));
  }
  wave(r) { const a = this.crew.find(c => c.info === r); if (!a) return; a.state = 'wave'; setTimeout(() => a.state = 'idle', 3500); }
  exit() { this.cam.enabled = false; clearUI(); }
  update(dt) {
    const off = this.cam.apply(this.camera, new THREE.Vector3(0, 1, 0));
    this.camera.position.set(off.x, 1.2 + off.y, off.z); this.camera.lookAt(0, 1.1, 0);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    for (const a of this.crew) a.update(dt);
    this.G.world.pipeline.render(this.scene, this.camera, { time: 0, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Vector3(1, 1, 1), atmos: [], exposure: 1.0, sss: false });
  }
}

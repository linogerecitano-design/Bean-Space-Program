// Launch-site frame helpers (local ENU frame: x east, y up, z south).
import * as THREE from 'three';
import { latLonToDir, LAUNCH_SITE } from '../gen/planetgen.js';
import { V3 } from '../core/math.js';

export function siteFrame(body, lat = LAUNCH_SITE.lat, lon = LAUNCH_SITE.lon) {
  const d = latLonToDir(lat, lon);
  const up = new THREE.Vector3(...d);
  const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), up).normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  const m = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const hgt = body.surface ? body.surface.height(d[0], d[1], d[2]) : 0;
  const r = body.radius + hgt;
  return { dir: up, q, bf: [d[0] * r, d[1] * r, d[2] * r], ground: hgt };
}
// body-fixed point -> system-frame position
export function bfToSystem(body, t, bf) {
  const q = body.rotAt(t); const v = new THREE.Vector3(bf[0], bf[1], bf[2]).applyQuaternion(q);
  return body.posAt(t).clone().add(new V3(v.x, v.y, v.z));
}
// local site point -> system frame
export function localToSystem(body, t, site, local) {
  const v = new THREE.Vector3(...local).applyQuaternion(site.q);
  return bfToSystem(body, t, [site.bf[0] + v.x, site.bf[1] + v.y, site.bf[2] + v.z]);
}
export function localDirToWorld(body, t, site, dir) { return new THREE.Vector3(...dir).applyQuaternion(site.q).applyQuaternion(body.rotAt(t)); }
// Attach an object to the body's rotating frame at a local site offset
export function attachToBody(world, body, obj, site) {
  const v = world.visuals.get(body); if (!v || !v.spin) return false;
  if (obj.parent !== v.spin) v.spin.add(obj);
  obj.position.set(...site.bf); obj.quaternion.copy(site.q);
  return true;
}

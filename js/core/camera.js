// Orbit / chase camera with mouse + touch (drag to rotate, wheel / pinch to zoom).
import * as THREE from 'three';

export class OrbitCam {
  constructor(dom) {
    this.dom = dom;
    this.yaw = 0.6; this.pitch = 0.25; this.dist = 30; this.minDist = 1; this.maxDist = 1e13;
    this.up = new THREE.Vector3(0, 1, 0); // local "up" (radial) for ground views
    this.enabled = true;
    this.targetYaw = null;
    this.intercept = null; // (event) => true to let the scene handle this pointer instead of orbiting
    this.zoomTarget = null; this.wheelSpeed = 0; this.lastWheel = 0;
    const ptrs = new Map(); let lastPinch = 0;
    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return; this.dragged = 0;
      if (this.intercept && ptrs.size === 0 && this.intercept(e)) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]); dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId); const dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      this.dragged += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 1) { this.yaw -= dx * 0.005; this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch + dy * 0.005)); }
      else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (lastPinch) this.zoom(lastPinch / d); lastPinch = d;
      }
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = 0; };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return; e.preventDefault();
      // accelerating zoom: quick successive notches cover orders of magnitude fast
      const now = performance.now(); const dt = now - this.lastWheel; this.lastWheel = now;
      this.wheelSpeed = dt < 120 ? Math.min(this.wheelSpeed + 1, 12) : 0;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      this.zoom(Math.exp(Math.sign(dy) * Math.min(Math.abs(dy), 200) * 0.0022 * (1 + this.wheelSpeed * 0.35)), true);
    }, { passive: false });
    addEventListener('keydown', (e) => {
      if (!this.enabled || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') this.zoom(0.7, true);
      if (e.key === '-' || e.code === 'NumpadSubtract') this.zoom(1 / 0.7, true);
    });
  }
  // smooth: animate toward the new distance instead of jumping
  zoom(f, smooth) {
    const base = smooth && this.zoomTarget ? this.zoomTarget : this.dist;
    const t = Math.max(this.minDist, Math.min(this.maxDist, base * f));
    if (smooth) this.zoomTarget = t; else { this.dist = t; this.zoomTarget = null; }
  }
  // returns camera offset (world) from target and sets camera orientation
  apply(camera, frameUp) {
    if (this.zoomTarget) {
      const now = performance.now(); const dt = Math.min(0.1, (now - (this._zt || now)) / 1000); this._zt = now;
      this.zoomTarget = Math.max(this.minDist, Math.min(this.maxDist, this.zoomTarget));
      const k = 1 - Math.exp(-dt * 14); this.dist = Math.exp(Math.log(this.dist) + (Math.log(this.zoomTarget) - Math.log(this.dist)) * k);
      if (Math.abs(Math.log(this.zoomTarget / this.dist)) < 0.002) { this.dist = this.zoomTarget; this.zoomTarget = null; }
    } else this._zt = performance.now();
    const up = frameUp || this.up;
    // build a basis around "up"
    const ref = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const east = new THREE.Vector3().crossVectors(ref, up).normalize();
    const north = new THREE.Vector3().crossVectors(up, east).normalize();
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const off = new THREE.Vector3()
      .addScaledVector(east, Math.sin(this.yaw) * cp)
      .addScaledVector(north, Math.cos(this.yaw) * cp)
      .addScaledVector(up, sp).multiplyScalar(this.dist);
    camera.up.copy(up);
    camera.position.set(0, 0, 0);
    camera.lookAt(-off.x, -off.y, -off.z);
    camera.updateMatrixWorld();
    return off;
  }
}

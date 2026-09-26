
window.snap = (n = 1) => { const r = (window.BSP && BSP.step) ? BSP.step(n) : window.stepFrames && window.stepFrames(n); const cv = (window.world && world.renderer.domElement) || (window.BSP && BSP.world && BSP.world.renderer.domElement) || document.querySelector('canvas'); const url = cv.toDataURL('image/jpeg', 0.85); let img = document.getElementById('snap'); if (!img) { img = document.createElement('img'); img.id = 'snap'; img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:4;object-fit:contain;background:#000;pointer-events:none'; document.body.appendChild(img); } img.src = url; img.style.display = ''; return url.length; };
window.unsnap = () => { const img = document.getElementById('snap'); if (img) img.style.display = 'none'; };
// dev: render n frames (waiting for async work between them) and save the canvas to .snaps/<name>.jpg
window.shotTo = async (name = 'snap', n = 20, fn) => {
  const B = window.BSP; for (let i = 0; i < n; i++) { if (fn) fn(i); B.step(1); await new Promise(r => setTimeout(r, 100)); }
  B.step(1); const url = B.world.renderer.domElement.toDataURL('image/jpeg', 0.85);
  await fetch('/__snap?name=' + name, { method: 'POST', body: url }); return name;
};
// sine of the sun's elevation at the landed vessel's spot at time tt
window.sunUp = (tt) => {
  const B = window.BSP, v = B.scene.vessel, b = v.body, st = B.sys.star, bf = v.landedBF, n = Math.hypot(...bf);
  const x = bf[0] / n, y = bf[1] / n, z = bf[2] / n, Q = b.rotAt(tt), qx = Q.x, qy = Q.y, qz = Q.z, qw = Q.w;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  const rx = ix * qw - iw * qx - iy * qz + iz * qy, ry = iy * qw - iw * qy - iz * qx + ix * qz, rz = iz * qw - iw * qz - ix * qy + iy * qx;
  const sp = st.posAt(tt), bp = b.posAt(tt); const sx = sp.x - bp.x, sy = sp.y - bp.y, sz = sp.z - bp.z;
  return (rx * sx + ry * sy + rz * sz) / Math.hypot(sx, sy, sz);
};
// jump to the next local time when the sun rises through the given elevation (sine)
window.toSun = (e = 0.3, days = 400) => { const t = window.BSP.t; for (let d = 0; d < days; d += 0.02) if (sunUp(t + d * 86400) < e && sunUp(t + (d + 0.02) * 86400) >= e) { window.BSP.t = t + d * 86400; return d; } return -1; };

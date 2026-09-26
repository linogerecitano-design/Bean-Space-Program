// Generates an equirectangular albedo+height texture for bodies without real imagery.
import { Surface } from '../gen/planetgen.js';

self.onmessage = (e) => {
  const { id, body, w, h } = e.data;
  const s = new Surface(body, {});
  const out = new Uint8Array(w * h * 4);
  const hs = new Float32Array(w * h);
  let hmin = Infinity, hmax = -Infinity;
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI; // row 0 = north (flipped later by three)
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w - 0.5) * 2 * Math.PI;
      const x = cl * Math.cos(lon), y = sl, z = -cl * Math.sin(lon);
      const hh = s.height(x, y, z, 2 * Math.PI * s.R / w); hs[j * w + i] = hh;
      if (hh < hmin) hmin = hh; if (hh > hmax) hmax = hh;
    }
  }
  const range = Math.max(1, hmax - hmin);
  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI; const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w - 0.5) * 2 * Math.PI;
      const x = cl * Math.cos(lon), y = sl, z = -cl * Math.sin(lon);
      const k = j * w + i, hh = hs[k];
      const hx = hs[j * w + ((i + 1) % w)] - hh, hy = hs[Math.min(h - 1, j + 1) * w + i] - hh;
      const slope = Math.min(1, Math.hypot(hx, hy) / (s.R * Math.PI / h) * 1.5);
      const c = s.color(x, y, z, hh, slope);
      const o = k * 4;
      out[o] = Math.min(255, Math.max(0, Math.pow(c[0], 1 / 2.2) * 255));
      out[o + 1] = Math.min(255, Math.max(0, Math.pow(c[1], 1 / 2.2) * 255));
      out[o + 2] = Math.min(255, Math.max(0, Math.pow(c[2], 1 / 2.2) * 255));
      out[o + 3] = Math.round((hh - hmin) / range * 255); // alpha: normalized height
    }
  }
  self.postMessage({ id, data: out, w, h, hmin, hmax }, [out.buffer]);
};

// Builds terrain chunk geometry off the main thread. Each body is registered once with its
// style and height maps; build jobs then only carry the chunk's face coordinates.
import { Surface } from '../gen/planetgen.js';
import { buildChunk } from '../gen/terrainBuild.js';

const surfaces = new Map();
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'body') {
    surfaces.set(m.key, new Surface(m.def, { maps: m.maps }));
    return;
  }
  if (m.type === 'drop') { surfaces.delete(m.key); return; }
  if (m.type === 'build') {
    const S = surfaces.get(m.key);
    if (!S) { self.postMessage({ id: m.id, error: 'unknown body ' + m.key }); return; }
    try {
      const r = buildChunk(S, m.job);
      self.postMessage({ id: m.id, r }, [r.pos.buffer, r.nor.buffer, r.water.buffer, r.aDir.buffer, r.aT1.buffer, r.aT2.buffer]);
    } catch (err) { self.postMessage({ id: m.id, error: String(err) }); }
  }
};

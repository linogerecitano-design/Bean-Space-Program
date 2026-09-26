// Off-main-thread world baking (see js/gen/worlds.js).
import { bakeWorld } from '../gen/worlds.js';

self.onmessage = async (e) => {
  const { id, params } = e.data;
  try {
    const r = await bakeWorld(params, (msg, f) => self.postMessage({ id, progress: f, msg }));
    const transfer = r.cloudsOnly ? [] : [r.height.buffer, r.color.buffer];
    if (r.clouds) transfer.push(r.clouds.data.buffer);
    self.postMessage({ id, result: r }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};

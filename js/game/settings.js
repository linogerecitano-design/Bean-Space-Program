// Graphics settings (per device, kept in localStorage). 'auto' behaves like High but lets the
// renderer lower its internal resolution whenever the frame rate drops.
import { IS_MOBILE } from '../render/textures.js';

export const PRESETS = {
  low:    { label: 'Low',    scale: 0.6,  maxDpr: 1,   cloudSteps: 14, atmoSteps: 8,  shadow: 0,    scatter: 0.35, splitK: 1.3, clouds3d: 0.5, msaa: 0 },
  medium: { label: 'Medium', scale: 0.8,  maxDpr: 1,   cloudSteps: 22, atmoSteps: 12, shadow: 1024, scatter: 0.65, splitK: 1.7, clouds3d: 0.75, msaa: 0 },
  high:   { label: 'High',   scale: 1.0,  maxDpr: 1.5, cloudSteps: 32, atmoSteps: 16, shadow: 2048, scatter: 1.0,  splitK: 2.2, clouds3d: 1, msaa: 4 },
  ultra:  { label: 'Ultra',  scale: 1.0,  maxDpr: 2,   cloudSteps: 48, atmoSteps: 20, shadow: 4096, scatter: 1.3,  splitK: 2.8, clouds3d: 1.3, msaa: 4 },
};
const PHONE_AUTO = { ...PRESETS.medium, scale: 0.8, maxDpr: 2 };
const KEY = 'bsp-graphics';
let preset = 'auto';
try { preset = localStorage.getItem(KEY) || 'auto'; } catch (e) {}
if (preset !== 'auto' && !PRESETS[preset]) preset = 'auto';
const listeners = new Set();

export const settings = {
  get preset() { return preset; },
  get auto() { return preset === 'auto'; },
  // the effective parameter set
  // phones: Medium effects, but render near the screen's real resolution (the dynamic scale steps down if frames get slow)
  get q() { return preset === 'auto' ? (IS_MOBILE ? PHONE_AUTO : PRESETS.high) : PRESETS[preset]; },
  set(p) { preset = p; try { localStorage.setItem(KEY, p); } catch (e) {} for (const f of listeners) try { f(); } catch (e) { console.error(e); } },
  onChange(f) { listeners.add(f); },
};

// Easter egg: "Beanier Beans" — astronauts flop about like ragdolls instead of standing up
export function beanier() { try { return localStorage.getItem('bsp-beanier') === '1'; } catch (e) { return false; } }
export function setBeanier(on) { try { localStorage.setItem('bsp-beanier', on ? '1' : '0'); } catch (e) {} }

// Keyboard state + on-screen touch controls (virtual stick, roll buttons, throttle slider).
import { h } from '../ui/ui.js';

export const keys = new Set();
const pressed = new Set();
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
export const down = (c) => keys.has(c);
export function hit(c) { if (pressed.has(c)) { pressed.delete(c); return true; } return false; }
export function endFrame() { pressed.clear(); }

export const touch = { pitch: 0, yaw: 0, roll: 0, throttle: null };
export function buildTouchControls(onThrottle) {
  const knob = h('div.knob');
  const stick = h('div#stick.panel', {}, knob);
  let id = null, cx = 0, cy = 0;
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e); });
  const move = (e) => {
    if (e.pointerId !== id) return;
    let dx = (e.clientX - cx) / 55, dy = (e.clientY - cy) / 55; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    knob.style.transform = `translate(${dx * 45}px, ${dy * 45}px)`; touch.yaw = dx; touch.pitch = dy;
  };
  stick.addEventListener('pointermove', move);
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touch.yaw = 0; touch.pitch = 0; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  const rb = (lbl, v) => { const b = h('button', {}, lbl); b.addEventListener('pointerdown', () => touch.roll = v); b.addEventListener('pointerup', () => touch.roll = 0); b.addEventListener('pointerleave', () => touch.roll = 0); return b; };
  const roll = h('div#rollbtns', {}, rb('⟲', -1), rb('⟳', 1));
  const fill = h('div.fill'); const txt = h('div.txt', {}, '0%');
  const thr = h('div#throttle.panel', {}, fill, txt);
  let tid = null;
  const setT = (e) => { const r = thr.getBoundingClientRect(); const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top - 6) / (r.height - 12))); onThrottle(v); };
  thr.addEventListener('pointerdown', (e) => { tid = e.pointerId; thr.setPointerCapture(tid); setT(e); });
  thr.addEventListener('pointermove', (e) => { if (e.pointerId === tid) setT(e); });
  thr.addEventListener('pointerup', () => tid = null);
  const show = (v) => { fill.style.height = `calc(${(v * 100).toFixed(0)}% - 12px)`; txt.textContent = Math.round(v * 100) + '%'; };
  return { els: [stick, roll, thr], show };
}

// Tiny DOM helpers.
export const $ = (s, r = document) => r.querySelector(s);
export function h(tag, attrs = {}, ...kids) {
  const [t0, ...cls] = tag.split('.');
  const [t, id] = t0.split('#');
  const el = document.createElement(t || 'div');
  if (id) el.id = id;
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
export const ui = () => document.getElementById('ui');
export function clearUI() { ui().replaceChildren(); }
export function mount(...els) { for (const e of els) ui().append(e); return els[0]; }

let msgTimer = 0;
export function flash(text, ms = 2500) {
  let m = document.getElementById('msg');
  if (!m) { m = h('div', { id: 'msg' }); document.body.append(m); }
  m.textContent = text; m.style.opacity = 1; clearTimeout(msgTimer); msgTimer = setTimeout(() => { m.style.opacity = 0; }, ms);
}
export function modal(title, body, buttons = [{ label: 'Close' }]) {
  return new Promise((resolve) => {
    const bg = h('div.modal-bg');
    const close = (v) => { bg.remove(); resolve(v); };
    const box = h('div.modal.panel', {}, h('h2', {}, title), body instanceof Node ? body : h('div', { html: body }),
      h('div.row', { style: { justifyContent: 'flex-end', flexWrap: 'wrap' } }, buttons.map(b => h('button' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { onclick: () => close(b.value ?? b.label) }, b.label))));
    bg.append(box); bg.addEventListener('pointerdown', (e) => { if (e.target === bg) close(null); });
    document.body.append(bg);
  });
}
export function progress(el, f) { el.querySelector('i').style.width = (f * 100).toFixed(0) + '%'; }

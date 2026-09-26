// Graphics settings dialog (menu + pause menus).
import { h, modal, flash } from './ui.js';
import { settings, PRESETS } from '../game/settings.js';

export async function graphicsDialog() {
  const opts = [['auto', 'Auto (adapts resolution to keep the frame rate up)'], ...Object.entries(PRESETS).map(([k, p]) => [k, p.label])];
  const list = h('div.col', {}, opts.map(([k, label]) => h('label.row', { style: { cursor: 'pointer' } },
    h('input', { type: 'radio', name: 'gfx', value: k, checked: settings.preset === k ? true : undefined }), label)));
  const r = await modal('Graphics', h('div.col', {}, list,
    h('div.dim.small', {}, 'Lower settings reduce resolution, cloud and atmosphere quality, shadows, surface detail and scatter density.')), [{ label: 'Cancel' }, { label: 'Apply', value: 'ok', primary: true }]);
  if (r !== 'ok') return;
  const sel = list.querySelector('input:checked'); if (!sel) return;
  settings.set(sel.value); flash('Graphics: ' + (sel.value === 'auto' ? 'Auto' : PRESETS[sel.value].label));
}

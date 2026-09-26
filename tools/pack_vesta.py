"""Packs GaeaButBetter vesta-preset bakes (tools/vesta_raw/v*) into web assets (assets/vesta)."""
import json, os, glob
import numpy as np
from PIL import Image

root = os.path.join(os.path.dirname(__file__), '..')
os.makedirs(os.path.join(root, 'assets', 'vesta'), exist_ok=True)
for d in sorted(glob.glob(os.path.join(root, 'tools', 'vesta_raw', 'v*'))):
    if not os.path.isdir(d):
        continue
    sid = os.path.basename(d)
    h = np.array(Image.open(os.path.join(d, 'height.png'))).astype(np.uint32)
    o = np.zeros((h.shape[0], h.shape[1], 3), np.uint8)
    o[..., 0] = h >> 8
    o[..., 1] = h & 255
    Image.fromarray(o).save(os.path.join(root, 'assets', 'vesta', f'{sid}_h.png'), optimize=True)
    Image.open(os.path.join(d, 'color.png')).convert('RGB').save(os.path.join(root, 'assets', 'vesta', f'{sid}_c.webp'), quality=88)
    m = json.load(open(os.path.join(d, 'height_meta.json')))
    json.dump({'min_km': m['min_km'], 'range_km': m['range_km']}, open(os.path.join(root, 'assets', 'vesta', f'{sid}.json'), 'w'))
    print(sid, int(h.max()), round(m['range_km'], 2))

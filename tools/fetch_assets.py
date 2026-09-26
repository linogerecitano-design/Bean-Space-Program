"""Downloads and prepares all external art for Bean Space Program.
Planet maps: Solar System Scope (CC BY 4.0), Steve Albers / Björn Jónsson / NASA maps.
Ground materials + scatter models: Poly Haven (CC0).
Run: python tools/fetch_assets.py   (idempotent; skips files that already exist)
"""
import json, os, subprocess, sys, urllib.request, io
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
TEX = os.path.join(ROOT, 'planets'); GROUND = os.path.join(ROOT, 'ground'); MODELS = os.path.join(ROOT, 'scatter')
RAW = os.path.join(ROOT, '_raw')
for d in (TEX, GROUND, MODELS, RAW): os.makedirs(d, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 BeanSpaceProgram-asset-fetch'}

def get(url, timeout=180):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read()

SSS = 'https://www.solarsystemscope.com/textures/download/'
ALB = 'https://stevealbers.net/albers/sos/'
PLANETS = {
    'sun': SSS + '8k_sun.jpg', 'mercury': SSS + '8k_mercury.jpg', 'venus_surface': SSS + '8k_venus_surface.jpg',
    'venus_atmosphere': SSS + '4k_venus_atmosphere.jpg', 'earth_day': SSS + '8k_earth_daymap.jpg', 'earth_night': SSS + '8k_earth_nightmap.jpg',
    'earth_clouds': SSS + '8k_earth_clouds.jpg', 'earth_normal': SSS + '8k_earth_normal_map.tif', 'earth_specular': SSS + '8k_earth_specular_map.tif',
    'moon': SSS + '8k_moon.jpg', 'mars': SSS + '8k_mars.jpg', 'jupiter': SSS + '8k_jupiter.jpg', 'saturn': SSS + '8k_saturn.jpg',
    'saturn_ring': SSS + '8k_saturn_ring_alpha.png', 'uranus': SSS + '2k_uranus.jpg', 'neptune': SSS + '2k_neptune.jpg',
    'milkyway': SSS + '8k_stars_milky_way.jpg',
    'io': ALB + 'jupiter/io/io_rgb_cyl.jpg', 'europa': ALB + 'jupiter/europa/europa_rgb_cyl_juno.png', 'ganymede': ALB + 'jupiter/ganymede/ganymede_4k.jpg',
    'callisto': 'https://bjj.mmedia.is/data/callisto/callisto.jpg',
    'mimas': ALB + 'saturn/mimas/mimas_rgb_cyl_www.jpg', 'enceladus': ALB + 'saturn/enceladus/enceladus_rgb_cyl_www.jpg', 'tethys': ALB + 'saturn/tethys/tethys_rgb_cyl_www.jpg',
    'dione': ALB + 'saturn/dione/dione_rgb_cyl_www.jpg', 'rhea': ALB + 'saturn/rhea/rhea_rgb_cyl_www.jpg', 'titan': ALB + 'saturn/titan/titan_rgb_cyl_www.jpg',
    'iapetus': ALB + 'saturn/iapetus/iapetus_rgb_cyl_www.jpg', 'phoebe': ALB + 'saturn/phoebe/phoebe_rgb_cyl_www.jpg',
    'miranda': ALB + 'uranus/miranda/miranda_rgb_cyl_www.jpg', 'ariel': ALB + 'uranus/ariel/ariel_rgb_cyl_www.jpg', 'umbriel': ALB + 'uranus/umbriel/umbriel_rgb_cyl_www.jpg',
    'titania': ALB + 'uranus/titania/titania_rgb_cyl_www.jpg', 'oberon': ALB + 'uranus/oberon/oberon_rgb_cyl_www.jpg',
    'triton': ALB + 'neptune/triton/triton_rgb_cyl_www.jpg', 'pluto': ALB + 'pluto/pluto_rgb_cyl_8k.png', 'charon': ALB + 'pluto/charon/charon_rgb_cyl.jpg',
    'ceres': ALB + 'asteroids/ceres_rgb_cyl.png', 'vesta': ALB + 'asteroids/vesta.png',
    'ida': 'http://sbn.psi.edu/pds/asteroid/MULTI_SA_MULTI_6_STOOKEMAPS_V2_0/document/243ida/icylmos2.jpg',
    'eros': 'http://sbn.psi.edu/pds/asteroid/MULTI_SA_MULTI_6_STOOKEMAPS_V2_0/document/433eros/eros_cyl_near.jpg',
    'mathilde': 'http://sbn.psi.edu/pds/asteroid/MULTI_SA_MULTI_6_STOOKEMAPS_V2_0/document/253mathilde/marelcyl.jpg',
    'gaspra': 'http://sbn.psi.edu/pds/asteroid/MULTI_SA_MULTI_6_STOOKEMAPS_V2_0/document/951gaspra/gascylmo.jpg',
    'wild2': 'http://sbn.psi.edu/pds/asteroid/MULTI_SA_MULTI_6_STOOKEMAPS_V2_0/document/81pwild2/wild2_cyl_stardust.jpg',
    # elevation
    'earth_height': 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
    'earth_water': 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
    'moon_height': 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg',
}
MAXW = {'earth_day': 8192, 'earth_clouds': 8192, 'earth_night': 4096, 'moon': 8192, 'mars': 8192, 'milkyway': 8192}
GRAY = {'earth_clouds', 'earth_specular', 'saturn_ring', 'earth_height', 'earth_water', 'moon_height'}

def fetch_planet(item):
    name, url = item
    out = os.path.join(TEX, name + ('.png' if name == 'saturn_ring' else '.jpg'))
    if os.path.exists(out): return f'skip {name}'
    try:
        data = get(url)
        im = Image.open(io.BytesIO(data))
        if name == 'saturn_ring': im = im.convert('RGBA')
        elif name in GRAY: im = im.convert('L')
        else: im = im.convert('RGB')
        mw = MAXW.get(name, 4096)
        if im.width > mw: im = im.resize((mw, mw // 2 if name != 'saturn_ring' else im.height), Image.LANCZOS)
        if name == 'saturn_ring': im.save(out)
        else: im.save(out, quality=90)
        return f'ok {name} {im.size}'
    except Exception as e:
        return f'FAIL {name}: {e}'

GROUND_SETS = ['grass_path_3', 'forest_leaves_02', 'rocky_terrain_02', 'rock_face_03', 'snow_02', 'coast_sand_01', 'sand_01', 'dry_ground_rocks',
               'red_laterite_soil_stones', 'red_sand', 'moon_01', 'moon_dusted_02', 'moon_meteor_01', 'gravel_ground_01', 'concrete_floor_02', 'asphalt_02',
               'dark_rock', 'snow_field_aerial', 'mud_cracked_dry_03', 'brown_mud_02', 'aerial_grass_rock', 'forrest_ground_01', 'lichen_rock', 'burned_ground_01']

def fetch_ground(name):
    out_d = os.path.join(GROUND, name + '_diff.jpg'); out_n = os.path.join(GROUND, name + '_nor.png')
    if os.path.exists(out_d) and os.path.exists(out_n): return f'skip {name}'
    try:
        files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
        diff = files['Diffuse']['1k']['jpg']['url']
        nor = files['nor_gl']['1k']['jpg']['url']
        disp = files.get('Displacement', {}).get('1k', {})
        disp = (disp.get('jpg') or disp.get('png') or {}).get('url')
        d = Image.open(io.BytesIO(get(diff))).convert('RGB').resize((1024, 1024), Image.LANCZOS)
        n = Image.open(io.BytesIO(get(nor))).convert('RGB').resize((1024, 1024), Image.LANCZOS)
        h = Image.open(io.BytesIO(get(disp))).convert('L').resize((1024, 1024), Image.LANCZOS) if disp else Image.new('L', (1024, 1024), 128)
        d.save(out_d, quality=90)
        nr, ng, nb = n.split(); Image.merge('RGBA', (nr, ng, nb, h)).save(out_n, optimize=True)  # height packed in alpha for parallax
        return f'ok {name}'
    except Exception as e:
        return f'FAIL {name}: {e}'

SCATTER = ['moon_rock_01', 'moon_rock_02', 'moon_rock_03', 'moon_rock_04', 'moon_rock_05', 'moon_rock_06', 'moon_rock_07',
           'rock_07', 'rock_09', 'stone_01', 'boulder_01', 'namaqualand_boulder_02', 'namaqualand_boulder_03', 'namaqualand_boulder_04',
           'namaqualand_boulder_05', 'namaqualand_boulder_06', 'namaqualand_stones_01', 'rock_moss_set_01', 'rock_moss_set_02', 'rock_face_01',
           'fir_sapling', 'pine_sapling_small', 'jacaranda_tree', 'island_tree_02', 'tree_small_02', 'quiver_tree_01', 'quiver_tree_02',
           'searsia_lucida', 'othonna_cerarioides', 'dead_tree_trunk_02', 'dead_quiver_trunk', 'searsia_burchellii',
           'shrub_01', 'shrub_02', 'shrub_03', 'shrub_04', 'fern_02', 'wild_rooibos_bush', 'grass_medium_01', 'grass_medium_02', 'grass_bermuda_01',
           'flower_gazania', 'flower_ursinia', 'dandelion_01', 'cheiridopsis_succulent', 'moss_01', 'tree_stump_01', 'dry_branches_medium_01', 'celandine_01']
TARGET_TRIS = {'tree': 9000, 'rock': 2500, 'plant': 3000}

def kind_of(name):
    if 'rock' in name or 'stone' in name or 'boulder' in name: return 'rock'
    if 'tree' in name or 'sapling' in name or 'searsia' in name or 'othonna' in name or 'trunk' in name: return 'tree'
    return 'plant'

def fetch_model(name):
    out = os.path.join(MODELS, name + '.glb')
    if os.path.exists(out): return f'skip {name}'
    try:
        files = json.loads(get(f'https://api.polyhaven.com/files/{name}'))
        g = files['gltf']['1k']['gltf']
        d = os.path.join(RAW, name); os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name + '.gltf'), 'wb') as f: f.write(get(g['url']))
        for rel, info in g.get('include', {}).items():
            p = os.path.join(d, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, 'wb') as f: f.write(get(info['url'], 600))
        return f'dl {name}'
    except Exception as e:
        return f'FAIL {name}: {e}'

def process_model(name):
    out = os.path.join(MODELS, name + '.glb')
    if os.path.exists(out): return f'skip {name}'
    src = os.path.join(RAW, name, name + '.gltf')
    if not os.path.exists(src): return f'missing {name}'
    k = kind_of(name)
    tmp = os.path.join(RAW, name + '_w.glb')
    cli = ['npx', '--no-install', 'gltf-transform']
    sh = sys.platform == 'win32'
    try:
        subprocess.run(cli + ['weld', src, tmp], check=True, capture_output=True, shell=sh)
        # meshoptimizer simplify, then shrink textures to 512 px
        ratio = '0.02' if k != 'rock' else '0.05'
        subprocess.run(cli + ['simplify', tmp, tmp, '--ratio', ratio, '--error', '0.004' if k == 'rock' else '0.01'], check=True, capture_output=True, shell=sh)
        subprocess.run(cli + ['resize', tmp, tmp, '--width', '512', '--height', '512'], check=True, capture_output=True, shell=sh)
        subprocess.run(cli + ['dedup', tmp, out], check=True, capture_output=True, shell=sh)
        return f'ok {name} {os.path.getsize(out)//1024} KB'
    except subprocess.CalledProcessError as e:
        return f'FAIL {name}: {e.stderr.decode(errors="ignore")[-400:]}'

if __name__ == '__main__':
    what = sys.argv[1:] or ['planets', 'ground', 'models']
    with ThreadPoolExecutor(8) as ex:
        if 'planets' in what:
            for r in ex.map(fetch_planet, PLANETS.items()): print(r, flush=True)
        if 'ground' in what:
            for r in ex.map(fetch_ground, GROUND_SETS): print(r, flush=True)
        if 'models' in what:
            for r in ex.map(fetch_model, SCATTER): print(r, flush=True)
    if 'models' in what or 'process' in what:
        for n in SCATTER: print(process_model(n), flush=True)

# Jalankan: Blender --background --python tools/make_character.py -- [preview.png]
# Membuat badan dewa chibi: SATU mesh menyatu (metaball) + rangka, ekspor ke public/assets/god.glb
# Warna per bagian disimpan di UV (u = indeks palet): 0 kulit, 1 jubah, 2 hiasan, 3 sandal
import bpy, bmesh, sys, os, math
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'god.glb')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- metaball (menghadap -Y, Z atas)
mb = bpy.data.metaballs.new('mb')
mb.resolution = 0.035
mb.render_resolution = 0.035
mb.threshold = 0.6
obj = bpy.data.objects.new('mb', mb)
scene.collection.objects.link(obj)

RSCALE = float(os.environ.get('RSCALE', '1.5'))
def ball(x, y, z, r, sx=1, sy=1, sz=1, stiff=2.0):
    e = mb.elements.new(type='ELLIPSOID')
    e.co = (x, y, z); e.radius = r * RSCALE
    e.size_x, e.size_y, e.size_z = sx, sy, sz
    e.stiffness = stiff
    return e

ball(0, 0, 1.30, 0.50)                       # kepala besar
ball(0, 0, 0.74, 0.34, 1.0, 0.92, 1.0)       # dada (lebih kecil -> ada lekuk leher)
ball(0, 0, 0.50, 0.46, 1.0, 0.95, 0.80)      # jubah bawah (bentuk pir)
for s in (-1, 1):
    ball(s * 0.40, 0, 0.80, 0.16)            # bahu
    ball(s * 0.54, 0, 0.72, 0.15)            # lengan
    ball(s * 0.65, -0.02, 0.64, 0.17)        # tangan
    ball(s * 0.20, 0, 0.26, 0.19)            # paha
    ball(s * 0.21, -0.06, 0.12, 0.18, 1.0, 1.35, 0.8)  # kaki

bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
bpy.data.objects.remove(obj)
body = bpy.data.objects.new('Body', me)
scene.collection.objects.link(body)
bpy.context.view_layer.objects.active = body
body.select_set(True)

# rapikan: gabung titik, haluskan, kurangi poligon
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
for _ in range(6):
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(me); bm.free()
dec = body.modifiers.new('dec', 'DECIMATE'); dec.ratio = min(1.0, 3200 / max(1, len(me.polygons)))
bpy.ops.object.modifier_apply(modifier='dec')
me = body.data
# taruh telapak kaki tepat di z=0
zmin = min(v.co.z for v in me.vertices)
for v in me.vertices: v.co.z -= zmin
for p in me.polygons: p.use_smooth = True
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
hv=[v.co for v in me.vertices if v.co.z>1.05]
print('HEAD halfwidth %.3f front %.3f top %.3f' % (max(abs(c.x) for c in hv), -min(c.y for c in hv), max(c.z for c in hv)))
print('BBOX x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f  polys %d' % (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs), len(me.polygons)))

# ---------------------------------------------------------------- warna per bagian lewat UV
NECK = 0.97; HAND = 0.56
def part(c):
    ax = abs(c.x)
    if c.z > NECK: return 0                      # kepala
    if ax > HAND and c.z < 0.95: return 0        # tangan
    if c.z < 0.17: return 3                      # sandal
    if 0.17 <= c.z < 0.25 and ax < 0.45: return 0  # betis
    if 0.25 <= c.z < 0.33: return 2              # tepi jubah
    if 0.60 <= c.z < 0.68 and ax < 0.5: return 2 # sabuk
    return 1
bm = bmesh.new(); bm.from_mesh(me)
def cut(co, no):
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, dist=0.0001, plane_co=co, plane_no=no)
for z in (NECK, 0.17, 0.25, 0.33, 0.60, 0.68): cut((0, 0, z), (0, 0, 1))
for x in (-HAND, HAND): cut((x, 0, 0), (1, 0, 0))
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.to_mesh(me); bm.free()
for p in me.polygons: p.use_smooth = True
uv = me.uv_layers.new(name='UVMap')
for p in me.polygons:
    u = (part(p.center) + 0.5) / 4.0
    for li in p.loop_indices: uv.data[li].uv = (u, 0.5)

mat = bpy.data.materials.new('GodBody')
mat.use_nodes = True
mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
me.materials.append(mat)

# ---------------------------------------------------------------- rangka + bobot manual
arm = bpy.data.armatures.new('Rig')
rig = bpy.data.objects.new('Rig', arm)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
def bone(name, head, tail, parent=None):
    b = arm.edit_bones.new(name); b.head = head; b.tail = tail; b.roll = 0
    if parent: b.parent = arm.edit_bones[parent]
    return b
bone('root', (0, 0, 0), (0, 0, 0.3))
bone('body', (0, 0, 0.3), (0, 0, 0.98), 'root')
bone('head', (0, 0, 0.98), (0, 0, 1.7), 'body')
bone('armL', (0.40, 0, 0.82), (0.74, 0, 0.62), 'body')
bone('armR', (-0.40, 0, 0.82), (-0.74, 0, 0.62), 'body')
bone('legL', (0.20, 0, 0.36), (0.20, 0, 0.0), 'root')
bone('legR', (-0.20, 0, 0.36), (-0.20, 0, 0.0), 'root')
bpy.ops.object.mode_set(mode='OBJECT')

def ss(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
groups = {n: body.vertex_groups.new(name=n) for n in ('body', 'head', 'armL', 'armR', 'legL', 'legR')}
for v in me.vertices:
    x, y, z = v.co
    w_head = ss(0.92, 1.06, z)
    w_arm = ss(0.36, 0.52, abs(x)) * (1 - ss(0.90, 1.0, z)) * ss(0.42, 0.52, z)
    w_leg = 1 - ss(0.24, 0.40, z)
    left = ss(-0.07, 0.07, x)
    w = {'head': w_head, 'armL': w_arm * (1 if x > 0 else 0), 'armR': w_arm * (1 if x < 0 else 0),
         'legL': w_leg * left, 'legR': w_leg * (1 - left)}
    w['body'] = max(0.0, 1 - sum(w.values()))
    tot = sum(w.values())
    for n, val in w.items():
        if val > 0.001: groups[n].add([v.index], val / tot, 'REPLACE')
body.parent = rig
mod = body.modifiers.new('Armature', 'ARMATURE'); mod.object = rig

# ---------------------------------------------------------------- ekspor
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=False,
                          export_skins=True, export_animations=False, export_yup=True, export_materials='EXPORT')
print('EXPORTED', OUT, os.path.getsize(OUT), 'bytes')

# ---------------------------------------------------------------- preview (opsional)
if argv:
    cols = [(1.0, 0.82, 0.66, 1), (0.95, 0.95, 0.95, 1), (0.95, 0.76, 0.3, 1), (0.54, 0.35, 0.17, 1)]
    mats = []
    for i, c in enumerate(cols):
        m = bpy.data.materials.new('p%d' % i); m.diffuse_color = c; mats.append(m)
    me.materials.clear()
    for m in mats: me.materials.append(m)
    for p in me.polygons: p.material_index = part(p.center)
    # pose uji: ayun lengan & kaki untuk cek deformasi
    pb = rig.pose.bones
    for n, ang in (('legL', 0.6), ('legR', -0.6), ('armL', -0.7), ('armR', 0.7)):
        pb[n].rotation_mode = 'XYZ'; pb[n].rotation_euler = (ang, 0, 0)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam); scene.camera = cam
    cam.location = (1.6, -4.6, 1.3); cam.data.lens = 60
    d = Vector((0, 0, 0.85)) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'
    scene.render.resolution_x = 700; scene.render.resolution_y = 700
    scene.render.filepath = argv[0]
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', argv[0])

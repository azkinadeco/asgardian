# Jalankan: Blender --background --python tools/make_props.py -- [preview.png]
# Membuat aset dekorasi & rambut -> public/assets/props.glb (tiap objek = satu aset bernama)
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix, noise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets', 'props.glb')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
T, S = Matrix.Translation, Matrix.Diagonal

MATS = {}
def mat(name, rgb, emit=0.0):
    if name not in MATS:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.7
        if emit: b.inputs['Emission'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
        m.diffuse_color = (*rgb, 1)
        MATS[name] = m
    return MATS[name]
def hexc(h): return tuple(((h >> s) & 255) / 255 for s in (16, 8, 0))
C = dict(marble=hexc(0xf4efe6), gold=hexc(0xf2c14e), cream=hexc(0xf7e3a1), rock=hexc(0x7a6a5c), dirt=hexc(0xa77b52), stone=hexc(0x8d8478),
         white=(1, 1, 1), leaf=hexc(0x3f9b4b), leaf2=hexc(0x58b84f), trunk=hexc(0x7a5230), roof=hexc(0xd9694a), win=hexc(0x3b6fe0),
         coral=hexc(0xff8a7a), crystal=hexc(0x7de3ff), hair=hexc(0xdddddd))

class Build:
    def __init__(self, name): self.name = name; self.bm = bmesh.new(); self.mats = []
    def mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)
    def _tag(self, n0, m):
        self.bm.faces.ensure_lookup_table()
        i = self.mi(m)
        for f in self.bm.faces[n0:]: f.material_index = i
    def cone(self, m, r1, r2, depth, loc, seg=12, scale=(1, 1, 1)):  # r1 bawah, r2 atas, loc = pusat alas
        n0 = len(self.bm.faces)
        mx = T(Vector(loc) + Vector((0, 0, depth / 2))) @ S((*scale, 1))
        bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth, matrix=mx)
        self._tag(n0, m)
    def box(self, m, size, loc, rot=None):
        n0 = len(self.bm.faces)
        mx = T(Vector(loc)) @ (rot or Matrix.Identity(4)) @ S((*size, 1))
        bmesh.ops.create_cube(self.bm, size=1, matrix=mx); self._tag(n0, m)
    def sphere(self, m, r, loc, scale=(1, 1, 1), seg=12):
        n0 = len(self.bm.faces)
        bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=max(6, seg // 2 + 2), radius=r, matrix=T(Vector(loc)) @ S((*scale, 1)))
        self._tag(n0, m)
    def ico(self, m, r, loc, sub=2, scale=(1, 1, 1)):
        n0 = len(self.bm.faces)
        bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r, matrix=T(Vector(loc)) @ S((*scale, 1)))
        self._tag(n0, m)
    def displace(self, amt, freq=1.5, seed=0.0):
        self.bm.normal_update()
        for v in self.bm.verts:
            v.co += v.normal * amt * noise.noise(v.co * freq + Vector((seed, seed * 1.7, -seed)))
    def finish(self, smooth=True, bevel=0.0):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for m in self.mats: me.materials.append(mat(m, C[m], 1.5 if m == 'win' else 0))
        for p in me.polygons: p.use_smooth = smooth
        ob = bpy.data.objects.new(self.name, me); scene.collection.objects.link(ob)
        if bevel:
            bpy.context.view_layer.objects.active = ob
            md = ob.modifiers.new('bev', 'BEVEL'); md.width = bevel; md.segments = 2; md.limit_method = 'ANGLE'
            bpy.ops.object.modifier_apply(modifier='bev')
        if smooth:
            ob.data.use_auto_smooth = True; ob.data.auto_smooth_angle = math.radians(50)
        return ob

def blob(name, m, balls, res=0.1, target=500, flatten=1.0):
    mb = bpy.data.metaballs.new(name + '_mb'); mb.resolution = res; mb.threshold = 0.6
    o = bpy.data.objects.new(name + '_mb', mb); scene.collection.objects.link(o)
    for (x, y, z, r) in balls:
        e = mb.elements.new(); e.co = (x, y, z); e.radius = r * 1.5
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(o)
    me.name = name
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    for _ in range(3): bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in bm.verts: v.co.z *= flatten
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    d = ob.modifiers.new('dec', 'DECIMATE'); d.ratio = min(1.0, target / max(1, len(me.polygons)))
    bpy.ops.object.modifier_apply(modifier='dec')
    ob.data.materials.append(mat(m, C[m]))
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def join(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name; objs[0].data.name = name
    return objs[0]

props = []
# ---- awan
props.append(blob('cloud', 'white', [(0, 0, 0, .62), (.62, .05, -.05, .46), (-.62, 0, -.05, .5), (.2, .12, .3, .42), (-.27, -.1, .27, .38), (1.05, 0, -.12, .3), (-1.05, .05, -.12, .32), (.1, -.25, 0, .4)], res=0.11, target=520, flatten=0.75))
# ---- batu bawah pulau (atas di z=0, turun sampai -1, radius 0.5)
b = Build('island')
b.cone('rock', 0.10, 0.5, 1.0, (0, 0, -1), seg=11)
bmesh.ops.subdivide_edges(b.bm, edges=b.bm.edges[:], cuts=2, use_grid_fill=True)
for v in b.bm.verts:
    if v.co.z < -0.02:
        k = 1 + 0.22 * noise.noise(v.co * 4.0); v.co.x *= k; v.co.y *= k
        v.co.z += 0.06 * noise.noise(v.co * 6.0 + Vector((3, 1, 2)))
b.bm.faces.ensure_lookup_table()
di = b.mi('dirt')
for f in b.bm.faces:
    if f.calc_center_median().z > -0.22: f.material_index = di
props.append(b.finish(smooth=False))
# ---- batu bulat
b = Build('boulder'); b.ico('stone', 1.0, (0, 0, 0), sub=2); b.displace(0.22, 1.3, 2.0); props.append(b.finish(smooth=False))
# ---- pilar Yunani (tinggi 6)
b = Build('column')
b.cone('marble', 0.5, 0.43, 4.9, (0, 0, 0.5), seg=20)
for v in b.bm.verts:
    a = math.atan2(v.co.y, v.co.x); k = 1 - 0.07 * (0.5 + 0.5 * math.cos(a * 10))
    v.co.x *= k; v.co.y *= k
b.cone('marble', 0.78, 0.78, 0.25, (0, 0, 0), seg=20); b.cone('gold', 0.64, 0.6, 0.25, (0, 0, 0.25), seg=20)
b.cone('gold', 0.5, 0.62, 0.25, (0, 0, 5.4), seg=20); b.box('marble', (1.5, 1.5, 0.35), (0, 0, 5.825))
props.append(b.finish(smooth=True))
# ---- menara Asgard
b = Build('tower')
b.cone('rock', 0.4, 2.6, 6, (0, 0, -6), seg=9)
for v in b.bm.verts:
    if v.co.z < -0.1: k = 1 + 0.25 * noise.noise(v.co * 0.9); v.co.x *= k; v.co.y *= k
b.cone('cream', 2.2, 1.7, 9, (0, 0, 0), seg=16)
b.cone('gold', 2.35, 2.35, 0.4, (0, 0, 0), seg=16); b.cone('gold', 2.0, 2.0, 0.35, (0, 0, 4.2), seg=16)
b.cone('gold', 2.5, 2.5, 0.45, (0, 0, 9), seg=16)
b.cone('gold', 2.3, 1.1, 3.0, (0, 0, 9.45), seg=16); b.cone('gold', 1.1, 0.0, 3.2, (0, 0, 12.45), seg=16)
b.sphere('gold', 0.35, (0, 0, 15.7))
for i in range(6):
    a = i / 6 * math.tau; r = 1.95
    b.box('win', (0.55, 0.3, 1.3), (math.cos(a) * r, math.sin(a) * r, 6.3), Matrix.Rotation(a + math.pi / 2, 4, 'Z'))
props.append(b.finish(smooth=True))
# ---- pohon cemara
tr = Build('trunk'); tr.cone('trunk', 0.22, 0.16, 1.1, (0, 0, 0), seg=8); t0 = tr.finish()
fo = blob('fol', 'leaf', [(0, 0, 1.4, .72), (0, 0, 2.3, .62), (0, 0, 3.05, .46), (0, 0, 3.65, .3), (.25, .1, 1.1, .45), (-.25, -.1, 1.2, .45)], res=0.12, target=360)
props.append(join('tree', [t0, fo]))
# ---- kepala palu
b = Build('hammer'); b.box('stone', (2.4, 1.7, 1.7), (0, 0, 0))
for s in (-1, 1): b.box('gold', (0.3, 1.82, 1.82), (s * 0.8, 0, 0))
props.append(b.finish(smooth=True, bevel=0.14))
# ---- karang
balls = []
import random; random.seed(4)
for i in range(6):
    a = i / 6 * math.tau + random.random(); tilt = 0.35 + random.random() * 0.5; L = 1.6 + random.random() * 1.4
    for k in range(7):
        t = k / 6; r = 0.36 * (1 - 0.3 * t)
        balls.append((math.cos(a) * math.sin(tilt) * L * t, math.sin(a) * math.sin(tilt) * L * t, 0.2 + math.cos(tilt) * L * t, r))
props.append(blob('coral', 'coral', balls, res=0.1, target=700))
# ---- kristal
b = Build('crystal')
for (x, y, h, r, tx) in [(0, 0, 3.2, .55, 0), (.6, .2, 2.0, .4, .35), (-.5, .3, 1.6, .35, -.4), (.1, -.6, 1.3, .3, .2)]:
    n0 = len(b.bm.verts)
    b.cone('crystal', r * 0.8, r, h * 0.75, (x, y, 0), seg=6); b.cone('crystal', r, 0.0, h * 0.25, (x, y, h * 0.75), seg=6)
    b.bm.verts.ensure_lookup_table()
    for v in b.bm.verts[n0:]: v.co.x += tx * v.co.z * 0.3
props.append(b.finish(smooth=False))
# ---- kuil Yunani (dekorasi jauh)
b = Build('temple')
for i, (w, d) in enumerate([(13, 9), (12.2, 8.2), (11.4, 7.4)]): b.box('marble', (w, d, 0.4), (0, 0, 0.2 + i * 0.4))
for x in [-4.6, -2.76, -0.92, 0.92, 2.76, 4.6]:
    for y in (-3, 3):
        b.cone('marble', 0.42, 0.36, 5, (x, y, 1.2), seg=10); b.box('marble', (1.0, 1.0, 0.25), (x, y, 6.3))
b.box('cream', (9.2, 5.2, 4.9), (0, 0, 3.7)); b.box('marble', (11.6, 7.6, 0.7), (0, 0, 6.8)); b.box('gold', (11.8, 7.8, 0.18), (0, 0, 7.2))
n0 = len(b.bm.verts); b.box('roof', (11.6, 7.6, 2.2), (0, 0, 8.4)); b.bm.verts.ensure_lookup_table()
for v in b.bm.verts[n0:]:
    if v.co.z > 8.4: v.co.x = 0
b.sphere('gold', 0.35, (0, -3.8, 9.7)); b.sphere('gold', 0.35, (0, 3.8, 9.7))
props.append(b.finish(smooth=False))
# ---- rambut ikal & janggut (pusat = pusat kepala, radius kepala 0.426, wajah di -Y)
hb = []
for i in range(60):
    z = 1 - (i + 0.5) / 60 * 1.25; rr = math.sqrt(max(0, 1 - z * z)); a = i * 2.39996
    d = Vector((math.cos(a) * rr, math.sin(a) * rr, z))
    if d.y < -0.05 and d.z < 0.58: continue      # wajah & pipi terbuka
    if d.z < 0.2 and d.y < 0.35: continue        # sisi bawah hanya di belakang kepala
    hb.append((d.x * 0.43, d.y * 0.43, d.z * 0.43, 0.15))
props.append(blob('hair', 'hair', hb, res=0.045, target=700))
bb = []
for row, (z, rad, n) in enumerate([(-0.21, 0.37, 7), (-0.30, 0.33, 7), (-0.39, 0.25, 5), (-0.46, 0.14, 3)]):
    for k in range(n):
        phi = (k / (n - 1) - 0.5) * math.radians(135 - row * 18)
        bb.append((math.sin(phi) * rad, -math.cos(phi) * rad * 0.98, z, 0.12))
bb += [(-0.08, -0.42, -0.13, 0.075), (0.08, -0.42, -0.13, 0.075), (-0.18, -0.39, -0.16, 0.07), (0.18, -0.39, -0.16, 0.07)]
props.append(blob('beard', 'hair', bb, res=0.04, target=600))

for o in props:
    xs = [v.co for v in o.data.vertices]
    print('PROP %-8s polys %5d  x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % (o.name, len(o.data.polygons), min(c.x for c in xs), max(c.x for c in xs), min(c.y for c in xs), max(c.y for c in xs), min(c.z for c in xs), max(c.z for c in xs)))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='EXPORT', export_animations=False)
print('EXPORTED', OUT, os.path.getsize(OUT), 'bytes')

if argv:
    grid = {'cloud': (-9, 0, 2, 1.5), 'island': (-5.5, 0, 3, 3), 'boulder': (-2.5, 0, 1, 1), 'column': (0, 0, 0, 1), 'tower': (4.5, 4, 0, 0.6), 'tree': (2.2, 0, 0, 1.2),
            'hammer': (-9, -5, 1, 1), 'coral': (-5.5, -5, 0, 1), 'crystal': (-2.5, -5, 0, 1), 'temple': (10, 3, 0, 0.5), 'hair': (1, -5, 1, 2.5), 'beard': (3.5, -5, 1.5, 2.5)}
    for o in props:
        x, y, z, s = grid[o.name]; o.location = (x, y, z); o.scale = (s, s, s)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.location = (1, -30, 13); cam.data.lens = 50
    cam.rotation_euler = (Vector((1, -1, 2.5)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'
    scene.render.resolution_x = 1300; scene.render.resolution_y = 700; scene.render.filepath = argv[0]
    bpy.ops.render.render(write_still=True)

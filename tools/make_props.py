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
         coral=hexc(0xff8a7a), crystal=hexc(0x7de3ff), hair=hexc(0xdddddd),
         bolt=hexc(0xffe04a), steel=hexc(0xb8bec8), wood=hexc(0x8a5a2b), metal=hexc(0xd9a441), crest=hexc(0xd0312d), gem=hexc(0xe0344a), flame=hexc(0xff6a2b), feather=(1, 1, 1))

class Build:
    def __init__(self, name): self.name = name; self.bm = bmesh.new(); self.mats = []
    def mi(self, m):
        if m not in self.mats: self.mats.append(m)
        return self.mats.index(m)
    def _tag(self, n0, m):
        # face baru tidak selalu berada di akhir daftar, jadi tandai lewat flag `tag`
        i = self.mi(m)
        for f in self.bm.faces:
            if not f.tag: f.material_index = i; f.tag = True
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

# ================================================================ aksesori dewa
def poly_extrude(b, m, pts, thick):  # pts di bidang XZ
    n0 = len(b.bm.faces)
    f = b.bm.faces.new([b.bm.verts.new((x, -thick / 2, z)) for x, z in pts])
    r = bmesh.ops.extrude_face_region(b.bm, geom=[f])
    for v in [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]: v.co.y += thick
    b._tag(n0, m)
    bmesh.ops.recalc_face_normals(b.bm, faces=b.bm.faces[:])
RZ = lambda a: Matrix.Rotation(a, 4, 'Z')
RX = lambda a: Matrix.Rotation(a, 4, 'X')
RY = lambda a: Matrix.Rotation(a, 4, 'Y')
# --- senjata (pegangan di titik asal, mengarah ke +Z)
b = Build('acc_bolt')
poly_extrude(b, 'bolt', [(0.02, 1.0), (0.26, 1.0), (0.08, 0.55), (0.24, 0.55), (-0.1, -0.15), (-0.02, 0.38), (-0.2, 0.38)], 0.12)
props.append(b.finish(smooth=False, bevel=0.02))
b = Build('acc_trident')
b.cone('gold', 0.035, 0.035, 1.75, (0, 0, -0.55), seg=8); b.sphere('gold', 0.06, (0, 0, -0.55))
b.box('gold', (0.5, 0.07, 0.08), (0, 0, 1.2)); b.cone('gold', 0.05, 0.0, 0.42, (0, 0, 1.22), seg=8)
for sx in (-1, 1):
    b.cone('gold', 0.045, 0.045, 0.2, (sx * 0.22, 0, 1.2), seg=8); b.cone('gold', 0.05, 0.0, 0.3, (sx * 0.22, 0, 1.4), seg=8)
props.append(b.finish(smooth=True))
b = Build('acc_spear')
b.cone('wood', 0.032, 0.032, 1.7, (0, 0, -0.55), seg=8); b.cone('gold', 0.055, 0.045, 0.1, (0, 0, 1.12), seg=8)
b.cone('steel', 0.1, 0.0, 0.42, (0, 0, 1.2), seg=4, scale=(1, 0.35, 1)); b.cone('steel', 0.03, 0.1, 0.1, (0, 0, 1.12), seg=4, scale=(1, 0.35, 1))
props.append(b.finish(smooth=False))
b = Build('acc_hammer')
b.cone('wood', 0.045, 0.04, 0.62, (0, 0, -0.1), seg=8)
for z in (0.0, 0.12, 0.24): b.cone('gold', 0.055, 0.055, 0.035, (0, 0, z), seg=8)
b.sphere('gold', 0.065, (0, 0, -0.12))
b.box('steel', (0.56, 0.3, 0.3), (0, 0, 0.66))
for sx in (-1, 1): b.box('gold', (0.07, 0.33, 0.33), (sx * 0.17, 0, 0.66))
props.append(b.finish(smooth=True, bevel=0.035))
# --- sayap (sisi +X; sisi lain dicerminkan di game)
b = Build('acc_wing')
for i, (ang, ln) in enumerate([(0.15, 0.62), (0.55, 0.56), (0.95, 0.46), (1.3, 0.34)]):
    mx = RY(-ang) @ T(Vector((ln / 2, 0, 0))) @ S((ln / 2, 0.035, 0.11 - i * 0.012, 1))
    n0 = len(b.bm.faces); bmesh.ops.create_uvsphere(b.bm, u_segments=10, v_segments=6, radius=1, matrix=mx); b._tag(n0, 'feather')
b.sphere('feather', 0.1, (0.02, 0, 0.02), scale=(1, 0.5, 1))
props.append(b.finish(smooth=True))
# --- helm (pusat = pusat kepala, wajah di -Y)
b = Build('acc_helmet')
n0 = len(b.bm.faces); bmesh.ops.create_uvsphere(b.bm, u_segments=20, v_segments=12, radius=0.475); b._tag(n0, 'metal')
bmesh.ops.delete(b.bm, geom=[v for v in b.bm.verts if v.co.z < 0.03 and not (v.co.y > 0.1 and v.co.z > -0.2) and not (abs(v.co.x) > 0.3 and v.co.y > -0.25 and v.co.z > -0.26)], context='VERTS')
b.box('metal', (0.07, 0.05, 0.3), (0, -0.47, 0.0))                       # pelindung hidung
# jambul: sirip lonjong dari depan ke belakang
n0 = len(b.bm.faces); bmesh.ops.create_uvsphere(b.bm, u_segments=14, v_segments=10, radius=1, matrix=T(Vector((0, 0.04, 0.1))) @ S((0.055, 0.56, 0.6, 1)))
bmesh.ops.delete(b.bm, geom=[v for v in b.bm.verts if not v.link_faces or (all(not f.tag for f in v.link_faces) and v.co.z < 0.3)], context='VERTS')
b._tag(n0, 'crest')
props.append(b.finish(smooth=True))
# --- mahkota
b = Build('acc_crown')
b.cone('gold', 0.33, 0.35, 0.13, (0, 0, 0.42), seg=16)
for i in range(8):
    a = i / 8 * math.tau; r = 0.335
    b.cone('gold', 0.085, 0.0, 0.2 if i % 2 else 0.13, (math.cos(a) * r, math.sin(a) * r, 0.55), seg=4)
    if i % 2 == 0: b.sphere('gem', 0.04, (math.cos(a) * 0.35, math.sin(a) * 0.35, 0.49), seg=8)
props.append(b.finish(smooth=False))
# --- mahkota laurel
b = Build('acc_laurel')
for i in range(18):
    a = i / 18 * math.tau
    if abs(a - math.pi * 1.5) < 0.28: continue                           # celah di depan
    side = 1 if math.cos(a) > 0 else -1
    mx = T(Vector((math.cos(a) * 0.46, math.sin(a) * 0.46, 0.2 + 0.05 * math.sin(a)))) @ RZ(a + math.pi / 2 + side * 0.35 * (1 if math.sin(a) < 0 else -1)) @ RX(0.5) @ S((0.13, 0.035, 0.06, 1))
    n0 = len(b.bm.faces); bmesh.ops.create_uvsphere(b.bm, u_segments=8, v_segments=5, radius=1, matrix=mx); b._tag(n0, 'gold')
props.append(b.finish(smooth=True))
# --- rambut api
fb = []
for (ox, oy, h, lean) in [(0, 0.02, 0.62, 0.0), (0.2, 0.05, 0.42, 0.25), (-0.2, 0.05, 0.42, -0.25), (0.05, 0.22, 0.4, 0.0), (0.0, -0.16, 0.34, 0.0)]:
    for k in range(7):
        t = k / 6; fb.append((ox + lean * t * 0.5 + 0.05 * math.sin(t * 5), oy + 0.05 * t, 0.26 + h * t, 0.2 * (1 - 0.72 * t)))
for i in range(14):
    a = i / 14 * math.tau; fb.append((math.cos(a) * 0.3, math.sin(a) * 0.3 + 0.05, 0.22, 0.17))
props.append(blob('acc_flame', 'flame', fb, res=0.045, target=650))

# ================================================================ rintangan & penanda
b = Build('hub')                                   # poros palang berputar (tinggi 1.3)
b.cone('stone', 1.0, 0.92, 0.26, (0, 0, 0), seg=18); b.cone('gold', 0.74, 0.62, 0.72, (0, 0, 0.26), seg=18)
b.cone('stone', 0.82, 0.82, 0.16, (0, 0, 0.98), seg=18); b.sphere('gold', 0.5, (0, 0, 1.08), scale=(1, 1, 0.55), seg=16)
for i in range(6):
    a = i / 6 * math.tau; b.sphere('gem', 0.09, (math.cos(a) * 0.7, math.sin(a) * 0.7, 0.62), seg=8)
props.append(b.finish(smooth=True))
b = Build('pivot')                                 # gantungan palu berayun
b.ico('gold', 0.8, (0, 0, 0.2), sub=1); b.cone('stone', 1.0, 1.0, 0.24, (0, 0, 0.1), seg=14)
for i in range(4):
    a = i / 4 * math.tau + 0.4; b.cone('gold', 0.16, 0.0, 0.6, (math.cos(a) * 0.95, math.sin(a) * 0.95, 0.2), seg=5)
props.append(b.finish(smooth=False))
b = Build('gate')                                  # gerbang finis (tiang di x = +-6.5)
for sx in (-1, 1):
    b.cone('marble', 0.72, 0.6, 7.0, (sx * 6.5, 0, 0), seg=14)
    b.cone('gold', 0.95, 0.95, 0.35, (sx * 6.5, 0, 0), seg=14); b.cone('gold', 0.78, 0.78, 0.3, (sx * 6.5, 0, 3.4), seg=14); b.cone('gold', 0.6, 0.85, 0.4, (sx * 6.5, 0, 6.8), seg=14)
b.box('gold', (14.9, 1.0, 0.95), (0, 0, 7.65))
poly_extrude(b, 'marble', [(-7.4, 8.15), (7.4, 8.15), (0, 10.4)], 0.8)
poly_extrude(b, 'gold', [(-2.2, 8.5), (2.2, 8.5), (0, 9.7)], 0.95)
b.sphere('gold', 0.42, (0, 0, 10.7))
for i in range(11):
    x = -5.5 + i * 1.1
    poly_extrude(b, 'crest' if i % 2 else 'win', [(x - 0.45, 7.15), (x + 0.45, 7.15), (x, 6.25)], 0.06)
props.append(b.finish(smooth=False))
b = Build('flag')                                  # bendera checkpoint
b.cone('gold', 0.08, 0.06, 3.3, (0, 0, 0), seg=8); b.sphere('gold', 0.14, (0, 0, 3.35), seg=8)
NX, NZ = 7, 3; grid = [[b.bm.verts.new((0.07 + ix / (NX - 1) * 1.35, math.sin(ix * 0.9) * 0.1 * (ix / (NX - 1)), 2.25 + iz / (NZ - 1) * 0.95 * (1 - 0.35 * ix / (NX - 1)) + 0.17 * ix / (NX - 1))) for iz in range(NZ)] for ix in range(NX)]
for ix in range(NX - 1):
    for iz in range(NZ - 1): b.bm.faces.new((grid[ix][iz], grid[ix + 1][iz], grid[ix + 1][iz + 1], grid[ix][iz + 1]))
b._tag(0, 'crest')
props.append(b.finish(smooth=True))

# ================================================================ bangunan ikonik tiap map
b = Build('palace')                                # istana Asgard
b.cone('rock', 1.5, 9.5, 12, (0, 0, -12), seg=10)
for v in b.bm.verts:
    if v.co.z < -0.2: k = 1 + 0.2 * noise.noise(v.co * 0.4); v.co.x *= k; v.co.y *= k
b.cone('cream', 6.5, 5.6, 7, (0, 0, 0), seg=18); b.cone('gold', 6.9, 6.9, 0.6, (0, 0, 7), seg=18)
b.cone('cream', 3.6, 3.0, 10, (0, 0, 7.6), seg=16); b.cone('gold', 3.4, 3.4, 0.5, (0, 0, 17.6), seg=16)
b.sphere('gold', 3.3, (0, 0, 18.0), scale=(1, 1, 1.15), seg=18); b.cone('gold', 0.5, 0.0, 5, (0, 0, 21), seg=8)
for i in range(4):
    a = i / 4 * math.tau + 0.78; x, y = math.cos(a) * 6.8, math.sin(a) * 6.8
    b.cone('cream', 1.7, 1.4, 12, (x, y, 0), seg=12); b.cone('gold', 1.9, 1.9, 0.4, (x, y, 12), seg=12); b.cone('gold', 1.8, 0.0, 4.5, (x, y, 12.4), seg=12)
for i in range(10):
    a = i / 10 * math.tau; b.box('win', (0.8, 0.4, 2.0), (math.cos(a) * 6.05, math.sin(a) * 6.05, 4), RZ(a + math.pi / 2))
props.append(b.finish(smooth=True))
# patung raksasa (Olympus / taman)
st = blob('statue_fig', 'marble', [(0, 0, 4.6, .9), (0, 0, 3.2, .85), (0, 0, 2.3, .95), (-.45, 0, 1.1, .5), (.45, 0, 1.1, .5), (-.45, -.1, .35, .5), (.45, -.1, .35, .5),
                                   (-1.0, 0, 3.5, .42), (-1.5, 0, 3.0, .38), (1.0, 0, 3.9, .42), (1.45, 0, 4.7, .38), (1.6, 0, 5.5, .4)], res=0.16, target=700)
pb = Build('statue_base'); pb.box('marble', (3.2, 3.2, 0.8), (0, 0, -0.4)); pb.box('gold', (3.5, 3.5, 0.25), (0, 0, -0.9)); pb.box('marble', (3.9, 3.9, 0.6), (0, 0, -1.3))
poly_extrude(pb, 'bolt', [(1.5, 7.6), (1.95, 7.6), (1.7, 6.7), (2.0, 6.7), (1.45, 5.3), (1.6, 6.3), (1.3, 6.3)], 0.25)
props.append(join('statue', [st, pb.finish(smooth=False)]))
b = Build('lighthouse')                            # mercusuar (laut Poseidon)
for i in range(5):
    r0, r1 = 2.4 - i * 0.26, 2.4 - (i + 1) * 0.26
    b.cone('white' if i % 2 else 'coral', r0, r1, 3.0, (0, 0, i * 3.0), seg=16)
b.cone('gold', 1.6, 1.6, 0.35, (0, 0, 15), seg=16); b.cone('bolt', 0.9, 0.9, 1.6, (0, 0, 15.35), seg=12)
b.cone('gold', 1.5, 0.0, 2.0, (0, 0, 16.95), seg=16); b.cone('rock', 3.6, 3.0, 1.2, (0, 0, -1.2), seg=9)
props.append(b.finish(smooth=True))
b = Build('sword')                                 # pedang raksasa tertancap (Muspelheim)
poly_extrude(b, 'steel', [(-0.9, 0), (0.9, 0), (0.9, 9.5), (0.0, 11.5), (-0.9, 9.5)], 0.35)
poly_extrude(b, 'gold', [(-2.4, 11.3), (2.4, 11.3), (2.8, 12.2), (-2.8, 12.2)], 0.7)
b.cone('wood', 0.35, 0.3, 3.0, (0, 0, 12.2), seg=10); b.sphere('gold', 0.6, (0, 0, 15.5), seg=10); b.sphere('gem', 0.45, (0, -0.3, 11.75), seg=10)
props.append(b.finish(smooth=False, bevel=0.06))
b = Build('icecastle')                             # kastil es (Jotunheim)
random.seed(9)
for i in range(11):
    a = i / 11 * math.tau; r = 0 if i == 0 else 3.2 + random.random() * 1.6; h = 12 if i == 0 else 4 + random.random() * 5; rad = 1.5 if i == 0 else 0.8 + random.random() * 0.5
    x, y = math.cos(a) * r, math.sin(a) * r
    b.cone('crystal', rad, rad * 0.85, h, (x, y, 0), seg=6); b.cone('white', rad * 0.95, 0.0, h * 0.35, (x, y, h), seg=6)
b.cone('crystal', 5.6, 4.6, 2.2, (0, 0, -2.2), seg=8)
props.append(b.finish(smooth=False))
b = Build('ruin')                                  # reruntuhan gerbang (Hades)
for sx, h in ((-1, 7.5), (1, 5.2)):
    b.cone('stone', 0.9, 0.78, h, (sx * 3.2, 0, 0), seg=10); b.box('stone', (2.3, 2.3, 0.5), (sx * 3.2, 0, 0.25)); b.box('stone', (1.9, 1.9, 0.45), (sx * 3.2, 0, h))
b.box('stone', (5.0, 1.5, 1.0), (-1.4, 0, 8.4), RY(0.12)); b.box('stone', (1.6, 1.4, 0.9), (2.6, 1.6, 0.45), RZ(0.5)); b.box('stone', (1.2, 1.1, 0.8), (0.6, -1.9, 0.4), RZ(-0.3))
b.sphere('gem', 0.35, (-3.2, -0.85, 5.5), seg=8)
props.append(b.finish(smooth=False, bevel=0.07))

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
        if o.name in ('palace', 'statue', 'lighthouse', 'sword', 'icecastle', 'ruin'):
            x, y, z, s = {'palace': (-12, 12, 0, 0.35), 'statue': (-5, 12, 1, 0.9), 'lighthouse': (0, 12, 0, 0.5), 'sword': (5, 12, 0, 0.55), 'icecastle': (11, 12, 0, 0.5), 'ruin': (17, 10, 0, 0.6)}[o.name]
        elif o.name in ('hub', 'pivot', 'gate', 'flag'):
            x, y, z, s = {'hub': (-9, -17, 0, 2), 'pivot': (-5, -17, 1, 2), 'gate': (4, -17, 0, 0.5), 'flag': (11, -17, 0, 1.3)}[o.name]
        elif o.name.startswith('acc_'):
            i = [q.name for q in props if q.name.startswith('acc_')].index(o.name); x, y, z, s = -10 + i * 2.6, -11, 1, 2.2
        else: x, y, z, s = grid[o.name]
        o.location = (x, y, z); o.scale = (s, s, s)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.location = (2, -40, 20); cam.data.lens = 46
    cam.rotation_euler = (Vector((1, -4, 2.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'
    scene.render.resolution_x = 1300; scene.render.resolution_y = 700; scene.render.filepath = argv[0]
    bpy.ops.render.render(write_still=True)

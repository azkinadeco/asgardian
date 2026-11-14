// Karakter dewa chibi (orisinal) dari bentuk primitif three.js
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from '/jsm/utils/SkeletonUtils.js';
import { prop } from './props.js';
import { mergeGeometries } from '/jsm/utils/BufferGeometryUtils.js';
import { bakeGeo } from './merge.js';

export const GODS = [
  { id: 'zeus', name: 'Zeus', robe: 0xffffff, trim: 0xf2c14e, skin: 0xffd2a8, hair: 0xf2f2f2, beard: true, head: 'laurel', item: 'bolt' },
  { id: 'poseidon', name: 'Poseidon', robe: 0x2aa7d8, trim: 0x9ff0ff, skin: 0xf2c9a0, hair: 0x1c6fa8, beard: true, head: 'crown', item: 'trident' },
  { id: 'athena', name: 'Athena', robe: 0xe8e2ff, trim: 0x8a6fe8, skin: 0xffd9b8, hair: 0x6b4a2b, head: 'helmet', metal: 0xd9a441, crest: 0x3b6fe0, item: 'spear' },
  { id: 'hades', name: 'Hades', cape: 0x5b3a8a, robe: 0x3a2a55, trim: 0x9b5cff, skin: 0xcfd6e6, hair: 0x1b1b2a, beard: true, head: 'helmet', metal: 0x2a2a3a, crest: 0x9b5cff },
  { id: 'apollo', name: 'Apollo', robe: 0xfff1b8, trim: 0xff9d2e, skin: 0xffcf99, hair: 0xf7c531, head: 'laurel' },
  { id: 'ares', name: 'Ares', cape: 0x5a1010, robe: 0xc0392b, trim: 0x2b2b2b, skin: 0xe8b48a, hair: 0x2b1a12, head: 'helmet', metal: 0xb0b6bf, crest: 0xff3b30, item: 'spear' },
  { id: 'hermes', name: 'Hermes', robe: 0x8fe3c0, trim: 0xffffff, skin: 0xffd9b8, hair: 0xb5651d, head: 'wings' },
  { id: 'thor', name: 'Thor', cape: 0xd0312d, robe: 0x4a5a78, trim: 0xd9d9d9, skin: 0xffd2a8, hair: 0xd9562b, beard: true, head: 'wings', item: 'hammer' },
  { id: 'loki', name: 'Loki', robe: 0x7b3fa0, trim: 0xff9d2e, skin: 0xf1dcc9, hair: 0xff6a2b, head: 'flame' },
  { id: 'odin', name: 'Odin', cape: 0x27364f, robe: 0x5a6f8f, trim: 0xc9d2e0, skin: 0xf0c8a0, hair: 0xbfc5cc, beard: true, head: 'crown', patch: true, item: 'spear' },
];

// kostum: warna jubah alternatif yang dibuka dengan koin
export const SKINS = [
  { id: 'default', name: 'Asli', cost: 0 },
  { id: 'es', name: 'Es', cost: 100, robe: 0xbfe9ff, trim: 0x4dc3ff },
  { id: 'mawar', name: 'Mawar', cost: 100, robe: 0xff8fb3, trim: 0xffffff },
  { id: 'laut', name: 'Laut', cost: 120, robe: 0x2fc4b2, trim: 0xeafff9 },
  { id: 'api', name: 'Api', cost: 120, robe: 0xff7a2b, trim: 0x2b2b2b },
  { id: 'bayangan', name: 'Bayangan', cost: 150, robe: 0x2a2438, trim: 0x9b5cff },
  { id: 'emas', name: 'Emas', cost: 200, robe: 0xf2c14e, trim: 0xffffff },
  { id: 'kerajaan', name: 'Kerajaan', cost: 0, lvl: 5, robe: 0x6a3fb8, trim: 0xf2c14e },
  { id: 'legenda', name: 'Legenda', cost: 0, lvl: 10, robe: 0xfdfdfd, trim: 0xffd23a },
];
const hex = c => '#' + c.toString(16).padStart(6, '0');
export const godColor = id => hex((GODS.find(g => g.id === id) || GODS[0]).robe);

function makePrimitive(def) {
  const g = new THREE.Group(), rig = new THREE.Group();
  g.add(rig);
  const M = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
  const add = (geo, m, x, y, z, parent) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    (parent || rig).add(o);
    return o;
  };
  const robe = M(def.robe), trim = M(def.trim), skin = M(def.skin), hair = M(def.hair), dark = M(0x1a1a1a), gold = M(0xf2c14e);

  // badan (jubah)
  add(new THREE.CylinderGeometry(0.34, 0.5, 0.85, 16), robe, 0, 0.6, 0);
  add(new THREE.CylinderGeometry(0.43, 0.45, 0.1, 16), trim, 0, 0.6, 0);
  add(new THREE.CylinderGeometry(0.51, 0.51, 0.08, 16), trim, 0, 0.22, 0);
  const sash = add(new THREE.TorusGeometry(0.39, 0.055, 8, 20), trim, 0, 0.82, 0);
  sash.rotation.set(Math.PI / 2, 0.55, 0);

  // kepala
  const head = new THREE.Group();
  head.position.y = 1.38;
  rig.add(head);
  add(new THREE.SphereGeometry(0.44, 20, 16), skin, 0, 0, 0, head);
  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const eR = add(eyeGeo, dark, 0.16, 0.05, 0.4, head); eR.scale.y = 1.5;
  if (def.patch) {
    add(new THREE.BoxGeometry(0.2, 0.17, 0.05), dark, -0.16, 0.06, 0.4, head);
    const strap = add(new THREE.TorusGeometry(0.445, 0.02, 6, 24), dark, 0, 0.08, 0, head);
    strap.rotation.set(Math.PI / 2, 0.15, 0);
  } else {
    const eL = add(eyeGeo, dark, -0.16, 0.05, 0.4, head); eL.scale.y = 1.5;
  }
  const cheek = M(0xff9c9c);
  for (const s of [-1, 1]) { const c = add(new THREE.SphereGeometry(0.07, 8, 6), cheek, s * 0.28, -0.08, 0.33, head); c.scale.set(1, 0.6, 0.4); }
  if (def.head !== 'helmet') add(new THREE.SphereGeometry(0.465, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), hair, 0, 0.02, -0.03, head);
  if (def.beard) { const b = add(new THREE.SphereGeometry(0.3, 14, 10), hair, 0, -0.26, 0.2, head); b.scale.set(1.1, 0.9, 0.7); }

  if (def.head === 'laurel') {
    const l = add(new THREE.TorusGeometry(0.43, 0.055, 8, 20), gold, 0, 0.2, 0, head);
    l.rotation.set(Math.PI / 2 - 0.2, 0, 0);
  } else if (def.head === 'crown') {
    add(new THREE.CylinderGeometry(0.3, 0.33, 0.14, 12, 1, true), M(0xf2c14e, { side: THREE.DoubleSide }), 0, 0.42, 0, head);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(new THREE.ConeGeometry(0.07, 0.2, 6), gold, Math.cos(a) * 0.3, 0.56, Math.sin(a) * 0.3, head);
    }
  } else if (def.head === 'helmet') {
    add(new THREE.SphereGeometry(0.48, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), M(def.metal), 0, 0.02, -0.02, head);
    const cr = add(new THREE.TorusGeometry(0.44, 0.08, 8, 16, Math.PI), M(def.crest), 0, 0.12, -0.02, head);
    cr.rotation.y = Math.PI / 2;
  } else if (def.head === 'wings') {
    add(new THREE.CylinderGeometry(0.45, 0.46, 0.1, 16), M(0xc9d2e0), 0, 0.2, 0, head);
    for (const s of [-1, 1]) {
      const w = add(new THREE.ConeGeometry(0.13, 0.5, 4), M(0xffffff), s * 0.47, 0.42, -0.05, head);
      w.rotation.set(-0.4, 0, -s * 0.45);
      w.scale.z = 0.4;
    }
  } else if (def.head === 'flame') {
    const fm = M(def.hair, { emissive: def.hair, emissiveIntensity: 0.5 });
    add(new THREE.ConeGeometry(0.2, 0.55, 8), fm, 0, 0.62, -0.02, head);
    add(new THREE.ConeGeometry(0.14, 0.38, 8), fm, 0.2, 0.5, 0, head).rotation.z = -0.4;
    add(new THREE.ConeGeometry(0.14, 0.38, 8), fm, -0.2, 0.5, 0, head).rotation.z = 0.4;
  }

  // tangan & kaki
  const handGeo = new THREE.SphereGeometry(0.13, 10, 8);
  const handL = add(handGeo, skin, -0.55, 0.72, 0), handR = add(handGeo, skin, 0.55, 0.72, 0);
  const footGeo = new THREE.SphereGeometry(0.17, 10, 8), sandal = M(0x8a5a2b);
  const footL = add(footGeo, sandal, -0.2, 0.1, 0.05), footR = add(footGeo, sandal, 0.2, 0.1, 0.05);
  footL.scale.set(1, 0.7, 1.4); footR.scale.set(1, 0.7, 1.4);

  // senjata di tangan kanan
  if (def.item) {
    const it = new THREE.Group();
    handR.add(it);
    const steel = M(0xb8bec8);
    if (def.item === 'bolt') {
      const bm = M(0xffe04a, { emissive: 0xffc400, emissiveIntensity: 0.8 });
      add(new THREE.BoxGeometry(0.1, 0.42, 0.1), bm, 0.06, 0.62, 0, it).rotation.z = 0.5;
      add(new THREE.BoxGeometry(0.1, 0.42, 0.1), bm, -0.04, 0.32, 0, it).rotation.z = -0.5;
      add(new THREE.BoxGeometry(0.1, 0.42, 0.1), bm, 0.06, 0.02, 0, it).rotation.z = 0.5;
    } else if (def.item === 'hammer') {
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), sandal, 0, 0.25, 0, it);
      add(new THREE.BoxGeometry(0.46, 0.28, 0.28), steel, 0, 0.6, 0, it);
    } else {
      add(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 8), def.item === 'trident' ? gold : sandal, 0, 0.35, 0, it);
      if (def.item === 'spear') add(new THREE.ConeGeometry(0.08, 0.28, 8), steel, 0, 1.33, 0, it);
      else {
        add(new THREE.BoxGeometry(0.44, 0.05, 0.05), gold, 0, 1.2, 0, it);
        for (const x of [-0.2, 0, 0.2]) add(new THREE.ConeGeometry(0.045, 0.3, 6), gold, x, 1.37, 0, it);
      }
    }
  }
  g.userData = { rig, head, handL, handR, footL, footR };
  return g;
}

// anim: 0 diam, 1 lari, 2 lompat, 3 terjang, 4 terpental
export function animateGod(g, anim, t, extra) {
  if (g.userData.bones) return animateRig(g, anim, t, extra);
  const u = g.userData, s = Math.sin(t * 14), c = Math.cos(t * 14);
  let rx = 0, rz = 0, by = 0, fl = 0, fr = 0, hl = 0, hr = 0, hy = 0.72;
  if (anim === 1) { fl = s * 0.3; fr = -s * 0.3; hl = -s * 0.3; hr = s * 0.3; by = Math.abs(c) * 0.08; rx = 0.14; }
  else if (anim === 2) { hy = 1.15; fl = -0.12; fr = 0.12; }
  else if (anim === 3) { rx = 1.35; hy = 1.1; by = 0.3; }
  else if (anim === 4) { rx = -1.25; rz = Math.sin(t * 22) * 0.35; hy = 1.0; by = 0.35; fl = s * 0.2; fr = -s * 0.2; }
  else { by = Math.sin(t * 3) * 0.03; }
  const r = u.rig;
  r.rotation.x += (rx - r.rotation.x) * 0.25;
  r.rotation.z += (rz - r.rotation.z) * 0.25;
  r.position.y += (by - r.position.y) * 0.4;
  u.footL.position.z = 0.05 + fl; u.footR.position.z = 0.05 + fr;
  u.footL.position.y = 0.1 + Math.max(0, fl) * 0.5; u.footR.position.y = 0.1 + Math.max(0, fr) * 0.5;
  u.handL.position.z = hl; u.handR.position.z = hr;
  u.handL.position.y += (hy - u.handL.position.y) * 0.3; u.handR.position.y += (hy - u.handR.position.y) * 0.3;
}

// ============================================================ model Blender (satu mesh menyatu + rangka)
let TPL = null;
export async function loadGodAssets(src) {
  const loader = new GLTFLoader();
  const gltf = src instanceof ArrayBuffer ? await new Promise((res, rej) => loader.parse(src, '', res, rej)) : await loader.loadAsync(src || '/assets/god.glb');
  const sc = gltf.scene, rest = {};
  sc.updateMatrixWorld(true);
  sc.traverse(o => {
    if (!o.isBone) return;
    const P = new THREE.Quaternion();
    o.parent.getWorldQuaternion(P);
    rest[o.name] = { P, Pi: P.clone().invert(), L: o.quaternion.clone(), inv: o.matrixWorld.clone().invert() };
  });
  for (const n of ['body', 'head', 'armL', 'armR', 'legL', 'legR']) if (!rest[n]) throw new Error('bone hilang: ' + n);
  TPL = { scene: sc, rest };
}

function palette(def) {
  const d = new Uint8Array(16);
  [def.skin, def.robe, def.trim, 0x8a5a2b].forEach((c, i) => d.set([c >> 16 & 255, c >> 8 & 255, c & 255, 255], i * 4));
  const t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// shading kartun 3 tingkat + garis tepi (inverted hull)
let _grad = null;
function gradMap() {
  if (!_grad) {
    _grad = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    _grad.magFilter = _grad.minFilter = THREE.NearestFilter; _grad.needsUpdate = true;
  }
  return _grad;
}
// cahaya tepi lembut supaya karakter "lepas" dari latar
function rim(mat, amount = 0.3) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
      `float rimF = pow( 1.0 - clamp( dot( normalize( vViewPosition ), normal ), 0.0, 1.0 ), 2.6 );
       gl_FragColor.rgb += vec3( 1.0, 0.96, 0.85 ) * rimF * ${amount.toFixed(2)};
       #include <dithering_fragment>`);
  };
  mat.customProgramCacheKey = () => 'rim' + amount;
  return mat;
}
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2a1e4a, side: THREE.BackSide });
outlineMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize( normal ) * 0.026;'); };
// garis tepi dari badan poligon rendah: sedikit lebih tebal supaya tetap membungkus badan aslinya
const outlineLowMat = new THREE.MeshBasicMaterial({ color: 0x2a1e4a, side: THREE.BackSide });
outlineLowMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize( normal ) * 0.036;'); };
outlineLowMat.customProgramCacheKey = () => 'outlineLow';

const EYE_MAT = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 90 }), SHINE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
// bahan bersama untuk hiasan gabungan: warna dari vertex color, satu program untuk semua dewa
let _accMat = null;
const accMat = () => _accMat || (_accMat = rim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradMap(), side: THREE.DoubleSide }), 0.22));
const _rel = new THREE.Matrix4(), _inv = new THREE.Matrix4();
function mergeStatic(base, cast) {
  base.updateMatrixWorld(true);
  _inv.copy(base.matrixWorld).invert();
  const plain = [], glow = new Map(), used = [];
  base.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry.attributes.normal || !o.material.color) return;
    for (let p = o; p && p !== base; p = p.parent) if (!p.visible || p.userData.dyn) return;
    const m = o.material, em = m.emissive && m.emissiveIntensity > 0 ? m.emissive.getHex() : 0;
    const g = bakeGeo(o.geometry, null, _rel.multiplyMatrices(_inv, o.matrixWorld), m);
    if (em) { if (!glow.has(em)) glow.set(em, { m, geos: [] }); glow.get(em).geos.push(g); } else plain.push(g);
    used.push(o);
  });
  const put = (geos, mat) => { if (!geos.length) return; const me = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos, false) : geos[0], mat); me.castShadow = cast; me.userData.dyn = true; base.add(me); };
  put(plain, accMat());
  for (const { m, geos } of glow.values()) { const c = m.clone(); c.color.set(0xffffff); c.vertexColors = true; put(geos, c); }
  for (const o of used) o.removeFromParent();
}

function makeRigged(def) {
  const g = new THREE.Group(), rig = new THREE.Group();
  g.add(rig);
  const inst = skClone(TPL.scene), bones = {};
  rig.add(inst);
  const bodyMat = rim(new THREE.MeshToonMaterial({ map: palette(def), gradientMap: gradMap() }));
  let skinned = null, low = null, outlineRef = null;
  inst.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) { o.material = bodyMat; o.frustumCulled = false; if (/low/i.test(o.name)) low = o; else skinned = o; }
  });
  if (!skinned) { skinned = low; low = null; }
  if (skinned) {
    // badan poligon rendah (kalau ada di aset): dipakai garis tepi + bayangan, dan menggantikan badan saat jauh
    const hull = low || skinned;
    skinned.castShadow = !low;
    if (low) { low.visible = false; low.castShadow = false; }
    const ol = new THREE.SkinnedMesh(hull.geometry, low ? outlineLowMat : outlineMat);
    ol.bind(hull.skeleton, hull.bindMatrix);
    ol.frustumCulled = false; ol.castShadow = !!low;
    hull.parent.add(ol);
    outlineRef = ol;
  }
  // jangkar: anak-anaknya memakai koordinat model (y atas, +z depan) tapi ikut gerak tulang
  const anchor = name => {
    const a = new THREE.Group();
    a.matrixAutoUpdate = false;
    a.matrix.copy(TPL.rest[name].inv);
    bones[name].add(a);
    return a;
  };
  const M = (c, o) => new THREE.MeshToonMaterial(Object.assign({ color: c, gradientMap: gradMap() }, o || {}));
  const add = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const hair = M(def.hair), gold = M(0xf2c14e);

  const headAnchor = anchor('head');
  const face = new THREE.Group();          // mata, pipi, senyum
  face.position.y = 1.3; face.scale.setScalar(0.95);
  let head = new THREE.Group();            // rambut cadangan + hiasan kepala
  head.position.y = 1.3; head.scale.setScalar(0.95);
  headAnchor.add(face, head);
  // rambut & janggut ikal dari Blender (kalau aset sudah dimuat)
  const tint = o => { o.traverse(n => { if (n.isMesh) { n.material = hairToon; n.castShadow = true; } }); return o; };
  const hairToon = rim(new THREE.MeshToonMaterial({ color: def.hair, gradientMap: gradMap() }), 0.22);
  const hairP = def.head !== 'helmet' && def.head !== 'flame' ? prop('hair') : null;
  const beardP = def.beard ? prop('beard') : null;
  if (hairP) { tint(hairP); hairP.position.y = 1.3; hairP.scale.setScalar(0.92); headAnchor.add(hairP); head.position.y = 1.37; head.scale.setScalar(1.08); }
  if (beardP) { tint(beardP); beardP.traverse(n => { n.castShadow = false; }); beardP.position.set(0, 1.3, 0.01); headAnchor.add(beardP); }
  // kedua mata jadi satu mesh (kedip = skala Y), kedua kilau mata jadi satu mesh
  const eyeXs = def.patch ? [-0.16] : [-0.16, 0.16];
  const eyeMesh = add(mergeGeometries(eyeXs.map(x => new THREE.SphereGeometry(0.075, 12, 10).scale(1, 1, 0.6).translate(x, 0, 0))), EYE_MAT, 0, 0.04, 0.395, face);
  eyeMesh.scale.y = 1.5; eyeMesh.userData.dyn = true;
  const shineMesh = add(mergeGeometries(eyeXs.map(x => new THREE.SphereGeometry(0.022, 6, 6).translate(x + 0.025, 0, 0))), SHINE_MAT, 0, 0.09, 0.44, face);
  shineMesh.userData.dyn = true;
  const eyes = [eyeMesh], shines = [shineMesh];
  if (def.patch) {
    add(new THREE.BoxGeometry(0.21, 0.18, 0.05), M(0x1a1a1a), 0.16, 0.05, 0.41, face);
    const strap = add(new THREE.TorusGeometry(0.452, 0.02, 6, 24), M(0x1a1a1a), 0, 0.08, 0, face);
    strap.rotation.set(Math.PI / 2, -0.15, 0);
  }
  const cheek = M(0xff9c9c);
  for (const s of [-1, 1]) { const c = add(new THREE.SphereGeometry(0.075, 8, 6), cheek, s * 0.29, -0.1, 0.33, face); c.scale.set(1, 0.6, 0.35); c.castShadow = false; }
  const smile = add(new THREE.TorusGeometry(0.07, 0.016, 6, 12, Math.PI), M(0x7a3b2e), 0, -0.1, 0.435, face);
  smile.rotation.z = Math.PI; smile.castShadow = false;
  if (def.head !== 'helmet' && !hairP) add(new THREE.SphereGeometry(0.485, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), hair, 0, 0.0, -0.03, head);
  if (def.beard) { smile.visible = false; if (!beardP) { const b = add(new THREE.SphereGeometry(0.3, 14, 10), hair, 0, -0.27, 0.2, face); b.scale.set(1.15, 0.85, 0.7); } }

  // hiasan kepala & senjata dari Blender (warna bisa diganti per nama material)
  const toon = (o, colors) => {
    o.traverse(n => {
      if (!n.isMesh) return;
      const nm = n.material.name, c = colors && colors[nm] !== undefined ? colors[nm] : n.material.color;
      n.material = M(c, Object.assign({ side: THREE.DoubleSide }, nm === 'bolt' || nm === 'flame' ? { emissive: c, emissiveIntensity: 0.55 } : null));
    });
    return o;
  };
  const gear = (name, colors) => { const o = prop(name); if (!o) return null; toon(o, colors); o.position.y = 1.3; headAnchor.add(o); return o; };
  let geared = false;
  if (def.head === 'laurel') { const l = gear('acc_laurel'); if (l) { l.scale.setScalar(hairP ? 1.1 : 1); geared = true; } }
  else if (def.head === 'crown') geared = !!gear('acc_crown');
  else if (def.head === 'helmet') geared = !!gear('acc_helmet', { metal: def.metal, crest: def.crest });
  else if (def.head === 'flame') geared = !!gear('acc_flame', { flame: def.hair });
  else if (def.head === 'wings') {
    const w1 = gear('acc_wing'), w2 = gear('acc_wing');
    if (w1 && w2) {
      w1.position.set(0.4, 1.5, -0.04); w2.position.set(-0.4, 1.5, -0.04); w2.scale.x = -1;
      add(new THREE.CylinderGeometry(0.47, 0.48, 0.09, 20), M(0xc9d2e0), 0, 0.2, 0, head);
      geared = true;
    }
  }
  if (geared) { /* aset Blender terpasang */ } else if (def.head === 'laurel') {
    const l = add(new THREE.TorusGeometry(0.44, 0.055, 8, 20), gold, 0, 0.2, 0, head);
    l.rotation.set(Math.PI / 2 - 0.2, 0, 0);
  } else if (def.head === 'crown') {
    add(new THREE.CylinderGeometry(0.3, 0.33, 0.14, 12, 1, true), M(0xf2c14e, { side: THREE.DoubleSide }), 0, 0.42, 0, head);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.ConeGeometry(0.07, 0.2, 6), gold, Math.cos(a) * 0.3, 0.56, Math.sin(a) * 0.3, head); }
  } else if (def.head === 'helmet') {
    add(new THREE.SphereGeometry(0.485, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), M(def.metal), 0, 0.0, -0.02, head);
    add(new THREE.TorusGeometry(0.44, 0.08, 8, 16, Math.PI), M(def.crest), 0, 0.12, -0.02, head).rotation.y = Math.PI / 2;
  } else if (def.head === 'wings') {
    add(new THREE.CylinderGeometry(0.455, 0.465, 0.1, 16), M(0xc9d2e0), 0, 0.2, 0, head);
    for (const s of [-1, 1]) { const w = add(new THREE.ConeGeometry(0.13, 0.5, 4), M(0xffffff), s * 0.47, 0.42, -0.05, head); w.rotation.set(-0.4, 0, -s * 0.45); w.scale.z = 0.4; }
  } else if (def.head === 'flame') {
    const fm = M(def.hair, { emissive: def.hair, emissiveIntensity: 0.5 });
    add(new THREE.ConeGeometry(0.2, 0.55, 8), fm, 0, 0.62, -0.02, head);
    add(new THREE.ConeGeometry(0.14, 0.38, 8), fm, 0.2, 0.5, 0, head).rotation.z = -0.4;
    add(new THREE.ConeGeometry(0.14, 0.38, 8), fm, -0.2, 0.5, 0, head).rotation.z = 0.4;
  }

  let armAnchor = null;
  if (def.item) {
    const it = new THREE.Group();
    it.position.set(-0.74, 0.6, 0.1);
    armAnchor = anchor('armR');
    armAnchor.add(it);
    const steel = M(0xb8bec8), wood = M(0x8a5a2b);
    const wp = prop('acc_' + def.item);
    if (wp) { toon(wp); wp.scale.setScalar(0.92); it.add(wp); }
    else if (def.item === 'bolt') {
      const bm = M(0xffe04a, { emissive: 0xffc400, emissiveIntensity: 0.8 });
      add(new THREE.BoxGeometry(0.1, 0.42, 0.1), bm, 0.06, 0.62, 0, it).rotation.z = 0.5;
      add(new THREE.BoxGeometry(0.1, 0.42, 0.1), bm, -0.04, 0.32, 0, it).rotation.z = -0.5;
      add(new THREE.BoxGeometry(0.1, 0.42, 0.1), bm, 0.06, 0.02, 0, it).rotation.z = 0.5;
    } else if (def.item === 'hammer') {
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), wood, 0, 0.25, 0, it);
      add(new THREE.BoxGeometry(0.46, 0.28, 0.28), steel, 0, 0.6, 0, it);
    } else {
      add(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 8), def.item === 'trident' ? gold : wood, 0, 0.35, 0, it);
      if (def.item === 'spear') add(new THREE.ConeGeometry(0.08, 0.28, 8), steel, 0, 1.33, 0, it);
      else {
        add(new THREE.BoxGeometry(0.44, 0.05, 0.05), gold, 0, 1.2, 0, it);
        for (const x of [-0.2, 0, 0.2]) add(new THREE.ConeGeometry(0.045, 0.3, 6), gold, x, 1.37, 0, it);
      }
    }
  }
  // jubah berkibar (kain sederhana: baris atas menempel di bahu, sisanya melambai)
  let cape = null;
  if (def.cape !== undefined) {
    const geo = new THREE.PlaneGeometry(0.82, 0.95, 4, 6);
    const m = new THREE.Mesh(geo, M(def.cape, { side: THREE.DoubleSide }));
    m.position.set(0, 0.62, -0.3); m.castShadow = true; m.frustumCulled = false;
    anchor('body').add(m);
    cape = { geo, base: geo.attributes.position.array.slice(), t: 0 };
  }
  // semua hiasan diam (rambut, janggut, helm, pipi, senjata) digabung jadi satu mesh per jangkar
  try { mergeStatic(headAnchor, true); if (armAnchor) mergeStatic(armAnchor, false); } catch (e) { console.error('gabung hiasan gagal', e); }
  g.userData = { rig, bones, eyes, shines, smile, outline: outlineRef, body: skinned, low, face, far: false, cape, seed: Math.random() * 10, phase: 0, lastT: 0,
    st: { ll: 0, lr: 0, al: 0, ar: 0, azl: 0, azr: 0, hx: 0, hy: 0, bx: 0, by: 0, eye: 1.5, spin: 0 } };
  return g;
}

// LOD: karakter jauh memakai badan poligon rendah tanpa garis tepi dan tanpa detail wajah
export function setGodLOD(g, far, outline = !far) {
  const u = g.userData;
  if (!u.bones) return;
  if (u.outline && u.outline.visible !== outline) u.outline.visible = outline;
  if (u.far === far) return;
  u.far = far;
  if (u.low) { u.low.visible = far; u.body.visible = !far; }
  if (u.face) u.face.visible = !far;
}

export function makeGod(def, skinId) {
  const sk = SKINS.find(s => s.id === skinId);
  if (sk && sk.robe !== undefined) def = Object.assign({}, def, { robe: sk.robe, trim: sk.trim });
  if (TPL) { try { return makeRigged(def); } catch (e) { console.error('makeRigged gagal, pakai model cadangan', e); } }
  return makePrimitive(def);
}

const _d = new THREE.Quaternion(), _e = new THREE.Euler();
// putar tulang terhadap sumbu MODEL (x kiri, y atas, z depan), bukan sumbu lokal tulang
function pose(u, name, x, y, z) {
  const b = u.bones[name], r = TPL.rest[name];
  _d.setFromEuler(_e.set(x, y, z));
  b.quaternion.copy(r.Pi).multiply(_d).multiply(r.P).multiply(r.L);
}

// extra (opsional): { vy: kecepatan vertikal, speed: kecepatan mendatar, turn: laju belok (rad/detik) }
function animateRig(g, anim, t, extra) {
  const u = g.userData, st = u.st, x = extra || {};
  const dt = Math.min(0.05, Math.max(0, t - u.lastT)) || 0.016; u.lastT = t;
  const speed = x.speed ?? 8, vy = x.vy ?? 0, turn = x.turn ?? 0, sd = u.seed;
  // langkah kaki mengikuti kecepatan sebenarnya
  u.phase += dt * (5 + speed * 1.05);
  const p = u.phase, s = Math.sin(p), c = Math.cos(p);
  let rx = 0, rz = 0, by = 0, ll = 0, lr = 0, al = 0, ar = 0, azl = 0.06, azr = 0.06, hx = 0, hy = 0, bx = 0, bT = 0, eye = 1.5, spin = 0, sy = 1;

  if (anim === 1) { // lari: ayunan penuh, badan memelintir, kepala tetap stabil
    const amp = Math.min(1.15, 0.45 + speed * 0.09);
    ll = s * amp; lr = -s * amp;
    al = -s * amp * 1.15; ar = s * amp * 1.15;
    azl = 0.28 + Math.max(0, s) * 0.2; azr = 0.28 + Math.max(0, -s) * 0.2;
    by = Math.abs(c) * 0.1; bx = 0.16 + speed * 0.012; bT = s * 0.2; hy = -s * 0.14; hx = -0.1 + Math.abs(c) * 0.05;
    rz = Math.max(-0.3, Math.min(0.3, -turn * 0.06));
  } else if (anim === 2) { // di udara: naik = meregang, turun = mengepak & kaki menekuk
    if (vy > 1) { azl = azr = 1.45; al = ar = -0.25; ll = 0.35; lr = 0.15; hx = -0.25; rx = -0.08; sy = 1.04; }
    else { const f = Math.sin(t * 20 + sd) * 0.28; azl = 1.0 + f; azr = 1.0 - f; ll = -0.55; lr = -0.3; hx = 0.18; rx = Math.min(0.3, -vy * 0.012); eye = 1.75; }
  } else if (anim === 3) { // terjang: gaya terbang
    rx = 1.38; by = 0.3; al = ar = -1.5; azl = azr = 0.3; ll = 0.25 + Math.sin(t * 24) * 0.25; lr = 0.25 - Math.sin(t * 24) * 0.25; hx = -0.5; eye = 1.1;
  } else if (anim === 4) { // terpental: jungkir balik sambil menggelepar
    rx = -1.2; by = 0.4; spin = 1; rz = Math.sin(t * 19 + sd) * 0.4;
    ll = Math.sin(t * 23) * 0.8; lr = -Math.sin(t * 23 + 1) * 0.8; al = Math.sin(t * 21) * 1.1; ar = -Math.sin(t * 21 + 2) * 1.1; azl = azr = 1.1; eye = 0.35;
  } else if (anim === 5) { // sorak: lompat-lompat, tangan melambai
    const h = Math.abs(Math.sin(t * 8));
    azl = 1.7 + Math.sin(t * 16) * 0.32; azr = 1.7 - Math.sin(t * 16) * 0.32; by = h * 0.34; ll = 0.3 * h; lr = -0.3 * h; hx = -0.22; rz = Math.sin(t * 8) * 0.1; eye = 0.7; sy = 1 + h * 0.05;
  } else if (anim === 8) { // menari: pinggul bergoyang, tangan naik-turun bergantian
    const d = Math.sin(t * 9), d2 = Math.sin(t * 4.5);
    rz = d * 0.16; bT = d2 * 0.5; azl = 0.9 + d * 0.8; azr = 0.9 - d * 0.8; ll = Math.max(0, d) * 0.5; lr = Math.max(0, -d) * 0.5; by = Math.abs(d) * 0.1; hy = -d2 * 0.3; eye = 0.8;
  } else if (anim === 9) { // melambai: satu tangan tinggi berayun
    azl = 2.1 + Math.sin(t * 13) * 0.35; azr = 0.1; hy = 0.25; rz = 0.06; hx = -0.1; eye = 0.9;
  } else if (anim === 6) { // kecewa: menunduk, bahu turun
    hx = 0.5; bx = 0.22; azl = azr = 0.0; al = ar = 0.15; rz = Math.sin(t * 1.4 + sd) * 0.04; eye = 0.8; sy = 0.97;
  } else if (anim === 7) { // siap-siap sebelum start: kuda-kuda sambil memantul
    const h = Math.abs(Math.sin(t * 7 + sd));
    bx = 0.3; hx = -0.25; al = 0.7; ar = -0.5; azl = azr = 0.35; ll = -0.35; lr = 0.3; by = h * 0.06; sy = 0.95 + h * 0.03;
  } else { // diam: bernapas, menoleh, memindah tumpuan
    const br = Math.sin(t * 2.2 + sd);
    sy = 1 + br * 0.018; by = 0; azl = azr = 0.1 + br * 0.05;
    hy = Math.sin(t * 0.6 + sd) * 0.32; hx = Math.sin(t * 0.9 + sd * 2) * 0.06;
    rz = Math.sin(t * 0.8 + sd) * 0.03; al = Math.sin(t * 1.1 + sd) * 0.06; ar = -al;
  }
  // kedip
  const bl = (t * 0.37 + sd) % 1;
  if (bl > 0.955 && anim !== 4) eye = 0.12;

  const k = Math.min(1, dt * 16), kf = Math.min(1, dt * 22);
  st.ll += (ll - st.ll) * kf; st.lr += (lr - st.lr) * kf; st.al += (al - st.al) * kf; st.ar += (ar - st.ar) * kf;
  st.azl += (azl - st.azl) * k; st.azr += (azr - st.azr) * k; st.hx += (hx - st.hx) * k; st.hy += (hy - st.hy) * k;
  st.bx += (bx - st.bx) * k; st.by += (bT - st.by) * k; st.eye += (eye - st.eye) * Math.min(1, dt * 30);
  const r = u.rig;
  r.rotation.x += (rx - r.rotation.x) * k;
  r.rotation.z += (rz - r.rotation.z) * k;
  if (spin) { st.spin += dt * 11; r.rotation.y = st.spin; }
  else { st.spin = 0; const w = ((r.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; r.rotation.y = w * (1 - k); }
  r.position.y += (by - r.position.y) * Math.min(1, dt * 24);
  r.scale.y += (sy - r.scale.y) * k;
  pose(u, 'body', st.bx, st.by, 0);
  pose(u, 'head', st.hx, st.hy - st.by * 0.7, 0);
  pose(u, 'legL', st.ll, 0, 0);
  pose(u, 'legR', st.lr, 0, 0);
  pose(u, 'armL', st.al, 0, st.azl);
  pose(u, 'armR', st.ar, 0, -st.azr);
  if (u.cape) {
    const p = u.cape.geo.attributes.position, b = u.cape.base, lift = Math.min(1, speed / 9) * (anim === 1 || anim === 3 ? 1 : 0.25) + (anim === 2 ? 0.5 : 0);
    for (let i = 0; i < p.count; i++) {
      const by = b[i * 3 + 1], bx2 = b[i * 3], k = (0.475 - by) / 0.95, w = k * k;
      p.setZ(i, -w * (0.1 + lift * 0.55) - Math.sin(t * (5 + lift * 6) + k * 3.2 + bx2 * 3) * 0.06 * k * (1 + lift));
      p.setY(i, by + w * lift * 0.22);
      p.setX(i, bx2 * (1 + k * 0.25));
    }
    p.needsUpdate = true; u.cape.geo.computeVertexNormals();
  }
  for (const e of u.eyes) e.scale.y = st.eye;
  const sh = st.eye > 0.6;
  for (const h of u.shines) h.visible = sh;
}

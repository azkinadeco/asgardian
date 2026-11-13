// Karakter dewa chibi (orisinal) dari bentuk primitif three.js
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from '/jsm/utils/SkeletonUtils.js';
import { prop } from './props.js';

export const GODS = [
  { id: 'zeus', name: 'Zeus', robe: 0xffffff, trim: 0xf2c14e, skin: 0xffd2a8, hair: 0xf2f2f2, beard: true, head: 'laurel', item: 'bolt' },
  { id: 'poseidon', name: 'Poseidon', robe: 0x2aa7d8, trim: 0x9ff0ff, skin: 0xf2c9a0, hair: 0x1c6fa8, beard: true, head: 'crown', item: 'trident' },
  { id: 'athena', name: 'Athena', robe: 0xe8e2ff, trim: 0x8a6fe8, skin: 0xffd9b8, hair: 0x6b4a2b, head: 'helmet', metal: 0xd9a441, crest: 0x3b6fe0, item: 'spear' },
  { id: 'hades', name: 'Hades', robe: 0x3a2a55, trim: 0x9b5cff, skin: 0xcfd6e6, hair: 0x1b1b2a, beard: true, head: 'helmet', metal: 0x2a2a3a, crest: 0x9b5cff },
  { id: 'apollo', name: 'Apollo', robe: 0xfff1b8, trim: 0xff9d2e, skin: 0xffcf99, hair: 0xf7c531, head: 'laurel' },
  { id: 'ares', name: 'Ares', robe: 0xc0392b, trim: 0x2b2b2b, skin: 0xe8b48a, hair: 0x2b1a12, head: 'helmet', metal: 0xb0b6bf, crest: 0xff3b30, item: 'spear' },
  { id: 'hermes', name: 'Hermes', robe: 0x8fe3c0, trim: 0xffffff, skin: 0xffd9b8, hair: 0xb5651d, head: 'wings' },
  { id: 'thor', name: 'Thor', robe: 0x4a5a78, trim: 0xd9d9d9, skin: 0xffd2a8, hair: 0xd9562b, beard: true, head: 'wings', item: 'hammer' },
  { id: 'loki', name: 'Loki', robe: 0x7b3fa0, trim: 0xff9d2e, skin: 0xf1dcc9, hair: 0xff6a2b, head: 'flame' },
  { id: 'odin', name: 'Odin', robe: 0x5a6f8f, trim: 0xc9d2e0, skin: 0xf0c8a0, hair: 0xbfc5cc, beard: true, head: 'crown', patch: true, item: 'spear' },
];

// kostum: warna jubah alternatif yang dibuka dengan koin
export const SKINS = [
  { id: 'default', name: 'Asli', cost: 0 },
  { id: 'es', name: 'Es', cost: 100, robe: 0xbfe9ff, trim: 0x4dc3ff },
  { id: 'mawar', name: 'Mawar', cost: 100, robe: 0xff8fb3, trim: 0xffffff },
  { id: 'bayangan', name: 'Bayangan', cost: 150, robe: 0x2a2438, trim: 0x9b5cff },
  { id: 'emas', name: 'Emas', cost: 200, robe: 0xf2c14e, trim: 0xffffff },
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
export function animateGod(g, anim, t) {
  if (g.userData.bones) return animateRig(g, anim, t);
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
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2a1e4a, side: THREE.BackSide });
outlineMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize( normal ) * 0.026;'); };

function makeRigged(def) {
  const g = new THREE.Group(), rig = new THREE.Group();
  g.add(rig);
  const inst = skClone(TPL.scene), bones = {};
  rig.add(inst);
  const bodyMat = new THREE.MeshToonMaterial({ map: palette(def), gradientMap: gradMap() });
  let skinned = null;
  inst.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isSkinnedMesh) { o.material = bodyMat; o.frustumCulled = false; o.castShadow = true; skinned = o; }
  });
  if (skinned) {
    const ol = new THREE.SkinnedMesh(skinned.geometry, outlineMat);
    ol.bind(skinned.skeleton, skinned.bindMatrix);
    ol.frustumCulled = false;
    skinned.parent.add(ol);
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
  const add = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const hair = M(def.hair), dark = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 90 }), gold = M(0xf2c14e);

  const headAnchor = anchor('head');
  const face = new THREE.Group();          // mata, pipi, senyum
  face.position.y = 1.3; face.scale.setScalar(0.95);
  let head = new THREE.Group();            // rambut cadangan + hiasan kepala
  head.position.y = 1.3; head.scale.setScalar(0.95);
  headAnchor.add(face, head);
  // rambut & janggut ikal dari Blender (kalau aset sudah dimuat)
  const tint = o => { o.traverse(n => { if (n.isMesh) { n.material = hairToon; n.castShadow = true; } }); return o; };
  const hairToon = new THREE.MeshToonMaterial({ color: def.hair, gradientMap: gradMap() });
  const hairP = def.head !== 'helmet' && def.head !== 'flame' ? prop('hair') : null;
  const beardP = def.beard ? prop('beard') : null;
  if (hairP) { tint(hairP); hairP.position.y = 1.3; hairP.scale.setScalar(0.92); headAnchor.add(hairP); head.position.y = 1.37; head.scale.setScalar(1.08); }
  if (beardP) { tint(beardP); beardP.position.set(0, 1.3, 0.01); headAnchor.add(beardP); }
  const eyeGeo = new THREE.SphereGeometry(0.075, 12, 10);
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eye = x => { const e = add(eyeGeo, dark, x, 0.04, 0.395, face); e.scale.set(1, 1.5, 0.6); e.castShadow = false; add(new THREE.SphereGeometry(0.022, 6, 6), shine, x + 0.025, 0.09, 0.44, face).castShadow = false; return e; };
  eye(-0.16);
  if (def.patch) {
    add(new THREE.BoxGeometry(0.21, 0.18, 0.05), M(0x1a1a1a), 0.16, 0.05, 0.41, face);
    const strap = add(new THREE.TorusGeometry(0.452, 0.02, 6, 24), M(0x1a1a1a), 0, 0.08, 0, face);
    strap.rotation.set(Math.PI / 2, -0.15, 0);
  } else eye(0.16);
  const cheek = M(0xff9c9c);
  for (const s of [-1, 1]) { const c = add(new THREE.SphereGeometry(0.075, 8, 6), cheek, s * 0.29, -0.1, 0.33, face); c.scale.set(1, 0.6, 0.35); c.castShadow = false; }
  const smile = add(new THREE.TorusGeometry(0.07, 0.016, 6, 12, Math.PI), M(0x7a3b2e), 0, -0.1, 0.435, face);
  smile.rotation.z = Math.PI; smile.castShadow = false;
  if (def.head !== 'helmet' && !hairP) add(new THREE.SphereGeometry(0.485, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), hair, 0, 0.0, -0.03, head);
  if (def.beard) { smile.visible = false; if (!beardP) { const b = add(new THREE.SphereGeometry(0.3, 14, 10), hair, 0, -0.27, 0.2, face); b.scale.set(1.15, 0.85, 0.7); } }

  if (def.head === 'laurel') {
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

  if (def.item) {
    const it = new THREE.Group();
    it.position.set(-0.74, 0.6, 0.1);
    anchor('armR').add(it);
    const steel = M(0xb8bec8), wood = M(0x8a5a2b);
    if (def.item === 'bolt') {
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
  g.userData = { rig, bones, st: { ll: 0, lr: 0, al: 0, ar: 0, az: 0, hx: 0, bx: 0 } };
  return g;
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

function animateRig(g, anim, t) {
  const u = g.userData, st = u.st, s = Math.sin(t * 14), c = Math.cos(t * 14);
  let rx = 0, rz = 0, by = 0, ll = 0, lr = 0, al = 0, ar = 0, az = 0.05 + Math.sin(t * 3) * 0.04, hx = 0, bx = 0;
  if (anim === 1) { ll = s * 0.95; lr = -s * 0.95; al = -s * 1.0; ar = s * 1.0; by = Math.abs(c) * 0.07; bx = 0.2; hx = -0.1; rz = s * 0.05; }
  else if (anim === 2) { az = 1.25; ll = 0.45; lr = -0.35; hx = -0.15; }
  else if (anim === 3) { rx = 1.35; by = 0.3; az = 1.5; al = ar = -0.6; ll = lr = 0.3; }
  else if (anim === 4) { rx = -1.25; rz = Math.sin(t * 22) * 0.35; by = 0.38; ll = s * 0.7; lr = -s * 0.7; az = 1.0 + c * 0.4; al = s; ar = -s; }
  else if (anim === 5) { az = 1.75 + Math.sin(t * 16) * 0.3; by = Math.abs(Math.sin(t * 8)) * 0.3; ll = 0.25; lr = -0.25; hx = -0.2; rz = Math.sin(t * 8) * 0.08; }
  const k = 0.3;
  st.ll += (ll - st.ll) * k; st.lr += (lr - st.lr) * k; st.al += (al - st.al) * k; st.ar += (ar - st.ar) * k;
  st.az += (az - st.az) * k; st.hx += (hx - st.hx) * k; st.bx += (bx - st.bx) * k;
  const r = u.rig;
  r.rotation.x += (rx - r.rotation.x) * 0.25;
  r.rotation.z += (rz - r.rotation.z) * 0.25;
  r.position.y += (by - r.position.y) * 0.4;
  pose(u, 'body', st.bx, 0, 0);
  pose(u, 'head', st.hx, 0, 0);
  pose(u, 'legL', st.ll, 0, 0);
  pose(u, 'legR', st.lr, 0, 0);
  pose(u, 'armL', st.al, 0, st.az);
  pose(u, 'armR', st.ar, 0, -st.az);
}

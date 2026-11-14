// Pemanggang geometri: menggabungkan banyak mesh diam menjadi satu draw call.
// Warna bahan dipanggang ke vertex color, transformasi ubin tekstur dipanggang ke UV.
import * as THREE from '/vendor/three.module.js';

const texSig = t => (t ? t.source.uuid + ':' + t.wrapS + ':' + t.wrapT : '');
export const matSig = m => [m.type, m.flatShading ? 1 : 0, m.side, texSig(m.map), texSig(m.emissiveMap), m.emissive ? m.emissive.getHex() : 0, m.emissiveIntensity ?? 1,
  m.shininess ?? 0, m.specular ? m.specular.getHex() : 0, m.fog ? 1 : 0].join('|');
export function canonMat(m) {
  const c = m.clone();
  c.color.set(0xffffff); c.vertexColors = true;
  const fix = (t, ch) => { const n = t.clone(); n.repeat.set(1, 1); n.offset.set(0, 0); n.channel = ch; n.needsUpdate = true; return n; };
  if (m.map) c.map = fix(m.map, 0);
  if (m.emissiveMap) c.emissiveMap = fix(m.emissiveMap, 1);
  return c;
}
const _bv = new THREE.Vector3(), _bn = new THREE.Matrix3();
export function bakeGeo(src, grp, mtx, mat) {
  const pos = src.attributes.position, nor = src.attributes.normal, uv = src.attributes.uv, idx = src.index;
  let v0 = 0, vn = pos.count, index;
  if (idx) { const s = grp ? grp.start : 0, c = grp ? Math.min(grp.count, idx.count - s) : idx.count; index = new Array(c); for (let i = 0; i < c; i++) index[i] = idx.getX(s + i); }
  else { if (grp) { v0 = grp.start; vn = Math.min(grp.count, pos.count - v0); } index = new Array(vn); for (let i = 0; i < vn; i++) index[i] = i; }
  const P = new Float32Array(vn * 3), N = new Float32Array(vn * 3), C = new Float32Array(vn * 3);
  const mu = mat.map || mat.emissiveMap ? new Float32Array(vn * 2) : null, mu1 = mat.emissiveMap ? new Float32Array(vn * 2) : null;
  const tm = t => { if (!t) return null; if (t.matrixAutoUpdate) t.updateMatrix(); return t.matrix.elements; };
  const e0 = tm(mat.map || mat.emissiveMap), e1 = tm(mat.emissiveMap), col = mat.color;
  _bn.getNormalMatrix(mtx);
  for (let i = 0; i < vn; i++) {
    const k = v0 + i;
    _bv.fromBufferAttribute(pos, k).applyMatrix4(mtx); P[i * 3] = _bv.x; P[i * 3 + 1] = _bv.y; P[i * 3 + 2] = _bv.z;
    _bv.fromBufferAttribute(nor, k).applyMatrix3(_bn).normalize(); N[i * 3] = _bv.x; N[i * 3 + 1] = _bv.y; N[i * 3 + 2] = _bv.z;
    C[i * 3] = col.r; C[i * 3 + 1] = col.g; C[i * 3 + 2] = col.b;
    if (mu) {
      const u = uv ? uv.getX(k) : 0, v = uv ? uv.getY(k) : 0;
      mu[i * 2] = e0[0] * u + e0[3] * v + e0[6]; mu[i * 2 + 1] = e0[1] * u + e0[4] * v + e0[7];
      if (mu1) { mu1[i * 2] = e1[0] * u + e1[3] * v + e1[6]; mu1[i * 2 + 1] = e1[1] * u + e1[4] * v + e1[7]; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  if (mu) g.setAttribute('uv', new THREE.BufferAttribute(mu, 2));
  if (mu1) g.setAttribute('uv1', new THREE.BufferAttribute(mu1, 2));
  g.setIndex(index);
  return g;
}

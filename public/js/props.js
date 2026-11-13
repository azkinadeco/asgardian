// Aset dekorasi buatan Blender (public/assets/props.glb). Kalau belum/ gagal dimuat, prop() mengembalikan null
// dan pemanggil memakai bentuk primitif cadangan.
import * as THREE from '/vendor/three.module.js';
import { GLTFLoader } from '/jsm/loaders/GLTFLoader.js';

const PROPS = {};
export async function loadProps(src) {
  const loader = new GLTFLoader();
  const gltf = src instanceof ArrayBuffer ? await new Promise((res, rej) => loader.parse(src, '', res, rej)) : await loader.loadAsync(src || '/assets/props.glb');
  const cache = new Map();
  for (const o of gltf.scene.children.slice()) {
    o.traverse(m => {
      if (!m.isMesh) return;
      const s = m.material;
      if (!cache.has(s)) cache.set(s, new THREE.MeshPhongMaterial({ color: s.color.clone(), emissive: s.emissive ? s.emissive.clone().multiplyScalar(0.35) : 0, shininess: 25, specular: 0x222222 }));
      m.material = cache.get(s);
    });
    o.position.set(0, 0, 0);
    PROPS[o.name] = o;
  }
}
export const hasProps = () => Object.keys(PROPS).length > 0;
// klon aset; color (opsional) mewarnai ulang semua bagiannya
export function prop(name, color, opt) {
  const src = PROPS[name];
  if (!src) return null;
  const o = src.clone(true);
  if (color !== undefined) {
    const m = new THREE.MeshPhongMaterial(Object.assign({ color, shininess: 25, specular: 0x222222 }, opt || {}));
    o.traverse(n => { if (n.isMesh) n.material = m; });
  }
  return o;
}

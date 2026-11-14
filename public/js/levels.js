// Map: geometri, rintangan, checkpoint, dan jalur bot.
// Semua rintangan adalah fungsi murni dari waktu ronde `t`, jadi sinkron di semua pemain.
import * as THREE from '/vendor/three.module.js';
import { RoundedBoxGeometry } from '/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from '/jsm/utils/BufferGeometryUtils.js';
import { matSig, canonMat, bakeGeo } from './merge.js';
import { knock, R, H } from './sim.js';
import { prop } from './props.js';

export const LEVELS = [
  { name: 'Bifrost Dash', sub: 'Pulau Terbang Asgard', type: 'race', goal: 'Lari sampai Gerbang Valhalla!' },
  { name: 'Meteor Storm', sub: 'Galaksi', type: 'survival', goal: 'Bertahan! Jangan jatuh ke angkasa!' },
  { name: 'Throne of Olympus', sub: 'Gunung Olympus', type: 'final', goal: 'Rebut Mahkota Laurel di puncak!' },
  { name: 'Tidal Trial', sub: 'Samudra Poseidon', type: 'race', goal: 'Lompati ombak sampai Gerbang Karang!' },
  { name: 'Muspelheim Run', sub: 'Dunia Api Muspelheim', type: 'race', goal: 'Seberangi lautan lava!' },
  { name: "Hades' Wheel", sub: 'Dunia Bawah Hades', type: 'survival', goal: 'Lompati roda Hades, jangan terlempar!' },
  { name: 'Golden Garden', sub: 'Taman Hesperides', type: 'collect', goal: 'Kumpulkan 5 apel emas!' },
  { name: 'Yggdrasil Climb', sub: 'Pohon Dunia Yggdrasil', type: 'final', goal: 'Panjat pohon dunia, rebut mahkotanya!' },
  { name: 'Jotunheim Slide', sub: 'Negeri Es Jotunheim', type: 'race', goal: 'Hati-hati, lantainya licin!' },
  { name: 'Tidal Rise', sub: 'Menara Karang Poseidon', type: 'survival', goal: 'Air naik! Panjat setinggi mungkin!' },
  { name: 'Valkyrie Skyway', sub: 'Jalan Langit Valkyrie', type: 'race', goal: 'Lawan angin, pantul di bumper, sampai gerbang senja!' },
  { name: 'Storm Summit', sub: 'Puncak Badai Thor', type: 'final', goal: 'Tembus badai, rebut mahkota di puncak!' },
];

const HAS_DOM = typeof document !== 'undefined';
const lam = (c, o) => new THREE.MeshPhongMaterial(Object.assign({ color: c, shininess: 35, specular: 0x333333 }, o || {}));
const GOLD = 0xf2c14e, MARBLE = 0xf4efe6, STEEL = 0xaab2be, STONE = 0x8d8478;

function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mesh(geo, m, x, y, z, parent) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function canvasTex(w, h, draw) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// pendar cahaya (sprite aditif) untuk benda bercahaya
let glowTex;
function glow(parent, x, y, z, color, size) {
  if (!HAS_DOM) return null;
  glowTex = glowTex || canvasTex(64, 64, c => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.position.set(x, y, z); s.scale.set(size, size, 1);
  s.userData.size = size;
  parent.add(s);
  if (CUR) CUR.glows.push(s);
  return s;
}
// sisi platform: bibir warna permukaan + lapisan tanah / susunan batu
function sideTex(key, th) {
  if (!HAS_DOM) return null;
  const k = 'side_' + key;
  if (!texCache[k]) texCache[k] = canvasTex(128, 128, c => {
    const hex = v => '#' + v.toString(16).padStart(6, '0');
    c.fillStyle = hex(th.side); c.fillRect(0, 0, 128, 128);
    const r = rng(key.length * 97 + 5);
    if (th.brick) {
      c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 2;
      for (let row = 0; row < 4; row++) { const y = 24 + row * 26; c.beginPath(); c.moveTo(0, y); c.lineTo(128, y); c.stroke(); for (let x = (row % 2) * 32; x < 128; x += 64) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 26); c.stroke(); } }
      c.fillStyle = 'rgba(255,255,255,0.10)'; for (let i = 0; i < 10; i++) c.fillRect(r() * 128, 24 + r() * 100, 10 + r() * 20, 3);
    } else {
      for (const [y, a] of [[44, 0.10], [72, 0.16], [100, 0.24]]) { c.fillStyle = `rgba(0,0,0,${a})`; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= 128; x += 16) c.lineTo(x, y + Math.sin(x / 128 * Math.PI * 4 + y) * 4); c.lineTo(128, 128); c.lineTo(0, 128); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.14)'; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(r() * 128, 40 + r() * 80, 2 + r() * 3, 0, 7); c.fill(); }
    }
    { const g = c.createLinearGradient(0, 20, 0, 128); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,10,40,0.34)'); c.fillStyle = g; c.fillRect(0, 20, 128, 108); }
    c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(0, 14, 128, 12);
    // bibir atas bergelombang
    c.fillStyle = hex(th.top); c.fillRect(0, 0, 128, 14);
    for (let x = 0; x < 128; x += 16) { c.beginPath(); c.arc(x + 8, 14, 8, 0, Math.PI); c.fill(); }
  });
  return texCache[k];
}

// tekstur ubin buatan (kotak-kotak ala mainan) + tema platform
const texCache = {};
function tileTex(key, base, alt, line, dots) {
  if (!HAS_DOM) return null;
  if (!texCache[key]) texCache[key] = canvasTex(256, 256, c => {
    c.scale(2, 2); // digambar di bidang 128x128 = 2x2 ubin; satu tekstur menutup 8x8 satuan dunia
    const r = rng(key.length * 53 + 11), R = (a, b) => a + r() * (b - a);
    // gambar berulang di tepi supaya tekstur tersambung mulus saat diulang
    const wrap = (x, y, m, fn) => { for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) if (x + ox > -m && x + ox < 128 + m && y + oy > -m && y + oy < 128 + m) fn(x + ox, y + oy); };
    const checker = a => { c.globalAlpha = a; c.fillStyle = alt; c.fillRect(0, 0, 64, 64); c.fillRect(64, 64, 64, 64); c.globalAlpha = 1; };
    const specks = (n, col, r0, r1) => { c.fillStyle = col; for (let i = 0; i < n; i++) { const rad = R(r0, r1); wrap(R(0, 128), R(0, 128), rad, (x, y) => { c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); }); } };
    const wig = (n, col, lw, amp) => { c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; for (let i = 0; i < n; i++) { let x = R(0, 128), y = R(0, 128); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * amp; y += (r() - 0.3) * amp; c.lineTo(x, y); } c.stroke(); } };
    const tiles = [[0, 0], [64, 0], [0, 64], [64, 64]];
    c.fillStyle = base; c.fillRect(0, 0, 128, 128);
    if (key === 'grass') {
      // rumput dipangkas bergaris + helai-helai kecil
      c.globalAlpha = 0.55; c.fillStyle = alt; c.fillRect(0, 0, 32, 128); c.fillRect(64, 0, 32, 128); c.globalAlpha = 1;
      c.lineCap = 'round';
      for (let i = 0; i < 170; i++) { const x = R(0, 128), y = R(0, 128), l = R(1.4, 3.4), a = R(-3.14, 3.14); c.strokeStyle = ['rgba(60,140,50,0.32)', 'rgba(190,255,150,0.3)', 'rgba(40,120,60,0.24)'][i % 3]; c.lineWidth = R(0.8, 1.5); wrap(x, y, 7, (px, py) => { c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.sin(a) * l, py - Math.cos(a) * l); c.stroke(); }); }
      specks(16, 'rgba(255,255,255,0.22)', 0.8, 1.6);
    } else if (key === 'sand') {
      // riak pasir + butiran halus + beberapa kerikil
      for (let i = 0; i < 9; i++) { const y0 = i * 14.2 + 4, ph = R(0, 6); for (const [dy, col] of [[0, 'rgba(160,120,50,0.22)'], [1.6, 'rgba(255,250,220,0.4)']]) { c.strokeStyle = col; c.lineWidth = 1.4; c.beginPath(); for (let x = 0; x <= 128; x += 4) { const y = y0 + dy + Math.sin(x / 128 * Math.PI * 4 + ph) * 2.6; if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); } }
      specks(150, 'rgba(150,110,50,0.28)', 0.4, 1.0); specks(60, 'rgba(255,255,235,0.5)', 0.4, 0.9);
      for (let i = 0; i < 7; i++) { const rad = R(1.6, 3), x = R(0, 128), y = R(0, 128); wrap(x, y, 4, (px, py) => { c.fillStyle = 'rgba(120,90,50,0.3)'; c.beginPath(); c.ellipse(px + 0.6, py + 0.8, rad, rad * 0.75, 0, 0, 7); c.fill(); c.fillStyle = i % 2 ? '#e9dcc0' : '#cdb894'; c.beginPath(); c.ellipse(px, py, rad, rad * 0.75, 0, 0, 7); c.fill(); }); }
    } else if (key === 'wood') {
      // papan memanjang dengan serat, sambungan berselang, dan paku
      for (let b = 0; b < 4; b++) {
        const y = b * 32; c.fillStyle = b % 2 ? alt : base; c.fillRect(0, y, 128, 32);
        c.fillStyle = `rgba(${b % 2 ? '255,220,160' : '60,30,5'},${R(0.03, 0.1)})`; c.fillRect(0, y, 128, 32);
        c.strokeStyle = 'rgba(90,55,20,0.28)'; c.lineWidth = 1;
        for (let k = 0; k < 4; k++) { const yy = y + 5 + k * 7 + R(-1, 1), ph = R(0, 6); c.beginPath(); for (let x = 0; x <= 128; x += 8) { const v = yy + Math.sin(x / 128 * Math.PI * 2 * (1 + (k % 2)) + ph) * 1.6; if (x) c.lineTo(x, v); else c.moveTo(x, v); } c.stroke(); }
        const seam = b % 2 ? 40 : 104;
        c.fillStyle = 'rgba(50,28,8,0.55)'; c.fillRect(seam, y, 1.6, 32); c.fillRect(0, y, 128, 1.6);
        c.fillStyle = 'rgba(255,230,180,0.25)'; c.fillRect(0, y + 1.6, 128, 1);
        for (const dx of [-5, 6]) for (const dy of [8, 24]) { c.fillStyle = 'rgba(40,25,10,0.7)'; c.beginPath(); c.arc(seam + dx, y + dy, 1.3, 0, 7); c.fill(); }
      }
    } else {
      // ubin batu: papan catur lembut + detail khas bahan
      checker(key === 'marble' ? 0.8 : 1);
      if (dots) specks(key === 'ice' ? 30 : 46, dots, key === 'ice' ? 0.6 : 1.2, key === 'ice' ? 1.6 : 3.8);
      if (key === 'marble') { wig(9, 'rgba(150,135,110,0.3)', 1.2, 34); wig(5, 'rgba(255,255,255,0.6)', 1.6, 30); }
      if (key === 'ice') { wig(8, 'rgba(255,255,255,0.75)', 1.1, 30); wig(5, 'rgba(90,160,210,0.3)', 0.9, 26); }
      if (key === 'coral') { wig(6, 'rgba(255,255,255,0.3)', 1.5, 22); c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1; for (let i = 0; i < 14; i++) { const rad = R(1.5, 4); wrap(R(0, 128), R(0, 128), 5, (x, y) => { c.beginPath(); c.arc(x, y, rad, 0, 7); c.stroke(); }); } }
      if (key === 'basalt') wig(10, 'rgba(15,8,10,0.55)', 1.4, 26);
      // sudut ubin sedikit lebih gelap (kesan kedalaman)
      for (const [x, y] of tiles) { const g = c.createRadialGradient(x + 32, y + 32, 18, x + 32, y + 32, 48); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); c.fillStyle = g; c.fillRect(x, y, 64, 64); }
      if (line) { c.strokeStyle = line; c.lineWidth = 3; for (const [x, y] of tiles) c.strokeRect(x, y, 64, 64); }
      // sisi terang/gelap di tepi nat (ubin terasa timbul)
      for (const [x, y] of tiles) { c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(x + 2, y + 2, 60, 1.4); c.fillRect(x + 2, y + 2, 1.4, 60); c.fillStyle = 'rgba(0,0,0,0.14)'; c.fillRect(x + 2, y + 60.6, 60, 1.4); c.fillRect(x + 60.6, y + 2, 1.4, 60); }
      if (key === 'marble') {
        // tatahan emas: bingkai tipis + belah ketupat di tiap sudut ubin
        c.strokeStyle = 'rgba(214,170,70,0.75)'; c.lineWidth = 1.2; for (const [x, y] of tiles) c.strokeRect(x + 7, y + 7, 50, 50);
        for (const [x, y] of [[0, 0], [64, 0], [0, 64], [64, 64], [128, 0], [0, 128], [128, 64], [64, 128], [128, 128]]) { c.fillStyle = '#e2b84f'; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.fill(); c.fillStyle = '#fff3c4'; c.beginPath(); c.moveTo(x, y - 2.5); c.lineTo(x + 2.5, y); c.lineTo(x, y + 2.5); c.lineTo(x - 2.5, y); c.fill(); }
      }
      if (key === 'styx') { c.strokeStyle = 'rgba(125,227,176,0.42)'; c.lineWidth = 1.3; for (const [x, y] of tiles) { c.beginPath(); c.arc(x + 32, y + 32, 17, 0, 7); c.stroke(); c.beginPath(); c.arc(x + 32, y + 32, 12, 0, 7); c.stroke(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(x + 32 + Math.cos(a) * 12, y + 32 + Math.sin(a) * 12); c.lineTo(x + 32 + Math.cos(a) * 17, y + 32 + Math.sin(a) * 17); c.stroke(); } } }
      if (key === 'ice') { c.fillStyle = 'rgba(255,255,255,0.95)'; for (let i = 0; i < 12; i++) { const x = R(6, 122), y = R(6, 122), l = R(1.5, 3.5); c.beginPath(); c.moveTo(x, y - l); c.lineTo(x + l * 0.25, y - l * 0.25); c.lineTo(x + l, y); c.lineTo(x + l * 0.25, y + l * 0.25); c.lineTo(x, y + l); c.lineTo(x - l * 0.25, y + l * 0.25); c.lineTo(x - l, y); c.lineTo(x - l * 0.25, y - l * 0.25); c.fill(); } }
    }
  });
  return texCache[key];
}
// retakan menyala (lava / rune) untuk permukaan basalt & styx
function crackTex(key, color) {
  if (!HAS_DOM) return null;
  const k = 'crack_' + key;
  if (!texCache[k]) texCache[k] = canvasTex(256, 256, c => {
    c.fillStyle = '#000'; c.fillRect(0, 0, 256, 256);
    const r = rng(key.length * 31 + 2);
    c.strokeStyle = color; c.lineCap = 'round'; c.shadowColor = color; c.shadowBlur = 8;
    for (let i = 0; i < 9; i++) {
      let x = r() * 256, y = r() * 256, a = r() * 6.28; c.lineWidth = 1.5 + r() * 2.5; c.beginPath(); c.moveTo(x, y);
      for (let n = 0; n < 7; n++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 26; y += Math.sin(a) * 26; c.lineTo(x, y); }
      c.stroke();
    }
  });
  return texCache[k];
}
const THEMES = {
  grass: { tex: ['grass', '#6ccb5c', '#7ddc6b', null, '#58b54b'], top: 0x74d463, side: 0xa77b52 },
  marble: { tex: ['marble', '#efe6d4', '#f8f2e6', '#d8c9a8', null], top: 0xf1eadb, side: 0xdccfb6, brick: true },
  sand: { tex: ['sand', '#f0d590', '#f6e0a6', null, '#dcbb6c'], top: 0xf0d590, side: 0xc9a25c },
  coral: { tex: ['coral', '#ff9f8a', '#ffb3a0', '#f07f6c', null], top: 0xffa692, side: 0xd96f6f },
  basalt: { tex: ['basalt', '#4a3f46', '#584b52', '#2c2429', '#6d3a2c'], top: 0x514449, side: 0x2e262b, brick: true, crack: '#ff7a1a' },
  wood: { tex: ['wood', '#a8743f', '#b98248', '#8a5a2b', '#96652f'], top: 0xb07a44, side: 0x7a4e26 },
  ice: { tex: ['ice', '#cfeeff', '#e6f7ff', '#a9dcf5', '#ffffff'], top: 0xd8f1ff, side: 0x8ec9ea, brick: true },
  storm: { tex: ['storm', '#3f4660', '#4a5270', '#262b40', '#5b6a94'], top: 0x454c68, side: 0x262b40, brick: true, crack: '#8fd0ff' },
  styx: { tex: ['styx', '#4b3a78', '#5a4690', '#2d2250', '#7de3b0'], top: 0x52408a, side: 0x2d2250, brick: true, crack: '#5dffb4' },
};
function themeMats(theme, w, d) {
  const th = THEMES[theme], base = tileTex(...th.tex);
  let top;
  if (base) {
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 8, d / 8); t.anisotropy = 4; t.needsUpdate = true;
    const o = { map: t };
    const ck = th.crack && crackTex(theme, th.crack);
    if (ck) { const e = ck.clone(); e.wrapS = e.wrapT = THREE.RepeatWrapping; e.repeat.set(w / 10, d / 10); e.needsUpdate = true; o.emissiveMap = e; o.emissive = 0xffffff; o.emissiveIntensity = 0.85; }
    top = lam(0xffffff, o);
  } else top = lam(th.top);
  const sb = sideTex(theme, th);
  const sideMat = len => {
    if (!sb) return lam(th.side);
    const t = sb.clone();
    t.wrapS = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(len / 4)), 1); t.needsUpdate = true;
    return lam(0xffffff, { map: t });
  };
  const sx = sideMat(d), sz = sideMat(w);
  return [sx, sx, top, lam(th.side), sz, sz];
}

let CUR = null; // level yang sedang dibangun (untuk mendaftarkan benda bergerak)
const ENV_T = { value: 0 }; // waktu ronde untuk shader lingkungan (rumput, burung)
let _tuftMat = null;
function tuftMat() {
  if (_tuftMat) return _tuftMat;
  _tuftMat = lam(0x58bb4c);
  _tuftMat.onBeforeCompile = sh => {
    sh.uniforms.uT = ENV_T;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float gph = instanceMatrix[3].x * 1.3 + instanceMatrix[3].z * 1.7, gk = ( position.y + 0.12 ) * 4.0;
          transformed.x += sin( uT * 2.3 + gph ) * 0.09 * gk; transformed.z += cos( uT * 1.7 + gph * 1.3 ) * 0.06 * gk;
        #endif`);
  };
  _tuftMat.customProgramCacheKey = () => 'tuft';
  return _tuftMat;
}
// kawanan burung (atau kelelawar): satu mesh, kepakan dan lintasan melingkar dihitung di vertex shader
function birds(L, n, cx, cy, cz, rad, color, size = 1) {
  if (!HAS_DOM) return;
  const pos = [], aux = [], r = rng(n * 13 + Math.round(cx + cz));
  for (let i = 0; i < n; i++) {
    const ph = r() * 6.28, rr = rad * (0.45 + r() * 0.75), h = (r() - 0.5) * rad * 0.35;
    for (const sd of [-1, 1]) for (const [x, z, tip] of [[0, 0.45, 0], [0, -0.35, 0], [sd * 1.25, -0.15, 1]]) { pos.push(x, 0, z); aux.push(ph, rr, h, tip); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 4));
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: { uT: ENV_T, uC: { value: new THREE.Vector3(cx, cy, cz) }, uCol: { value: new THREE.Color(color) }, uS: { value: size } }, side: THREE.DoubleSide,
    vertexShader: `attribute vec4 aux; uniform float uT, uS; uniform vec3 uC; varying float vTip;
      void main() {
        float ang = aux.x + uT * ( 0.1 + fract( aux.x * 7.0 ) * 0.09 );
        vec3 c = uC + vec3( cos( ang ) * aux.y, aux.z + sin( uT * 0.6 + aux.x * 5.0 ) * 2.0, sin( ang ) * aux.y );
        vec3 fwd = vec3( -sin( ang ), 0.0, cos( ang ) ), right = vec3( fwd.z, 0.0, -fwd.x );
        float flap = sin( uT * 8.0 + aux.x * 31.0 ) * 0.75 + 0.15;
        vec3 wp = c + ( right * position.x + fwd * position.z + vec3( 0.0, aux.w * flap * abs( position.x ), 0.0 ) ) * uS;
        vTip = aux.w;
        gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
      }`,
    fragmentShader: `uniform vec3 uCol; varying float vTip;
      void main() {
        gl_FragColor = vec4( uCol * ( 1.0 - vTip * 0.25 ), 1.0 );
        #include <colorspace_fragment>
      }`,
  }));
  m.frustumCulled = false; m.userData.dyn = true;
  L.group.add(m);
}
// bintang jatuh: garis cahaya aditif yang melintas di langit
function shootingStars(L, n) {
  if (!HAS_DOM) return;
  const tex = canvasTex(128, 8, c => { const g = c.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(190,220,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,1)'); c.fillStyle = g; c.fillRect(0, 2, 128, 4); });
  const r = rng(n * 7 + 1), list = [];
  for (let i = 0; i < n; i++) {
    const m = mesh(new THREE.PlaneGeometry(22, 0.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }), 0, 0, 0, L.group);
    m.rotation.z = -0.45; m.userData.dyn = true;
    list.push({ m, per: 5 + r() * 6, off: r() * 10, x: (r() - 0.5) * 260, y: 60 + r() * 50, z: 90 + r() * 80 });
  }
  L.updaters.push(t => { for (const s of list) { const k = (((t + s.off) % s.per) + s.per) % s.per; s.m.visible = k < 1.1; if (s.m.visible) { s.m.position.set(s.x + k * 80, s.y - k * 38, s.z); s.m.material.opacity = Math.min(1, k * 5, (1.1 - k) * 4); } } });
}
const floaty = (o, amp, drift = 0) => { if (CUR && o) CUR.floaters.push({ o, y: o.position.y, x: o.position.x, amp, drift, ph: o.position.x * 0.37 + o.position.z * 0.21 }); return o; };
function put(parent, name, x, y, z, sx = 1, sy = sx, sz = sx, color, rotY = 0) {
  const o = prop(name, color);
  if (!o) return null;
  o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.y = rotY;
  parent.add(o);
  return o;
}

class Level {
  constructor() {
    this.group = new THREE.Group();
    this.plats = []; this.obs = []; this.cps = []; this.wps = []; this.updaters = [];
    this.gravity = 28; this.killY = -14; this.survival = false;
    this.spawn = { y: 0, z: 0 };
    this.sky = ['#3a7bd5', '#9fd3ff', '#ffe9c9'];
    this.floaters = []; this.glows = [];
  }
  // y = tinggi permukaan atas (sisi rendah kalau ramp); rise = kenaikan sepanjang +z
  addPlat(x, y, z, w, d, opt = {}) {
    const h = opt.h ?? 1.2, rise = opt.rise || 0;
    const geo = rise || opt.sharp ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, Math.min(0.22, h * 0.3));
    if (rise) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + rise * (p.getZ(i) / d + 0.5));
      geo.computeVertexNormals();
    }
    const m = mesh(geo, opt.mat || (opt.color !== undefined ? lam(opt.color) : themeMats(opt.theme || 'marble', w, d)), x, y - h / 2, z, this.group);
    if (!rise && opt.rim !== false) mesh(new RoundedBoxGeometry(w + 0.3, 0.22, d + 0.3, 2, 0.1), lam(opt.rim ?? GOLD, opt.rimOpt), 0, h / 2 - 0.3, 0, m);
    if (opt.rock) {
      const s = Math.min(w, d), rh = s * 0.75;
      if (put(m, 'island', 0, -h / 2 + 0.05, 0, w * 1.02, rh, d * 1.02)) { /* aset Blender */ } else {
      const r = mesh(new THREE.ConeGeometry(s * 0.5, rh, 7), lam(0x7a6a5c, { flatShading: true }), 0, -h / 2 - rh / 2, 0, m);
      r.rotation.x = Math.PI;
      r.scale.set(w / s, 1, d / s);
      }
    }
    // rumput & bunga kecil di pulau rumput yang luas
    if (HAS_DOM && !rise && opt.theme === 'grass' && w * d >= 30) {
      const r = rng(Math.floor(x * 31 + z * 17 + w * 7) + 3), n = Math.min(80, Math.floor(w * d / 4)), M4 = new THREE.Matrix4(), col = new THREE.Color();
      const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.24, 4), tuftMat(), n);
      const flo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 5), lam(0xffffff), Math.ceil(n / 3));
      for (let i = 0; i < n; i++) {
        const px = (r() - 0.5) * (w - 1), pz = (r() - 0.5) * (d - 1), sc = 0.6 + r() * 0.7;
        M4.makeScale(sc, sc, sc).setPosition(px, h / 2 + 0.15 * sc, pz); tuft.setMatrixAt(i, M4);
        if (i % 3 === 0) { M4.makeScale(1, 0.6, 1).setPosition(px + 0.3, h / 2 + 0.07, pz + 0.2); flo.setMatrixAt(i / 3, M4); flo.setColorAt(i / 3, col.set([0xffffff, 0xffe14d, 0xff9ac1, 0xc9a6ff][(i / 3) % 4])); }
      }
      m.add(tuft, flo);
    }
    const P = { x, y, z, w, d, h, rise, mesh: m, dx: 0, dy: 0, dz: 0, off: false, x0: x, y0: y, z0: z };
    this.plats.push(P);
    return P;
  }
  topAt(P, z) { return P.rise ? P.y + P.rise * Math.min(1, Math.max(0, (z - P.z) / P.d + 0.5)) : P.y; }
  groundAt(x, z, yMax, margin = 0.25) {
    let best = -Infinity;
    for (const P of this.plats) {
      if (P.off || Math.abs(x - P.x) > P.w / 2 + margin || Math.abs(z - P.z) > P.d / 2 + margin) continue;
      const t = this.topAt(P, z);
      if (t <= yMax && t > best) best = t;
    }
    return best;
  }
  update(t) { for (const u of this.updaters) u(t); }
  finish() { return false; }
}

// ------------------------------------------------------------ rintangan
function mover(L, P, ax, ay, w, ph) {
  P.mesh.userData.dyn = true;
  L.updaters.push(t => {
    const s = Math.sin(w * t + ph), nx = P.x0 + ax * s, ny = P.y0 + ay * s;
    P.dx = nx - P.x; P.dy = ny - P.y;
    P.x = nx; P.y = ny;
    P.mesh.position.x = nx; P.mesh.position.y = ny - P.h / 2;
  });
}

// palang palu berputar; bisa dilompati
function spinner(L, x, y, z, len, w, ph, color, acc = 0, kmax = 99) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  L.group.add(g);
  if (!put(g, 'hub', 0, 0, 0, 0.9)) mesh(new THREE.CylinderGeometry(0.7, 0.85, 1.3, 12), lam(GOLD), 0, 0.65, 0, g);
  const arm = new THREE.Group();
  arm.position.y = 0.5; arm.userData.dyn = true;
  g.add(arm);
  mesh(new THREE.CapsuleGeometry(0.32, len * 2 - 0.6, 6, 12), lam(color), 0, 0, 0, arm).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) if (!put(arm, 'hammer', s * len, 0, 0, 0.5, 0.55, 0.62)) mesh(new RoundedBoxGeometry(1.1, 0.9, 1.1, 2, 0.18), lam(STEEL), s * len, 0, 0, arm);
  let a = ph, w0 = w;
  L.updaters.push(t => { const tp = Math.max(0, t); w = w0 + Math.sign(w0) * acc * tp; a = ph + w0 * (acc ? tp : t) + Math.sign(w0) * 0.5 * acc * tp * tp; arm.rotation.y = -a; });
  const local = e => {
    const dx = e.pos.x - x, dz = e.pos.z - z, c = Math.cos(a), s = Math.sin(a);
    return [dx * c + dz * s, -dx * s + dz * c, c, s];
  };
  L.obs.push({
    hit(e) {
      if (e.pos.y > y + 0.95 || e.pos.y + H < y) return;
      const [lx, lz, c, s] = local(e), lim = 0.3 + R;
      if (Math.abs(lx) > len + 0.6 || Math.abs(lz) > lim) return;
      const side = lz >= 0 ? 1 : -1, push = lim - Math.abs(lz);
      e.pos.x += -s * side * push; e.pos.z += c * side * push;
      const v = w * lx;
      if (Math.sign(v) === side && Math.abs(lx) > 0.4) {
        const sp = Math.min(kmax, Math.abs(v) * 1.2 + 5);
        knock(e, -s * side * sp, 6.5, c * side * sp, 0.6);
      }
    },
    warn(e) {
      if (e.pos.y > y + 0.95) return false;
      const [lx, lz] = local(e);
      if (Math.abs(lx) > len + 0.6) return false;
      return Math.abs(lz) < 1.1 || (Math.sign(w * lx) === Math.sign(lz) && (Math.abs(lz) - 0.8) / (Math.abs(w * lx) + 6) < 0.16);
    },
  });
}

// palu raksasa berayun melintang jalur
function pendulum(L, x, y, z, w, ph) {
  const py = y + 8.2, len = 6.6, A = 1.15;
  if (!put(L.group, 'pivot', x, py, z, 1)) mesh(new THREE.OctahedronGeometry(0.9), lam(GOLD, { emissive: 0x7a5a00, flatShading: true }), x, py + 0.3, z, L.group);
  const arm = new THREE.Group();
  arm.position.set(x, py, z); arm.userData.dyn = true;
  L.group.add(arm);
  mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), lam(STEEL), 0, -len / 2, 0, arm);
  if (!put(arm, 'hammer', 0, -len, 0)) {
    mesh(new RoundedBoxGeometry(2.4, 1.7, 1.7, 2, 0.25), lam(STONE), 0, -len, 0, arm);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.3, 1.8, 1.8), lam(GOLD), s * 0.8, -len, 0, arm);
  }
  let a = 0, dir = 1;
  L.updaters.push(t => { a = A * Math.sin(w * t + ph); dir = Math.cos(w * t + ph) * w >= 0 ? 1 : -1; arm.rotation.z = a; });
  L.obs.push({
    hit(e) {
      const dx = e.pos.x - (x + len * Math.sin(a)), dy = e.pos.y + 0.8 - (py - len * Math.cos(a)), dz = e.pos.z - z;
      if (dx * dx + dy * dy + dz * dz < (1.25 + R) ** 2) knock(e, dir * 13, 7, (Math.random() - 0.5) * 4, 0.9);
    },
  });
}

// batu Sisyphus menggelinding menuruni ramp
function boulder(L, P, x, speed, off, rad, color) {
  const pm = put(L.group, 'boulder', x, 0, 0, rad, rad, rad, color);
  const base = pm ? rad : 1;
  const m = pm || mesh(new THREE.IcosahedronGeometry(rad, 1), lam(color ?? STONE, { flatShading: true }), x, 0, 0, L.group);
  m.userData.dyn = true;
  const zTop = P.z + P.d / 2, span = P.d;
  let bz = 0, by = 0, sc = 1;
  L.updaters.push(t => {
    const s = (((t * speed + off) % span) + span) % span;
    bz = zTop - s; by = L.topAt(P, bz) + rad;
    sc = Math.min(1, s / 2.5, (span - s) / 1.5);
    m.position.set(x, by, bz);
    m.scale.setScalar(Math.max(0.01, sc) * base);
    m.rotation.x = -s / rad;
  });
  L.obs.push({
    hit(e) {
      if (sc < 0.6) return;
      const dx = e.pos.x - x, dy = e.pos.y + 0.8 - by, dz = e.pos.z - bz;
      if (dx * dx + dy * dy + dz * dz < (rad + R) ** 2) knock(e, (dx >= 0 ? 1 : -1) * 5, 7, -speed - 3, 0.8);
    },
    avoid(e) {
      const dz = bz - e.pos.z;
      if (dz < 0 || dz > 10 || Math.abs(e.pos.x - x) > rad + 1.1) return 0;
      let s = e.pos.x >= x ? 1 : -1;
      if (Math.abs(e.pos.x + s * 2.5) > P.w / 2 - 0.8) s = -s;
      return s;
    },
  });
}

// petir Zeus: lingkaran peringatan lalu sambaran
function lightning(L, x, y, z, rad, period, ph, color = 0xffe04a, boltColor = 0xfff7c2) {
  const basic = o => new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, depthWrite: false }, o));
  const disc = mesh(new THREE.CircleGeometry(rad, 28), basic({ opacity: 0 }), x, y + 0.05, z, L.group);
  const ring = mesh(new THREE.RingGeometry(rad - 0.22, rad, 32), basic({ opacity: 0.5 }), x, y + 0.06, z, L.group);
  disc.rotation.x = ring.rotation.x = -Math.PI / 2;
  const bolt = mesh(new THREE.CylinderGeometry(0.35, 0.9, 30, 6), basic({ color: boltColor, opacity: 0.9 }), x, y + 15, z, L.group);
  let strike = false;
  L.updaters.push(t => {
    const c = (((t + ph) % period) + period) % period, warnT = period - 1.3;
    strike = c > period - 0.28;
    disc.material.opacity = strike ? 0.9 : c > warnT ? ((c - warnT) / 1.02) * 0.55 : 0;
    bolt.visible = strike;
  });
  L.obs.push({
    hit(e) {
      if (!strike || Math.abs(e.pos.y - y) > 2.5) return;
      const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz);
      if (d < rad) { const k = d || 1; knock(e, (dx / k) * 7, 11, (dz / k) * 7, 0.9); }
    },
  });
}

// ------------------------------------------------------------ dekorasi
function cloud(g, x, y, z, s, color = 0xffffff) {
  const pc = put(g, 'cloud', x, y, z, s * 1.35, s * 1.2, s * 1.35, color, x * 1.7);
  if (pc) return floaty(pc, 0.5, 2.5);
  const m = lam(color), c = new THREE.Group();
  c.position.set(x, y, z);
  for (const [dx, dy, dz, r] of [[0, 0, 0, 1], [1.1, 0.1, 0.2, 0.75], [-1.1, 0, -0.1, 0.8], [0.4, 0.5, -0.3, 0.7], [-0.5, 0.35, 0.3, 0.6]])
    mesh(new THREE.SphereGeometry(r * s, 10, 8), m, dx * s, dy * s, dz * s, c);
  c.scale.y = 0.6;
  g.add(c);
  return c;
}
function tower(g, x, y, z, s) {
  if (put(g, 'tower', x, y, z, s, s, s, undefined, x)) return;
  const t = new THREE.Group();
  t.position.set(x, y, z);
  mesh(new THREE.ConeGeometry(4 * s, 6 * s, 7), lam(0x7a6a5c, { flatShading: true }), 0, -3 * s, 0, t).rotation.x = Math.PI;
  mesh(new THREE.CylinderGeometry(1.6 * s, 2.2 * s, 9 * s, 10), lam(0xf7e3a1), 0, 4.5 * s, 0, t);
  mesh(new THREE.ConeGeometry(2.3 * s, 4.5 * s, 10), lam(GOLD), 0, 11.2 * s, 0, t);
  g.add(t);
}
function column(g, x, y, z, h = 6) {
  if (put(g, 'column', x, y, z, 1, h / 6, 1)) return;
  mesh(new THREE.CylinderGeometry(0.55, 0.6, h, 12), lam(MARBLE), x, y + h / 2, z, g);
  mesh(new THREE.BoxGeometry(1.5, 0.4, 1.5), lam(MARBLE), x, y + h + 0.2, z, g);
  mesh(new THREE.BoxGeometry(1.5, 0.3, 1.5), lam(GOLD), x, y + 0.15, z, g);
}
// pulau hias melayang (tanpa tabrakan): rumput + batu + pohon/kristal
function decoIsland(g, x, y, z, r, rnd, opt = {}) {
  const isl = new THREE.Group();
  isl.position.set(x, y, z);
  const top = mesh(new THREE.CylinderGeometry(r, r * 0.96, 0.8, 14), lam(opt.top ?? 0x74d463), 0, -0.4, 0, isl);
  if (!put(isl, 'island', 0, -0.75, 0, r * 2.05, r * 1.5, r * 2.05, opt.rock)) { const c = mesh(new THREE.ConeGeometry(r, r * 1.5, 8), lam(0x7a6a5c, { flatShading: true }), 0, -0.8 - r * 0.75, 0, isl); c.rotation.x = Math.PI; }
  const n = opt.count ?? 2 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, d = rnd() * r * 0.65, sc = (opt.scale ?? 1) * (0.8 + rnd() * 0.7);
    put(isl, opt.item || 'tree', Math.cos(a) * d, 0, Math.sin(a) * d, sc, sc, sc, opt.itemColor, rnd() * 6);
  }
  g.add(isl);
  return floaty(isl, 0.45);
}

function rainbowMat() {
  const cols = ['#ff4d4d', '#ff9a3c', '#ffe14d', '#5fe07a', '#4dc3ff', '#6a6bff', '#c05cff'];
  const tex = canvasTex(70, 4, (c, w, h) => cols.forEach((col, i) => { c.fillStyle = col; c.fillRect(i * 10, 0, 10, h); }));
  return tex ? new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }) : lam(0x4dc3ff);
}

// ============================================================ MAP 1: ASGARD
function asgard(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  const GRASS = 0x7ed36b;
  L.cloudFloor = -30;
  L.spawn = { y: 0, z: 2 };

  L.addPlat(0, 0, 0, 16, 14, { theme: 'grass', rock: true });
  // lorong palu berputar
  L.addPlat(0, 0, 22, 12, 30, { rock: true });
  spinner(L, 0, 0, 13, 5.4, 1.6, 0, 0xd0453a);
  spinner(L, 0, 0, 22, 5.4, -2.0, 1, 0x3b6fe0);
  spinner(L, 0, 0, 31, 5.4, 2.4, 2, 0xd0453a);
  // pulau-pulau melayang
  L.addPlat(0, 0, 41.5, 5, 4, { theme: 'grass', rock: true });
  mover(L, L.addPlat(0, 0, 48, 5, 4, { theme: 'grass', rock: true }), 3.5, 0, 0.9, 0);
  mover(L, L.addPlat(0, 0, 54.5, 5, 4, { theme: 'grass', rock: true }), -3.5, 0, 0.9, 0.6);
  L.addPlat(0, 0, 61.5, 7, 5, { theme: 'grass', rock: true });
  // jembatan pelangi Bifrost + palu berayun
  L.addPlat(0, 0, 79, 4.5, 30, { mat: rainbowMat(), h: 0.5, rim: 0xffffff });
  pendulum(L, 0, 0, 70, 1.5, 0);
  pendulum(L, 0, 0, 79, 1.8, 2);
  pendulum(L, 0, 0, 88, 1.5, 4);
  // pulau Valhalla
  L.addPlat(0, 0, 103, 16, 18, { rock: true });
  spinner(L, 0, 0, 102.5, 5.5, 2.2, 0.5, 0xf2c14e);
  powerBox(L, 0, 0, 61.5, 'shield');
  arch(g, 108, 0, 6.5, GOLD, true);

  L.cps = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 35 }, { x: 0, y: 0, z: 61.5 }, { x: 0, y: 0, z: 95 }];
  L.wps = [{ x: 0, z: 6, w: 5 }, { x: 0, z: 36, w: 4 }, { x: 0, z: 41.5, w: 1.2 }, { x: 0, z: 48, w: 0.8 }, { x: 0, z: 54.5, w: 0.8 },
    { x: 0, z: 61.5, w: 1.5 }, { x: 0, z: 93, w: 1.2 }, { x: 0, z: 113, w: 4 }];
  L.finish = e => e.pos.z >= 108 && e.pos.y > -0.5;

  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    tower(g, side * (55 + rnd() * 70), -30 + rnd() * 30, -10 + rnd() * 170, 1 + rnd() * 1.6);
  }
  if (!put(g, 'palace', 0, -2, 165, 2.6, 2.6, 2.6)) tower(g, 0, -6, 150, 4);
  birds(L, 14, -10, 26, 70, 46, 0xffffff); birds(L, 8, 30, 34, 120, 30, 0xfff2d0);
  for (let i = 0; i < 10; i++) decoIsland(g, (i % 2 ? 1 : -1) * (16 + rnd() * 26), -6 + rnd() * 9, -5 + i * 12 + rnd() * 8, 3 + rnd() * 3, rnd);
  for (let i = 0; i < 26; i++) cloud(g, (rnd() - 0.5) * 160, -22 + rnd() * 14, -20 + rnd() * 170, 3 + rnd() * 4);
  return L;
}

// ============================================================ MAP 2: GALAKSI
function galaxy(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.survival = true; L.gravity = 20; L.killY = -12;
  L.sky = ['#03010c', '#180a36', '#3a1466'];
  L.skyFx = { cloud: 0.75, cloudCol: 0x5a2f9a, stars: 1 };
  L.fog = [120, 500];
  L.tiles = [];
  const S = 4.2;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    if (i * i + j * j > 10) continue;
    const P = L.addPlat(i * S, 0, j * S, 4, 4, { h: 0.8, mat: lam((i + j) & 1 ? 0x2b2070 : 0x3a2a8f), rim: 0x55e6ff, rimOpt: { emissive: 0x1a8fb0 } });
    P.mesh.userData.dyn = true;
    L.tiles.push({ P, time: 0 });
  }
  // urutan kehancuran acak (seed dari server -> sama untuk semua)
  const order = L.tiles.slice();
  for (let i = order.length - 1; i > 0; i--) { const k = (rnd() * (i + 1)) | 0; [order[i], order[k]] = [order[k], order[i]]; }
  let time = 4;
  order.forEach((T, i) => { T.time = time; time += 2.4 - 1.2 * (i / (order.length - 1)); });
  const metGeo = new THREE.IcosahedronGeometry(1.1, 0);
  for (const T of L.tiles) {
    T.met = mesh(metGeo, lam(0xff7a2b, { emissive: 0xff4a00, flatShading: true }), 0, 0, 0, g);
    T.met.visible = false; T.met.userData.dyn = true;
  }
  L.updaters.push(t => {
    for (const T of L.tiles) {
      const d = t - T.time, m = T.P.mesh;
      if (d < -1.5) { T.met.visible = false; continue; }
      if (d < 0) {
        const k = 0.5 + 0.5 * Math.sin(t * 22);
        m.material.emissive.setRGB(k, k * 0.15, 0);
        T.met.visible = true;
        T.met.position.set(T.P.x + d * 9, 1 - d * 30, T.P.z);
        T.met.rotation.x = t * 5;
      } else {
        T.P.off = true; T.met.visible = false;
        if (d < 1.2) { m.position.y = -0.4 - d * d * 22; m.rotation.x = d * 1.5; } else m.visible = false;
      }
    }
  });
  L.obs.push({
    hit(e, t) {
      for (const T of L.tiles) {
        const d = t - T.time;
        if (d < 0 || d > 0.12) continue;
        const dx = e.pos.x - T.P.x, dz = e.pos.z - T.P.z, dist = Math.hypot(dx, dz);
        if (dist < 3.6 && Math.abs(e.pos.y) < 3) { const k = dist || 1; knock(e, (dx / k) * 7, 8, (dz / k) * 7, 0.6); return; }
      }
    },
  });

  // langit: bintang, planet, piringan galaksi
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([r * Math.cos(a) * 300, u * 300, r * Math.sin(a) * 300], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: true, fog: false })));
  const planets = [[-60, 18, 70, 14, 0xff8a5c, true], [75, -10, 40, 9, 0x5ce0c4, false], [40, 35, -90, 20, 0xb18cff, true], [-90, -20, -50, 11, 0xffd35c, false]];
  for (const [x, y, z, r, col, ring] of planets) {
    mesh(new THREE.SphereGeometry(r, 24, 18), lam(col, { fog: false }), x, y, z, g);
    if (ring) {
      const rg = mesh(new THREE.TorusGeometry(r * 1.7, r * 0.12, 4, 40), lam(0xffffff, { fog: false, transparent: true, opacity: 0.7 }), x, y, z, g);
      rg.rotation.set(1.2, 0.3, 0); rg.scale.z = 0.1;
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd(), r = 26 + rnd() * 30, y = -8 + rnd() * 16, sc = 1.5 + rnd() * 2.5;
    const col = [0x7de3ff, 0xc08bff, 0xff8ad6][i % 3];
    put(g, 'boulder', Math.cos(a) * r, y, Math.sin(a) * r, sc, sc * 0.7, sc, 0x4a3a8a, a);
    const cr = put(g, 'crystal', Math.cos(a) * r, y + sc * 0.4, Math.sin(a) * r, sc * 0.6, sc * 0.6, sc * 0.6, col, a * 2);
    if (cr) { cr.traverse(n => { if (n.isMesh) { n.material.emissive = new THREE.Color(col).multiplyScalar(0.45); n.material.flatShading = true; } }); glow(g, Math.cos(a) * r, y + sc * 1.4, Math.sin(a) * r, col, sc * 5); }
  }
  shootingStars(L, 5);
  const dt = canvasTex(256, 256, (c) => {
    const gr = c.createRadialGradient(128, 128, 4, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.15, 'rgba(255,140,220,0.8)');
    gr.addColorStop(0.5, 'rgba(90,80,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
  });
  if (dt) {
    const disc = mesh(new THREE.CircleGeometry(110, 48), new THREE.MeshBasicMaterial({ map: dt, transparent: true, depthWrite: false, fog: false }), 0, -45, 0, g);
    disc.rotation.x = -Math.PI / 2;
    L.updaters.push(t => { disc.rotation.z = t * 0.05; });
  }
  return L;
}

// ============================================================ MAP 3: OLYMPUS
function olympus(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.sky = ['#f0703a', '#ffc98a', '#fff1d2'];
  L.skyFx = { cloud: 0.8, cloudCol: 0xfff0dc };
  L.spawn = { y: 0, z: 1 };
  const W = 18;
  L.cloudFloor = -30;

  L.addPlat(0, 0, 0, W, 12, { rock: true });
  // lereng Sisyphus
  const ramp = L.addPlat(0, 0, 26, W, 40, { rise: 14, h: 2 });
  [-6, -2, 2, 6].forEach((x, i) => boulder(L, ramp, x, 8.5 + ((i * 7) % 4) * 1.1, rnd() * 40, 1.2, 0xb8ab99));
  // dataran petir
  L.addPlat(0, 14, 56, W, 20, { h: 3 });
  const zones = [[-4.5, 50], [4.5, 50], [0, 53], [-6, 57], [6, 57], [0, 59], [-3.5, 63], [3.5, 63]];
  zones.forEach(([x, z], i) => lightning(L, x, 14, z, 2.8, 3.4, i * 0.47));
  // tangga awan
  const CL = 0xffffff, copt = { color: CL, rim: 0xffe9a8, h: 0.9 };
  mover(L, L.addPlat(0, 14.9, 70, 5, 4, copt), 3, 0, 1.0, 0);
  L.addPlat(0, 15.8, 76, 5, 4, copt);
  mover(L, L.addPlat(0, 16.7, 82, 5, 4, copt), -3, 0, 1.0, 1);
  // singgasana
  L.addPlat(0, 17.5, 91, 12, 10, { rock: true });
  const crown = new THREE.Group();
  crown.position.set(0, 18.9, 92);
  mesh(new THREE.TorusGeometry(0.8, 0.14, 8, 24), lam(GOLD, { emissive: 0xb07a00 }), 0, 0, 0, crown).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    mesh(new THREE.ConeGeometry(0.14, 0.45, 5), lam(0x8ee06a, { emissive: 0x2a6a10 }), Math.cos(a) * 0.8, 0.25, Math.sin(a) * 0.8, crown);
  }
  glow(crown, 0, 0.1, 0, 0xffe07a, 5);
  g.add(crown); crown.userData.dyn = true;
  L.crown = crown;
  L.updaters.push(t => { crown.rotation.y = t * 2; if (!L.crownTaken) crown.position.y = 18.9 + Math.sin(t * 3) * 0.15; });
  mesh(new THREE.BoxGeometry(3, 1, 2), lam(GOLD), 0, 18, 95, g);
  mesh(new THREE.BoxGeometry(3, 4.5, 0.6), lam(GOLD), 0, 20.2, 95.8, g);
  for (const s of [-1, 1]) { column(g, s * 5, 17.5, 94.5, 6); column(g, s * 5, 17.5, 87.5, 6); }

  L.cps = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 14, z: 47.5 }, { x: 0, y: 14, z: 65 }];
  L.wps = [{ x: 0, z: 5, w: 6 }, { x: 0, z: 47, w: 7 }, { x: 0, z: 65, w: 5 }, { x: 0, z: 70, w: 0.8 }, { x: 0, z: 76, w: 1 }, { x: 0, z: 82, w: 0.8 }, { x: 0, z: 92, w: 0 }];
  L.finish = e => Math.hypot(e.pos.x, e.pos.y + 0.8 - 18.9, e.pos.z - 92) < 2;

  for (const z of [-4, 4]) for (const s of [-1, 1]) column(g, s * 8, 0, z, 7);
  for (const z of [48, 56, 64]) for (const s of [-1, 1]) column(g, s * 8.2, 14, z, 7);
  for (let i = 0; i < 30; i++) cloud(g, (rnd() - 0.5) * 170, -18 + rnd() * 30, -30 + rnd() * 160, 3 + rnd() * 5, 0xfff3e0);
  put(g, 'temple', 0, 6, 128, 3.2, 3.2, 3.2);
  birds(L, 12, 0, 36, 60, 44, 0xfff6e6);
  put(g, 'statue', -13.5, 14, 56, 1.5, 1.5, 1.5, undefined, 0.5); put(g, 'statue', 13.5, 14, 56, 1.5, 1.5, 1.5, undefined, -0.5);
  put(g, 'temple', -46, 2, 70, 1.6, 1.6, 1.6, undefined, 0.6); put(g, 'temple', 48, -4, 30, 1.6, 1.6, 1.6, undefined, -0.5);
  for (let i = 0; i < 10; i++) decoIsland(g, (i % 2 ? 1 : -1) * (15 + rnd() * 20), -4 + i * 2 + rnd() * 6, -6 + i * 10 + rnd() * 6, 3 + rnd() * 2.5, rnd);
  // puncak gunung di kejauhan
  for (let i = 0; i < 6; i++) mesh(new THREE.ConeGeometry(30 + rnd() * 20, 70 + rnd() * 40, 6), lam(0xd9c7b0, { flatShading: true }), (i % 2 ? 1 : -1) * (70 + rnd() * 50), -20, rnd() * 160, g);
  return L;
}

// bantalan lontar: injak untuk terlempar tinggi
function pad(L, x, y, z, hw, power) {
  const m = mesh(new THREE.CylinderGeometry(1, 1.1, 0.3, 20), lam(0xff5fa2, { emissive: 0x7a1040 }), x, y + 0.12, z, L.group);
  glow(L.group, x, y + 0.6, z, 0xff5fa2, 3 + hw);
  m.scale.set(hw, 1, 1.3); m.userData.dyn = true;
  const top = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 20), lam(0xffffff, { emissive: 0x888888 }), 0, 0.2, 0, m);
  let squash = 0;
  L.updaters.push(t => { squash *= 0.9; m.scale.y = 1 + Math.sin(t * 6) * 0.08 - squash * 0.5; top.position.y = 0.2; });
  L.obs.push({
    hit(e) {
      if (Math.abs(e.pos.x - x) > hw + 0.2 || Math.abs(e.pos.z - z) > 1.5 || e.pos.y < y - 0.1 || e.pos.y > y + 0.45 || e.vel.y > 1) return;
      e.vel.y = power; e.grounded = false; e.ground = null; e.coyote = 0; e.fx = 'jump'; squash = 1;
    },
  });
}
// jalur percepatan: lari lebih kencang sesaat
function boost(L, x, y, z, w, d) {
  const tex = canvasTex(64, 64, c => { c.fillStyle = '#35d0ff'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#ffffff'; for (const yy of [8, 40]) { c.beginPath(); c.moveTo(8, yy + 20); c.lineTo(32, yy); c.lineTo(56, yy + 20); c.lineTo(56, yy + 28); c.lineTo(32, yy + 8); c.lineTo(8, yy + 28); c.fill(); } });
  const o = { emissive: 0x1a6f8f };
  if (tex) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(Math.max(1, w / 3), Math.max(1, d / 3)); o.map = tex; }
  const m = mesh(new THREE.PlaneGeometry(w, d), lam(tex ? 0xffffff : 0x35d0ff, o), x, y + 0.03, z, L.group);
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI; m.userData.dyn = true;
  if (tex) L.updaters.push(t => { tex.offset.y = t * 1.5; });
  L.obs.push({ hit(e) { if (e.grounded && Math.abs(e.pos.x - x) < w / 2 && Math.abs(e.pos.z - z) < d / 2 && Math.abs(e.pos.y - y) < 0.3) e.speedT = Math.max(e.speedT, 1.0); } });
}

// lantai kedip: pijakan yang hilang-timbul secara berkala (berkedip dulu sebelum hilang)
function blinker(L, P, period, ph, onFrac = 0.6) {
  P.mesh.userData.dyn = true;
  L.updaters.push(t => {
    const c = (((t + ph) % period) + period) % period, lim = period * onFrac;
    const off = t > 0 && c > lim, warn = t > 0 && !off && c > lim - 0.8;
    P.off = off;
    P.mesh.visible = !off && !(warn && Math.sin(c * 30) > 0.2);
  });
}
// kotak kekuatan: sentuh untuk lari kencang atau perisai sesaat (tiap pemain punya jeda sendiri)
function powerBox(L, x, y, z, kind) {
  const id = (L.boxes = L.boxes || []).length, col = kind === 'shield' ? 0xb9a6ff : 0x7fe6ff;
  const g = new THREE.Group();
  g.position.set(x, y + 1.1, z); g.userData.dyn = true;
  L.group.add(g);
  mesh(new RoundedBoxGeometry(0.95, 0.95, 0.95, 2, 0.14), lam(col, { emissive: new THREE.Color(col).multiplyScalar(0.45) }), 0, 0, 0, g);
  mesh(new THREE.OctahedronGeometry(0.3), lam(0xffffff, { emissive: 0xaaaaaa }), 0, 0, 0, g).scale.y = 1.5;
  glow(g, 0, 0, 0, col, 3.4);
  L.boxes.push({ g, id });
  L.updaters.push(t => { g.rotation.y = t * 1.8 + id; g.rotation.x = Math.sin(t * 1.3 + id) * 0.3; g.position.y = y + 1.1 + Math.sin(t * 2.5 + id) * 0.15; });
  L.obs.push({
    hit(e, t) {
      if (!(t > 0) || Math.abs(e.pos.y - y) > 2 || Math.hypot(e.pos.x - x, e.pos.z - z) > 1.25) return;
      const at = e.boxAt || (e.boxAt = {});
      if ((at[id] || 0) > t) return;
      at[id] = t + 9;
      if (kind === 'shield') e.shieldT = Math.max(e.shieldT, 3.5); else e.speedT = Math.max(e.speedT, 3.5);
      e.fx = kind === 'shield' ? 'boxShield' : 'boxSpeed';
    },
  });
}

// bumper: tiang karet yang memantulkan siapa pun yang menyentuhnya
function bumper(L, x, y, z, r, hw, color = 0xff5fa2) {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.userData.dyn = true;
  L.group.add(g);
  mesh(new THREE.CylinderGeometry(r, r * 1.08, 1.3, 18), lam(color, { emissive: new THREE.Color(color).multiplyScalar(0.25) }), 0, 0.65, 0, g);
  for (const yy of [0.35, 0.95]) mesh(new THREE.TorusGeometry(r * 1.03, 0.09, 6, 20), lam(0xffffff), 0, yy, 0, g).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(r * 0.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xffffff, { emissive: 0x666666 }), 0, 1.3, 0, g);
  glow(g, 0, 1.2, 0, color, r * 4);
  let pulse = 0;
  L.updaters.push(() => { pulse *= 0.86; const k = 1 + pulse * 0.35; g.scale.set(k, 1 - pulse * 0.15, k); });
  L.obs.push({
    hit(e) {
      if (e.pos.y > y + 1.5 || e.pos.y + H < y) return;
      const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.hypot(dx, dz);
      if (d > r + R) return;
      const k = d || 1; pulse = 1;
      knock(e, (dx / k) * 9, 5.5, (dz / k) * 9, 0.35);
    },
    avoid(e) {
      const dz = z - e.pos.z;
      if (dz < 0 || dz > 4 || Math.abs(e.pos.x - x) > r + 0.9 || Math.abs(e.pos.y - y) > 2) return 0;
      let sd = e.pos.x >= x ? 1 : -1;
      if (Math.abs(e.pos.x + sd * 2) > hw - 0.6) sd = -sd;
      return sd;
    },
  });
}
// kipas angin: secara berkala meniup ke samping di satu ruas jalan
function fan(L, x, y, z, w, d, dir, force, period, ph) {
  const tex = canvasTex(64, 64, c => { c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.lineCap = 'round'; for (const [yy, x0, len] of [[10, 6, 30], [26, 26, 32], [42, 2, 24], [56, 30, 26]]) { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x0 + len, yy); c.stroke(); } });
  let plane = null;
  if (tex) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(Math.max(1, w / 4), Math.max(1, d / 4));
    plane = mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, color: 0xcfefff }), x, y + 0.9, z, L.group);
    plane.rotation.x = -Math.PI / 2; plane.userData.dyn = true;
  }
  // menara kipas di sisi asal angin
  const tw = new THREE.Group();
  tw.position.set(x - dir * (w / 2 + 1.6), y - 0.4, z);
  L.group.add(tw);
  mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 10), lam(STEEL), 0, 1.2, 0, tw);
  const hubG = new THREE.Group(); hubG.position.set(dir * 0.5, 2.5, 0); hubG.userData.dyn = true; tw.add(hubG);
  mesh(new THREE.SphereGeometry(0.45, 10, 8), lam(GOLD), 0, 0, 0, hubG);
  for (let i = 0; i < 4; i++) { const b = mesh(new THREE.BoxGeometry(0.08, 1.7, 0.6), lam(0xe8f4ff), 0, 0, 0, hubG); b.geometry.translate(0, 0.95, 0); b.rotation.x = i * Math.PI / 2; b.rotation.y = 0.5; }
  mesh(new THREE.TorusGeometry(1.95, 0.1, 6, 24), lam(GOLD), dir * 0.5, 2.5, 0, tw).rotation.y = Math.PI / 2;
  let on = false, spin = 0, lastT = 0;
  L.updaters.push(t => {
    const c = (((t + ph) % period) + period) % period;
    on = t > 0 && c < period * 0.5;
    const warm = c > period - 0.6 ? (c - (period - 0.6)) / 0.6 : 0; // berputar dulu sebelum meniup
    spin += Math.min(0.1, Math.max(0, t - lastT)) * (on ? 22 : 2 + warm * 16); lastT = t;
    hubG.rotation.x = spin;
    if (plane) { plane.material.opacity += ((on ? 0.6 : warm * 0.2) - plane.material.opacity) * 0.2; tex.offset.x = -dir * t * 2.2; }
  });
  const inside = e => Math.abs(e.pos.x - x) < w / 2 + 0.3 && Math.abs(e.pos.z - z) < d / 2 && e.pos.y > y - 0.5 && e.pos.y < y + 3.5;
  L.obs.push({
    hit(e) { if (on && inside(e)) e.wind = dir * force; },
    avoid(e) { return on && inside(e) ? -dir : 0; },
  });
}

// ombak: dinding rendah yang melaju ke arah pemain; lompati
function wave(L, P, speed, off, color) {
  const m = mesh(new THREE.CapsuleGeometry(0.45, P.w - 0.9, 6, 12), lam(color, { transparent: false, emissive: 0x0a3a55 }), P.x, P.y + 0.45, 0, L.group);
  m.rotation.z = Math.PI / 2; m.userData.dyn = true;
  const zEnd = P.z + P.d / 2, span = P.d;
  let wz = 0, sc = 1;
  L.updaters.push(t => {
    const s = (((t * speed + off) % span) + span) % span;
    wz = zEnd - s; sc = Math.min(1, s / 2, (span - s) / 2);
    m.position.z = wz; m.position.y = P.y + 0.45 * sc; m.scale.set(1, 1, Math.max(0.01, sc)); m.rotation.x = -s * 1.5;
  });
  L.obs.push({
    hit(e) {
      if (sc < 0.7 || e.pos.y > P.y + 0.9 || e.pos.y + H < P.y || Math.abs(e.pos.x - P.x) > P.w / 2) return;
      if (Math.abs(e.pos.z - wz) < 0.45 + R) knock(e, 0, 5.5, -speed - 1, 0.5);
    },
    warn(e) { const d = wz - e.pos.z; return sc > 0.6 && d > 0 && d < 0.28 * (speed + 7) && e.pos.y < P.y + 0.9 && Math.abs(e.pos.x - P.x) < P.w / 2; },
  });
}
function sea(L, y, color, emissive, size = 700) {
  const tex = canvasTex(256, 256, c => {
    c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, 256, 256);
    const r = rng(11);
    for (let i = 0; i < 26; i++) {
      const x = r() * 256, yy = r() * 256, rad = 14 + r() * 30;
      c.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.4})`; c.lineWidth = 3 + r() * 4;
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { c.beginPath(); c.ellipse(x + ox, yy + oy, rad, rad * 0.55, r() * 3, 0, 5.2); c.stroke(); }
    }
  });
  const o = { emissive: emissive || 0, shininess: 90, specular: 0x999999 };
  if (tex) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(size / 22, size / 22); o.map = tex; o.emissiveMap = tex; }
  const mat = lam(tex ? new THREE.Color(color).multiplyScalar(1.7) : color, o);
  // ombak dihitung di GPU (vertex shader): tanpa beban CPU, normalnya analitik, puncak ombak berbuih,
  // dan permukaan memantulkan warna langit di sudut landai
  const lava = (emissive || 0) > 0x800000, uT = { value: 0 };
  mat.userData.noMerge = true;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = uT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uT; varying float vCrest;
        vec4 seaWave( vec2 p ) {
          float a = p.x * 0.23 + uT * 1.5, b = p.y * 0.29 + uT * 1.2, c = ( p.x + p.y ) * 0.11 + uT * 0.8, d = ( p.x - p.y ) * 0.47 + uT * 2.1;
          float edge = clamp( ( 1.0 - max( abs( p.x ), abs( p.y - 50.0 ) ) / 114.0 ) * 4.0, 0.0, 1.0 );
          float h = sin( a ) * 0.28 + cos( b ) * 0.22 + sin( c ) * 0.2 + sin( d ) * 0.07;
          float dx = cos( a ) * 0.0644 + cos( c ) * 0.022 + cos( d ) * 0.0329, dz = -sin( b ) * 0.0638 + cos( c ) * 0.022 - cos( d ) * 0.0329;
          return vec4( vec3( h, dx, dz ) * edge, edge );
        }`)
      .replace('#include <beginnormal_vertex>', `vec4 sw = seaWave( ( modelMatrix * vec4( position, 1.0 ) ).xz );
        vec3 objectNormal = normalize( vec3( -sw.y, 1.0, -sw.z ) ); vCrest = sw.x;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3( position.x, position.y + sw.x - 0.9 * ( 1.0 - sw.w ), position.z );');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uT; varying float vCrest;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        float fres = pow( 1.0 - clamp( abs( dot( normalize( vViewPosition ), normal ) ), 0.0, 1.0 ), 3.0 );
        ${lava
    ? 'gl_FragColor.rgb *= 0.9 + 0.16 * sin( uT * 1.7 + vCrest * 5.0 ); gl_FragColor.rgb += vec3( 1.0, 0.55, 0.12 ) * smoothstep( 0.3, 0.75, vCrest ) * 0.4;'
    : 'gl_FragColor.rgb += vec3( 1.0 ) * smoothstep( 0.34, 0.72, vCrest ) * 0.3 + vec3( 0.75, 0.9, 1.0 ) * fres * 0.4;'}`);
  };
  mat.customProgramCacheKey = () => 'sea' + (lava ? 1 : 0);
  const flat = new THREE.PlaneGeometry(size, size, 1, 1); flat.rotateX(-Math.PI / 2);
  const m = mesh(flat, mat, 0, y, 60, L.group);
  L.seaY = y; L.seaColor = color; L.seaMeshes = [m]; L.seaFx = lava ? 'lava' : 'glint';
  // bagian tengah bertessellasi (di sekitar lintasan) yang benar-benar bergelombang
  const N = 56, W = 240;
  if (HAS_DOM) {
    const wave = new THREE.PlaneGeometry(W, W, N, N);
    wave.rotateX(-Math.PI / 2);
    if (tex) { const uv = wave.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / 22, uv.getY(i) * W / 22); }
    const wm = mesh(wave, mat, 0, y, 50, L.group);
    wm.frustumCulled = false;
    L.seaMeshes.push(wm);
  }
  for (const sm of L.seaMeshes) sm.userData.dyn = true;
  L.updaters.push(t => { uT.value = t; if (tex) tex.offset.set(t * 0.012, t * 0.02); });
}
function arch(g, z, y, half, color, rainbow) {
  if (put(g, 'gate', 0, y, z, half / 6.5, 1, 1)) {
    mesh(new THREE.BoxGeometry(half * 2 - 1, 0.06, 1.4), rainbow ? rainbowMat() : lam(0xffffff, { emissive: 0x555555 }), 0, y + 0.04, z, g);
    const gl = glow(g, 0, y + 3.5, z, 0xfff2c0, half * 1.5); if (gl) gl.material.opacity = 0.35;
    return;
  }
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.7, 0.8, 7, 12), lam(color), s * half, y + 3.5, z, g);
  mesh(new RoundedBoxGeometry(half * 2 + 1.6, 1, 1.2, 2, 0.2), lam(color), 0, y + 7.5, z, g);
  glow(g, 0, y + 4, z, 0xffffff, half * 2.2);
  mesh(new THREE.BoxGeometry(half * 2 - 1, 0.06, 1.4), rainbow ? rainbowMat() : lam(0xffffff, { emissive: 0x555555 }), 0, y + 0.04, z, g);
}

// ============================================================ MAP 4: SAMUDRA POSEIDON
function tidal(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.sky = ['#1f8fd6', '#7fe0e8', '#d9fff5'];
  L.killY = -5; L.spawn = { y: 0, z: 2 };
  sea(L, -4.2, 0x1fa3c9, 0x0a4a66);
  L.addPlat(0, 0, 0, 16, 14, { theme: 'sand', h: 5 });
  // dermaga ombak
  const pier = L.addPlat(0, 0, 21, 12, 28, { theme: 'coral', h: 5 });
  wave(L, pier, 7.5, 0, 0x7fe6ff); wave(L, pier, 7.5, 14, 0xb6f3ff);
  // batu apung naik-turun
  const stones = [39.5, 46, 52.5];
  stones.forEach((z, i) => mover(L, L.addPlat(i === 1 ? 1.5 : -1, -0.4, z, 5, 4, { theme: 'sand', h: 2.5 }), 0, 0.9, 1.3, i * 2.1));
  L.addPlat(0, 0, 59.5, 8, 6, { theme: 'sand', h: 5 });
  powerBox(L, 0, 0, 59.5, 'speed');
  // jembatan karang
  L.addPlat(0, 0, 77, 6, 29, { theme: 'coral', h: 1 });
  spinner(L, 0, 0, 68, 2.9, 2.6, 0, 0x9b5cff);
  pendulum(L, 0, 0, 77, 1.7, 1);
  spinner(L, 0, 0, 86, 2.9, -3.0, 1, 0x9b5cff);
  L.addPlat(0, 0, 99.5, 16, 16, { theme: 'sand', h: 5 });
  arch(g, 103, 0, 6.5, 0xff8a7a, false);
  L.cps = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 34 }, { x: 0, y: 0, z: 59.5 }, { x: 0, y: 0, z: 93 }];
  L.wps = [{ x: 0, z: 6, w: 5 }, { x: 0, z: 34.5, w: 4.5 }, { x: -1, z: 39.5, w: 1 }, { x: 1.5, z: 46, w: 1 }, { x: -1, z: 52.5, w: 1 },
    { x: 0, z: 59.5, w: 2 }, { x: 0, z: 91, w: 1.6 }, { x: 0, z: 108, w: 4 }];
  L.finish = e => e.pos.z >= 103 && e.pos.y > -0.5;
  // karang, batu, dan tiang trisula di laut
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1, x = side * (14 + rnd() * 70), z = -20 + rnd() * 150, hgt = 4 + rnd() * 12;
    const col = [0xff8a7a, 0xffc36b, 0x9b7bff, 0x53d6b6][i % 4], sc = 1.6 + rnd() * 2.6;
    if (i % 3 === 0 || !put(g, 'coral', x, -4.6, z, sc, sc, sc, col, rnd() * 6)) mesh(new THREE.ConeGeometry(2 + rnd() * 3, hgt, 6), lam(col, { flatShading: true }), x, -4 + hgt / 2, z, g);
  }
  put(g, 'lighthouse', -30, -4, 62, 1.5, 1.5, 1.5); put(g, 'lighthouse', 34, -4, 118, 1.2, 1.2, 1.2);
  birds(L, 16, 0, 16, 55, 40, 0xffffff); // camar
  for (let i = 0; i < 14; i++) cloud(g, (rnd() - 0.5) * 220, 28 + rnd() * 25, rnd() * 180, 4 + rnd() * 4);
  return L;
}

// ============================================================ MAP 5: MUSPELHEIM
function muspel(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.sky = ['#1a0508', '#7a1c12', '#ff7a2e'];
  L.skyFx = { cloud: 0.9, cloudCol: 0x2a0d0c, stars: 0.35 };
  L.killY = -5; L.spawn = { y: 0, z: 2 };
  sea(L, -4.3, 0xff5a1f, 0xd63a00);
  const FIRE = 0xff7a1a, HOT = 0xffd9a0;
  L.addPlat(0, 0, 0, 16, 14, { theme: 'basalt', h: 5, rim: 0xff9d2e });
  // jalan semburan api
  L.addPlat(0, 0, 20, 10, 26, { theme: 'basalt', h: 5, rim: 0xff9d2e });
  [[-2.6, 10.5], [2.6, 10.5], [0, 15], [-2.6, 19.5], [2.6, 19.5], [0, 24], [-2.6, 28.5], [2.6, 28.5]]
    .forEach(([x, z], i) => lightning(L, x, 0, z, 2.3, 2.8, i * 0.62, FIRE, HOT));
  // batu tenggelam
  [36.5, 43, 49.5, 56].forEach((z, i) => mover(L, L.addPlat(0, -1.2, z, 5.5, 4, { theme: 'basalt', h: 3, rim: 0xff9d2e }), 0, 1.2, 1.1, i * 1.7));
  L.addPlat(0, 0, 62.5, 8, 5, { theme: 'basalt', h: 5, rim: 0xff9d2e });
  powerBox(L, 0, 0, 62.5, 'shield');
  // lereng batu api
  const ramp = L.addPlat(0, 0, 77, 14, 24, { rise: 6, h: 2, color: 0x4a3f46 });
  [-4.5, 0, 4.5].forEach((x, i) => boulder(L, ramp, x, 8 + i * 1.5, rnd() * 24, 1.2, 0x5a2a1c));
  L.addPlat(0, 6, 97, 14, 16, { theme: 'basalt', h: 4, rim: 0xff9d2e });
  pendulum(L, 0, 6, 93, 1.9, 0.5);
  arch(g, 101, 6, 5.8, 0xff9d2e, false);
  L.cps = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 32 }, { x: 0, y: 0, z: 62.5 }, { x: 0, y: 6, z: 90 }];
  L.wps = [{ x: 0, z: 6, w: 5 }, { x: 0, z: 32.5, w: 3.5 }, { x: 0, z: 36.5, w: 1 }, { x: 0, z: 43, w: 1 }, { x: 0, z: 49.5, w: 1 }, { x: 0, z: 56, w: 1 },
    { x: 0, z: 62.5, w: 2 }, { x: 0, z: 89.5, w: 5.5 }, { x: 0, z: 106, w: 4 }];
  L.finish = e => e.pos.z >= 101 && e.pos.y > 5.5;
  for (const [x, z, sc, tilt] of [[-22, 30, 1.6, 0.25], [24, 70, 2.0, -0.2], [-28, 100, 1.4, 0.15]]) { const sw = put(g, 'sword', x, -6, z, sc, sc, sc, undefined, 0.6); if (sw) sw.rotation.z = tilt; }
  // gunung berapi & batu membara
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1, x = side * (45 + rnd() * 70), z = -20 + rnd() * 170, hgt = 30 + rnd() * 40;
    mesh(new THREE.ConeGeometry(18 + rnd() * 14, hgt, 7), lam(0x2e2226, { flatShading: true }), x, -5 + hgt / 2, z, g);
    mesh(new THREE.ConeGeometry(4, 5, 7), lam(0xff7a1a, { emissive: 0xff4a00 }), x, -5 + hgt + 0.5, z, g);
  }
  for (let i = 0; i < 22; i++) mesh(new THREE.IcosahedronGeometry(1.5 + rnd() * 3, 0), lam(0x3a2c30, { flatShading: true, emissive: 0x3a0d00 }), (i % 2 ? 1 : -1) * (10 + rnd() * 40), -4, rnd() * 130 - 10, g);
  return L;
}

// ============================================================ MAP 6: RODA HADES
function hades(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.survival = true; L.killY = -10;
  L.sky = ['#07030f', '#2a1048', '#1f6e5a'];
  L.skyFx = { cloud: 0.7, cloudCol: 0x2fae86, stars: 0.8, aurora: 0.25 };
  sea(L, -9.2, 0x39d9a0, 0x0e7a55);
  L.addPlat(0, 0, 0, 22, 22, { theme: 'styx', h: 2.5, rim: 0x7de3b0, rimOpt: { emissive: 0x2a8f68 } });
  const dir = rnd() < 0.5 ? 1 : -1;
  spinner(L, 0, 0, 0, 14.5, 0.9 * dir, rnd() * 6, 0x9b5cff, 0.03, 9);
  // palang kedua mulai bergerak belakangan
  spinner(L, 0, 0.0, 0, 10, -0.01 * dir, 1.5, 0x39d9a0, 0.045, 9);
  L.tiles = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 5 : 8; L.tiles.push({ P: { x: Math.cos(a) * r, z: Math.sin(a) * r }, time: Infinity }); }
  for (const [x, z] of [[-12.5, -12.5], [12.5, -12.5], [-12.5, 12.5], [12.5, 12.5]]) {
    mesh(new THREE.CylinderGeometry(0.8, 1, 9, 10), lam(0x2d2250), x, 2, z, g);
    mesh(new THREE.ConeGeometry(0.7, 1.8, 8), lam(0x7dffc0, { emissive: 0x39d9a0 }), x, 7.6, z, g);
    glow(g, x, 7.8, z, 0x7dffc0, 6);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 19 + rnd() * 10, sc = 1.5 + rnd() * 2;
    const cr = put(g, 'crystal', Math.cos(a) * r, -9, Math.sin(a) * r, sc, sc * 1.6, sc, 0x4dffb0, a);
    if (cr) cr.traverse(n => { if (n.isMesh) { n.material.emissive = new THREE.Color(0x1a8f5c); n.material.flatShading = true; } });
  }
  L.seaFx = 'wisp';
  birds(L, 18, 0, 12, 0, 30, 0x1a1030, 0.8); // kelelawar
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.6; put(g, 'ruin', Math.cos(a) * 21, -9.2, Math.sin(a) * 21, 1.5, 1.5, 1.5, 0x3a2f5c, -a + Math.PI / 2); }
  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2, r = 30 + rnd() * 90, hgt = 10 + rnd() * 40;
    mesh(new THREE.ConeGeometry(3 + rnd() * 6, hgt, 5), lam(0x1d1433, { flatShading: true }), Math.cos(a) * r, -9 + hgt / 2, Math.sin(a) * r, g);
  }
  return L;
}

// ============================================================ MAP 7: TAMAN HESPERIDES (rebutan apel emas)
function garden(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.sky = ['#2f7fd8', '#a6dcff', '#fff0c9'];
  L.ringSpawn = true; L.killY = -10;
  L.cloudFloor = -26;
  L.addPlat(0, 0, 0, 36, 36, { theme: 'grass', rock: true, h: 1.6 });
  spinner(L, -9, 0, -7, 5, 1.9, rnd() * 6, 0xd0453a);
  spinner(L, 9, 0, 7, 5, -1.9, rnd() * 6, 0x3b6fe0);
  spinner(L, 9, 0, -9, 3.5, 2.6, rnd() * 6, 0xf2c14e);
  spinner(L, -9, 0, 9, 3.5, -2.6, rnd() * 6, 0xf2c14e);
  // pohon apel raksasa di tengah (hiasan)
  put(g, 'statue', -15.5, 0, -15.5, 0.8, 0.8, 0.8, undefined, 0.8); put(g, 'statue', 15.5, 0, 15.5, 0.8, 0.8, 0.8, undefined, -2.3);
  if (!put(g, 'tree', 0, 0, 0, 2.6, 2.6, 2.6)) mesh(new THREE.ConeGeometry(2.5, 9, 10), lam(0x3f9b4b), 0, 5, 0, g);
  const spots = [];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.3; spots.push({ x: Math.cos(a) * 6.5, y: 0, z: Math.sin(a) * 6.5 }); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; spots.push({ x: Math.cos(a) * 14, y: 0, z: Math.sin(a) * 14 }); }
  // jangan taruh apel di poros palang berputar
  for (const sp of spots) for (const [cx, cz] of [[-9, -7], [9, 7], [9, -9], [-9, 9]]) if (Math.hypot(sp.x - cx, sp.z - cz) < 2.2) { sp.x *= 1.22; sp.z *= 1.22; }
  L.collect = { need: 5, respawn: 6, spots, avail: spots.map(() => 0) };
  const appleMat = lam(0xffd23a, { emissive: 0xb07a00, shininess: 90 }), leafMat = lam(0x58b84f);
  const apples = spots.map(s => {
    const a = new THREE.Group();
    mesh(new THREE.SphereGeometry(0.42, 14, 12), appleMat, 0, 0, 0, a).scale.y = 0.92;
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 6), lam(0x7a5230), 0, 0.42, 0, a);
    mesh(new THREE.SphereGeometry(0.14, 8, 6), leafMat, 0.14, 0.5, 0, a).scale.set(1.4, 0.4, 0.8);
    glow(a, 0, 0, 0, 0xffd23a, 2.6);
    a.position.set(s.x, 1, s.z); a.userData.dyn = true;
    g.add(a);
    return a;
  });
  L.updaters.push(t => apples.forEach((a, k) => { a.visible = L.collect.avail[k] <= t; a.position.y = 1 + Math.sin(t * 3 + k) * 0.18; a.rotation.y = t * 2 + k; }));
  L.cps = [{ x: 0, y: 0, z: -3 }];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; decoIsland(g, Math.cos(a) * (30 + rnd() * 14), -5 + rnd() * 9, Math.sin(a) * (30 + rnd() * 14), 3 + rnd() * 3, rnd); }
  for (let i = 0; i < 20; i++) cloud(g, (rnd() - 0.5) * 180, -22 + rnd() * 12, (rnd() - 0.5) * 180, 3 + rnd() * 4);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.8; column(g, Math.cos(a) * 23.5, 0, Math.sin(a) * 23.5, 6); }
  birds(L, 12, 0, 22, 0, 38, 0xffffff);
  return L;
}

// ============================================================ MAP 8: YGGDRASIL (final)
function yggdrasil(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.sky = ['#0e5a6b', '#7fd6c2', '#f3ffd9'];
  L.skyFx = { cloud: 0.5, cloudCol: 0xf3ffe6 };
  L.spawn = { y: 0, z: 1 };
  const W = { theme: 'wood', rim: 0x58b84f };
  L.cloudFloor = -30;
  L.addPlat(0, 0, 0, 16, 12, { theme: 'grass', rock: true });
  // dahan zig-zag
  L.addPlat(-3, 0.8, 10.5, 6, 6, W);
  L.addPlat(3, 1.6, 18, 6, 6, W);
  L.addPlat(-3, 2.4, 25.5, 6, 6, W);
  pendulum(L, 3, 1.6, 18, 1.6, 0);
  // dahan besar + palang
  L.addPlat(0, 3, 35.5, 12, 12, W);
  spinner(L, 0, 3, 34, 5, 2.3, 0, 0x58b84f);
  pad(L, 0, 3, 39.6, 3.2, 20);
  // tajuk tengah
  L.addPlat(0, 8, 49.5, 12, 11, W);
  boost(L, 0, 8, 50, 4, 7);
  spinner(L, 0, 8, 48, 5, -2.6, 1, 0xffc36b);
  // daun melayang
  const leaf = { color: 0x58b84f, rim: 0x3f9b4b, h: 0.7 };
  mover(L, L.addPlat(0, 8.6, 58.5, 5, 4, leaf), 3, 0, 1.0, 0);
  L.addPlat(0, 9.2, 64.5, 5, 4, leaf);
  mover(L, L.addPlat(0, 9.8, 70.5, 5, 4, leaf), -3, 0, 1.0, 1.2);
  // puncak
  L.addPlat(0, 10.5, 79.5, 12, 10, { theme: 'grass', rock: true });
  lightning(L, -3, 10.5, 77, 2.2, 3, 0, 0x7dffb0, 0xe6fff0); lightning(L, 3, 10.5, 77, 2.2, 3, 1.5, 0x7dffb0, 0xe6fff0);
  const crown = new THREE.Group();
  crown.position.set(0, 11.9, 81);
  mesh(new THREE.TorusGeometry(0.8, 0.14, 8, 24), lam(GOLD, { emissive: 0xb07a00 }), 0, 0, 0, crown).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mesh(new THREE.ConeGeometry(0.14, 0.45, 5), lam(0x8ee06a, { emissive: 0x2a6a10 }), Math.cos(a) * 0.8, 0.25, Math.sin(a) * 0.8, crown); }
  glow(crown, 0, 0.1, 0, 0xffe07a, 5);
  g.add(crown); L.crown = crown; crown.userData.dyn = true;
  L.updaters.push(t => { crown.rotation.y = t * 2; if (!L.crownTaken) crown.position.y = 11.9 + Math.sin(t * 3) * 0.15; });
  L.cps = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 31.5 }, { x: 0, y: 8, z: 46 }];
  L.wps = [{ x: 0, z: 5, w: 5 }, { x: -3, z: 10.5, w: 1.5 }, { x: 3, z: 18, w: 1.5 }, { x: -3, z: 25.5, w: 1.5 }, { x: 0, z: 36, w: 3.5 }, { x: 0, z: 39.6, w: 2 },
    { x: 0, z: 53.5, w: 3.5 }, { x: 0, z: 58.5, w: 0.8 }, { x: 0, z: 64.5, w: 1 }, { x: 0, z: 70.5, w: 0.8 }, { x: 0, z: 81, w: 0 }];
  L.finish = e => Math.hypot(e.pos.x, e.pos.y + 0.8 - 11.9, e.pos.z - 81) < 2;
  // batang pohon raksasa & tajuk
  mesh(new THREE.CylinderGeometry(9, 13, 90, 14), lam(0x7a4e26, { flatShading: true }), -26, -10, 45, g);
  mesh(new THREE.CylinderGeometry(7, 10, 80, 12), lam(0x6d4420, { flatShading: true }), 28, -14, 70, g);
  for (let i = 0; i < 14; i++) { const s = 7 + rnd() * 7; if (!put(g, 'cloud', (rnd() - 0.5) * 110, 24 + rnd() * 16, 10 + rnd() * 90, s, s * 0.9, s, [0x3f9b4b, 0x58b84f, 0x2f8040][i % 3], rnd() * 6)) break; }
  for (let i = 0; i < 10; i++) decoIsland(g, (i % 2 ? 1 : -1) * (13 + rnd() * 18), -3 + i * 1.3 + rnd() * 4, -4 + i * 9 + rnd() * 6, 2.5 + rnd() * 2.5, rnd);
  for (let i = 0; i < 16; i++) cloud(g, (rnd() - 0.5) * 170, -24 + rnd() * 12, -20 + rnd() * 140, 3 + rnd() * 4);
  birds(L, 14, 0, 30, 45, 40, 0xfff2a8, 0.7);
  return L;
}

// ============================================================ MAP 9: JOTUNHEIM (balapan es)
function jotunheim(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.sky = ['#1d3f8a', '#8fc4f2', '#f4fbff'];
  L.skyFx = { cloud: 0.35, aurora: 0.8, stars: 0.5 };
  L.ice = true; L.killY = -5; L.spawn = { y: 0, z: 2 };
  sea(L, -4.2, 0x6fbde8, 0x1d4f7a);
  const I = { theme: 'ice', rim: 0xffffff };
  L.addPlat(0, 0, 0, 16, 14, Object.assign({ h: 5 }, I));
  // lapangan es + bola salju
  const lane = L.addPlat(0, 0, 22, 13, 30, Object.assign({ h: 5 }, I));
  wave(L, lane, 6.5, 0, 0xffffff); wave(L, lane, 6.5, 15, 0xffffff);
  lightning(L, -3.5, 0, 16, 2.2, 3.2, 0, 0x9fe3ff, 0xffffff); lightning(L, 3.5, 0, 24, 2.2, 3.2, 1.1, 0x9fe3ff, 0xffffff); lightning(L, -2, 0, 31, 2.2, 3.2, 2.2, 0x9fe3ff, 0xffffff);
  // bongkahan es hanyut
  L.addPlat(0, 0, 41.5, 6, 4.5, Object.assign({ h: 3 }, I));
  mover(L, L.addPlat(0, 0, 48.5, 6, 4.5, Object.assign({ h: 3 }, I)), 3, 0, 0.8, 0);
  mover(L, L.addPlat(0, 0, 55.5, 6, 4.5, Object.assign({ h: 3 }, I)), -3, 0, 0.8, 0.8);
  L.addPlat(0, 0, 63, 9, 6, Object.assign({ h: 5 }, I));
  powerBox(L, 0, 0, 63, 'shield');
  // jembatan es + jalur percepatan
  L.addPlat(0, 0, 80, 6.5, 28, Object.assign({ h: 1 }, I));
  boost(L, 0, 0, 70, 3, 5);
  spinner(L, 0, 0, 77, 3.1, 2.2, 0, 0x4dc3ff);
  pendulum(L, 0, 0, 86, 1.6, 1);
  L.addPlat(0, 0, 102, 16, 16, Object.assign({ h: 5 }, I));
  arch(g, 105, 0, 6.5, 0x9fd8ff, false);
  L.cps = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 35.5 }, { x: 0, y: 0, z: 63 }, { x: 0, y: 0, z: 95.5 }];
  L.wps = [{ x: 0, z: 6, w: 5 }, { x: 0, z: 36, w: 4.5 }, { x: 0, z: 41.5, w: 1.2 }, { x: 0, z: 48.5, w: 0.8 }, { x: 0, z: 55.5, w: 0.8 }, { x: 0, z: 63, w: 2 }, { x: 0, z: 93, w: 1.6 }, { x: 0, z: 110, w: 4 }];
  L.finish = e => e.pos.z >= 105 && e.pos.y > -0.5;
  for (let i = 0; i < 22; i++) {
    const side = i % 2 ? 1 : -1, x = side * (14 + rnd() * 70), z = -20 + rnd() * 150, sc = 2 + rnd() * 4;
    const cr = put(g, 'crystal', x, -4.5, z, sc, sc * 1.4, sc, [0xdff4ff, 0x9fd8ff, 0xffffff][i % 3], rnd() * 6);
    if (cr) cr.traverse(n => { if (n.isMesh) n.material.flatShading = true; }); else mesh(new THREE.ConeGeometry(2 + rnd() * 3, 8, 5), lam(0xdff4ff, { flatShading: true }), x, 0, z, g);
  }
  put(g, 'icecastle', 0, -4, 150, 3.2, 3.2, 3.2); put(g, 'icecastle', -42, -4, 70, 1.6, 1.6, 1.6, undefined, 1); put(g, 'icecastle', 44, -4, 30, 1.4, 1.4, 1.4, undefined, 2);
  for (let i = 0; i < 7; i++) mesh(new THREE.ConeGeometry(26 + rnd() * 18, 60 + rnd() * 40, 6), lam(0xeaf6ff, { flatShading: true }), (i % 2 ? 1 : -1) * (80 + rnd() * 50), 20, rnd() * 170, g);
  for (let i = 0; i < 12; i++) cloud(g, (rnd() - 0.5) * 220, 30 + rnd() * 25, rnd() * 180, 4 + rnd() * 4);
  return L;
}

// pulau lobby: tempat pemain bermain-main sambil menunggu game dimulai
export function buildPlaza() {
  const L = new Level(), g = L.group, rnd = rng(42);
  CUR = L;
  L.sky = ['#3a7bd5', '#9fd3ff', '#ffe9c9'];
  L.ringSpawn = true; L.killY = -10;
  L.cloudFloor = -26;
  CUR = L;
  L.addPlat(0, 0, 0, 30, 30, { theme: 'grass', rock: true, h: 1.6 });
  L.addPlat(0, 0.9, -9, 8, 6, { theme: 'marble', h: 0.9 });
  pad(L, 9, 0, 0, 1.6, 15);
  boost(L, -9, 0, 0, 3, 10);
  spinner(L, 0, 0, 8, 4, 1.4, 0, 0xd0453a);
  for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) column(g, x, 0, z, 6);
  for (const [x, z, s] of [[-13, -4, 1.3], [13, 5, 1.5], [6, -13, 1.2], [-6, 13, 1.4], [13, -8, 1.1]]) put(g, 'tree', x, 0, z, s, s, s, undefined, x);
  put(g, 'temple', 0, 0.9, -12.5, 0.55, 0.55, 0.55, undefined, Math.PI / 2 * 0);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.4; decoIsland(g, Math.cos(a) * (28 + rnd() * 12), -6 + rnd() * 10, Math.sin(a) * (28 + rnd() * 12), 3 + rnd() * 3, rnd); }
  for (let i = 0; i < 4; i++) tower(g, (i % 2 ? 1 : -1) * (55 + rnd() * 30), -25 + rnd() * 20, -40 + i * 30, 1.2 + rnd());
  for (let i = 0; i < 18; i++) cloud(g, (rnd() - 0.5) * 170, -22 + rnd() * 12, (rnd() - 0.5) * 170, 3 + rnd() * 4);
  birds(L, 12, 0, 22, 0, 36, 0xffffff);
  L.cps = [{ x: 0, y: 0, z: 3 }];
  L.info = { name: 'Lobby', sub: '', type: 'lobby', goal: '' };
  animateEnv(L);
  L.update(0);
  return L;
}

// awan & pulau hias melayang pelan, pendar berdenyut
function animateEnv(L) {
  L.updaters.push(t => {
    ENV_T.value = t;
    for (const f of L.floaters) { f.o.position.y = f.y + Math.sin(t * 0.55 + f.ph) * f.amp; if (f.drift) f.o.position.x = f.x + Math.sin(t * 0.07 + f.ph) * f.drift; }
    for (let i = 0; i < L.glows.length; i++) { const s = L.glows[i], k = s.userData.size * (1 + Math.sin(t * 2.4 + i * 1.7) * 0.12); s.scale.set(k, k, 1); }
  });
}

// ============================================================ MAP 10: TIDAL RISE (bertahan, air naik)
function rising(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.survival = true; L.climb = true; L.sky = ['#1f8fd6', '#7fe0e8', '#d9fff5'];
  const Y0 = -5.2, RATE = 0.3, T0 = 4;
  sea(L, Y0, 0x1fa3c9, 0x0a4a66);
  L.killY = Y0 - 0.6;
  L.tiles = [];
  const tile = P => { L.tiles.push({ P, time: T0 + (P.y - Y0 - 0.3) / RATE }); return P; };
  tile(L.addPlat(0, 0, 0, 14, 14, { theme: 'sand', h: 6 }));
  const dir = rnd() < 0.5 ? 1 : -1;
  for (let i = 0; i < 14; i++) {
    const a = dir * i * 0.6 + 0.4;
    tile(L.addPlat(Math.cos(a) * 11, 0.9 * (i + 1), Math.sin(a) * 11, 5, 5, { theme: i % 2 ? 'coral' : 'sand', h: 1.2 }));
  }
  tile(L.addPlat(0, 13.5, 0, 12, 12, { theme: 'coral', h: 1.4 }));
  spinner(L, 0, 13.5, 0, 3.6, 2.2 * dir, rnd() * 6, 0x9b5cff);
  // tiang tengah (hiasan) menopang puncak
  mesh(new THREE.CylinderGeometry(1.6, 2.4, 14, 12), lam(0xffb3a0), 0, 5.4, 0, g);
  L.updaters.push(t => {
    const lvl = Y0 + Math.max(0, t - T0) * RATE;
    L.seaY = lvl; L.killY = lvl - 0.6;
    for (const sm of L.seaMeshes) sm.position.y = lvl;
  });
  put(g, 'lighthouse', -30, -5, 24, 1.6, 1.6, 1.6); put(g, 'lighthouse', 32, -5, -26, 1.3, 1.3, 1.3);
  birds(L, 16, 0, 24, 0, 34, 0xffffff);
  for (let i = 0; i < 22; i++) { const a = rnd() * 6.28, r = 22 + rnd() * 60, sc = 1.6 + rnd() * 2.6; put(g, 'coral', Math.cos(a) * r, -5.6, Math.sin(a) * r, sc, sc, sc, [0xff8a7a, 0xffc36b, 0x9b7bff, 0x53d6b6][i % 4], rnd() * 6); }
  for (let i = 0; i < 14; i++) cloud(g, (rnd() - 0.5) * 200, 30 + rnd() * 22, (rnd() - 0.5) * 200, 4 + rnd() * 4);
  return L;
}

// ============================================================ MAP 11: VALKYRIE SKYWAY (balapan senja)
function skyway(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.sky = ['#2b2a6b', '#e58a9a', '#ffd9a8'];
  L.skyFx = { cloud: 0.75, cloudCol: 0xffc9b0, stars: 0.45 };
  L.cloudFloor = -30;
  L.spawn = { y: 0, z: 2 };
  L.addPlat(0, 0, 0, 16, 14, { theme: 'grass', rock: true });
  // ladang bumper
  L.addPlat(0, 0, 22, 12, 30, { rock: true });
  [[-3, 12], [3, 12], [0, 17], [-3.5, 22], [3.5, 22], [0, 27], [-2.5, 32], [2.5, 32]].forEach(([x, z], i) => bumper(L, x, 0, z, 0.9, 6, [0xff5fa2, 0x4dc3ff, 0xffc36b][i % 3]));
  // jembatan angin
  L.addPlat(0, 0, 52, 7.5, 26, { theme: 'wood', rim: GOLD, h: 0.8 });
  fan(L, 0, 0, 45.5, 7.5, 7, 1, 4.6, 3.2, 0);
  fan(L, 0, 0, 58.5, 7.5, 7, -1, 4.6, 3.2, 1.6);
  L.addPlat(0, 0, 70, 9, 6, { theme: 'grass', rock: true });
  pad(L, 0, 0, 71.6, 3.2, 20);
  // teras atas: palang + jalur percepatan
  L.addPlat(0, 5, 81.5, 12, 11, { rock: true });
  spinner(L, 0, 5, 80, 5, 2.4, 0, 0x9b5cff);
  boost(L, 0, 5, 82.5, 4, 7);
  // awan melayang
  const cl = { color: 0xffffff, rim: 0xffc9b0, h: 0.8 };
  mover(L, L.addPlat(0, 5.6, 90.5, 5, 4, cl), 3, 0, 1.0, 0);
  L.addPlat(0, 6.2, 96.5, 5, 4, cl);
  mover(L, L.addPlat(0, 6.8, 102.5, 5, 4, cl), -3, 0, 1.0, 1.2);
  L.addPlat(0, 7.5, 111.5, 14, 12, { rock: true });
  bumper(L, -3.2, 7.5, 109, 0.9, 7, 0xffc36b); bumper(L, 3.2, 7.5, 109, 0.9, 7, 0xffc36b);
  powerBox(L, 0, 0, 38.5, 'shield');
  arch(g, 114, 7.5, 5.8, GOLD, true);
  L.cps = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 35 }, { x: 0, y: 0, z: 70 }, { x: 0, y: 5, z: 78 }];
  L.wps = [{ x: 0, z: 6, w: 5 }, { x: 0, z: 36, w: 4 }, { x: 0, z: 41, w: 1.5 }, { x: 0, z: 46, w: 1 }, { x: 0, z: 52, w: 1 }, { x: 0, z: 58, w: 1 }, { x: 0, z: 64, w: 1.2 },
    { x: 0, z: 69.5, w: 2 }, { x: 0, z: 71.6, w: 2 }, { x: 0, z: 85.5, w: 3.5 }, { x: 0, z: 90.5, w: 0.8 }, { x: 0, z: 96.5, w: 1 }, { x: 0, z: 102.5, w: 0.8 }, { x: 0, z: 119, w: 4 }];
  L.finish = e => e.pos.z >= 114 && e.pos.y > 7;
  for (let i = 0; i < 12; i++) tower(g, (i % 2 ? 1 : -1) * (50 + rnd() * 70), -30 + rnd() * 30, -10 + rnd() * 180, 1 + rnd() * 1.6);
  if (!put(g, 'palace', 0, 2, 172, 2.4, 2.4, 2.4)) tower(g, 0, -4, 160, 4);
  for (let i = 0; i < 11; i++) decoIsland(g, (i % 2 ? 1 : -1) * (15 + rnd() * 26), -6 + i * 0.8 + rnd() * 8, -5 + i * 12 + rnd() * 8, 3 + rnd() * 3, rnd);
  for (let i = 0; i < 22; i++) cloud(g, (rnd() - 0.5) * 170, -20 + rnd() * 16, -20 + rnd() * 180, 3 + rnd() * 4, 0xffe1d0);
  birds(L, 14, 0, 26, 70, 44, 0x3a2a5a, 0.9);
  return L;
}

// ============================================================ MAP 12: STORM SUMMIT (final, badai)
function summit(seed) {
  const L = new Level(), g = L.group, rnd = rng(seed);
  CUR = L;
  L.sky = ['#141a3a', '#4a5a9a', '#b9c9ee'];
  L.skyFx = { cloud: 0.95, cloudCol: 0x4a5378, stars: 0.15 };
  L.fog = [110, 420];
  L.cloudFloor = -28;
  L.spawn = { y: 0, z: 1 };
  const S = { theme: 'ice', rim: 0xc9d2e0 };
  L.addPlat(0, 0, 0, 16, 12, { theme: 'storm', rock: true, rim: 0xc9d2e0 });
  // dataran petir
  L.addPlat(0, 0, 20, 14, 26, { theme: 'storm', rim: 0xc9d2e0, h: 2 });
  [[-3.5, 11], [3.5, 11], [0, 15], [-4, 20], [4, 20], [0, 24], [-3, 29], [3, 29]].forEach(([x, z], i) => lightning(L, x, 0, z, 2.5, 3.2, i * 0.55, 0x9fd8ff, 0xffffff));
  powerBox(L, 0, 0, 19.5, 'shield');
  // lantai kedip menanjak
  // gelombang nyala bergerak maju: pijakan berikutnya menyala sedetik setelah yang sebelumnya
  [37.5, 43.5, 49.5, 55.5].forEach((z, i) => blinker(L, L.addPlat(0, 0.6 * (i + 1), z, 6, 5, Object.assign({ h: 0.8 }, S)), 4.6, -i * 1.0, 0.66));
  L.addPlat(0, 3, 62.5, 10, 7, { theme: 'storm', rock: true, rim: 0xc9d2e0 });
  // lereng batu
  const ramp = L.addPlat(0, 3, 76, 9, 18, { rise: 4, h: 2, color: 0x4a4f63 });
  [-2.5, 2.5].forEach((x, i) => boulder(L, ramp, x, 7.5 + i * 1.5, rnd() * 18, 1.1, 0x7a8196));
  // teras badai: palang, bumper, kotak kekuatan
  L.addPlat(0, 7, 91, 12, 10, { theme: 'storm', rock: true, rim: 0xc9d2e0 });
  spinner(L, 0, 7, 91, 5, 2.5, 0, 0x4dc3ff);
  bumper(L, -4.2, 7, 94.5, 0.8, 6, 0x9fd8ff); bumper(L, 4.2, 7, 94.5, 0.8, 6, 0x9fd8ff);
  powerBox(L, 0, 7, 87.5, 'speed');
  const cl = { color: 0xdfe6f5, rim: 0x9fb0d8, h: 0.8 };
  mover(L, L.addPlat(0, 7.6, 99.5, 5, 5, cl), 3, 0, 1.0, 0);
  mover(L, L.addPlat(0, 8.2, 105.5, 5, 5, cl), -3, 0, 1.0, 1.2);
  L.addPlat(0, 9, 114, 12, 10, { theme: 'storm', rock: true, rim: GOLD });
  const crown = new THREE.Group();
  crown.position.set(0, 10.4, 115.5);
  mesh(new THREE.TorusGeometry(0.8, 0.14, 8, 24), lam(GOLD, { emissive: 0xb07a00 }), 0, 0, 0, crown).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mesh(new THREE.ConeGeometry(0.14, 0.45, 5), lam(0x9fd8ff, { emissive: 0x1a5a8a }), Math.cos(a) * 0.8, 0.25, Math.sin(a) * 0.8, crown); }
  glow(crown, 0, 0.1, 0, 0xffe07a, 5);
  g.add(crown); L.crown = crown; crown.userData.dyn = true;
  L.updaters.push(t => { crown.rotation.y = t * 2; if (!L.crownTaken) crown.position.y = 10.4 + Math.sin(t * 3) * 0.15; });
  for (const sd of [-1, 1]) column(g, sd * 5, 9, 117.5, 6);
  L.cps = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 31 }, { x: 0, y: 3, z: 62.5 }, { x: 0, y: 7, z: 88 }];
  L.wps = [{ x: 0, z: 6, w: 6 }, { x: 0, z: 32, w: 5 }, { x: 0, z: 37.5, w: 1.5 }, { x: 0, z: 43.5, w: 1.5 }, { x: 0, z: 49.5, w: 1.5 }, { x: 0, z: 55.5, w: 1.5 },
    { x: 0, z: 62.5, w: 3 }, { x: 0, z: 84.5, w: 3 }, { x: 0, z: 95, w: 2.5 }, { x: 0, z: 99.5, w: 0.8 }, { x: 0, z: 105.5, w: 0.8 }, { x: 0, z: 115.5, w: 0 }];
  L.finish = e => Math.hypot(e.pos.x, e.pos.y + 0.8 - 10.4, e.pos.z - 115.5) < 2;
  // puncak-puncak gunung badai & awan gelap
  for (let i = 0; i < 9; i++) mesh(new THREE.ConeGeometry(22 + rnd() * 18, 70 + rnd() * 50, 6), lam(0x3a4160, { flatShading: true }), (i % 2 ? 1 : -1) * (55 + rnd() * 60), -25, rnd() * 190 - 10, g);
  mesh(new THREE.ConeGeometry(40, 120, 7), lam(0x333a58, { flatShading: true }), 0, -62, 150, g);
  for (let i = 0; i < 9; i++) decoIsland(g, (i % 2 ? 1 : -1) * (14 + rnd() * 20), -6 + i * 1.2 + rnd() * 5, -4 + i * 13 + rnd() * 6, 2.5 + rnd() * 2.5, rnd, { top: 0x7a8196, rock: 0x4a4f63, item: 'crystal', itemColor: 0x9fd8ff, scale: 0.6 });
  for (let i = 0; i < 24; i++) cloud(g, (rnd() - 0.5) * 180, 22 + rnd() * 20, -20 + rnd() * 190, 5 + rnd() * 5, 0x5a6388);
  return L;
}

const BUILDERS = [asgard, galaxy, olympus, tidal, muspel, hades, garden, yggdrasil, jotunheim, rising, skyway, summit];
export function buildLevel(idx, seed) {
  const L = BUILDERS[idx % BUILDERS.length](seed || 1);
  animateEnv(L);
  L.info = LEVELS[idx % LEVELS.length];
  // bendera di tiap checkpoint
  if (!L.survival && !L.collect) L.cps.slice(1).forEach(cp => {
    const P = L.plats.find(p => !p.rise && Math.abs(cp.x - p.x0) <= p.w / 2 && Math.abs(cp.z - p.z0) <= p.d / 2 && Math.abs(cp.y - p.y0) < 0.5);
    if (!P) return;
    for (const s of [-1, 1]) {
      const x = P.x0 + s * (P.w / 2 - 0.35);
      const fl = put(L.group, 'flag', x, cp.y, cp.z, 1, 1, 1, undefined, s > 0 ? Math.PI : 0);
      if (fl) { fl.userData.dyn = true; L.updaters.push(t => { fl.rotation.y = (s > 0 ? Math.PI : 0) + Math.sin(t * 2.2 + x) * 0.22; }); continue; }
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), lam(GOLD), x, cp.y + 1.6, cp.z, L.group);
      const f = mesh(new THREE.ConeGeometry(0.5, 1.1, 3), lam(0xff4d6d, { emissive: 0x7a1030 }), x - s * 0.55, cp.y + 2.75, cp.z, L.group);
      f.rotation.z = s * Math.PI / 2; f.scale.z = 0.15;
    }
  });
  L.update(-10);
  return L;
}

// ============================================================ penggabungan benda diam
// Semua benda yang tidak bergerak digabung per bahan (warna dipanggang ke vertex color, ubin ke UV),
// supaya satu map digambar dengan puluhan draw call saja, bukan ratusan. Awan dan pulau hias
// dikelompokkan lalu tiap kelompok melayang bersama.
export function optimizeLevel(L) {
  const root = L.group, t0 = L.info && L.info.type === 'lobby' ? 0 : -10;
  // jaring pengaman: apa pun yang berpindah di antara dua waktu dianggap bergerak
  const snap = new Map(), moved = new Set();
  L.update(-7.3); root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh) snap.set(o, o.matrixWorld.elements.slice()); });
  L.update(-4.1); root.updateMatrixWorld(true);
  for (const [o, a] of snap) { const b = o.matrixWorld.elements; for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-5) { moved.add(o); break; } }
  for (const m of L.seaMeshes || []) m.userData.dyn = true;
  // awan & pulau hias: beberapa kelompok yang melayang bersama
  const fl = L.floaters, froots = new Set(), fg = {};
  L.floaters = [];
  fl.forEach((f, i) => {
    f.o.position.y = f.y; f.o.position.x = f.x;
    if (f.o.parent !== root) { L.floaters.push(f); return; }
    const k = (f.drift ? 'c' : 'i') + (i % 3);
    if (!fg[k]) { fg[k] = new THREE.Group(); root.add(fg[k]); froots.add(fg[k]); L.floaters.push({ o: fg[k], y: 0, x: 0, amp: f.amp, drift: f.drift, ph: i * 1.9 }); }
    fg[k].add(f.o);
  });
  root.updateMatrixWorld(true);
  const buckets = new Map(), mats = new Map(), inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), used = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry.attributes.normal) return;
    let base = root, dyn = false;
    for (let p = o; p && p !== root; p = p.parent) { if (!p.visible || p.userData.dyn) dyn = true; if (froots.has(p)) base = p; }
    if (dyn || (base === root && moved.has(o))) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    if (list.some(m => !m || m.transparent || m.isMeshBasicMaterial || m.userData.noMerge || !m.color)) return;
    rel.multiplyMatrices(inv.copy(base.matrixWorld).invert(), o.matrixWorld);
    const chunk = base === root ? Math.floor(o.matrixWorld.elements[14] / 48) : 0;
    const groups = Array.isArray(o.material) ? o.geometry.groups : [null];
    for (const grp of groups) {
      const m = grp ? list[grp.materialIndex] : list[0];
      if (!m) continue;
      const sig = matSig(m), key = base.id + '|' + chunk + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + sig;
      if (!mats.has(sig)) mats.set(sig, canonMat(m));
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { base, sig, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
      b.geos.push(bakeGeo(o.geometry, grp, rel, m));
    }
    used.push(o);
  });
  for (const b of buckets.values()) {
    const geo = b.geos.length > 1 ? mergeGeometries(b.geos, false) : b.geos[0];
    if (!geo) continue;
    const m = new THREE.Mesh(geo, mats.get(b.sig));
    m.castShadow = b.cast; m.receiveShadow = b.recv; m.userData.dyn = true;
    b.base.add(m);
  }
  // benda asli disembunyikan dari kamera (anak-anaknya, mis. rumput dan pendar, tetap tampil)
  for (const o of used) { if (o.children.length) o.layers.set(5); else o.removeFromParent(); }
  L.update(t0);
  return buckets.size;
}

// Asgardian - klien: render, input, jaringan, UI
import * as THREE from '/vendor/three.module.js';
import { GODS, SKINS, makeGod, animateGod, godColor, loadGodAssets } from './gods.js';
import { LEVELS, buildLevel, buildPlaza } from './levels.js';
import { loadProps, prop } from './props.js';
import { newEnt, stepEnt, postStep, spawnAt, separate, lerpAngle, ABILITIES, AB_CD, castSelf, applyArea, touchApple, diveBump } from './sim.js';

const $ = id => document.getElementById(id);
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// mode tes (server dijalankan dengan DEBUG=1): ?auto=1&shot=4&level=0&tp=z,y
const QS = new URLSearchParams(location.search);
function report(msg) { if (QS.has('shot')) fetch('/debug/log', { method: 'POST', body: String(msg) }).catch(() => {}); }
window.addEventListener('error', e => report('ERR ' + e.message + ' @' + e.filename + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => report('REJ ' + ((e.reason && e.reason.stack) || e.reason)));

// ------------------------------------------------------------ renderer
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
let baseFov = 60;
const hemi = new THREE.HemisphereLight(0xffffff, 0x9a8fc0, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4dc, 2.3);
sun.position.set(30, 60, -25);
scene.add(sun, sun.target);
// bayangan asli; otomatis dimatikan kalau perangkat keberatan (lihat tuneQuality)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 170 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
const SUN_OFF = new THREE.Vector3(-28, 52, 16);
const quality = { acc: 0, n: 0, level: 3, mode: 'auto' };
const BASE_DPR = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(BASE_DPR);
renderer.shadowMap.autoUpdate = false; // bayangan diperbarui tiap 2 frame (lihat frame())
// level: 3 = bayangan + resolusi penuh, 2 = bayangan + resolusi 1x, 1 = tanpa bayangan, 0 = tanpa bayangan + resolusi rendah
function applyQuality(level) {
  quality.level = level;
  sun.castShadow = level >= 2;
  renderer.setPixelRatio([0.75, 1, 1, BASE_DPR][level] ?? BASE_DPR);
  resize();
}
function tuneQuality(dt) {
  if (quality.mode !== 'auto') return;
  quality.acc += dt; quality.n++;
  if (quality.n < 120) return;
  const avg = quality.acc / quality.n;
  quality.acc = 0; quality.n = 0;
  // di bawah ~42 fps turunkan satu tingkat; ke tingkat terendah (resolusi buram) hanya kalau di bawah 30 fps
  if (quality.level > 0 && avg > (quality.level === 1 ? 1 / 30 : 1 / 42)) {
    applyQuality(quality.level - 1);
    report('quality -> ' + quality.level + ' (avg ms ' + (avg * 1000).toFixed(1) + ')');
  }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 75 : 60;
  baseFov = camera.fov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
dome.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(dome.geometry.attributes.position.count * 3), 3));
dome.renderOrder = -10; dome.frustumCulled = false;
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,250,225,0.95)'); g.addColorStop(0.3, 'rgba(255,235,170,0.35)'); g.addColorStop(1, 'rgba(255,220,150,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})(), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
sunSprite.scale.set(190, 190, 1); sunSprite.renderOrder = -9;
scene.add(dome, sunSprite);
const SUN_DIR = new THREE.Vector3(-0.45, 0.4, 0.8).normalize();
function setSky(cols, fog) {
  // kubah langit 3D (ikut kamera) + matahari berpendar
  const top = new THREE.Color(cols[0]), mid = new THREE.Color(cols[1]), bot = new THREE.Color(cols[2]), tmp = new THREE.Color();
  const pos = dome.geometry.attributes.position, col = dome.geometry.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 500;
    if (h > 0.05) tmp.copy(mid).lerp(top, Math.min(1, (h - 0.05) / 0.45)); else tmp.copy(bot).lerp(mid, Math.max(0, (h + 0.07) / 0.12));
    col.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  col.needsUpdate = true;
  scene.background = bot;
  const dark = top.r + top.g + top.b < 0.5;
  sunSprite.visible = !dark;
  sunSprite.material.color.copy(mid).lerp(new THREE.Color(0xffffff), 0.6);
  const f = fog || [150, 560];
  scene.fog = new THREE.Fog(cols[2], f[0], f[1]);
}

function disposeTree(o) {
  o.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) for (const m of [].concat(n.material)) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}

// ------------------------------------------------------------ audio
let actx = null, master = null, muted = false;
try { muted = localStorage.getItem('asg_mute') === '1'; } catch { /* */ }
function initAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    actx.resume();
    if (!master) { master = actx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(actx.destination); }
  } catch { /* tanpa suara */ }
}
function setMuted(m) {
  muted = m;
  try { localStorage.setItem('asg_mute', m ? '1' : '0'); } catch { /* */ }
  if (master) master.gain.value = m ? 0 : 1;
  $('muteBtn').textContent = m ? '🔇' : '🔊';
}
function beep(freq, dur = 0.12, type = 'square', vol = 0.06, slide = 0) {
  if (!actx || !master) return;
  try {
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur);
  } catch { /* abaikan */ }
}
// musik latar prosedural: arpeggio pentatonik + bas, berbeda tiap map
const music = {
  step: 0, timer: 0, root: 220, scale: [0, 3, 5, 7, 10], pat: [0, 2, 4, 2, 3, 1, 4, 2],
  setMood(lv) {
    const moods = [[220, [0, 2, 4, 7, 9]], [174.6, [0, 3, 5, 7, 10]], [246.9, [0, 2, 4, 7, 9]], [196, [0, 2, 5, 7, 9]], [164.8, [0, 3, 5, 6, 10]], [155.6, [0, 3, 5, 7, 8]], [261.6, [0, 2, 4, 7, 9]]];
    const m = moods[(lv + 1) % moods.length] || moods[0];
    this.root = m[0]; this.scale = m[1];
    this.pat = Array.from({ length: 8 }, (_, i) => (i * (3 + (lv % 3)) + (lv * 2)) % 5);
  },
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!actx || muted || document.hidden) return;
      const s = this.step++, n = f => this.root * Math.pow(2, f / 12);
      const deg = this.pat[s % 8], oct = (s % 16) >= 8 ? 12 : 0;
      beep(n(this.scale[deg] + oct), 0.16, 'triangle', 0.028);
      if (s % 4 === 0) beep(n(this.scale[[0, 0, 3, 2][(s >> 2) % 4]] - 12), 0.34, 'sine', 0.05);
      if (s % 8 === 4) beep(n(this.scale[2] + 12), 0.1, 'sine', 0.015);
      if (s % 8 === 0) beep(110, 0.13, 'sine', 0.07, -65);                 // kick
      if (s % 2 === 1) noise(0.03, 0.012, 'highpass', 6000);              // hi-hat
      if (s % 8 === 4) noise(0.08, 0.025, 'bandpass', 1800);              // snare
      if (s % 16 === 0) { beep(n(this.scale[0]), 1.1, 'sine', 0.014); beep(n(this.scale[2]), 1.1, 'sine', 0.012); } // pad
    }, 150);
  },
};
// derau tersaring: desir, gedebuk, cipratan, sorakan
let noiseBuf = null;
function noise(dur = 0.2, vol = 0.06, type = 'lowpass', f0 = 800, f1 = 0) {
  if (!actx || !master) return;
  try {
    if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(), t = actx.currentTime;
    src.buffer = noiseBuf; src.loop = true; f.type = type; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur);
  } catch { /* abaikan */ }
}
// suara suasana: derau tersaring yang berulang pelan (angin, ombak, gemuruh lava, gua)
let ambNode = null;
function ambience(kind) {
  if (!actx || !master) return;
  try {
    if (ambNode) { ambNode.g.gain.linearRampToValueAtTime(0.0001, actx.currentTime + 0.5); const old = ambNode; setTimeout(() => { try { old.src.stop(); old.lfo.stop(); } catch { /* */ } }, 700); ambNode = null; }
    const cfg = { wind: ['bandpass', 420, 0.03, 0.13], sea: ['lowpass', 650, 0.045, 0.22], lava: ['lowpass', 130, 0.09, 0.4], cave: ['bandpass', 240, 0.035, 0.09], space: ['bandpass', 900, 0.012, 0.05] }[kind];
    if (!cfg) return;
    if (!noiseBuf) noise(0.01, 0.0001);
    const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(), lfo = actx.createOscillator(), lg = actx.createGain();
    src.buffer = noiseBuf; src.loop = true; f.type = cfg[0]; f.frequency.value = cfg[1]; g.gain.value = cfg[2];
    lfo.frequency.value = cfg[3]; lg.gain.value = cfg[2] * 0.6; lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(master); src.start(); lfo.start();
    ambNode = { src, g, lfo };
  } catch { /* abaikan */ }
}
const AMB_SOUND = { 0: 'wind', 1: 'space', 2: 'wind', 3: 'sea', 4: 'lava', 5: 'cave', 6: 'wind', 7: 'wind', 8: 'wind', 9: 'sea', plaza: 'wind' };
const SFX = {
  jump: () => { beep(420, 0.14, 'triangle', 0.06, 300); noise(0.1, 0.03, 'highpass', 1200); },
  dive: () => { noise(0.28, 0.07, 'bandpass', 500, 1800); beep(300, 0.18, 'sawtooth', 0.03, -150); },
  hit: () => { beep(160, 0.25, 'sawtooth', 0.08, -100); noise(0.18, 0.09, 'lowpass', 900, 150); },
  land: () => noise(0.09, 0.07, 'lowpass', 260, 90),
  step: () => noise(0.035, 0.016, 'highpass', 2200),
  splash: () => noise(0.4, 0.09, 'bandpass', 1800, 350),
  cheer: () => noise(0.9, 0.05, 'bandpass', 1100, 900),
  respawn: () => beep(600, 0.2, 'sine', 0.06, -300),
  tick: () => beep(520, 0.12, 'square', 0.07),
  go: () => beep(880, 0.4, 'square', 0.08),
  win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'triangle', 0.1), i * 130)); noise(0.9, 0.05, 'bandpass', 1100, 900); },
  lose: () => [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'triangle', 0.09), i * 180)),
};

// ------------------------------------------------------------ partikel
function softTex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  draw(c.getContext('2d'));
  return new THREE.CanvasTexture(c);
}
const dotTex = softTex(x => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
const sqTex = softTex(x => { x.fillStyle = '#fff'; x.beginPath(); x.roundRect ? x.roundRect(10, 16, 44, 32, 6) : x.rect(10, 16, 44, 32); x.fill(); });
// partikel: titik lembut (debu, percikan) dan kertas konfeti
const parts = [];
function burst(pos, colors, n = 10, sp = 5) {
  const confetti = colors === CONFETTI;
  for (let i = 0; i < n; i++) {
    let p = parts.find(q => q.life <= 0);
    if (!p) {
      if (parts.length > 170) return;
      p = { m: new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })), v: new THREE.Vector3(), life: 0, max: 1, size: 1, spin: 0 };
      scene.add(p.m); parts.push(p);
    }
    const mt = p.m.material;
    mt.map = confetti ? sqTex : dotTex; mt.color.set(colors[i % colors.length]); mt.opacity = 1; mt.needsUpdate = true;
    p.m.position.copy(pos); p.m.position.y += 0.4;
    p.v.set((Math.random() - 0.5) * sp, Math.random() * sp, (Math.random() - 0.5) * sp);
    p.max = p.life = (confetti ? 0.9 : 0.45) + Math.random() * 0.6;
    p.size = confetti ? 0.3 + Math.random() * 0.15 : 0.35 + Math.random() * 0.3;
    p.spin = confetti ? (Math.random() - 0.5) * 14 : 0; p.grav = confetti ? 5 : 9;
    p.m.visible = true;
  }
}
function tickParts(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt; p.v.y -= p.grav * dt;
    if (p.spin) { p.v.x *= 1 - 1.5 * dt; p.v.z *= 1 - 1.5 * dt; p.m.material.rotation += p.spin * dt; }
    p.m.position.addScaledVector(p.v, dt);
    const k = Math.max(0, p.life / p.max), sc = p.size * (p.spin ? 1 : 0.4 + 0.6 * k);
    p.m.scale.set(sc * (p.spin ? 0.6 + 0.4 * Math.abs(Math.sin(p.life * 9)) : 1), sc, 1);
    p.m.material.opacity = Math.min(1, k * 2.2);
    if (p.life <= 0) p.m.visible = false;
  }
}
// partikel suasana per map (serbuk emas, bara, salju, daun, gelembung)
const AMB_N = 240, ambPos = new Float32Array(AMB_N * 3), amb = { vy: 0.5, sway: 0.6, on: false };
for (let i = 0; i < AMB_N; i++) ambPos.set([(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 28, (Math.random() - 0.5) * 60], i * 3);
const ambGeo = new THREE.BufferGeometry();
ambGeo.setAttribute('position', new THREE.BufferAttribute(ambPos, 3));
const ambPts = new THREE.Points(ambGeo, new THREE.PointsMaterial({ map: dotTex, size: 0.32, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true }));
ambPts.frustumCulled = false; ambPts.visible = false; scene.add(ambPts);
const AMBIENT = {
  0: [0xfff2b0, 0.6, 0.3], 2: [0xffe9a8, 0.7, 0.3], 3: [0xffffff, 1.3, 0.24], 4: [0xff8a2b, 2.4, 0.3], 5: [0x7dffc0, 1.1, 0.3],
  6: [0xfff2b0, 0.5, 0.3], 7: [0x8ee06a, -1.1, 0.42], 8: [0xffffff, -2.4, 0.3], plaza: [0xfff2b0, 0.5, 0.3],
};
function setAmbient(key) {
  const a = AMBIENT[key];
  ambPts.visible = amb.on = !!a;
  if (a) { ambPts.material.color.set(a[0]); amb.vy = a[1]; ambPts.material.size = a[2]; }
}
function tickAmbient(dt, t) {
  if (!amb.on) return;
  const c = camera.position;
  for (let i = 0; i < AMB_N; i++) {
    const o = i * 3;
    ambPos[o] += Math.sin(t * 0.7 + i) * amb.sway * dt; ambPos[o + 1] += amb.vy * dt * (0.6 + (i % 5) * 0.2); ambPos[o + 2] += Math.cos(t * 0.5 + i * 1.3) * amb.sway * dt;
    // bungkus dalam kotak di sekitar kamera
    if (ambPos[o] - c.x > 30) ambPos[o] -= 60; else if (ambPos[o] - c.x < -30) ambPos[o] += 60;
    if (ambPos[o + 1] - c.y > 14) ambPos[o + 1] -= 28; else if (ambPos[o + 1] - c.y < -14) ambPos[o + 1] += 28;
    if (ambPos[o + 2] - c.z > 30) ambPos[o + 2] -= 60; else if (ambPos[o + 2] - c.z < -30) ambPos[o + 2] += 60;
  }
  ambGeo.attributes.position.needsUpdate = true;
}
// cincin kejut kekuatan dewa
const rings = [], ringGeo = new THREE.RingGeometry(0.82, 1, 40);
function ring(pos, color, radius) {
  let r = rings.find(q => q.life <= 0);
  if (!r) { r = { m: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })), life: 0, rad: 1 }; r.m.rotation.x = -Math.PI / 2; scene.add(r.m); rings.push(r); }
  r.m.material.color.set(color); r.m.position.copy(pos); r.m.position.y += 0.15; r.life = 0.5; r.rad = radius; r.m.visible = true;
}
function tickRings(dt) {
  for (const r of rings) {
    if (r.life <= 0) continue;
    r.life -= dt;
    const k = 1 - Math.max(0, r.life) / 0.5;
    r.m.scale.setScalar(0.3 + k * r.rad); r.m.material.opacity = 0.9 * (1 - k);
    if (r.life <= 0) r.m.visible = false;
  }
}
// kilatan petir (tiang cahaya singkat)
const boltPool = [], boltGeo = new THREE.CylinderGeometry(0.1, 0.22, 9, 5);
function bolts(pos, r, n, color) {
  for (let i = 0; i < n; i++) {
    let b = boltPool.find(q => q.life <= 0);
    if (!b) { if (boltPool.length > 24) return; b = { m: new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), life: 0 }; scene.add(b.m); boltPool.push(b); }
    const a = Math.random() * 6.28, d = Math.random() * r;
    b.m.material.color.set(color); b.m.position.set(pos.x + Math.cos(a) * d, pos.y + 4.5, pos.z + Math.sin(a) * d);
    b.m.rotation.z = (Math.random() - 0.5) * 0.3; b.life = 0.12 + Math.random() * 0.22; b.m.visible = true;
  }
}
function tickBolts(dt) { for (const b of boltPool) { if (b.life <= 0) continue; b.life -= dt; b.m.material.opacity = Math.min(1, b.life * 7); b.m.scale.x = b.m.scale.z = 0.6 + Math.random() * 0.9; if (b.life <= 0) b.m.visible = false; } }
const auraGeo = new THREE.SphereGeometry(1.15, 16, 12);
const CONFETTI = [0xff4d4d, 0xffe14d, 0x5fe07a, 0x4dc3ff, 0xc05cff, 0xffffff];

// ------------------------------------------------------------ state
const G = {
  phase: 'menu', me: null, hostId: null, roster: new Map(), ents: new Map(),
  L: null, round: null, roundOver: false, offset: 0, bestRtt: 1e9,
  god: GODS[0].id, botCount: 5, addrs: [], fin: 0, alive: 0, lastCount: 99,
};
try { G.god = localStorage.getItem('asg_god') || G.god; $('name').value = localStorage.getItem('asg_name') || ''; } catch { /* private mode */ }
// koin & kostum (disimpan di perangkat)
const save = { coins: 0, owned: ['default'], skin: 'default', xp: 0, games: 0, wins: 0, qual: 0, tut: 0 };
const levelOf = xp => Math.floor(Math.sqrt(xp / 60)) + 1;
function renderProfile() {
  const lv = levelOf(save.xp), a = (lv - 1) * (lv - 1) * 60, b = lv * lv * 60;
  $('profile').innerHTML = `<b>Level ${lv}</b> · 👑 ${save.wins} menang · ${save.qual} kali lolos · ${save.games} game<div id="xpBar"><i style="width:${Math.round((save.xp - a) / (b - a) * 100)}%"></i></div>`;
}
try { Object.assign(save, JSON.parse(localStorage.getItem('asg_save') || '{}')); } catch { /* */ }
if (!SKINS.some(s => s.id === save.skin) || !save.owned.includes(save.skin)) save.skin = 'default';
function persist() { try { localStorage.setItem('asg_save', JSON.stringify(save)); } catch { /* */ } }
function addCoins(n) { save.coins += n; persist(); renderSkins(); }
function addXp(n) { const before = levelOf(save.xp); save.xp += n; persist(); renderProfile(); renderSkins(); if (levelOf(save.xp) > before) { feed(`⭐ Naik ke Level ${levelOf(save.xp)}!`); SFX.win(); } }
function renderSkins() {
  $('coins').textContent = '🪙 ' + save.coins + ' koin';
  const el = $('skins');
  el.innerHTML = '';
  for (const s of SKINS) {
    const locked = s.lvl && levelOf(save.xp) < s.lvl;
    if (s.lvl && !locked && !save.owned.includes(s.id)) save.owned.push(s.id);
    const own = save.owned.includes(s.id), b = document.createElement('button');
    const col = s.robe !== undefined ? '#' + s.robe.toString(16).padStart(6, '0') : godColor(G.god);
    b.className = 'god' + (s.id === save.skin ? ' sel' : '');
    b.innerHTML = `<i style="background:${col}"></i>${s.name}<small>${locked ? '🔒 Lv ' + s.lvl : own ? (s.id === save.skin ? 'dipakai' : 'punya') : '🪙 ' + s.cost}</small>`;
    b.onclick = () => {
      if (locked) { $('err').textContent = `Kostum ${s.name} terbuka di Level ${s.lvl}.`; return; }
      if (!own) {
        if (save.coins < s.cost) { $('err').textContent = `Koin belum cukup untuk kostum ${s.name} (butuh ${s.cost}).`; beep(200, 0.15, 'sawtooth'); return; }
        save.coins -= s.cost; save.owned.push(s.id); beep(880, 0.2, 'triangle', 0.09, 440);
      }
      save.skin = s.id; $('err').textContent = ''; persist(); renderSkins(); buildPreview();
    };
    el.appendChild(b);
  }
}
const serverNow = () => Date.now() + G.offset;
const nameOf = id => (G.roster.get(id) || {}).name || (G.ents.get(id) || {}).name || '???';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function show(which) {
  $('mode').classList.toggle('hidden', which !== 'mode');
  $('menu').classList.toggle('hidden', which !== 'menu');
  $('lobby').classList.toggle('hidden', which !== 'lobby');
  $('hud').classList.toggle('hidden', which === 'menu' || which === 'mode');
  document.body.classList.toggle('playing', which === 'hud');
  $('quitBtn').classList.toggle('hidden', which !== 'hud');
  document.body.classList.toggle('inlobby', which === 'lobby');
}

// ------------------------------------------------------------ preview menu
const preview = new THREE.Group();
scene.add(preview);
let previewGod = null;
function buildPreview() {
  disposeTree(preview); preview.clear();
  const m = c => new THREE.MeshLambertMaterial({ color: c });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 0.6, 24), m(0xf4efe6)); ped.position.y = -0.3;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 8, 32), m(0xf2c14e)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.05;
  const rock = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 7), new THREE.MeshLambertMaterial({ color: 0x7a6a5c, flatShading: true })); rock.rotation.x = Math.PI; rock.position.y = -2.1;
  const isl = prop('island');
  if (isl) { rock.visible = false; isl.scale.set(4.7, 3.4, 4.7); isl.position.y = -0.55; preview.add(isl); }
  for (const [x, z, sc] of [[-1.6, -1.5, 0.55], [1.7, -1.3, 0.7]]) { const t = prop('tree'); if (t) { t.position.set(x, 0, z); t.scale.setScalar(sc); preview.add(t); } }
  for (const [x, y, z, sc] of [[-7, 1, -9, 2.2], [8, 3, -12, 3], [-3, -3, -16, 3.5], [5, -2.5, -7, 1.6]]) { const c = prop('cloud'); if (c) { c.position.set(x, y, z); c.scale.setScalar(sc); preview.add(c); } }
  previewGod = makeGod(GODS.find(g => g.id === G.god) || GODS[0], save.skin);
  if (!QS.has('lineup')) {
    const others = GODS.filter(g => g.id !== G.god).sort(() => Math.random() - 0.5).slice(0, 4);
    [[-4.2, -3.6, 0.3], [4.1, -4.2, 0.1], [-6.4, -8, 1.3], [6.6, -8.5, 1.0]].forEach(([x, z, y], i) => {
      const isl = prop('island'); if (isl) { isl.scale.set(2.4, 1.8, 2.4); isl.position.set(x, y - 0.02, z); preview.add(isl); }
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.3, 14), m(0x74d463)); top.position.set(x, y - 0.15, z); preview.add(top);
      const c = makeGod(others[i]); c.position.set(x, y, z); c.rotation.y = -x * 0.12; c.scale.setScalar(0.9); c.userData.crowd = i + 1; preview.add(c);
    });
  }
  if (QS.has('lineup')) GODS.forEach((g, i) => { const m = makeGod(g); m.position.set((i - 4.5) * 1.25, 0.02, 2.2 + Math.abs(i - 4.5) * 0.12); m.scale.setScalar(0.9); m.userData.lineup = true; preview.add(m); });
  ped.receiveShadow = true;
  preview.add(ped, ring, rock, previewGod);
  sun.target.position.set(0, 0, 0); sun.position.copy(SUN_OFF);
}
function enterMenuScene() {
  preview.visible = true; setAmbient('plaza'); setLights('def');
  setSky(['#3a7bd5', '#9fd3ff', '#ffe9c9']);
  buildPreview();
}

// ------------------------------------------------------------ menu UI
// potret dewa untuk tombol pilih (dirender sekali dari model 3D)
const PORTRAITS = {};
function makePortraits() {
  try {
    const S = 128, rt = new THREE.WebGLRenderTarget(S, S), sc = new THREE.Scene(), cm = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x9a8fc0, 1.8)); const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(2, 4, 5); sc.add(dl);
    cm.position.set(0.5, 1.5, 3.9); cm.lookAt(0, 1.22, 0);
    const buf = new Uint8Array(S * S * 4), cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d'), img = cx.createImageData(S, S), lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.pow(i / 255, 1 / 2.2) * 255);
    for (const g of GODS) {
      const m = makeGod(g); m.rotation.y = 0.35; animateGod(m, 0, 1); sc.add(m);
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cm);
      renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const s = ((S - 1 - y) * S + x) * 4, d = (y * S + x) * 4; img.data[d] = lut[buf[s]]; img.data[d + 1] = lut[buf[s + 1]]; img.data[d + 2] = lut[buf[s + 2]]; img.data[d + 3] = buf[s + 3]; }
      cx.putImageData(img, 0, 0); PORTRAITS[g.id] = cv.toDataURL('image/png');
      sc.remove(m);
    }
    renderer.setRenderTarget(null); rt.dispose();
    if (QS.has('shot')) fetch('/debug/portrait', { method: 'POST', body: PORTRAITS.athena }).catch(() => {});
  } catch (e) { report('portrait fail ' + e); renderer.setRenderTarget(null); }
}
const godIcon = id => PORTRAITS[id] ? `<img src="${PORTRAITS[id]}" alt="">` : `<i style="background:${godColor(id)}"></i>`;
const godsEl = $('gods');
function renderGods() {
  godsEl.innerHTML = '';
  for (const g of GODS) {
    const b = document.createElement('button');
    b.className = 'god' + (g.id === G.god ? ' sel' : '');
    b.innerHTML = `${godIcon(g.id)}${g.name}`;
    b.onclick = () => { G.god = g.id; renderGods(); renderSkins(); buildPreview(); beep(660, 0.06); };
    godsEl.appendChild(b);
  }
  const a = ABILITIES[G.god];
  $('power').innerHTML = `⚡ Kekuatan: <b>${a.name}</b> — ${a.desc}`;
}
renderGods();
renderSkins();
renderProfile();

let ws = null;
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
$('joinBtn').onclick = () => {
  initAudio(); music.setMood(-1); music.start();
  const name = $('name').value.trim() || 'Dewa';
  try { localStorage.setItem('asg_name', name); localStorage.setItem('asg_god', G.god); } catch { /* */ }
  $('joinBtn').disabled = true; $('err').textContent = 'Menghubungkan...';
  G.myName = name; G.code = null;
  connect(name);
};
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); e.stopPropagation(); });
$('name').addEventListener('keyup', e => e.stopPropagation());
$('startBtn').onclick = () => send({ t: 'start', level: $('mapSel').value === '' ? undefined : +$('mapSel').value });
// pilihan mode di awal
G.mode = 'lan';
function pickMode(mode) {
  G.mode = mode;
  $('menuTitle').textContent = mode === 'solo' ? 'MAIN SENDIRI' : 'MULTIPLAYER WIFI';
  $('menuTag').textContent = mode === 'solo' ? 'Kamu melawan bot. Pilih dewamu!' : 'Semua pemain harus di WiFi yang sama.';
  $('joinBtn').textContent = mode === 'solo' ? 'LANJUT' : 'MASUK ARENA';
  $('roomRow').classList.toggle('hidden', mode === 'solo');
  $('err').textContent = '';
  show('menu'); beep(660, 0.06);
}
$('modeSolo').onclick = () => { initAudio(); pickMode('solo'); };
$('modeLan').onclick = () => { initAudio(); pickMode('lan'); };
$('backBtn').onclick = () => show('mode');
$('createBtn').onclick = () => { G.create = true; $('code').value = ''; $('joinBtn').click(); };
$('code').addEventListener('keydown', e => e.stopPropagation());
$('code').addEventListener('keyup', e => e.stopPropagation());
$('mapSel').innerHTML = '<option value="">Acak (3 ronde)</option>' + LEVELS.map((l, i) => `<option value="${i}">Latihan: ${l.name}</option>`).join('');
$('quitBtn').onclick = () => { if (confirm('Keluar dari game ini?')) { G.leaving = true; if (ws) ws.close(); } };
$('leaveBtn').onclick = () => { G.leaving = true; if (ws) ws.close(); };
$('muteBtn').onclick = () => { initAudio(); setMuted(!muted); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';
// pengaturan (tersimpan di perangkat)
const opts = { q: 'auto', sens: 1, invert: false, autoCam: IS_TOUCH, ts: 1 };
try { Object.assign(opts, JSON.parse(localStorage.getItem('asg_opts') || '{}')); } catch { /* */ }
function applyOpts() {
  quality.mode = opts.q;
  if (opts.q !== 'auto') applyQuality({ high: 3, med: 2, low: 0 }[opts.q] ?? 3);
  document.documentElement.style.setProperty('--ts', opts.ts); $('optT').value = opts.ts;
  $('optQ').value = opts.q; $('optS').value = opts.sens; $('optI').checked = !!opts.invert; $('optA').checked = !!opts.autoCam;
  try { localStorage.setItem('asg_opts', JSON.stringify(opts)); } catch { /* */ }
}
$('setBtn').onclick = () => $('settings').classList.toggle('hidden');
$('optQ').onchange = e => { opts.q = e.target.value; if (opts.q === 'auto') applyQuality(3); applyOpts();
// HP: mulai dari kualitas menengah dan partikel suasana lebih sedikit
if (IS_TOUCH) { if (opts.q === 'auto') applyQuality(2); ambGeo.setDrawRange(0, 110); } };
$('optS').oninput = e => { opts.sens = +e.target.value || 1; applyOpts(); };
$('optI').onchange = e => { opts.invert = e.target.checked; applyOpts(); };
$('optA').onchange = e => { opts.autoCam = e.target.checked; applyOpts(); };
$('optT').oninput = e => { opts.ts = +e.target.value || 1; applyOpts(); };
$('fsBtn').onclick = () => {
  const el = document.documentElement, on = document.fullscreenElement || document.webkitFullscreenElement;
  try { if (on) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (el.requestFullscreen || el.webkitRequestFullscreen).call(el); }
  catch { $('fsBtn').textContent = 'Tidak didukung di browser ini'; }
  $('settings').classList.add('hidden');
};
applyOpts();
$('botMinus').onclick = () => send({ t: 'bots', n: G.botCount - 1 });
$('botPlus').onclick = () => send({ t: 'bots', n: G.botCount + 1 });
for (const b of $('diffBtns').children) b.onclick = () => send({ t: 'diff', d: +b.dataset.d });

function renderLobby() {
  const isHost = G.hostId === G.me;
  $('plist').innerHTML = [...G.roster.values()].map(p =>
    `<li class="${p.id === G.me ? 'me' : ''}">${godIcon(p.god)}${esc(p.name)}${p.wins ? ' 👑' + p.wins : ''}${p.id === G.hostId ? '<span class="badge">HOST</span>' : ''}</li>`).join('');
  $('botN').textContent = G.botCount;
  $('diffRow').style.visibility = isHost ? 'visible' : 'hidden';
  for (const b of $('diffBtns').children) b.classList.toggle('on', +b.dataset.d === (G.diff ?? 1));
  $('botMinus').style.visibility = $('botPlus').style.visibility = isHost ? 'visible' : 'hidden';
  $('startBtn').classList.toggle('hidden', !isHost || G.serverPhase !== 'lobby');
  const solo = G.mode === 'solo';
  $('lobbyTitle').textContent = solo ? 'MAIN SENDIRI' : 'LOBBY';
  $('addr').classList.toggle('hidden', solo);
  $('mapRow').classList.toggle('hidden', !solo || !isHost);
  const lan = G.addrs.filter(a => !a.includes('127.0.0.1'));
  $('addr').innerHTML = lan.length
    ? `Ajak teman di WiFi yang sama, buka di browser HP:<br>${lan.map(a => `<b>${esc(a)}</b>`).join('<br>')}` + (G.code ? `<br>Room privat — kode: <b>${esc(G.code)}</b>` : '')
    : 'Server tidak menemukan alamat WiFi. Pastikan komputer tersambung ke WiFi.';
  $('lobbyNote').textContent = G.serverPhase !== 'lobby' ? 'Game sedang berlangsung — kamu ikut di game berikutnya.'
    : solo ? 'Atur jumlah bot, lalu tekan MULAI. Sambil itu kamu bisa mencoba kontrol di pulau ini.'
    : isHost ? 'Kamu host. Tekan MULAI kalau semua sudah masuk.' : 'Menunggu host memulai game...';
}

// ------------------------------------------------------------ jaringan
function connect(name) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onerror = () => { $('err').textContent = 'Tidak bisa terhubung ke server game. Pastikan server masih berjalan.'; };
  ws.onopen = () => { const code = G.code || $('code').value.trim(); send({ t: 'join', name, god: G.god, skin: save.skin, mode: G.mode === 'solo' ? 'solo' : (G.create || code) ? 'room' : 'lan', code, create: !!G.create }); G.create = false; ping(); };
  ws.onmessage = ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (ON[m.t]) ON[m.t](m);
  };
  ws.onclose = () => {
    if (QS.has('shot')) return endTest();
    if (G.joinFail) { G.joinFail = false; return; } // gagal masuk room: tetap di menu dengan pesan errornya
    // koneksi putus tak sengaja: coba sambung ulang sampai 3 kali
    if (!G.leaving && G.me && (G.retry = (G.retry || 0) + 1) <= 3) { feed(`📡 Koneksi terputus, mencoba lagi (${G.retry}/3)...`); clearRound(); G.phase = 'menu'; G.me = null; setTimeout(() => connect(G.myName), 1800); return; }
    G.retry = 0; G.code = null;
    if (G.leaving) { G.leaving = false; clearRound(); G.phase = 'menu'; G.me = null; show('mode'); enterMenuScene(); $('joinBtn').disabled = false; $('err').textContent = ''; return; }
    clearRound(); G.phase = 'menu'; G.me = null; show('menu'); enterMenuScene();
    $('joinBtn').disabled = false; $('err').textContent = 'Koneksi ke server terputus. Coba masuk lagi.';
  };
}
function ping() { send({ t: 'ping', c: Date.now() }); }
setInterval(() => { if (ws && ws.readyState === 1) ping(); }, 3000);

const ON = {
  welcome(m) { G.me = m.id; G.addrs = m.addrs || []; G.code = m.code || null; G.retry = 0; $('err').textContent = ''; },
  joinErr(m) { G.joinFail = true; $('err').textContent = m.msg; $('joinBtn').disabled = false; try { ws.close(); } catch { /* */ } },
  pong(m) {
    const now = Date.now(), rtt = now - m.c;
    if (rtt < G.bestRtt + 15) { G.bestRtt = Math.min(G.bestRtt, rtt); G.offset = m.s + rtt / 2 - now; }
  },
  lobby(m) {
    G.roster = new Map(m.players.map(p => [p.id, p]));
    const hostChanged = G.hostId !== m.hostId;
    G.hostId = m.hostId; G.botCount = m.botCount; G.serverPhase = m.phase; G.diff = m.diff;
    if (m.phase === 'lobby' && G.phase !== 'lobby') { G.phase = 'lobby'; show('lobby'); enterLobbyScene(); }
    else if (G.phase === 'menu' && G.me) { G.phase = 'lobby'; show('lobby'); enterLobbyScene(); }
    if (G.phase === 'lobby') syncLobbyEnts();
    if (G.phase === 'play') {
      for (const e of G.ents.values()) {
        if (!G.roster.has(e.id)) deactivate(e);
      }
    }
    renderLobby();
  },
  round(m) { startRound(m); },
  snap(m) {
    for (const a of m.e) {
      const e = G.ents.get(a[0]);
      if (!e || e.local) continue;
      const nowS = performance.now() / 1000, ds = Math.min(0.3, Math.max(0.03, nowS - (e.netT || 0)));
      if (e.got) e.netVel.set((a[1] - e.net.x) / ds, (a[2] - e.net.y) / ds, (a[3] - e.net.z) / ds); else (e.netVel = e.netVel || new THREE.Vector3()).set(0, 0, 0);
      if (e.netVel.lengthSq() > 900) e.netVel.set(0, 0, 0); // teleport / respawn
      e.netT = nowS;
      e.net.set(a[1], a[2], a[3]); e.netYaw = a[4]; e.anim = a[5];
      if (!e.got) { e.pos.copy(e.net); e.yaw = a[4]; e.got = true; }
    }
  },
  finished(m) {
    const e = G.ents.get(m.id);
    G.fin = m.n;
    if (e) { burst(e.pos, CONFETTI, 36, 10); for (const sx of [-5, 5]) burst(tmpV.set(e.pos.x + sx, e.pos.y + 1, e.pos.z), CONFETTI, 18, 12); ring(e.pos, 0xffe07a, 5); if (m.id !== G.me) SFX.cheer(); deactivate(e); }
    if (m.id === G.me) { flash('LOLOS!', 1800); SFX.win(); }
    feed(`✅ ${nameOf(m.id)} lolos (${m.n}/${m.Q})`);
  },
  dead(m) {
    const e = G.ents.get(m.id);
    G.alive = m.alive;
    if (e) deactivate(e);
    if (m.id === G.me) { flash('JATUH!', 1500); SFX.lose(); }
    feed(`💀 ${nameOf(m.id)} gugur — tersisa ${m.alive}`);
  },
  picked(m) {
    const L = G.L;
    if (!L || !L.collect) return;
    L.collect.avail[m.k] = m.at;
    const s = L.collect.spots[m.k];
    burst(new THREE.Vector3(s.x, 0.8, s.z), [0xffd23a, 0xffffff], 10, 5);
    if (m.id === G.me) { G.apples = m.n; beep(880, 0.1, 'triangle', 0.09, 440); flash('🍎 ' + m.n + '/' + L.collect.need, 700); }
  },
  ab(m) {
    const c = G.ents.get(m.id);
    if (!c) return;
    const a = ABILITIES[c.god] || ABILITIES.zeus;
    ring(c.pos, a.color, a.r || 2.5);
    burst(c.pos, [a.color, 0xffffff], 14, 7);
    // efek khas
    const fx = { zeus: [10, 0], poseidon: [0, 2], athena: [0, 1], hades: [0, 0], apollo: [0, 1], ares: [0, 1], hermes: [0, 0], thor: [4, 1], loki: [0, 2], odin: [0, 1] }[c.god] || [0, 0];
    bolts(c.pos, a.r || 3, fx[0], a.color);
    for (let i = 1; i <= fx[1]; i++) setTimeout(() => ring(c.pos, i % 2 ? 0xffffff : a.color, (a.r || 2.5) * (1 + i * 0.35)), i * 110);
    if (c.god === 'hades' || c.god === 'loki') burst(c.pos, [0x2a1040, a.color, 0x120a24], 26, 4);
    if (c.god === 'apollo' || c.god === 'odin') burst(c.pos, [0xfff2b0, 0xffffff, a.color], 22, 10);
    if (c.god === 'poseidon') burst(c.pos, [0x4dc3ff, 0xffffff, 0x9ff0ff], 30, 11);
    if (m.id === G.me || c.pos.distanceTo(camera.position) < 14) cam.shake = Math.max(cam.shake, a.area ? 0.35 : 0.15);
    if (a.dur) { c.auraT = a.dur; c.auraColor = a.color; }
    if (m.id === G.me) beep(700, 0.25, 'triangle', 0.09, 500);
    if (a.area) for (const e of G.ents.values()) {
      if (e === c || !e.local || !e.active) continue;
      if (applyArea(a, c.pos.x, c.pos.y, c.pos.z, e) && e.id === G.me) { feed(`⚡ Kamu kena ${a.name} dari ${c.name}!`); if (a.area === 'confuse') flash('KONTROL TERBALIK!', 1500); if (navigator.vibrate) navigator.vibrate(80); }
    }
  },
  roundEnd(m) {
    G.roundOver = true; G.outcome = new Set(m.qualified);
    const was = G.round && G.round.contenders.includes(G.me), iq = m.qualified.includes(G.me);
    $('endSmall').textContent = m.final ? 'Final selesai' : `Ronde ${G.round ? G.round.idx + 1 : ''} selesai`;
    $('endTitle').textContent = m.final ? (m.winner ? `👑 ${nameOf(m.winner)}` : 'Tidak ada pemenang') : 'YANG LOLOS';
    $('endYou').textContent = m.final ? (m.winner === G.me ? 'KAMU DEWA TERTINGGI!' : m.winner ? 'adalah Dewa Tertinggi!' : '')
      : !was ? '' : iq ? '✅ KAMU LOLOS!' : '❌ KAMU TERELIMINASI';
    $('endNames').innerHTML = (m.final ? '' : m.qualified.map(id => `<span>${PORTRAITS[(G.roster.get(id) || {}).god] ? `<img src="${PORTRAITS[G.roster.get(id).god]}" alt="">` : ''}${esc(nameOf(id))}</span>`).join(''))
      + (m.over && !m.final ? '<br>Semua pemain tereliminasi — kembali ke lobby.' : m.over ? '<br>Kembali ke lobby...' : '<br>Ronde berikutnya segera dimulai...');
    if (was) {
      const gain = 5 + (iq ? 15 : 0) + (m.final && m.winner === G.me ? 60 : 0);
      addCoins(gain);
      save.games += m.over ? 1 : 0; if (iq) save.qual++; if (m.final && m.winner === G.me) save.wins++;
      addXp(10 + (iq ? 25 : 0) + (m.final && m.winner === G.me ? 100 : 0));
      if (navigator.vibrate) navigator.vibrate(iq ? [30, 40, 30] : 120);
      $('endNames').innerHTML += `<br><b style="color:#ffd866">+${gain} 🪙 koin</b>`;
    }
    if (m.over && m.standings && m.standings.length) $('endNames').innerHTML += '<table>' + m.standings.map((s, i) => `<tr class="${s.id === G.me ? 'me' : ''}"><td>${i + 1}.</td><td>${esc(s.name)}</td><td>${s.pts} poin</td></tr>`).join('') + '</table>';
    G.celebrate = m.final && m.winner ? G.ents.get(m.winner) : null;
    if (G.celebrate) { G.celebrate.model.visible = true; cam.dist = 6; }
    $('end').classList.remove('hidden'); $('card').classList.add('hidden'); $('big').textContent = '';
    if (was && !m.final) (iq ? SFX.win : SFX.lose)();
    if (m.final && m.winner) {
      (m.winner === G.me ? SFX.win : SFX.lose)();
      const e = G.ents.get(m.winner);
      if (e) burst(e.pos, CONFETTI, 40, 10);
    }
  },
};

// ------------------------------------------------------------ ronde
const shGeo = new THREE.CircleGeometry(0.5, 16);
const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

function makeLabel(text, mine) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 34px "Arial Rounded MT Bold", Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = '#2a1e4a'; x.strokeText(text, 128, 32);
  x.fillStyle = mine ? '#ffd866' : '#ffffff'; x.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
  s.scale.set(2.6, 0.65, 1); s.renderOrder = 10;
  return s;
}

function deactivate(e) {
  e.active = false;
  e.model.visible = false; e.shadow.visible = false;
}

function clearRound() {
  for (const e of G.ents.values()) { scene.remove(e.model, e.shadow); disposeTree(e.model); }
  G.ents.clear();
  if (G.L) { scene.remove(G.L.group); disposeTree(G.L.group); G.L = null; }
  G.round = null; G.roundOver = false; G.outcome = null; G.celebrate = null; G.cine = false; document.body.classList.remove('cine'); cam.dist = 9.5; guide.visible = false;
  $('end').classList.add('hidden'); $('card').classList.add('hidden'); $('big').textContent = '';
}

function startRound(m) {
  clearRound();
  preview.visible = false;
  if (m.players) G.roster = new Map(m.players.map(p => [p.id, p]));
  if (m.hostId) G.hostId = m.hostId;
  G.serverPhase = 'playing';
  const lv = m.level ?? m.idx;
  const L = G.L = buildLevel(lv, m.seed);
  prepLevel(L);
  const n = m.contenders.length;
  m.contenders.forEach((id, i) => addEnt(id, i, n));
  G.round = m; G.roundOver = false; G.fin = 0; G.alive = n; G.lastCount = 99; G.apples = 0; G.hintI = 0;
  music.setMood(lv); setAmbient(lv === 9 ? 3 : lv); setLights(lv === 9 ? 3 : lv); ambience(AMB_SOUND[lv]);
  G.phase = 'play';
  cam.yaw = 0; cam.pitch = 0.42; cam.init = false;
  startRoundUI(m, lv, n);
}

// suasana cahaya tiap map: [warna matahari, kuat, langit, pantulan tanah, kuat]
const LIGHTS = {
  def: [0xfff4dc, 2.3, 0xffffff, 0x9a8fc0, 1.55],
  1: [0xb9a6ff, 1.7, 0x7a6cff, 0x2a0a4a, 1.35], 2: [0xffd9a0, 2.6, 0xffe6c4, 0xb08a70, 1.5], 3: [0xffffff, 2.4, 0xcfffff, 0x3a8aa0, 1.6],
  4: [0xffa060, 2.1, 0xff8a50, 0x4a0d08, 1.3], 5: [0x8affc8, 1.6, 0x7a5cd0, 0x0e3a2a, 1.3], 7: [0xfff2c0, 2.3, 0xd9ffe0, 0x4a7a3a, 1.55], 8: [0xeaf6ff, 2.3, 0xdff1ff, 0x7fa8c8, 1.75],
};
function setLights(key) {
  const l = LIGHTS[key] || LIGHTS.def;
  // warna dilunakkan ke putih supaya warna asli tiap dewa tetap terbaca
  const W = new THREE.Color(0xffffff);
  sun.color.set(l[0]).lerp(W, 0.55); sun.intensity = l[1]; hemi.color.set(l[2]).lerp(W, 0.55); hemi.groundColor.set(l[3]).lerp(new THREE.Color(0x9a8fc0), 0.45); hemi.intensity = Math.max(l[4], 1.5);
}
function prepLevel(L) {
  L.group.traverse(o => {
    if (!o.isMesh || o.material.transparent || o.material.isMeshBasicMaterial) return;
    o.receiveShadow = true;
    // hanya benda di sekitar lintasan yang membuat bayangan (hiasan jauh tidak perlu)
    o.getWorldPosition(tmpV);
    o.castShadow = Math.abs(tmpV.x) < 20 && tmpV.y > -4 && tmpV.y < 40;
  });
  scene.add(L.group);
  setSky(L.sky, L.fog);
}

function addEnt(id, i, n) {
  {
    const L = G.L, info = G.roster.get(id);
    if (!info) return;
    const e = newEnt(id);
    e.name = info.name; e.bot = !!info.bot; e.god = info.god;
    e.local = id === G.me; // bot disimulasikan server
    e.model = makeGod(GODS.find(g => g.id === info.god) || GODS[0], info.skin);
    const label = makeLabel((info.wins ? '👑' + (info.wins > 1 ? info.wins : '') + ' ' : '') + info.name, id === G.me);
    label.position.y = 2.4; e.model.add(label);
    e.shadow = new THREE.Mesh(shGeo, shMat); e.shadow.rotation.x = -Math.PI / 2;
    scene.add(e.model, e.shadow);
    e.net = new THREE.Vector3(); e.netVel = new THREE.Vector3(); e.netYaw = 0; e.got = false;
    spawnAt(e, L, i, n);
    e.net.copy(e.pos);
    G.ents.set(id, e);
  }
}

// lobby yang bisa dimainkan: semua pemain berlarian di pulau lobby
function enterLobbyScene() {
  clearRound();
  preview.visible = false;
  G.L = buildPlaza();
  prepLevel(G.L);
  G.round = { lobby: true, type: 'lobby', startAt: serverNow() - 60000, contenders: [], limit: 0, Q: 0, idx: -1 };
  G.lastCount = 0; G.roundOver = false;
  cam.yaw = 0; cam.pitch = 0.42; cam.init = false;
  music.setMood(-1); setAmbient('plaza'); setLights('def'); ambience('wind');
  syncLobbyEnts();
  $('touch').classList.toggle('hidden', !IS_TOUCH);
}
function syncLobbyEnts() {
  if (!G.round || !G.round.lobby) return;
  for (const e of [...G.ents.values()]) if (!G.roster.has(e.id)) { scene.remove(e.model, e.shadow); G.ents.delete(e.id); }
  const humans = [...G.roster.values()].filter(p => !p.bot);
  humans.forEach((p, i) => { if (!G.ents.has(p.id)) addEnt(p.id, i, Math.max(humans.length, 6)); });
  G.round.contenders = humans.map(p => p.id);
}

function startRoundUI(m, lv, n) {
  const info = LEVELS[lv];
  $('rname').textContent = `Ronde ${m.idx + 1}/${m.total} · ${info.name}`;
  $('goal').textContent = info.goal;
  $('cardSub').textContent = `Ronde ${m.idx + 1} — ${info.sub}`;
  $('cardName').textContent = info.name;
  $('cardGoal').textContent = info.goal + (m.type === 'final' ? '' : m.type === 'race' || m.type === 'collect' ? ` (${m.Q} tercepat lolos)` : n > m.Q ? ` (${m.Q} terakhir lolos)` : '');
  $('card').classList.remove('hidden');
  $('help').classList.toggle('hidden', IS_TOUCH);
  $('touch').classList.toggle('hidden', !IS_TOUCH);
  show('hud');
}

function feed(text) {
  const el = $('feed'), d = document.createElement('div');
  d.textContent = text; el.appendChild(d);
  while (el.children.length > 4) el.firstChild.remove();
  setTimeout(() => d.remove(), 4800);
}
let bigTimer = 0;
function flash(text, ms) {
  const el = $('big');
  el.textContent = text;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(bigTimer);
  if (ms) bigTimer = setTimeout(() => { $('big').textContent = ''; }, ms);
}

// ------------------------------------------------------------ input
const keys = {}, joy = { x: 0, y: 0 };
let jumpBuf = 0, diveQ = false, abQ = false, emoteQ = false, specIdx = 0;
const cam = { yaw: 0, pitch: 0.42, dist: 9.5, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, shake: 0, dip: 0, lastDrag: 0, fov: 60 };
// panah penunjuk apel terdekat
const guide = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 10), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
guide.visible = false; scene.add(guide);

window.addEventListener('keydown', e => {
  if (G.phase !== 'play' && G.phase !== 'lobby') return;
  keys[e.code] = true;
  if (e.code === 'Space') { jumpBuf = 0.15; e.preventDefault(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE' || e.code === 'KeyF') diveQ = true;
  if (e.code === 'KeyQ') abQ = true;
  if (e.code === 'KeyR') emoteQ = 5;
  if (e.code === 'Digit1') emoteQ = 8;
  if (e.code === 'Digit2') emoteQ = 9;
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let dragId = null, dragX = 0, dragY = 0, joyId = null;
const joyEl = $('joy'), knob = $('knob');
canvas.addEventListener('pointerdown', e => {
  // HP: sentuh sisi kiri layar -> joystick muncul di bawah jari
  if (IS_TOUCH && e.pointerType !== 'mouse' && joyId === null && e.clientX < window.innerWidth * 0.45 && (G.phase === 'play' || G.phase === 'lobby')) {
    joyEl.classList.add('dyn'); joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px';
    joyId = e.pointerId; moveJoy(e); return;
  }
  if (dragId === null) { dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY; } if (e.button === 2) abQ = true; specIdx++; });
window.addEventListener('pointermove', e => {
  if (e.pointerId === joyId && joyEl.classList.contains('dyn')) return moveJoy(e);
  if (e.pointerId !== dragId) return;
  cam.lastDrag = performance.now();
  cam.yaw -= (e.clientX - dragX) * 0.006 * opts.sens;
  cam.pitch = Math.max(0.08, Math.min(1.2, cam.pitch + (e.clientY - dragY) * 0.004 * opts.sens * (opts.invert ? -1 : 1)));
  dragX = e.clientX; dragY = e.clientY;
});
const endDrag = e => { if (e.pointerId === dragId) dragId = null; if (e.pointerId === joyId && joyEl.classList.contains('dyn')) { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; joyEl.classList.remove('dyn'); joyEl.style.left = joyEl.style.top = ''; } };
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

function moveJoy(e) {
  const r = joyEl.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  joy.x = x; joy.y = -y;
  knob.style.transform = `translate(${x * 40}px,${y * 40}px)`;
}
joyEl.addEventListener('pointerdown', e => { joyId = e.pointerId; try { joyEl.setPointerCapture(e.pointerId); } catch { /* */ } moveJoy(e); e.preventDefault(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = e => { if (e.pointerId === joyId) { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
joyEl.addEventListener('pointerup', endJoy);
joyEl.addEventListener('pointercancel', endJoy);
$('btnJump').addEventListener('pointerdown', e => { jumpBuf = 0.15; e.preventDefault(); });
$('btnDive').addEventListener('pointerdown', e => { diveQ = true; e.preventDefault(); });
$('btnAb').addEventListener('pointerdown', e => { abQ = true; e.preventDefault(); });
let emoteCycle = 0;
$('btnEmote').addEventListener('pointerdown', e => { emoteQ = [5, 8, 9][emoteCycle++ % 3]; e.preventDefault(); });

const inp = { x: 0, z: 0, jump: false, dive: false };
const NOINP = { x: 0, z: 0, jump: false, dive: false };
function readInput() {
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joy.y;
  const l = Math.hypot(ix, iy);
  if (l > 1) { ix /= l; iy /= l; }
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  inp.x = s * iy - c * ix; inp.z = c * iy + s * ix;
  if (keys.Space) jumpBuf = Math.max(jumpBuf, 0.05);
  inp.jump = jumpBuf > 0; inp.dive = diveQ; diveQ = false;
  return inp;
}

// ------------------------------------------------------------ loop game
let sendAcc = 0, hudAcc = 0;
const tmpV = new THREE.Vector3();
const pickSent = {};
const r2 = v => Math.round(v * 100) / 100;

function tickGame(dt, now) {
  const L = G.L, R = G.round, t = (serverNow() - R.startAt) / 1000;
  L.update(t);
  const playing = t >= 0 && !G.roundOver;
  const list = [...G.ents.values()];
  const tt = now / 1000;
  jumpBuf -= dt;

  for (const e of list) {
    if (!e.active) continue;
    if (e.local) {
      const mine = e.id === G.me;
      const i = !playing ? NOINP : readInput();
      if (playing && e.abCd <= 0 && abQ && L.survival && t < 8) feed('⏳ Kekuatan aktif setelah 8 detik di ronde bertahan');
      else if (playing && e.abCd <= 0 && abQ) {
        const a = ABILITIES[e.god] || ABILITIES.zeus;
        if (a.self) castSelf(e); else e.abCd = AB_CD;
        send({ t: 'ab', id: e.id });
      }
      if (mine) abQ = false;
      stepEnt(e, i, dt, L, t);
      if (e.cp > (e.cpSeen || 0)) { e.cpSeen = e.cp; flash('CHECKPOINT!', 900); beep(660, 0.12, 'triangle', 0.08, 330); burst(e.pos, CONFETTI, 12, 6); }
      if (e.speedT > 0 && e.grounded) burst(e.pos, [0x7fe6ff, 0xffffff], 1, 1.5);
      if (e.anim === 1 && (e.stepAcc = (e.stepAcc || 0) + dt * Math.hypot(e.vel.x, e.vel.z)) > 1.7) { e.stepAcc = 0; SFX.step(); }
      if (emoteQ) { e.emoteT = emoteQ === 5 ? 1.6 : 2.6; e.emoteK = emoteQ === true ? 5 : emoteQ; emoteQ = false; }
      e.emoteT = (e.emoteT || 0) - dt;
      if (e.emoteT > 0 && e.anim === 0) e.anim = e.emoteK || 5;
      separate(e, list);
      if (playing) diveBump(e, list);
      if (playing) {
        const r = postStep(e, L);
        if (r && !e.reported) { e.reported = true; send({ t: r, id: e.id }); }
        if (L.collect && !e.reported) {
          const k = touchApple(e, L, t);
          if (k >= 0 && now - (pickSent[k] || 0) > 400) { pickSent[k] = now; send({ t: 'pick', k }); }
        }
      } else if (e.pos.y < L.killY && !G.roundOver) spawnAt(e, L, R.contenders.indexOf(e.id), R.contenders.length);
      if (e.fx) {
        if (e.fx === 'jump') { if (mine) { SFX.jump(); jumpBuf = 0; } burst(e.pos, [0xffffff], 4, 2.5); e.sq = 1.28; }
        else if (e.fx === 'land') { e.sq = 0.74; burst(e.pos, [0xffffff, 0xf2efe6], 5, 2.2); if (mine) { SFX.land(); cam.dip = 0.25; } }
        else if (e.fx === 'hit') { e.flashT = 0.18; if (mine) { SFX.hit(); cam.shake = 0.45; if (navigator.vibrate) navigator.vibrate(60); } burst(e.pos, [0xffe04a, 0xffffff, 0xff9d2e], 12, 7); }
        else if (e.fx === 'dive' && mine) SFX.dive();
        else if (e.fx === 'block') { ring(e.pos, 0xb9a6ff, 1.6); if (mine) beep(900, 0.08, 'sine', 0.06); }
        else if (e.fx === 'respawn') { if (mine) SFX.respawn(); burst(e.pos, [0x9ff0ff, 0xffffff], 10, 4); }
        e.fx = null;
      }
    } else {
      const k = 1 - Math.exp(-16 * dt), age = Math.min(0.12, performance.now() / 1000 - (e.netT || 0));
      if (e.netVel) e.pos.lerp(tmpV.copy(e.net).addScaledVector(e.netVel, age), k); else e.pos.lerp(e.net, k);
      e.yaw = lerpAngle(e.yaw, e.netYaw, k);
    }
    if (L.seaY !== undefined) {
      const wet = e.pos.y < L.seaY + 0.4;
      if (wet && !e.wet) { burst(new THREE.Vector3(e.pos.x, L.seaY, e.pos.z), [L.seaColor, 0xffffff, L.seaColor], 22, 9); ring(new THREE.Vector3(e.pos.x, L.seaY, e.pos.z), 0xffffff, 3); if (e.id === G.me) SFX.splash(); }
      e.wet = wet;
    }
    e.model.position.copy(e.pos);
    e.model.rotation.y = e.yaw;
    // remote: tebak lompat/mendarat dari perubahan animasi
    if (!e.local && e.anim !== e.prevAnim) { if (e.anim === 2) e.sq = 1.25; else if (e.prevAnim === 2) e.sq = 0.78; if (e.anim === 4) { e.flashT = 0.18; burst(e.pos, [0xffe04a, 0xffffff, 0xff9d2e], 10, 6); } }
    // kilat putih sesaat ketika terpental
    if (e.flashT > 0 || e.flashOn) { e.flashT = (e.flashT || 0) - dt; const on = e.flashT > 0; if (on !== e.flashOn) { e.flashOn = on; e.model.traverse(n => { if (n.isSkinnedMesh && n.material.emissive) n.material.emissive.setScalar(on ? 0.55 : 0); }); } }
    e.prevAnim = e.anim;
    if (e.auraT > 0) {
      e.auraT -= dt;
      if (!e.aura) { e.aura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false })); e.aura.position.y = 0.9; e.model.add(e.aura); }
      e.aura.material.color.set(e.auraColor); e.aura.visible = e.auraT > 0; e.aura.scale.setScalar(1 + Math.sin(tt * 14) * 0.05);
    }
    e.sq = 1 + ((e.sq || 1) - 1) * Math.exp(-9 * dt);
    const sx = 1 / Math.sqrt(e.sq);
    e.model.scale.set(sx, e.sq, sx);
    if (e.anim === 1 && (e.dustT = (e.dustT || 0) + dt) > 0.16) { e.dustT = 0; burst(e.pos, [0xffffff], 1, 1.2); }
    // data gerak untuk animasi (pemain lain: diperkirakan dari perubahan posisi)
    const ax = e.ax || (e.ax = { x: e.pos.x, y: e.pos.y, z: e.pos.z, yaw: e.yaw, vy: 0, speed: 0, turn: 0 });
    const inv = 1 / Math.max(dt, 0.001), ka = Math.min(1, dt * 12);
    const dyaw = ((e.yaw - ax.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    ax.vy += ((e.local ? e.vel.y : (e.pos.y - ax.y) * inv) - ax.vy) * ka;
    ax.speed += ((e.local ? Math.hypot(e.vel.x, e.vel.z) : Math.hypot(e.pos.x - ax.x, e.pos.z - ax.z) * inv) - ax.speed) * ka;
    ax.turn += (dyaw * inv - ax.turn) * ka;
    ax.x = e.pos.x; ax.y = e.pos.y; ax.z = e.pos.z; ax.yaw = e.yaw;
    // hemat: garis tepi hanya untuk karakter dekat, animasi dilewati untuk yang sangat jauh
    const cd = e.model.position.distanceToSquared(camera.position);
    if (e.model.userData.outline) e.model.userData.outline.visible = cd < 45 * 45;
    if (cd > 95 * 95 && e.id !== G.me) continue;
    const shown = G.roundOver && G.outcome ? (G.outcome.has(e.id) ? 5 : 6) : (t < 0 && t > -3 && e.anim === 0 ? 7 : e.anim);
    animateGod(e.model, shown, tt, ax);
    const gy = L.groundAt(e.pos.x, e.pos.z, e.pos.y + 0.6);
    e.shadow.visible = gy > -1e8 && !sun.castShadow;
    if (e.shadow.visible) { e.shadow.position.set(e.pos.x, gy + 0.04, e.pos.z); e.shadow.scale.setScalar(Math.max(0.4, 1 - (e.pos.y - gy) * 0.08)); }
  }

  // kirim posisi (pemain sendiri + bot kalau host)
  sendAcc += dt;
  if (sendAcc > 0.066) {
    sendAcc = 0;
    const out = [];
    for (const e of list) if (e.local && e.active) out.push([e.id, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.yaw), e.anim]);
    if (out.length) send({ t: 's', e: out });
  }

  // kamera: ikuti diri sendiri, atau tonton pemain lain kalau sudah selesai/gugur
  const me = G.ents.get(G.me);
  const actives = list.filter(e => e.active);
  let target = me && me.active ? me : actives[specIdx % Math.max(1, actives.length)] || me || list[0];
  // selebrasi pemenang: kamera mengitari sang juara
  const champ = G.roundOver && G.celebrate;
  if (champ) {
    target = champ;
    cam.yaw = Math.sin(tt * 0.6) * 0.9; cam.pitch = 0.3;   // kamera berayun di depan juara (tidak tertutup singgasana)
    champ.model.position.copy(champ.pos); champ.model.scale.setScalar(1.25); champ.model.rotation.y = Math.PI;
    animateGod(champ.model, 5, tt);
    if ((champ.confT = (champ.confT || 0) + dt) > 0.25) { champ.confT = 0; burst(champ.pos, CONFETTI, 8, 9); }
    if (L.crown) { L.crownTaken = true; L.crown.position.set(champ.pos.x, champ.pos.y + 2.5, champ.pos.z); L.crown.scale.setScalar(0.62); } // mahkota di kepala juara
  }
  if (target) {
    const intro = 0;
    const yaw = cam.yaw + intro * 0.55, dist = cam.dist + intro * 3.5;
    const f = Math.cos(cam.pitch) * dist, s = Math.sin(yaw), c = Math.cos(yaw);
    const k = cam.init ? 1 - Math.exp(-10 * dt) : 1;
    // melihat sedikit ke depan arah gerak; kamera otomatis berputar ke belakang pemain
    const mv = target === me && me.active && !champ, sp = mv ? Math.hypot(me.vel.x, me.vel.z) : 0;
    tmpV.copy(target.pos); if (mv) { tmpV.x += me.vel.x * 0.14; tmpV.z += me.vel.z * 0.14; }
    cam.look.lerp(tmpV, k); cam.init = true;
    if (mv && opts.autoCam && sp > 3 && me.stun <= 0 && now - cam.lastDrag > 1200 && dragId === null) {
      const want = Math.atan2(me.vel.x, me.vel.z), d = ((want - cam.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(d) < 2.3) cam.yaw += d * Math.min(1, dt * 1.3);
    }
    // FOV melebar saat ngebut, kamera sedikit turun saat mendarat
    const fovT = baseFov + Math.max(0, Math.min(9, (sp - 8.5) * 1.6));
    cam.fov += (fovT - cam.fov) * Math.min(1, dt * 5);
    if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    cam.dip = Math.max(0, cam.dip - dt * 1.5);
    cam.shake = Math.max(0, cam.shake - dt * 1.6);
    const sh = cam.shake * cam.shake * 1.6;
    camera.position.set(cam.look.x - s * f + (Math.random() - 0.5) * sh, cam.look.y + 1.5 + Math.sin(cam.pitch) * dist + (Math.random() - 0.5) * sh - cam.dip * cam.dip * 3, cam.look.z - c * f);
    camera.lookAt(cam.look.x, cam.look.y + 1.3, cam.look.z);
  }
  // panah apel
  guide.visible = false;
  if (L.collect && me && me.active && playing) {
    let best = -1, bd = 1e9;
    L.collect.spots.forEach((sp, k) => { if (L.collect.avail[k] > t) return; const d = Math.hypot(sp.x - me.pos.x, sp.z - me.pos.z); if (d < bd) { bd = d; best = k; } });
    if (best >= 0 && bd > 2.5) {
      const sp = L.collect.spots[best], a = Math.atan2(sp.x - me.pos.x, sp.z - me.pos.z);
      guide.visible = true;
      guide.position.set(me.pos.x + Math.sin(a) * 1.5, me.pos.y + 0.5 + Math.sin(tt * 6) * 0.08, me.pos.z + Math.cos(a) * 1.5);
      guide.rotation.set(Math.PI / 2, a, 0, 'YXZ'); // kerucut (+Y) direbahkan ke +Z lalu diputar ke arah apel
    }
  }
  // target bayangan dibulatkan supaya tepi bayangan tidak bergetar
  // intro sinematik: kamera terbang dari garis finis menyusuri lintasan ke arah pemain
  const cine = !R.lobby && t < -3 && t > -6.2 && target;
  if (cine !== G.cine) { G.cine = cine; document.body.classList.toggle('cine', !!cine); }
  if (cine) {
    const u = Math.min(1, Math.max(0, (t + 6) / 3)), e2 = u * u * (3 - 2 * u), blend = Math.max(0, (u - 0.85) / 0.15);
    let px, py, pz, lx, ly, lz;
    if (L.wps.length > 1) {
      const z1 = L.wps[L.wps.length - 1].z, z = z1 + (target.pos.z - z1) * e2;
      let y = 0; for (const cp of L.cps) if (cp.z <= z + 4) y = cp.y;
      px = Math.sin(u * 2.6) * 7; py = y + 8.5; pz = z + 13; lx = 0; ly = y + 1; lz = z - 6;
    } else { const a = u * 2.2 + 0.6; px = Math.sin(a) * 24; py = 13; pz = Math.cos(a) * 24; lx = 0; ly = 1; lz = 0; }
    tmpV.set(px, py, pz).lerp(camera.position, blend);
    camera.position.copy(tmpV);
    camera.lookAt(lx + (cam.look.x - lx) * blend, ly + (cam.look.y + 1.3 - ly) * blend, lz + (cam.look.z - lz) * blend);
  }
  sun.target.position.set(Math.round(cam.look.x), Math.round(cam.look.y), Math.round(cam.look.z));
  sun.position.copy(sun.target.position).add(SUN_OFF);
  if (t > 1) tuneQuality(dt);
  if (QS.has('tp') && t > 0 && me && !me.tpDone) { const [z, y] = QS.get('tp').split(',').map(Number); me.pos.set(0, (y || 0) + 0.5, z); me.vel.set(0, 0, 0); me.cp = L.cps.length - 1; me.tpDone = true; }
  const spectating = target && target.id !== G.me && !G.roundOver;
  $('spec').classList.toggle('hidden', !spectating);
  if (spectating) $('specTxt').textContent = '👁 Menonton: ' + target.name + (actives.length > 1 ? ' (ketuk layar untuk ganti)' : '');

  // petunjuk singkat untuk dua game pertama
  if (!R.lobby && save.tut < 2 && me && me.active) {
    const hints = [[1, IS_TOUCH ? '👉 Joystick kiri untuk bergerak, tombol LOMPAT untuk melompat' : '👉 WASD untuk bergerak, Spasi untuk melompat'],
      [7, IS_TOUCH ? '👉 TERJANG untuk meluncur & menabrak lawan' : '👉 Shift untuk menerjang & menabrak lawan'],
      [13, (IS_TOUCH ? '👉 Tombol ungu' : '👉 Tombol Q') + ' = kekuatan ' + (ABILITIES[me.god] || {}).name]];
    G.hintI = G.hintI || 0;
    if (G.hintI < hints.length && t > hints[G.hintI][0]) { feed(hints[G.hintI][1]); if (++G.hintI === hints.length) { save.tut++; persist(); } }
  }
  // hitung mundur
  if (t < 0) {
    const n = Math.ceil(-t);
    if (n <= 3 && n !== G.lastCount) { G.lastCount = n; flash(String(n), 0); SFX.tick(); $('card').classList.add('hidden'); }
  } else if (G.lastCount !== 0) { G.lastCount = 0; flash('MULAI!', 900); SFX.go(); $('card').classList.add('hidden'); }

  hudAcc += dt;
  if (hudAcc > 0.2) {
    hudAcc = 0;
    const left = Math.max(0, Math.ceil(R.limit - Math.max(0, t)));
    $('timer').textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const racing = R.type !== 'survival' && R.type !== 'collect' && me && me.active;
    const rank = racing ? G.fin + 1 + actives.filter(e => e !== me && e.pos.z > me.pos.z).length : 0;
    $('count').textContent = (R.type === 'collect' ? `🍎 ${G.apples}/${L.collect ? L.collect.need : 5} · Lolos ${G.fin}/${R.Q}` : R.type === 'race' ? `Lolos ${G.fin}/${R.Q}` : R.type === 'survival' ? `Tersisa ${G.alive}` : '👑 Final') + (racing ? ` · Posisi ${rank}/${R.contenders.length}` : '');
    // papan peringkat mini (3 terdepan)
    const lead = $('lead'), showLead = R.type === 'race' || R.type === 'final';
    lead.classList.toggle('hidden', !showLead || G.roundOver);
    if (showLead) lead.innerHTML = actives.slice().sort((a, b) => b.pos.z - a.pos.z).slice(0, 3)
      .map((e, i) => `<div class="${e === me ? 'me' : ''}">${G.fin + i + 1}. ${esc(e.name)}</div>`).join('');
    const prog = $('prog'), showProg = showLead && L.wps.length > 1 && !G.roundOver;
    prog.classList.toggle('hidden', !showProg);
    if (showProg) {
      const z0 = L.spawn.z, z1 = L.wps[L.wps.length - 1].z, pct = z => Math.max(0, Math.min(100, (z - z0) / (z1 - z0) * 100)).toFixed(1);
      prog.innerHTML = L.cps.slice(1).map(cp => `<b style="left:${pct(cp.z)}%"></b>`).join('')
        + actives.map(e => `<i class="${e === me ? 'me' : ''}" style="left:${pct(e.pos.z)}%;background:${godColor(e.god)}"></i>`).join('');
    }
    const ap = $('abPill'), ab = me && ABILITIES[me.god];
    ap.classList.toggle('hidden', !(me && me.active && ab));
    if (me && ab) {
      const ready = me.abCd <= 0;
      ap.textContent = `⚡ ${ab.name}` + (ready ? (IS_TOUCH ? '' : ' [Q]') : ` ${Math.ceil(me.abCd)}s`);
      ap.classList.toggle('ready', ready); $('btnAb').classList.toggle('cd', !ready);
      $('btnAb').textContent = ready ? ab.name.split(' ')[0].toUpperCase() : Math.ceil(me.abCd) + 's';
      const pc = Math.round((1 - Math.max(0, me.abCd) / AB_CD) * 100);
      $('btnAb').style.background = ready ? '' : `conic-gradient(rgba(155,92,255,.9) ${pc}%, rgba(40,30,70,.75) 0)`;
    }
  }
}

function tickMenu(dt, now) {
  const portrait = window.innerWidth < window.innerHeight, wide = window.innerWidth >= 900;
  if (QS.has('lineup')) {
    let i = 0;
    for (const m of preview.children) if (m.userData.lineup) { animateGod(m, [0, 0, 5, 1, 0][Math.floor(now / 3000 + i) % 5], now / 1000, { speed: 7 }); m.rotation.y = Math.sin(now * 0.0006 + i++) * 0.5; }
    camera.position.set(0, 1.6, 9.5); camera.lookAt(0, 0.9, 2.2);
    return;
  }
  for (const c of preview.children) if (c.userData.crowd) animateGod(c, Math.floor(now / 2600 + c.userData.crowd * 1.7) % 4 === 0 ? 5 : 0, now / 1000);
  if (previewGod) { previewGod.rotation.y = Math.sin(now * 0.0008) * 0.7 + 0.2; animateGod(previewGod, 0, now / 1000); }
  camera.position.set(wide ? 2.2 : 0, 2.0, portrait ? 6.5 : 5.2);
  camera.lookAt(wide ? 2.2 : 0, wide ? 0.9 : portrait ? -0.9 : -0.4, 0);
}

let last = performance.now();
function frame(now) {
  if (testDone) return;
  requestAnimationFrame(frame);
  frameCount++;
  renderer.shadowMap.needsUpdate = (frameCount & 1) === 0;
  perf.acc += now - last; perf.n++;
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  if ((G.phase === 'play' || G.phase === 'lobby') && G.L && G.round) tickGame(dt, now); else { tickMenu(dt, now); if (now > 4000) tuneQuality(dt); }
  tickParts(dt); tickRings(dt); tickBolts(dt); tickAmbient(dt, now / 1000);
  dome.position.copy(camera.position);
  sunSprite.position.copy(camera.position).addScaledVector(SUN_DIR, 440);
  renderer.render(scene, camera);
  if (shot.on && now > shot.next && shot.n < 16) {
    shot.next = now + shot.every; shot.n++;
    fetch('/debug/shot_' + String(shot.n).padStart(2, '0'), { method: 'POST', body: canvas.toDataURL('image/png') }).catch(() => {});
    report(`shot ${shot.n} phase=${G.phase} lvl=${G.round ? G.round.level : '-'} ents=${G.ents.size} q=${quality.level}`);
  }
}
// mode tes: tutup tab sendiri setelah ?ttl=detik (atau saat server tes dimatikan) supaya tidak membebani komputer
let testDone = false;
function endTest() {
  if (testDone) return;
  testDone = true;
  try { if (ws) ws.close(); } catch { /* */ }
  try { renderer.dispose(); } catch { /* */ }
  window.close();
  setTimeout(() => { location.replace('about:blank'); }, 300);
}
if (QS.has('shot')) setTimeout(endTest, (+QS.get('ttl') || 45) * 1000);
let frameCount = 0;
const perf = { acc: 0, n: 0 };
if (QS.has('shot')) setInterval(() => (report(`hb frames=${frameCount} calls=${renderer.info.render.calls} tris=${renderer.info.render.triangles} ms=${perf.n ? (perf.acc / perf.n).toFixed(1) : '-'} q=${quality.level} vis=${document.visibilityState} phase=${G.phase}`), perf.acc = perf.n = 0), 5000);
const shot = { on: QS.has('shot'), every: (+QS.get('shot') || 4) * 1000, next: 2500, n: 0 };
$('loadFill').style.width = '35%';
Promise.allSettled([loadGodAssets().then(r => { $('loadFill').style.width = '70%'; return r; }), loadProps()]).then(rs => {
  $('loadFill').style.width = '100%'; setTimeout(() => $('loading').classList.add('done'), 250);
  if (rs.some(r => r.status !== 'fulfilled')) $('loadTxt').textContent = 'Sebagian aset gagal dimuat — game tetap jalan dengan tampilan sederhana.'; report('assets ' + rs.map(r => r.status + (r.reason ? ' ' + (r.reason.stack || r.reason) : '')).join(' | ')); makePortraits(); renderGods(); if (G.me) renderLobby(); if (G.phase === 'menu') buildPreview(); });
if (QS.has('auto')) {
  pickMode(QS.get('mode') === 'solo' ? 'solo' : 'lan');
  $('name').value = 'Tester';
  setTimeout(() => $('joinBtn').click(), 1200);
  if (!QS.has('nostart')) { let tries = 0; const iv = setInterval(() => { if (G.phase === 'play' || ++tries > 15) return clearInterval(iv); if (G.me && G.hostId === G.me && G.phase === 'lobby') send({ t: 'start', level: QS.has('level') ? +QS.get('level') : undefined }); }, 1500); }
}
enterMenuScene();
if (!QS.has('auto')) show('mode');
requestAnimationFrame(frame);

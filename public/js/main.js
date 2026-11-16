// Asgardian - klien: render, input, jaringan, UI
import * as THREE from '/vendor/three.module.js';
import { GODS, SKINS, makeGod, animateGod, godColor, loadGodAssets, setGodLOD } from './gods.js';
import { LEVELS, buildLevel, buildPlaza, optimizeLevel } from './levels.js';
import { loadProps, prop } from './props.js';
import { newEnt, stepEnt, postStep, spawnAt, separate, lerpAngle, ABILITIES, AB_CD, castSelf, applyArea, touchApple, diveBump } from './sim.js';

const $ = id => document.getElementById(id);
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
document.body.classList.toggle('touch', IS_TOUCH);
// ikon gambar (lihat kumpulan <symbol> di index.html) dipakai di semua teks UI sebagai ganti emoji
const ico = (n, c = '') => `<svg class="ico ${c}"><use href="#i-${n}"/></svg>`;
const FONT = '"Fredoka", ui-rounded, "Arial Rounded MT Bold", Arial, sans-serif';
try { document.fonts.load('600 34px Fredoka'); } catch { /* label nama memakai font cadangan */ }
// ukuran tampilan game (di HP tegak game diputar, jadi lebar = tinggi layar fisik); dihitung skrip di <head>
const lay = () => window.__lay();
const isRot = () => document.documentElement.classList.contains('rot');
const WIDE = { get matches() { return document.documentElement.classList.contains('wide'); } }; // sama dengan aturan CSS panel merapat kanan
// koordinat sentuhan/mouse di tampilan game (dibalik kalau tampilan diputar 90 derajat)
const P = e => isRot() ? { x: e.clientY, y: window.innerWidth - e.clientX } : { x: e.clientX, y: e.clientY };
const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* */ } };

// mode tes (server dijalankan dengan DEBUG=1): ?auto=1&shot=4&level=0&tp=z,y
const QS = new URLSearchParams(location.search);
function report(msg) { if (QS.has('shot')) fetch('/debug/log', { method: 'POST', body: String(msg) }).catch(() => {}); }
window.addEventListener('error', e => { report('ERR ' + e.message + ' @' + e.filename + ':' + e.lineno); oops(); });
// error tak terduga: beri tahu pemain sekali saja, dengan tombol muat ulang
let oopsShown = false;
function oops() {
  if (oopsShown || QS.has('shot')) return; oopsShown = true;
  const d = document.createElement('div'); d.id = 'oops';
  d.innerHTML = '<span>Ada gangguan kecil. Kalau game macet, muat ulang.</span><button type="button">Muat ulang</button><button type="button" class="x" aria-label="Tutup">×</button>';
  d.querySelector('button').onclick = () => location.reload(); d.querySelector('.x').onclick = () => d.remove();
  document.body.appendChild(d);
}
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
renderer.shadowMap.type = ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; // HP: saringan bayangan yang lebih murah
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 170 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
const SUN_OFF = new THREE.Vector3(-28, 52, 16);
const quality = { acc: 0, n: 0, level: 3, mode: 'auto', scale: 1, cool: 0, hold: 5, slow: 0, futile: 0, lastAvg: 0, floorMin: 0, wait: 3 };
const BASE_DPR = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(BASE_DPR);
renderer.shadowMap.autoUpdate = false; // diatur sendiri di frame()
// level (fitur): 3 = bayangan + resolusi penuh, 2 = bayangan + resolusi 1x, 1 = tanpa bayangan, 0 = tanpa bayangan + resolusi rendah
// scale (resolusi adaptif): diturunkan/dinaikkan pelan-pelan mengikuti fps, supaya efek tetap menyala
// dan yang dikorbankan lebih dulu hanyalah ketajaman
const DPR_CAP = [0.75, 1, 1, BASE_DPR];
function setRes() {
  renderer.setPixelRatio(Math.max(0.5, (DPR_CAP[quality.level] ?? BASE_DPR) * quality.scale));
  resize();
}
function applyQuality(level) {
  quality.level = level;
  sun.castShadow = level >= 2;
  setRes();
}
function tuneQuality(dt) {
  if (quality.mode === 'low') return;
  if ((quality.wait -= dt) > 0) return; // baru ganti adegan: lewati sentakan saat memuat/kompilasi shader
  quality.acc += dt; quality.n++; quality.cool -= dt;
  if (quality.n < 45) return;
  const avg = quality.acc / quality.n;
  quality.acc = 0; quality.n = 0;
  const minS = quality.mode === 'auto' ? 0.7 : 0.6, tg = opts.cap30 ? 2 : 1; // hemat baterai: target 30 fps
  if (avg > tg / 50) {
    const lo = Math.max(minS, quality.floorMin);
    if (quality.lastAvg) { quality.futile = avg > quality.lastAvg * 0.93 ? quality.futile + 1 : 0; quality.lastAvg = 0; }
    if (quality.futile >= 2) {
      // dua kali menurunkan resolusi tanpa hasil = bebannya di CPU, bukan di piksel: kembalikan ketajaman dan berhenti menurunkan
      quality.futile = 0; quality.scale = Math.min(1, quality.scale + 0.14); quality.floorMin = quality.scale;
      setRes();
      report('res scale tidak menolong, kembali ke ' + quality.scale.toFixed(2));
    } else if (quality.scale > lo + 0.01) {
      // di bawah 50 fps: kurangi resolusi dulu
      quality.lastAvg = avg;
      quality.scale = Math.max(lo, quality.scale - (avg > tg / 35 ? 0.15 : 0.07));
      quality.cool = quality.hold; quality.hold = Math.min(45, quality.hold * 1.6);
      setRes();
      report('res scale -> ' + quality.scale.toFixed(2) + ' (avg ms ' + (avg * 1000).toFixed(1) + ')');
    } else if (quality.mode === 'auto' && quality.level > 0 && avg > (quality.level === 1 ? tg / 30 : tg / 42) && ++quality.slow >= 2) {
      // mode otomatis: resolusi sudah mentok dan masih berat -> matikan bayangan, lalu resolusi rendah
      quality.slow = 0; quality.scale = Math.max(quality.floorMin, quality.level > 1 ? 0.85 : 1); quality.cool = 8; quality.lastAvg = 0; quality.futile = 0;
      applyQuality(quality.level > 1 ? 1 : 0);
      report('quality -> ' + quality.level + ' (avg ms ' + (avg * 1000).toFixed(1) + ')');
    }
  } else {
    quality.slow = 0;
    if (avg < tg / 57 && quality.scale < 1 && quality.cool <= 0) { quality.scale = Math.min(1, quality.scale + 0.05); quality.cool = 2; setRes(); }
  }
}

function resize() {
  const { w, h } = lay();
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 75 : 60;
  baseFov = camera.fov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// langit: satu shader murah (gradasi + pendar matahari + awan bergerak + bintang berkelip + aurora)
// awan/bintang diambil dari satu tekstur derau kecil, jadi hanya 2-3 kali baca tekstur per piksel
const skyNoise = (() => {
  const S = 128, d = new Uint8Array(S * S * 4);
  const fbm = () => {
    const octs = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]].map(([p, a]) => [p, a, Float32Array.from({ length: p * p }, Math.random)]);
    return (x, y) => {
      let v = 0;
      for (const [p, a, g] of octs) {
        const fx = x / S * p, fy = y / S * p, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const at = (i, j) => g[((j + p) % p) * p + ((i + p) % p)];
        v += a * ((at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy);
      }
      return v;
    };
  };
  const f1 = fbm(), f2 = fbm();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; d[i] = f1(x, y) * 255; d[i + 1] = f2(x, y) * 255; d[i + 2] = Math.random() < 0.012 ? 90 + Math.random() * 165 : 0; d[i + 3] = 255; }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
})();
const SUN_DIR = new THREE.Vector3(-0.45, 0.4, 0.8).normalize();
const skyU = { cTop: { value: new THREE.Color() }, cMid: { value: new THREE.Color() }, cBot: { value: new THREE.Color() }, cCloud: { value: new THREE.Color(0xffffff) }, cSun: { value: new THREE.Color(0xfff0c8) },
  sunDir: { value: SUN_DIR }, uT: { value: 0 }, uCloud: { value: 0.6 }, uStars: { value: 0 }, uAurora: { value: 0 }, nz: { value: skyNoise } };
const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
  fragmentShader: `uniform vec3 cTop, cMid, cBot, cCloud, cSun, sunDir; uniform float uT, uCloud, uStars, uAurora; uniform sampler2D nz; varying vec3 vDir;
    void main() {
      vec3 d = normalize( vDir ); float h = d.y;
      vec3 col = h > 0.05 ? mix( cMid, cTop, min( 1.0, ( h - 0.05 ) / 0.45 ) ) : mix( cBot, cMid, clamp( ( h + 0.07 ) / 0.12, 0.0, 1.0 ) );
      float sd = max( dot( d, sunDir ), 0.0 );
      col += cSun * ( pow( sd, 7.0 ) * 0.16 + pow( sd, 80.0 ) * 0.3 );
      if ( uStars > 0.0 ) {
        vec2 su = d.xz / ( abs( h ) + 1.0 ) * 4.0; float st = texture2D( nz, su ).b;
        col += vec3( 0.9, 0.95, 1.0 ) * st * st * ( 0.6 + 0.4 * sin( uT * 2.6 + su.x * 43.0 + su.y * 29.0 ) ) * uStars * smoothstep( -0.08, 0.2, h );
      }
      if ( uAurora > 0.0 ) {
        float ang = atan( d.x, d.z ), n1 = texture2D( nz, vec2( ang * 0.3183 + uT * 0.006, h * 0.2 + uT * 0.003 ) ).r;
        float cur = pow( smoothstep( 0.42, 0.72, n1 ), 1.5 ) * smoothstep( 0.06, 0.28, h ) * ( 1.0 - smoothstep( 0.4, 0.8, h ) );
        col += mix( vec3( 0.2, 1.0, 0.6 ), vec3( 0.65, 0.35, 1.0 ), smoothstep( 0.15, 0.6, h ) ) * cur * ( 0.65 + 0.35 * sin( ang * 84.0 + n1 * 22.0 ) ) * uAurora;
      }
      if ( uCloud > 0.0 && h > 0.0 ) {
        vec2 cu = d.xz / ( h + 0.2 );
        float n = texture2D( nz, cu * 0.09 + vec2( uT * 0.004, uT * 0.0015 ) ).r * 0.65 + texture2D( nz, cu * 0.27 - vec2( uT * 0.006, 0.0 ) ).g * 0.35;
        float dens = smoothstep( 0.54 - uCloud * 0.14, 0.76 - uCloud * 0.1, n ) * smoothstep( 0.0, 0.14, h );
        col = mix( col, cCloud * ( 0.86 + 0.22 * pow( sd, 3.0 ) ), dens * 0.8 );
      }
      gl_FragColor = vec4( col, 1.0 );
      #include <colorspace_fragment>
    }`,
}));
dome.renderOrder = -10; dome.frustumCulled = false;
// lautan awan di bawah pulau-pulau terbang (satu bidang, memakai tekstur derau yang sama)
const cloudFloor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: { nz: { value: skyNoise }, uT: skyU.uT, cLit: { value: new THREE.Color(0xffffff) }, cShade: { value: new THREE.Color(0xc9c2e8) }, cFog: skyU.cBot },
  transparent: true, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform sampler2D nz; uniform float uT; uniform vec3 cLit, cShade, cFog; varying vec3 vW;
    void main() {
      vec2 p = vW.xz * 0.0052;
      float n = texture2D( nz, p + vec2( uT * 0.0025, uT * 0.001 ) ).r * 0.62 + texture2D( nz, p * 2.9 - vec2( uT * 0.004, 0.0 ) ).g * 0.38;
      float a = smoothstep( 0.4, 0.58, n );
      vec3 col = mix( cShade, cLit, smoothstep( 0.46, 0.7, n ) );
      float far = smoothstep( 180.0, 620.0, distance( vW, cameraPosition ) );
      gl_FragColor = vec4( mix( col, cFog, far ), a * ( 1.0 - far * 0.85 ) );
      #include <colorspace_fragment>
    }`,
}));
cloudFloor.renderOrder = -8; cloudFloor.frustumCulled = false; cloudFloor.visible = false;
function setCloudFloor(y) {
  cloudFloor.visible = y !== undefined && y !== null;
  if (!cloudFloor.visible) return;
  cloudFloor.position.y = y;
  cloudFloor.material.uniforms.cShade.value.copy(skyU.cMid.value).lerp(new THREE.Color(0x8f86c9), 0.45);
  cloudFloor.material.uniforms.cLit.value.set(0xffffff).lerp(skyU.cBot.value, 0.25);
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,250,225,0.95)'); g.addColorStop(0.3, 'rgba(255,235,170,0.35)'); g.addColorStop(1, 'rgba(255,220,150,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})(), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
sunSprite.scale.set(190, 190, 1); sunSprite.renderOrder = -9;
scene.add(dome, sunSprite, cloudFloor);
// fx (opsional): { cloud: 0..1, cloudCol, stars: 0..1, aurora: 0..1 }
function setSky(cols, fog, fx) {
  const top = skyU.cTop.value.set(cols[0]), mid = skyU.cMid.value.set(cols[1]), bot = new THREE.Color(cols[2]);
  skyU.cBot.value.copy(bot);
  scene.background = bot;
  const dark = top.r + top.g + top.b < 0.5, f = fx || {};
  sunSprite.visible = !dark;
  sunSprite.material.color.copy(mid).lerp(new THREE.Color(0xffffff), 0.6);
  skyU.cSun.value.copy(mid).lerp(new THREE.Color(0xffffff), 0.5).multiplyScalar(dark ? 0 : 1);
  skyU.uCloud.value = f.cloud ?? (dark ? 0.35 : 0.6);
  skyU.cCloud.value.set(f.cloudCol ?? 0xffffff); if (f.cloudCol === undefined) skyU.cCloud.value.lerp(mid, dark ? 0.75 : 0.12);
  skyU.uStars.value = f.stars ?? (dark ? 1 : 0);
  skyU.uAurora.value = f.aurora ?? 0;
  const fg = fog || [150, 560];
  scene.fog = new THREE.Fog(cols[2], fg[0], fg[1]);
}

function disposeTree(o) {
  o.traverse(n => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) for (const m of [].concat(n.material)) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}

// ------------------------------------------------------------ audio
let actx = null, master = null, musicBus = null, sfxBus = null, bus = null, muted = false;
try { muted = localStorage.getItem('asg_mute') === '1'; } catch { /* */ }
function initAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    actx.resume();
    if (!master) {
      master = actx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(actx.destination);
      musicBus = actx.createGain(); sfxBus = actx.createGain(); musicBus.connect(master); sfxBus.connect(master); bus = sfxBus; setVolumes();
    }
  } catch { /* tanpa suara */ }
}
// aplikasi/tab ditinggal: semua suara dibisukan (termasuk TTS), kembali saat dibuka lagi
document.addEventListener('visibilitychange', () => {
  if (master && actx) master.gain.setTargetAtTime(document.hidden || muted ? 0 : 1, actx.currentTime, 0.05);
  if (document.hidden && typeof speechSynthesis !== 'undefined') try { speechSynthesis.cancel(); } catch { /* */ }
});
let musicDuck = 1;
function setVolumes() { if (musicBus) { musicBus.gain.value = (opts.mv ?? 1) * musicDuck; sfxBus.gain.value = opts.sv ?? 1; } }
// musik dipelankan (mis. saat layar hasil) lalu dikembalikan pelan-pelan
function duckMusic(on) { musicDuck = on ? 0.35 : 1; if (musicBus && actx) musicBus.gain.setTargetAtTime((opts.mv ?? 1) * musicDuck, actx.currentTime, 0.4); }
function setMuted(m) {
  muted = m;
  try { localStorage.setItem('asg_mute', m ? '1' : '0'); } catch { /* */ }
  if (master) master.gain.value = m ? 0 : 1;
  $('muteBtn').classList.toggle('off', m);
}
function beep(freq, dur = 0.12, type = 'square', vol = 0.06, slide = 0) {
  if (!actx || !master) return;
  try {
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(bus || master);
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
    const tick = () => {
      // tempo: normal 150 ms per ketukan, final 134 ms, 10 detik terakhir 112 ms
      this.timer = setTimeout(tick, this.fast ? 112 : this.final ? 134 : 150);
      if (!actx || muted || document.hidden) return;
      bus = musicBus; // nada musik lewat bus musik (volume terpisah dari efek)
      const s = this.step++, n = f => this.root * Math.pow(2, f / 12);
      const deg = this.pat[s % 8], oct = (s % 16) >= 8 ? 12 : 0;
      beep(n(this.scale[deg] + oct), 0.16, 'triangle', 0.028);
      if (s % 4 === 0) beep(n(this.scale[[0, 0, 3, 2][(s >> 2) % 4]] - 12), 0.34, 'sine', 0.05);
      if (s % 8 === 4) beep(n(this.scale[2] + 12), 0.1, 'sine', 0.015);
      if (s % 8 === 0) beep(110, 0.13, 'sine', 0.07, -65);                 // kick
      if (s % 2 === 1) noise(0.03, 0.012, 'highpass', 6000);              // hi-hat
      if (s % 8 === 4) noise(0.08, 0.025, 'bandpass', 1800);              // snare
      if (s % 16 === 0) { beep(n(this.scale[0]), 1.1, 'sine', 0.014); beep(n(this.scale[2]), 1.1, 'sine', 0.012); } // pad
      if ((this.final || this.fast) && s % 2 === 0) noise(0.03, 0.01, 'highpass', 7500);   // hi-hat rapat
      if (this.fast && s % 4 === 2) beep(110, 0.1, 'sine', 0.05, -60);                     // kick tambahan: makin tegang
      if (this.fast && s % 8 === 7) beep(n(this.scale[4] + 12), 0.08, 'square', 0.012);
      bus = sfxBus;
    };
    tick();
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
    src.connect(f).connect(g).connect(bus || master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur);
  } catch { /* abaikan */ }
}
// ------------------------------------------------------------ suara karakter
// bukan suara orang bicara: seruan pendek lucu ("ah!", "aw~", "noo", "yes!", "yay!") yang dibuat langsung seperti suara kucing kartun.
// caranya: gelombang gergaji yang nadanya naik-turun, lewat filter yang membuka/menutup (menutup = bunyi "o/w", membuka = "a/e").
// nada tiap dewa sedikit beda supaya bisa dikenali, semuanya tetap tinggi & imut
const VOX_P = { zeus: 1, poseidon: 0.94, athena: 1.16, hades: 0.86, apollo: 1.1, ares: 0.96, hermes: 1.24, thor: 0.9, loki: 1.2, odin: 0.86 };
// tiap suku kata: [mulai, lama, nada awal, puncak, akhir (Hz), filter awal, filter akhir, desah di awal 0..1, 's' = desis di akhir]
const VOX = {
  ah: [[0, 0.22, 620, 840, 560, 2300, 1300, 0.35]],
  aw: [[0, 0.32, 640, 780, 440, 1800, 620, 0.2]],
  ow: [[0, 0.2, 720, 860, 520, 1500, 560, 0.15]],
  oh: [[0, 0.24, 560, 700, 520, 950, 820, 0.3]],
  noo: [[0, 0.16, 640, 640, 620, 420, 1000, 0], [0.12, 0.46, 640, 600, 360, 1000, 700, 0]],
  yes: [[0, 0.07, 760, 820, 820, 3000, 2400, 0], [0.06, 0.18, 820, 1060, 900, 2400, 1900, 0, 's']],
  yay: [[0, 0.14, 700, 820, 800, 2200, 2400, 0], [0.13, 0.28, 820, 1180, 900, 2600, 1500, 0]],
  wee: [[0, 0.42, 820, 1480, 1250, 2700, 3000, 0]],
  hi: [[0, 0.2, 660, 990, 920, 1300, 2700, 0.55]],
  hya: [[0, 0.07, 900, 960, 920, 2700, 2700, 0.6], [0.06, 0.22, 820, 1120, 720, 2500, 1200, 0]],
  hup: [[0, 0.13, 620, 780, 720, 1500, 900, 0.5]],
  hehe: [[0, 0.1, 920, 1020, 900, 2400, 2200, 0.7], [0.15, 0.1, 900, 1000, 880, 2400, 2200, 0.7]],
  haha: [[0, 0.1, 920, 1020, 880, 2000, 1700, 0.7], [0.13, 0.1, 880, 970, 840, 2000, 1700, 0.7], [0.26, 0.1, 840, 920, 800, 2000, 1700, 0.7], [0.39, 0.16, 800, 880, 640, 2000, 1200, 0.7]],
  lala: [[0, 0.13, 660, 660, 660, 650, 2100, 0], [0.17, 0.13, 780, 780, 780, 650, 2100, 0], [0.34, 0.2, 880, 900, 860, 650, 2100, 0]],
  hmph: [[0, 0.2, 440, 400, 330, 520, 360, 0.5]],
  uf: [[0, 0.16, 540, 580, 400, 760, 420, 0.6]],
  eek: [[0, 0.2, 1250, 1750, 1550, 3200, 3200, 0]],
  aww: [[0, 0.52, 720, 840, 560, 2100, 760, 0.2]],
};
// seruan saat mengeluarkan kekuatan, dan saat memakai stiker (urutan sama dengan gambar e0..e7)
const CAST_VOX = { zeus: 'hya', poseidon: 'wee', athena: 'hya', hades: 'hehe', apollo: 'yay', ares: 'hya', hermes: 'wee', thor: 'hup', loki: 'hehe', odin: 'oh' };
const EMO_VOX = ['yay', 'lala', 'hi', 'haha', 'hmph', 'eek', 'yes', 'aww'];
// nama kekuatan untuk tulisan di layar
const CALLS = { zeus: 'Thunder Strike!', poseidon: 'Tidal Wave!', athena: 'Aegis Shield!', hades: 'Shadow Step!', apollo: 'Solar Wings!',
  ares: 'War Rage!', hermes: 'Swift Feet!', thor: 'Hammer Leap!', loki: 'Trick Time!', odin: "Allfather's Blessing!" };
const voiceVol = () => opts.vo === false ? 0 : opts.vo === true || opts.vo === undefined ? 1 : +opts.vo;
let voxLive = 0;
function vox(kind, god, vol = 1) {
  const P = VOX[kind], vv = voiceVol();
  if (!P || !actx || !master || vol < 0.05 || vv <= 0.01 || voxLive >= 3) return; // paling banyak 3 suara bersamaan supaya tidak riuh
  const k = VOX_P[god] || 1;
  try {
    if (!noiseBuf) noise(0.01, 0.0001);
    const t0 = actx.currentTime + 0.01, out = actx.createGain();
    out.gain.value = 0.07 * vol * vv; out.connect(sfxBus || master);
    let end = 0;
    for (const [st, d, a, b, c, fa, fb, h, tail] of P) {
      const t = t0 + st, o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain(), l = actx.createOscillator(), lg = actx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(a * k, t); o.frequency.exponentialRampToValueAtTime(b * k, t + d * 0.3); o.frequency.exponentialRampToValueAtTime(c * k, t + d);
      l.frequency.value = 7.5; lg.gain.value = a * k * 0.02; l.connect(lg).connect(o.frequency); // getar kecil supaya hidup
      f.type = 'lowpass'; f.Q.value = 4; f.frequency.setValueAtTime(fa * Math.sqrt(k), t); f.frequency.exponentialRampToValueAtTime(fb * Math.sqrt(k), t + d * 0.85);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.025); g.gain.setValueAtTime(1, t + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(f).connect(g).connect(out);
      o.start(t); o.stop(t + d + 0.02); l.start(t); l.stop(t + d + 0.02);
      const hiss = (at, dur, type, fq, v) => { const n = actx.createBufferSource(), nf = actx.createBiquadFilter(), ng = actx.createGain(); n.buffer = noiseBuf; nf.type = type; nf.frequency.value = fq; ng.gain.setValueAtTime(v, at); ng.gain.exponentialRampToValueAtTime(0.001, at + dur); n.connect(nf).connect(ng).connect(out); n.start(at, Math.random() * 0.5); n.stop(at + dur + 0.01); };
      if (h) hiss(t, 0.06, 'bandpass', 2200, h * 0.6);           // "h" di awal
      if (tail === 's') hiss(t + d - 0.03, 0.12, 'highpass', 4800, 0.45); // "s" di akhir ("yes")
      end = Math.max(end, st + d);
    }
    voxLive++; setTimeout(() => { voxLive--; try { out.disconnect(); } catch { /* */ } }, (end + 0.15) * 1000);
  } catch { /* tanpa suara */ }
}
// reaksi pemain sendiri pada momen penting (memakai suara dewanya)
const ANN_VOX = { 'Qualified!': 'yes', 'First place!': 'yay', 'Eliminated!': 'noo', 'Victory! You are the champion!': 'wee', 'Game over!': 'aww', 'Survived!': 'yay', 'Checkpoint!': 'hup', 'Level up!': 'yay' };
function announce(text) { if (ANN_VOX[text]) vox(ANN_VOX[text], G.god, 1); }
// bunyi pendamping emot (selain ucapan)
const EMO_SFX = [
  v => { noise(0.12, 0.08 * v, 'highpass', 2500); [784, 988, 1175].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'triangle', 0.04 * v), 60 + i * 60)); },
  v => [523, 659, 784, 659].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'sine', 0.04 * v), i * 110)),
  v => beep(880, 0.16, 'sine', 0.04 * v, 220),
  v => [0, 1, 2, 3].forEach(i => setTimeout(() => beep(700 - i * 60, 0.07, 'square', 0.02 * v), i * 90)),
  v => { beep(140, 0.3, 'sawtooth', 0.05 * v, -40); noise(0.3, 0.05 * v, 'bandpass', 900, 2600); },
  v => beep(1200, 0.4, 'sine', 0.04 * v, -800),
  v => { beep(660, 0.08, 'triangle', 0.05 * v); setTimeout(() => beep(990, 0.14, 'triangle', 0.05 * v), 80); },
  v => [1047, 1319].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sine', 0.035 * v), i * 100)),
];
// bunyi khas tiap kekuatan (v = volume menurut jarak)
const AB_SFX = {
  zeus: v => { noise(0.07, 0.16 * v, 'highpass', 2500); beep(1300, 0.18, 'square', 0.03 * v, -1000); setTimeout(() => noise(0.7, 0.13 * v, 'lowpass', 1400, 60), 70); },
  poseidon: v => { noise(0.9, 0.12 * v, 'lowpass', 300, 1900); setTimeout(() => noise(0.6, 0.08 * v, 'bandpass', 1500, 300), 380); },
  athena: v => [880, 1320, 1760].forEach((f, i) => setTimeout(() => beep(f, 0.55, 'sine', 0.045 * v), i * 60)),
  hades: v => { noise(0.38, 0.1 * v, 'bandpass', 2600, 180); beep(220, 0.45, 'sine', 0.08 * v, -170); },
  apollo: v => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.38, 'triangle', 0.045 * v), i * 70)),
  ares: v => { beep(90, 0.32, 'sine', 0.15 * v, -40); noise(0.45, 0.1 * v, 'bandpass', 600, 2600); },
  hermes: v => { noise(0.35, 0.09 * v, 'bandpass', 800, 4200); beep(600, 0.25, 'triangle', 0.045 * v, 900); },
  thor: v => { beep(70, 0.5, 'sine', 0.17 * v, -30); noise(0.55, 0.13 * v, 'lowpass', 900, 80); setTimeout(() => noise(0.06, 0.13 * v, 'highpass', 3000), 40); },
  loki: v => { for (let i = 0; i < 5; i++) setTimeout(() => beep(500 + (i % 2) * 260, 0.12, 'sine', 0.045 * v, i % 2 ? -200 : 200), i * 70); },
  odin: v => { [262, 330, 392].forEach(f => beep(f, 0.9, 'sine', 0.04 * v)); noise(0.6, 0.05 * v, 'bandpass', 3000, 6000); },
};
function abSound(god, vol = 1, mine = false) {
  if (vol < 0.05) return;
  if (!noiseBuf) noise(0.01, 0.0001); // siapkan buffer derau
  (AB_SFX[god] || AB_SFX.zeus)(vol);
  vox(CAST_VOX[god] || 'hya', god, vol);
}
const hexRgb = c => `${c >> 16 & 255},${c >> 8 & 255},${c & 255}`;
// HUD kekuatan disiapkan tiap ronde sesuai dewa pemain
function setupAbHud(god) {
  const a = ABILITIES[god] || ABILITIES.zeus, href = '#ab-' + (ABILITIES[god] ? god : 'zeus');
  $('abUse').setAttribute('href', href); $('abUseT').setAttribute('href', href);
  $('abName').textContent = a.name; $('abNm').textContent = a.name;
  const sl = $('abSlot'); sl.style.setProperty('--ac', '#' + a.color.toString(16).padStart(6, '0')); sl.style.setProperty('--acr', hexRgb(a.color)); $('btnAb').style.setProperty('--acr', hexRgb(a.color));
  G.buffDur = 0; G.buffOn = null;
  G.abP = -1;
}
function abCastFx(god) {
  const a = ABILITIES[god] || ABILITIES.zeus, el = $('abCast');
  G.buffDur = a.dur || 0; G.buffEnd = performance.now() + (a.dur || 0) * 1000;
  const me = G.ents.get(G.me); if (me) me.castT = 0.45;
  el.textContent = CALLS[god] || a.name + '!'; el.style.setProperty('--acr', hexRgb(a.color));
  for (const x of [el, $('abSlot'), $('btnAb')]) { const c = x === el ? 'on' : 'cast'; x.classList.remove(c); void x.offsetWidth; x.classList.add(c); }
  abSound(god, 1, true); buzz(40);
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
    src.connect(f).connect(g).connect(sfxBus || master); src.start(); lfo.start();
    ambNode = { src, g, lfo };
  } catch { /* abaikan */ }
}
const AMB_SOUND = { 0: 'wind', 1: 'space', 2: 'wind', 3: 'sea', 4: 'lava', 5: 'cave', 6: 'wind', 7: 'wind', 8: 'wind', 9: 'sea', 10: 'wind', 11: 'wind', plaza: 'wind' };
// warna bunyi langkah tiap map: es renyah tinggi, lava/gua lebih berat, logam/marmer sedikit lebih tinggi
const STEP_F = { 1: 1.2, 2: 1.15, 4: 0.55, 5: 0.6, 7: 0.75, 8: 1.7, 11: 0.9 };
const SFX = {
  jump: (k = 1) => { beep(420 * k, 0.14, 'triangle', 0.06, 300 * k); noise(0.1, 0.03, 'highpass', 1200); },
  dive: () => { noise(0.28, 0.07, 'bandpass', 500, 1800); beep(300, 0.18, 'sawtooth', 0.03, -150); },
  hit: () => { beep(160, 0.25, 'sawtooth', 0.08, -100); noise(0.18, 0.09, 'lowpass', 900, 150); },
  land: () => noise(0.09, 0.07, 'lowpass', 260, 90),
  step: (v = 1) => { const f = STEP_F[G.round && !G.round.lobby ? (G.round.level ?? G.round.idx) : -1] || 1; noise(0.035, (0.012 + Math.random() * 0.008) * v, f > 1.4 ? 'bandpass' : 'highpass', (1700 + Math.random() * 1100) * f); },
  splash: () => noise(0.4, 0.09, 'bandpass', 1800, 350),
  cheer: () => noise(0.9, 0.05, 'bandpass', 1100, 900),
  respawn: () => beep(600, 0.2, 'sine', 0.06, -300),
  tick: (f = 520) => beep(f, 0.12, 'square', 0.07),
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
// partikel: semua titik (debu, percikan, bunga api aditif, kertas konfeti) digambar dalam SATU draw call
const PN = IS_TOUCH ? 300 : 520;
const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 4), pDat = new Float32Array(PN * 3);
const pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pSize = new Float32Array(PN), pSpin = new Float32Array(PN), pGrav = new Float32Array(PN), pDrag = new Float32Array(PN);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('col', new THREE.BufferAttribute(pCol, 4));
pGeo.setAttribute('dat', new THREE.BufferAttribute(pDat, 3)); // ukuran, putaran, jenis (0 titik, 1 aditif, 2 konfeti)
const pMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 500 } }, transparent: true, depthWrite: false, premultipliedAlpha: true,
  vertexShader: `attribute vec4 col; attribute vec3 dat; varying vec4 vCol; varying vec3 vDat; uniform float uScale;
    void main() { vCol = col; vDat = dat; vec4 mv = modelViewMatrix * vec4( position, 1.0 ); gl_Position = projectionMatrix * mv; gl_PointSize = dat.x * uScale / max( 0.1, -mv.z ); }`,
  fragmentShader: `varying vec4 vCol; varying vec3 vDat;
    void main() {
      vec2 p = gl_PointCoord - 0.5; float a;
      if ( vDat.z > 1.5 ) { float c = cos( vDat.y ), s = sin( vDat.y ); vec2 q = vec2( c * p.x - s * p.y, s * p.x + c * p.y ); q.x /= max( 0.3, abs( cos( vDat.y * 1.7 ) ) ); a = step( abs( q.x ), 0.34 ) * step( abs( q.y ), 0.2 ); }
      else { float d = length( p ) * 2.0; a = vDat.z > 0.5 ? pow( max( 0.0, 1.0 - d ), 1.6 ) : smoothstep( 1.0, 0.35, d ); }
      a *= vCol.a; if ( a < 0.012 ) discard;
      gl_FragColor = vec4( vCol.rgb, 1.0 );
      #include <colorspace_fragment>
      gl_FragColor = vec4( gl_FragColor.rgb * a, vDat.z > 0.5 && vDat.z < 1.5 ? 0.0 : a );
    }`,
});
const pPts = new THREE.Points(pGeo, pMat);
pPts.frustumCulled = false; pPts.renderOrder = 5; scene.add(pPts);
let pCur = 0;
const _pc = new THREE.Color();
// o (opsional): { add: aditif, size, life, grav, up: dorongan ke atas, drag }
function burst(pos, colors, n = 10, sp = 5, o) {
  const confetti = colors === CONFETTI, kind = confetti ? 2 : o && o.add ? 1 : 0;
  for (let i = 0; i < n; i++) {
    let k = -1;
    for (let j = 0; j < PN; j++) { const q = (pCur + j) % PN; if (pLife[q] <= 0) { k = q; break; } }
    if (k < 0) return;
    pCur = (k + 1) % PN;
    _pc.set(colors[i % colors.length]);
    pCol[k * 4] = _pc.r; pCol[k * 4 + 1] = _pc.g; pCol[k * 4 + 2] = _pc.b; pCol[k * 4 + 3] = 1;
    pPos[k * 3] = pos.x; pPos[k * 3 + 1] = pos.y + 0.4; pPos[k * 3 + 2] = pos.z;
    pVel[k * 3] = (Math.random() - 0.5) * sp; pVel[k * 3 + 1] = Math.random() * sp + (o && o.up || 0); pVel[k * 3 + 2] = (Math.random() - 0.5) * sp;
    pMax[k] = pLife[k] = ((o && o.life) || (confetti ? 0.9 : 0.45)) + Math.random() * 0.6;
    pSize[k] = confetti ? 0.42 + Math.random() * 0.2 : ((o && o.size) || 0.35) * (1 + Math.random() * 0.85);
    pSpin[k] = confetti ? (Math.random() - 0.5) * 14 : 0; pGrav[k] = o && o.grav !== undefined ? o.grav : confetti ? 5 : 9; pDrag[k] = confetti ? 1.5 : (o && o.drag) || 0;
    pDat[k * 3 + 1] = Math.random() * 6.28; pDat[k * 3 + 2] = kind;
  }
}
function tickParts(dt) {
  pMat.uniforms.uScale.value = renderer.domElement.height * 0.5 / Math.tan(camera.fov * Math.PI / 360);
  for (let k = 0; k < PN; k++) {
    if (pLife[k] <= 0) continue;
    pLife[k] -= dt;
    const a = k * 3;
    pVel[a + 1] -= pGrav[k] * dt;
    if (pDrag[k]) { const d = 1 - Math.min(1, pDrag[k] * dt); pVel[a] *= d; pVel[a + 2] *= d; }
    pPos[a] += pVel[a] * dt; pPos[a + 1] += pVel[a + 1] * dt; pPos[a + 2] += pVel[a + 2] * dt;
    const f = Math.max(0, pLife[k] / pMax[k]);
    pDat[a] = pLife[k] <= 0 ? 0 : pSize[k] * (pSpin[k] ? 1 : 0.4 + 0.6 * f);
    pDat[a + 1] += pSpin[k] * dt;
    pCol[k * 4 + 3] = Math.min(1, f * 2.2);
  }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.col.needsUpdate = pGeo.attributes.dat.needsUpdate = true;
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
  6: [0xfff2b0, 0.5, 0.3], 7: [0x8ee06a, -1.1, 0.42], 8: [0xffffff, -2.4, 0.3], 10: [0xffd9b0, 0.5, 0.3], 11: [0xcfe0ff, -9, 0.16], plaza: [0xfff2b0, 0.5, 0.3],
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
const rings = [], ringGeo = new THREE.PlaneGeometry(2, 2);
const ringTex = softTex(x => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.08)'); g.addColorStop(0.8, 'rgba(255,255,255,0.55)'); g.addColorStop(0.9, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
function ring(pos, color, radius) {
  let r = rings.find(q => q.life <= 0);
  if (!r) { if (rings.length > 20) return; r = { m: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })), life: 0, rad: 1 }; r.m.rotation.x = -Math.PI / 2; scene.add(r.m); rings.push(r); }
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
const auraGeo = new THREE.SphereGeometry(1.15, 20, 14);
const makeAura = () => new THREE.Mesh(auraGeo, new THREE.ShaderMaterial({
  uniforms: { uCol: { value: new THREE.Color() }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec3 vN, vV; varying float vY; void main() { vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vN = normalize( normalMatrix * normal ); vV = normalize( -mv.xyz ); vY = position.y; gl_Position = projectionMatrix * mv; }',
  fragmentShader: `uniform vec3 uCol; uniform float uT; varying vec3 vN, vV; varying float vY;
    void main() {
      float f = pow( 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) ), 2.2 );
      float band = 0.75 + 0.25 * sin( vY * 9.0 - uT * 7.0 );
      gl_FragColor = vec4( uCol * ( f * 0.85 + 0.04 ) * band, 1.0 );
      #include <colorspace_fragment>
    }`,
}));
const CONFETTI = [0xff4d4d, 0xffe14d, 0x5fe07a, 0x4dc3ff, 0xc05cff, 0xffffff];
// resep partikel
const FX_GLOW = { add: true, size: 0.4, grav: 0, life: 0.3 }, FX_DUST = { size: 0.42, grav: 2, life: 0.35, drag: 3 }, FX_SPARK = { add: true, size: 0.3, grav: 12, life: 0.3 },
  FX_RISE = { add: true, size: 0.35, grav: -5, life: 0.5, drag: 2 }, FX_TRAIL = { add: true, size: 0.55, grav: 0, life: 0.25, drag: 2 }, FX_WIND = { add: true, size: 0.22, grav: -26, life: 0.25, drag: 0 }, FX_BREATH = { size: 0.35, grav: -0.6, life: 0.9, drag: 2.5 },
  FX_EMBER = { add: true, size: 0.26, grav: -1.6, up: 2.5, life: 1.5, drag: 0.6 }, FX_GLINT = { add: true, size: 0.5, grav: 0, life: 0.35 }, FX_TWINKLE = { add: true, size: 0.3, grav: -0.8, life: 0.6 }, FX_FIREWORK = { add: true, size: 0.55, grav: 3, life: 1.1, drag: 1.4 };

// ------------------------------------------------------------ state
const G = {
  phase: 'menu', me: null, hostId: null, roster: new Map(), ents: new Map(),
  L: null, round: null, roundOver: false, offset: 0, bestRtt: 1e9,
  god: GODS[0].id, botCount: 5, addrs: [], fin: 0, alive: 0, lastCount: 99,
};
try { G.god = localStorage.getItem('asg_god') || G.god; $('name').value = localStorage.getItem('asg_name') || ''; } catch { /* private mode */ }
// koin & kostum (disimpan di perangkat)
const save = { coins: 0, owned: ['default'], skin: 'default', xp: 0, games: 0, wins: 0, qual: 0, tut: 0, trail: 'asli', ownedT: ['asli'], best: {}, q: null };
// jejak terjang (kosmetik): warna partikel saat menerjang dan melompat
const TRAILS = [
  { id: 'asli', name: 'Asli', cost: 0 },
  { id: 'emas', name: 'Emas', cost: 80, cols: [0xffd23a, 0xfff2b0, 0xffffff] },
  { id: 'api', name: 'Api', cost: 100, cols: [0xff7a1a, 0xffd23a, 0xff3b30] },
  { id: 'es', name: 'Es', cost: 100, cols: [0x9fe3ff, 0xffffff, 0x4dc3ff] },
  { id: 'alam', name: 'Alam', cost: 120, cols: [0x8ee06a, 0xd9ffb0, 0x3f9b4b] },
  { id: 'pelangi', name: 'Pelangi', cost: 200, cols: [0xff4d4d, 0xffe14d, 0x5fe07a, 0x4dc3ff, 0xc05cff] },
  { id: 'bintang', name: 'Bintang', cost: 0, lvl: 7, cols: [0xffffff, 0xc9a6ff, 0x7de3ff] },
];
const fmtT = sec => sec.toFixed(1) + ' dtk';
// misi harian: tiga misi per hari, hadiah koin
const QUESTS = { games: ['Main %d game', 2, 30], qual: ['Lolos %d ronde', 3, 40], ab: ['Pakai kekuatan dewa %d kali', 5, 30], dive: ['Menerjang %d kali', 15, 30], cp: ['Lewati %d checkpoint', 6, 35], win: ['Menangkan %d final', 1, 60] };
function ensureQuests() {
  const d = new Date(), day = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  if (save.q && save.q.day === day && Array.isArray(save.q.list)) return;
  const keys = Object.keys(QUESTS); let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const start = h % keys.length, step = (h >> 4) % 2 ? 1 : 5;
  save.q = { day, list: [0, 1, 2].map(i => ({ k: keys[(start + i * step) % keys.length], have: 0 })) };
  persist();
}
function renderQuests() {
  ensureQuests();
  $('quests').innerHTML = save.q.list.map(q => {
    const [txt, need, coin] = QUESTS[q.k] || ['?', 1, 0];
    return `<div class="${q.done ? 'done' : ''}"><i style="width:${Math.min(100, q.have / need * 100)}%"></i><span>${txt.replace('%d', need)}</span><span>${q.done ? ico('check') : Math.min(q.have, need) + '/' + need + ' · ' + ico('coin') + coin}</span></div>`;
  }).join('');
  const left = save.q.list.filter(q => !q.done).length;
  $('tabQuest').textContent = left ? `Misi (${left})` : 'Misi';
}
function quest(k, n = 1) {
  save.st = save.st || {}; save.st[k] = (save.st[k] || 0) + n; // statistik seumur hidup (untuk pencapaian)
  ensureQuests();
  const q = save.q.list.find(x => x.k === k);
  if (!q || q.done) return;
  const [txt, need, coin] = QUESTS[k];
  q.have += n;
  if (q.have >= need) { q.done = true; feed(`Misi selesai: ${txt.replace('%d', need)} (+${coin} koin)`, 'target'); beep(880, 0.2, 'triangle', 0.09, 440); addCoins(coin); }
  persist(); renderQuests();
}
const levelOf = xp => Math.floor(Math.sqrt(xp / 60)) + 1;
// pencapaian: target jangka panjang, hadiah koin sekali saja
const ACH = [
  ['mulai', 'Langkah Pertama', 'Selesaikan 1 game', s => s.games >= 1, 20],
  ['juara', 'Juara', 'Menangkan 1 final', s => s.wins >= 1, 50],
  ['lolos20', 'Sulit Dijatuhkan', 'Lolos 20 ronde', s => s.qual >= 20, 100],
  ['veteran', 'Veteran Arena', 'Main 25 game', s => s.games >= 25, 150],
  ['dewa', 'Dewa Tertinggi', 'Menangkan 10 final', s => s.wins >= 10, 200],
  ['terjang', 'Penerjang', 'Menerjang 100 kali', s => (s.st.dive || 0) >= 100, 60],
  ['sakti', 'Sakti', 'Pakai kekuatan dewa 50 kali', s => (s.st.ab || 0) >= 50, 60],
  ['rekor', 'Pemecah Rekor', 'Punya rekor waktu di 3 map', s => Object.keys(s.best).length >= 3, 60],
  ['gaya', 'Penuh Gaya', 'Miliki 4 kostum', s => s.owned.length >= 4, 80],
  ['lv5', 'Naik Daun', 'Capai Level 5', s => levelOf(s.xp) >= 5, 100],
];
function checkAch(silent) {
  save.st = save.st || {}; save.ach = Array.isArray(save.ach) ? save.ach : [];
  let gain = 0;
  for (const [id, name, , test, coin] of ACH) {
    if (save.ach.includes(id)) continue;
    let ok = false; try { ok = test(save); } catch { /* */ }
    if (!ok) continue;
    save.ach.push(id); gain += coin;
    if (!silent) feed(`Pencapaian: ${name} (+${coin} koin)`, 'trophy');
  }
  $('achSum').textContent = `Pencapaian (${save.ach.length}/${ACH.length})`;
  $('achList').innerHTML = ACH.map(([id, name, desc, , coin]) => { const got = save.ach.includes(id); return `<div class="${got ? 'got' : ''}"><span><b>${name}</b>${desc}</span><span>${got ? ico('check', 'g') : ico('coin') + coin}</span></div>`; }).join('');
  if (gain) { if (!silent) SFX.win(); addCoins(gain); }
}
function renderProfile() {
  const lv = levelOf(save.xp), a = (lv - 1) * (lv - 1) * 60, b = lv * lv * 60;
  const pc = Math.round((save.xp - a) / (b - a) * 100), el = $('profile');
  // dibuat sekali, lalu hanya diperbarui supaya lebar bar XP beranimasi dan level membal saat naik
  if (!el.firstChild) el.innerHTML = `<span class="lv"></span><div id="xpBar"><i style="width:${pc}%"></i></div><span class="st"></span>`;
  const lvEl = el.querySelector('.lv'), was = lvEl.textContent;
  lvEl.textContent = 'Lv ' + lv; el.querySelector('#xpBar i').style.width = (was && was !== lvEl.textContent ? 100 : pc) + '%';
  if (was && was !== lvEl.textContent) { lvEl.classList.remove('up'); void lvEl.offsetWidth; lvEl.classList.add('up'); setTimeout(() => { el.querySelector('#xpBar i').style.transition = 'none'; el.querySelector('#xpBar i').style.width = '0%'; void el.offsetWidth; el.querySelector('#xpBar i').style.transition = ''; el.querySelector('#xpBar i').style.width = pc + '%'; }, 850); }
  el.querySelector('.st').innerHTML = ico('crown', 'g') + save.wins;
  $('profile').title = `${save.wins} menang · ${save.qual} kali lolos · ${save.games} game`;
}
try { Object.assign(save, JSON.parse(localStorage.getItem('asg_save') || '{}')); } catch { /* */ }
if (!SKINS.some(s => s.id === save.skin) || !save.owned.includes(save.skin)) save.skin = 'default';
if (!Array.isArray(save.ownedT)) save.ownedT = ['asli'];
if (!save.best || typeof save.best !== 'object') save.best = {};
if (!TRAILS.some(x => x.id === save.trail) || !save.ownedT.includes(save.trail)) save.trail = 'asli';
function persist() { try { localStorage.setItem('asg_save', JSON.stringify(save)); } catch { /* */ } }
function addCoins(n) { save.coins += n; persist(); renderSkins(); }
function addXp(n) { const before = levelOf(save.xp); save.xp += n; persist(); renderProfile(); renderSkins(); if (levelOf(save.xp) > before) { banner('star', 'LEVEL ' + levelOf(save.xp), [659, 784, 988, 1319]); setTimeout(() => announce('Level up!'), 900); } }
let coinShown = null, coinAnim = 0;
function showCoins() {
  const el = $('coins'), to = save.coins;
  if (coinShown === null || coinShown === to) { coinShown = to; el.innerHTML = ico('coin', 'g') + to; return; }
  const from = coinShown, t0 = performance.now(); coinShown = to;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  cancelAnimationFrame(coinAnim);
  const step = now => { const k = Math.min(1, (now - t0) / 600); el.innerHTML = ico('coin', 'g') + Math.round(from + (to - from) * (1 - (1 - k) * (1 - k))); if (k < 1) coinAnim = requestAnimationFrame(step); };
  coinAnim = requestAnimationFrame(step);
}
function renderSkins() {
  showCoins();
  renderTrails();
  const el = $('skins');
  el.innerHTML = '';
  for (const s of SKINS) {
    const locked = s.lvl && levelOf(save.xp) < s.lvl;
    if (s.lvl && !locked && !save.owned.includes(s.id)) save.owned.push(s.id);
    const own = save.owned.includes(s.id), b = document.createElement('button');
    const col = s.robe !== undefined ? '#' + s.robe.toString(16).padStart(6, '0') : godColor(G.god);
    b.className = 'god' + (s.id === save.skin ? ' sel' : '');
    b.innerHTML = `<i style="background:${col}"></i>${s.name}<small>${locked ? ico('lock') + 'Lv ' + s.lvl : own ? (s.id === save.skin ? 'dipakai' : 'punya') : ico('coin') + s.cost}</small>`;
    b.onclick = () => {
      if (locked) { $('err').textContent = `Kostum ${s.name} terbuka di Level ${s.lvl}.`; return; }
      if (!own) {
        if (save.coins < s.cost) { $('err').textContent = `Koin belum cukup untuk kostum ${s.name} (butuh ${s.cost}).`; beep(200, 0.15, 'sawtooth'); return; }
        save.coins -= s.cost; save.owned.push(s.id); beep(880, 0.2, 'triangle', 0.09, 440);
      }
      save.skin = s.id; $('err').textContent = ''; persist(); renderSkins(); swapPreviewGod();
    };
    el.appendChild(b);
  }
}
function renderTrails() {
  const el = $('trails');
  el.innerHTML = '';
  for (const tr of TRAILS) {
    const locked = tr.lvl && levelOf(save.xp) < tr.lvl;
    if (tr.lvl && !locked && !save.ownedT.includes(tr.id)) save.ownedT.push(tr.id);
    const own = save.ownedT.includes(tr.id), b = document.createElement('button'), hx = c => '#' + c.toString(16).padStart(6, '0');
    const bg = tr.cols ? `linear-gradient(135deg,${tr.cols.map(hx).join(',')})` : godColor(G.god);
    b.className = 'god' + (tr.id === save.trail ? ' sel' : '');
    b.innerHTML = `<i style="background:${bg}"></i>${tr.name}<small>${locked ? ico('lock') + 'Lv ' + tr.lvl : own ? (tr.id === save.trail ? 'dipakai' : 'punya') : ico('coin') + tr.cost}</small>`;
    b.onclick = () => {
      if (locked) { $('err').textContent = `Jejak ${tr.name} terbuka di Level ${tr.lvl}.`; return; }
      if (!own) {
        if (save.coins < tr.cost) { $('err').textContent = `Koin belum cukup untuk jejak ${tr.name} (butuh ${tr.cost}).`; beep(200, 0.15, 'sawtooth'); return; }
        save.coins -= tr.cost; save.ownedT.push(tr.id); beep(880, 0.2, 'triangle', 0.09, 440);
      }
      save.trail = tr.id; $('err').textContent = ''; persist(); renderSkins();
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
  for (const [x, y, z, sc] of [[-7, 1, -9, 2.2], [8, 3, -12, 3], [-3, -3, -16, 3.5], [5, -2.5, -7, 1.6]]) { const c = prop('cloud'); if (c) { c.position.set(x, y, z); c.scale.setScalar(sc); c.userData.drift = 0.12 + sc * 0.05; c.userData.y0 = y; preview.add(c); } }
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
  ring.userData.pvRing = true; G.pvRingMat = ring.material; tintStage();
  preview.add(ped, ring, rock, previewGod);
  sun.target.position.set(0, 0, 0); sun.position.copy(SUN_OFF);
}
// ganti dewa/kostum di panggung tanpa membangun ulang seluruh adegan: dewa baru muncul membal dengan percikan cahaya
const _pv = new THREE.Vector3();
const stageCol = () => (ABILITIES[G.god] || ABILITIES.zeus).color; // warna kekuatan selalu cerah (jubah sebagian dewa gelap)
function tintStage() { if (G.pvRingMat) G.pvRingMat.color.set(stageCol()).lerp(new THREE.Color(0xf2c14e), 0.3); }
function swapPreviewGod() {
  tintStage();
  if (previewGod) { preview.remove(previewGod); disposeTree(previewGod); }
  previewGod = makeGod(GODS.find(g => g.id === G.god) || GODS[0], save.skin);
  preview.add(previewGod);
  G.pvT = 1.4; G.pvPop = 0.4; G.pvCol = null;
  if (preview.visible) { burst(_pv.set(0, 0.5, 0), [0xffe07a, 0xffffff, godColor(G.god)], 18, 4, FX_RISE); ring(_pv.set(0, 0, 0), 0xffe07a, 3.2); }
}
function enterMenuScene() {
  preview.visible = true; setAmbient('plaza'); setLights('def');
  setSky(['#3a7bd5', '#9fd3ff', '#ffe9c9']); setCloudFloor(-14);
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
    b.onmouseenter = () => { if (g.id !== G.god) { showPower(g.id); $('power').classList.add('peek'); } };
    b.onmouseleave = () => { showPower(G.god); $('power').classList.remove('peek'); };
    b.onclick = () => { G.god = g.id; renderGods(); renderSkins(); swapPreviewGod(); vox('hi', g.id, 0.9); };
    godsEl.appendChild(b);
  }
  showPower(G.god);
}
function showPower(id) {
  const a = ABILITIES[id];
  $('power').innerHTML = `${ico('bolt')}<span><b>${a.name}</b>${a.desc}<span class="call">“${CALLS[id] || ''}”</span></span>`;
}
renderGods();
renderSkins();
renderProfile();
renderQuests();
checkAch();

let ws = null;
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
$('joinBtn').onclick = () => {
  initAudio(); music.setMood(-1); music.start();
  const name = $('name').value.trim() || 'Dewa';
  try { localStorage.setItem('asg_name', name); localStorage.setItem('asg_god', G.god); } catch { /* */ }
  $('joinBtn').disabled = true; $('err').className = 'info'; $('err').textContent = 'Menghubungkan...';
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
  $('menuTitle').textContent = mode === 'solo' ? 'MAIN SENDIRI' : 'MAIN BARENG';
  $('joinBtn').textContent = mode === 'solo' ? 'LANJUT' : 'MASUK';
  $('roomRow').classList.toggle('hidden', mode === 'solo');
  $('err').className = ''; $('err').textContent = '';
  show('menu');
}
$('modeSolo').onclick = () => { initAudio(); pickMode('solo'); };
$('modeLan').onclick = () => { initAudio(); pickMode('lan'); };
$('backBtn').onclick = () => show('mode');
$('createBtn').onclick = () => { G.create = true; $('code').value = ''; $('joinBtn').click(); };
$('code').addEventListener('keydown', e => e.stopPropagation());
$('code').addEventListener('keyup', e => e.stopPropagation());
$('mapSel').innerHTML = '<option value="">Acak (3 ronde)</option>' + LEVELS.map((l, i) => `<option value="${i}">Latihan: ${l.name}</option>`).join('');
// dialog konfirmasi sendiri (bukan kotak bawaan browser)
const sfxOpen = () => { noise(0.14, 0.03, 'bandpass', 700, 2600); beep(660, 0.08, 'sine', 0.025, 260); };
const sfxClose = () => { noise(0.12, 0.025, 'bandpass', 2400, 600); beep(700, 0.07, 'sine', 0.02, -260); };
function ask(text, yes, onYes) { sfxOpen(); $('confirmTxt').textContent = text; $('confirmYes').textContent = yes; $('confirm').classList.remove('hidden'); $('confirmYes').onclick = () => { $('confirm').classList.add('hidden'); onYes(); }; }
$('confirmNo').onclick = () => { $('confirm').classList.add('hidden'); sfxClose(); };
$('quitBtn').onclick = () => ask('Keluar dari game ini?', 'Keluar', () => { G.leaving = true; if (ws) ws.close(); });
// tab menu: Dewa / Gaya / Misi
for (const b of $('tabs').children) b.onclick = () => { const tabs = [...$('tabs').children], from = tabs.findIndex(x => x.classList.contains('on')), to = tabs.indexOf(b); $('tab-' + b.dataset.tab).style.setProperty('--sx', (to > from ? 22 : to < from ? -22 : 0) + 'px'); for (const x of $('tabs').children) { x.classList.toggle('on', x === b); $('tab-' + x.dataset.tab).classList.toggle('hidden', x !== b); } };
$('howBtn').onclick = () => $('how').classList.toggle('hidden');
$('howPc').classList.toggle('hidden', IS_TOUCH); $('howTouch').classList.toggle('hidden', !IS_TOUCH);
$('setClose').onclick = () => { $('settings').classList.add('hidden'); sfxClose(); };
// bunyi klik halus untuk semua tombol menu
let hoverAt = 0, hoverEl = null;
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse' || !e.target.closest) return;
  const b = e.target.closest('button, .god'); if (!b || b === hoverEl || b.closest('#touch')) return;
  hoverEl = b; const now = performance.now(); if (now - hoverAt < 70) return; hoverAt = now; beep(1500, 0.025, 'sine', 0.012);
});
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button') && !e.target.closest('#touch')) beep(540, 0.05, 'triangle', 0.035); });
$('leaveBtn').onclick = () => { G.leaving = true; if (ws) ws.close(); };
$('muteBtn').onclick = () => { initAudio(); setMuted(!muted); };
$('muteBtn').classList.toggle('off', muted);
// pengaturan (tersimpan di perangkat)
const opts = { q: 'auto', sens: 1, invert: false, autoCam: IS_TOUCH, ts: 1, us: 1, mv: 1, sv: 1, vo: 1, calm: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, cap30: false, fps: false };
try { Object.assign(opts, JSON.parse(localStorage.getItem('asg_opts') || '{}')); } catch { /* */ }
// tampilkan nilai tiap slider pengaturan (persen / kali)
const SLV = { optMV: v => Math.round(v * 100) + '%', optSV: v => Math.round(v * 100) + '%', optV: v => v > 0.01 ? Math.round(v * 100) + '%' : 'Mati', optS: v => (+v).toFixed(1) + '×', optT: v => Math.round(v * 100) + '%', optU: v => Math.round(v * 100) + '%' };
for (const id in SLV) { const inp = $(id), o = document.createElement('span'); o.className = 'val'; o.id = id + 'Val'; inp.after(o); inp.addEventListener('input', () => { o.textContent = SLV[id](inp.value); }); }
const showSliders = () => { for (const id in SLV) $(id + 'Val').textContent = SLV[id]($(id).value); };
function applyOpts() {
  if (quality.mode !== opts.q || !quality.inited) {
    quality.mode = opts.q; quality.inited = true; quality.hold = 5; quality.slow = 0; quality.futile = 0; quality.lastAvg = 0; quality.floorMin = 0;
    // HP mulai sedikit di bawah resolusi penuh; resolusi adaptif menaikkannya sendiri kalau perangkatnya kuat
    quality.scale = opts.q === 'low' ? 1 : IS_TOUCH ? 0.85 : 1;
    applyQuality({ auto: 3, high: 3, med: 2, low: 0 }[opts.q] ?? 3);
  }
  document.documentElement.style.setProperty('--ts', opts.ts); $('optT').value = opts.ts;
  document.documentElement.style.setProperty('--us', opts.us); $('optU').value = opts.us;
  $('optMV').value = opts.mv; $('optSV').value = opts.sv; $('optC').checked = !!opts.cap30; $('optF').checked = !!opts.fps; $('optCalm').checked = !!opts.calm; document.documentElement.classList.toggle('calm', !!opts.calm); $('optV').value = opts.vo === false ? 0 : opts.vo === true || opts.vo === undefined ? 1 : opts.vo;
  $('fps').classList.toggle('hidden', !opts.fps); setVolumes();
  $('optQ').value = opts.q; $('optS').value = opts.sens; $('optI').checked = !!opts.invert; $('optA').checked = !!opts.autoCam;
  showSliders();
  try { localStorage.setItem('asg_opts', JSON.stringify(opts)); } catch { /* */ }
}
$('setBtn').onclick = () => { const on = $('settings').classList.toggle('hidden'); (on ? sfxClose : sfxOpen)(); };
$('optQ').onchange = e => { opts.q = e.target.value; applyOpts(); };
if (IS_TOUCH) ambGeo.setDrawRange(0, 120); // HP: partikel suasana lebih sedikit
$('optS').oninput = e => { opts.sens = +e.target.value || 1; applyOpts(); };
$('optI').onchange = e => { opts.invert = e.target.checked; applyOpts(); };
$('optA').onchange = e => { opts.autoCam = e.target.checked; applyOpts(); };
$('optT').oninput = e => { opts.ts = +e.target.value || 1; applyOpts(); };
$('optU').oninput = e => { opts.us = +e.target.value || 1; applyOpts(); };
$('optMV').oninput = e => { opts.mv = +e.target.value; applyOpts(); };
$('optMV').onchange = () => [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'triangle', 0.05 * (opts.mv ?? 1)), i * 80));
$('optSV').oninput = e => { opts.sv = +e.target.value; applyOpts(); beep(660, 0.08); };
$('optSV').onchange = () => SFX.jump();
$('optC').onchange = e => { opts.cap30 = e.target.checked; quality.acc = quality.n = 0; quality.lastAvg = 0; applyOpts(); };
$('optF').onchange = e => { opts.fps = e.target.checked; applyOpts(); };
$('optCalm').onchange = e => { opts.calm = e.target.checked; applyOpts(); };
$('optV').oninput = e => { opts.vo = +e.target.value; applyOpts(); };
$('optV').onchange = () => vox('hi', G.god, 1);
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

$('addr').addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-cp]'); if (!b) return;
  const txt = b.dataset.cp, done = () => { b.classList.add('ok'); feed('Alamat disalin: ' + txt, 'check'); beep(1200, 0.06, 'sine', 0.04); setTimeout(() => b.classList.remove('ok'), 1200); };
  try { navigator.clipboard.writeText(txt).then(done, () => { const r = document.createRange(); r.selectNodeContents(b); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); feed('Tekan lama untuk menyalin', 'info'); }); }
  catch { feed('Tekan lama untuk menyalin', 'info'); }
});
function renderLobby() {
  const isHost = G.hostId === G.me;
  $('plist').innerHTML = [...G.roster.values()].map(p =>
    `<li class="${p.id === G.me ? 'me' : ''}">${godIcon(p.god)}<span class="nm">${esc(p.name)}</span>${p.wins ? `<span class="wins">${ico('crown')}${p.wins}</span>` : ''}${p.id === G.hostId ? '<span class="badge">HOST</span>' : ''}</li>`).join('');
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
    ? `Teman membuka alamat ini di browser (ketuk untuk menyalin):<br>${lan.map(a => `<b class="cp" data-cp="${esc(a)}">${esc(a)}</b>`).join('<br>')}` + (G.code ? `<br>Kode room: <b>${esc(G.code)}</b>` : '')
    : 'Alamat WiFi tidak ditemukan. Sambungkan komputer ke WiFi.';
  $('lobbyNote').textContent = G.serverPhase !== 'lobby' ? 'Game sedang berlangsung. Kamu ikut game berikutnya.'
    : solo || isHost ? '' : 'Menunggu host memulai...';
}

// ------------------------------------------------------------ jaringan
function connect(name) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onerror = () => { $('err').className = ''; $('err').textContent = 'Tidak bisa terhubung ke server game. Pastikan server masih berjalan.'; };
  ws.onopen = () => { const code = G.code || $('code').value.trim(); send({ t: 'join', name, god: G.god, skin: save.skin, trail: save.trail, mode: G.mode === 'solo' ? 'solo' : (G.create || code) ? 'room' : 'lan', code, create: !!G.create }); G.create = false; ping(); };
  ws.onmessage = ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (ON[m.t]) ON[m.t](m);
  };
  ws.onclose = () => {
    if (QS.has('shot')) return endTest();
    if (G.joinFail) { G.joinFail = false; return; } // gagal masuk room: tetap di menu dengan pesan errornya
    // koneksi putus tak sengaja: coba sambung ulang sampai 3 kali
    if (!G.leaving && G.me && (G.retry = (G.retry || 0) + 1) <= 3) { feed(`Koneksi terputus, mencoba lagi (${G.retry}/3)...`, 'wifi'); clearRound(); G.phase = 'menu'; G.me = null; setTimeout(() => connect(G.myName), 1800); return; }
    G.retry = 0; G.code = null;
    if (G.leaving) { G.leaving = false; cut(); clearRound(); G.phase = 'menu'; G.me = null; show('mode'); enterMenuScene(); $('joinBtn').disabled = false; $('err').textContent = ''; return; }
    clearRound(); G.phase = 'menu'; G.me = null; show('menu'); enterMenuScene();
    $('joinBtn').disabled = false; $('err').className = ''; $('err').textContent = 'Koneksi ke server terputus. Coba masuk lagi.';
  };
}
function ping() { send({ t: 'ping', c: Date.now() }); }
setInterval(() => { if (ws && ws.readyState === 1) ping(); }, 3000);

const ON = {
  welcome(m) { G.debug = !!m.debug; G.me = m.id; G.addrs = m.addrs || []; G.code = m.code || null; G.retry = 0; $('err').textContent = ''; },
  joinErr(m) { G.joinFail = true; $('err').className = ''; $('err').textContent = m.msg; $('joinBtn').disabled = false; try { ws.close(); } catch { /* */ } },
  pong(m) {
    const now = Date.now(), rtt = now - m.c;
    G.rtt = rtt;
    $('netWarn').classList.toggle('hidden', G.mode === 'solo' || rtt < 180); $('netWarn').title = rtt + ' ms';
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
      if (e.netVel.lengthSq() > 900) { e.netVel.set(0, 0, 0); if (e.got) e.blinkT = 1.1; } // teleport / respawn
      e.netT = nowS;
      e.net.set(a[1], a[2], a[3]); e.netYaw = a[4]; e.anim = a[5];
      if (!e.got) { e.pos.copy(e.net); e.yaw = a[4]; e.got = true; }
    }
  },
  finished(m) {
    const e = G.ents.get(m.id);
    G.fin = m.n;
    if (e) { burst(e.pos, CONFETTI, 36, 10); for (const sx of [-5, 5]) burst(tmpV.set(e.pos.x + sx, e.pos.y + 1, e.pos.z), CONFETTI, 18, 12); ring(e.pos, 0xffe07a, 5); if (m.id !== G.me) SFX.cheer(); deactivate(e, 'up'); }
    if (m.id === G.me) {
      const R = G.round, lv = R ? (R.level ?? R.idx) : -1;
      if (R && (R.type === 'race' || R.type === 'final') && LEVELS[lv]) {
        // rekor waktu pribadi per map
        const sec = Math.max(0, (serverNow() - R.startAt) / 1000), old = save.best[lv];
        flash((m.n === 1 ? 'JUARA 1! ' : 'LOLOS! ') + fmtT(sec), 2000);
        if (m.n === 1) { setTimeout(() => announce('First place!'), 900); confettiRain(70); }
        if (!old || sec < old) { save.best[lv] = Math.round(sec * 10) / 10; persist(); if (old) setTimeout(() => banner('star', 'REKOR BARU ' + fmtT(sec), [784, 988, 1175, 1568]), 1200); feed(`Rekor baru di ${LEVELS[lv].name}: ${fmtT(sec)}` + (old ? ` (sebelumnya ${fmtT(old)})` : ''), 'star'); }
      } else flash(m.n === 1 ? 'JUARA 1!' : 'LOLOS!', 1800);
      SFX.win(); glow('255,214,110'); announce('Qualified!'); confettiRain();
    }
    if (e && m.id !== G.me && e.pos.distanceToSquared(camera.position) < 40 * 40) { burst(e.pos, [0xffe07a, 0x9af07a, 0xffffff], 14, 4, FX_RISE); ring(e.pos, 0xffe07a, 2); }
    if (e && m.id !== G.me) vox('yay', e.god, Math.max(0, 1 - e.pos.distanceTo(cam.look) / 25) * 0.5);
    feed(`${nameOf(m.id)} lolos (${m.n}/${m.Q})`, 'flag', m.id);
  },
  dead(m) {
    const e = G.ents.get(m.id);
    G.alive = m.alive;
    if (e) { burst(e.pos, [0xffffff, 0xd9d4ee, 0xb9b0dd], 12, 3.5, FX_DUST); burst(e.pos, [0xffe07a, 0xffffff], 6, 6, FX_SPARK); ring(e.pos, 0xffffff, 2.2); deactivate(e, 'pop'); }
    if (m.id === G.me) { flash('JATUH!', 1500); SFX.lose(); hurt(); announce('Eliminated!'); canvas.classList.add('out'); setTimeout(() => canvas.classList.remove('out'), 1600); }
    if (e && m.id !== G.me) vox('noo', e.god, Math.max(0, 1 - e.pos.distanceTo(cam.look) / 25) * 0.6);
    feed(`${nameOf(m.id)} gugur · sisa ${m.alive}`, 'skull', m.id);
    { const me = G.ents.get(G.me); if (G.L && G.L.survival && me && me.active && m.alive <= 3 && m.alive >= 2) tipShow(`Tinggal ${m.alive} dewa!`, 'users'); }
  },
  picked(m) {
    const L = G.L;
    if (!L || !L.collect) return;
    L.collect.avail[m.k] = m.at;
    const s = L.collect.spots[m.k];
    burst(new THREE.Vector3(s.x, 0.8, s.z), [0xffd23a, 0xffffff], 10, 5);
    if (m.id === G.me) { G.apples = m.n; beep(880 * Math.pow(1.06, m.n - 1), 0.1, 'triangle', 0.09, 440); if (m.n >= L.collect.need) { flash('APEL LENGKAP!', 1400); [988, 1319, 1568].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.07), 120 + i * 90)); } else flash('APEL ' + m.n + '/' + L.collect.need, 700); }
    { const e = G.ents.get(m.id); if (e) { floatText(e.pos, '+1', '#ffd23a'); ring(e.pos, 0xffd23a, 1.6); } }
  },
  ab(m) {
    const c = G.ents.get(m.id);
    if (!c) return;
    const a = ABILITIES[c.god] || ABILITIES.zeus;
    ring(c.pos, a.color, a.r || 2.5);
    c.castT = 0.45; // pose menghentak tangan
    if (a.area && c.pos.distanceToSquared(camera.position) < 60 * 60) areaDome(c.pos, a.color, a.r || 5);
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
    // suara: pemain sendiri sudah bersuara saat menekan tombol; dewa lain terdengar makin pelan menurut jarak
    if (m.id === G.me) { floatText(c.pos, a.name, '#' + a.color.toString(16).padStart(6, '0')); glow(hexRgb(a.color)); if (performance.now() - (G.selfAbT || 0) > 1500) abSound(c.god, 1, true); }
    else abSound(c.god, Math.pow(Math.max(0, 1 - c.pos.distanceTo(cam.look) / 30), 1.3) * 0.85);
    if (a.area) for (const e of G.ents.values()) {
      if (e === c || !e.local || !e.active) continue;
      if (applyArea(a, c.pos.x, c.pos.y, c.pos.z, e) && e.id === G.me) { feed(`Kena ${a.name} dari ${c.name}!`, 'bolt', c.id); hurt(); if (a.area === 'confuse') flash('KONTROL TERBALIK!', 1500); buzz(80); }
    }
  },
  emo(m) { const e = G.ents.get(m.id); if (e && e.active) showEmo(e, m.k); },
  roundEnd(m) {
    duckMusic(true);
    G.roundOver = true; G.outcome = new Set(m.qualified);
    const was = G.round && G.round.contenders.includes(G.me), iq = m.qualified.includes(G.me);
    $('endSmall').textContent = m.final ? 'Final selesai' : `Ronde ${G.round ? G.round.idx + 1 : ''} selesai`;
    $('endTitle').innerHTML = m.final ? (m.winner ? ico('crown') + esc(nameOf(m.winner)) : 'Tidak ada pemenang') : 'Yang lolos';
    $('endYou').textContent = m.final ? (m.winner === G.me ? 'Kamu Dewa Tertinggi!' : m.winner ? 'Dewa Tertinggi' : '') : !was ? '' : iq ? 'Kamu lolos!' : 'Kamu tereliminasi';
    $('endYou').className = 'you ' + (m.final ? 'gold' : iq ? 'ok' : 'bad');
    let html = (m.final ? '' : m.qualified.map((id, i) => { const pt = PORTRAITS[(G.roster.get(id) || {}).god]; return `<span style="--i:${i}" class="q${pt ? '' : ' nop'}">${pt ? `<img src="${pt}" alt="">` : ''}${esc(nameOf(id))}</span>`; }).join(''))
      + (m.over && !m.final ? '<br>Semua pemain tereliminasi.' : m.over ? '' : '<br>Ronde berikutnya segera dimulai...');
    if (was) {
      const win = m.final && m.winner === G.me, gain = 5 + (iq ? 15 : 0) + (win ? 60 : 0), xp = 10 + (iq ? 25 : 0) + (win ? 100 : 0);
      const pct = v => { const lv = levelOf(v), a0 = (lv - 1) * (lv - 1) * 60; return Math.round((v - a0) / (lv * lv * 60 - a0) * 100); };
      const lvUp = levelOf(save.xp + xp) > levelOf(save.xp), from = lvUp ? 0 : pct(save.xp), to = pct(save.xp + xp);
      addCoins(gain);
      save.games += m.over ? 1 : 0; if (iq) save.qual++; if (win) save.wins++;
      if (m.over) quest('games'); if (iq) quest('qual'); if (win) quest('win');
      checkAch();
      const rs = G.rstat || {};
      html += `<span class="sum">Jatuh ${rs.falls || 0}× · terpental ${rs.hits || 0}× · menerjang ${rs.dives || 0}×</span>`
        + `<div class="gain"><span class="chip">${ico('coin')}+<b data-to="${gain}">0</b></span><span class="chip">${ico('star')}+<b data-to="${xp}">0</b> XP</span><span class="chip">Lv ${levelOf(save.xp + xp)}</span></div><div class="xp"><i id="endXp" style="width:${from}%"></i></div>`;
      addXp(xp);
      buzz(iq ? [30, 40, 30] : 120);
      setTimeout(() => { const el = $('endXp'); if (el) el.style.width = to + '%'; }, 350);
    }
    if (m.over && m.standings && m.standings.length) {
      // podium 3 besar (urutan tampil 2-1-3), sisanya di tabel
      const top = m.standings.slice(0, 3), rest = m.standings.slice(3);
      const col = (s, i) => { const pt = PORTRAITS[(G.roster.get(s.id) || {}).god]; return `<div class="pc p${i + 1}${s.id === G.me ? ' me' : ''}" style="--i:${[1, 0, 2][i]}">${pt ? `<img src="${pt}" alt="">` : ''}<span class="pn">${esc(s.name)}</span><div class="pb"><b>${i + 1}</b><small>${s.pts}</small></div></div>`; };
      html += '<div class="podium">' + [1, 0, 2].filter(i => top[i]).map(i => col(top[i], i)).join('') + '</div>';
      if (rest.length) html += '<div class="rest">' + rest.map((s, j) => `<span class="${s.id === G.me ? 'me' : ''}" style="--i:${j}"><b>${j + 4}</b>${esc(s.name)}<i>${s.pts}</i></span>`).join('') + '</div>';
    }
    $('endNames').innerHTML = html;
    // angka hadiah menghitung naik dengan bunyi tik kecil
    $('endNames').querySelectorAll('b[data-to]').forEach((b, j) => {
      const to = +b.dataset.to, t0 = performance.now() + 750 + j * 250;
      const step = now => { const k = Math.max(0, Math.min(1, (now - t0) / 700)); const v = Math.round(to * (1 - (1 - k) * (1 - k))); if (b.textContent !== String(v)) { b.textContent = v; if (k > 0 && k < 1 && v % 3 === 0) beep(1400 + k * 400, 0.025, 'sine', 0.02); } if (k < 1 && b.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    G.celebrate = m.final && m.winner ? G.ents.get(m.winner) : null;
    if (G.celebrate) { G.celebrate.vanT = 0; G.celebrate.model.visible = true; if (G.celebrate.label) G.celebrate.label.visible = true; cam.dist = 6; }
    $('end').classList.toggle('win', m.final ? m.winner === G.me : was && iq);
    $('end').classList.remove('hidden'); $('card').classList.add('hidden'); $('big').textContent = '';
    if (was && !m.final) (iq ? SFX.win : SFX.lose)();
    if (m.final) announce(m.winner === G.me ? 'Victory! You are the champion!' : 'Game over!');
    else if (was && iq && G.round && G.round.type === 'survival') { announce('Survived!'); confettiRain(30); }
    if (m.final && m.winner === G.me) { confettiRain(80); G.slowT = 1.1; }
    if (m.final && m.winner) {
      (m.winner === G.me ? SFX.win : SFX.lose)();
      const e = G.ents.get(m.winner);
      if (e) burst(e.pos, CONFETTI, 40, 10);
    }
  },
};

// ------------------------------------------------------------ ronde
// jarak LOD karakter: di luar LOD_LINE tanpa garis tepi/bayangan asli, di luar LOD_FAR badan poligon rendah
const LOD_NEAR = IS_TOUCH ? 11 : 16, LOD_LINE = IS_TOUCH ? 24 : 40, LOD_FAR = IS_TOUCH ? 30 : 55;
const LAND_T = 0.26;
// warna debu langkah/pendaratan tiap map (es kebiruan, abu lava, daun taman, dst.)
const DUST = { 0: [0xffffff, 0xf2efe6], 1: [0xb9a6ff, 0x7fe6ff], 2: [0xffffff, 0xf2e2b0], 3: [0xf2e6c4, 0xffffff], 4: [0x6a5048, 0xff9a4a], 5: [0x7d6aa8, 0x7dffc0],
  6: [0xd9f0a0, 0xfff6c0], 7: [0xa8d080, 0xc9a06a], 8: [0xe6f6ff, 0xbfe3ff], 9: [0xd8f0ff, 0xffffff], 10: [0xffe0f0, 0xffffff], 11: [0xc9d2e0, 0x9fb0e8] };
const dustCols = () => G.dust || DUST[0];
const shGeo = new THREE.PlaneGeometry(1.5, 1.5);
const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false, map: softTex(x => { const g = x.createRadialGradient(32, 32, 4, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }) });

const LBL_W = 1.9, LBL_H = 0.4275, LBL_Y = 2.26;
// label nama di atas kepala: huruf bulat kecil dengan garis tepi lembut; mahkota kecil untuk yang pernah menang
function makeLabel(text, mine, wins, col) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 72;
  const x = c.getContext('2d');
  x.font = '600 34px ' + FONT;
  x.textAlign = 'left'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  const dw = col ? 22 : 0, cw = (wins ? 34 : 0) + dw, tw = Math.min(300 - cw, x.measureText(text).width), x0 = 160 - (tw + cw) / 2;
  if (col) { x.beginPath(); x.arc(x0 + cw - 12, 37, 7.5, 0, 7); x.fillStyle = col; x.fill(); x.lineWidth = 4; x.strokeStyle = 'rgba(24,16,56,.9)'; x.stroke(); }
  if (wins) {
    x.beginPath(); x.moveTo(x0, 26); x.lineTo(x0 + 7, 34); x.lineTo(x0 + 13, 22); x.lineTo(x0 + 19, 34); x.lineTo(x0 + 26, 26); x.lineTo(x0 + 23, 46); x.lineTo(x0 + 3, 46); x.closePath();
    x.lineWidth = 5; x.strokeStyle = 'rgba(24,16,56,.9)'; x.stroke(); x.fillStyle = '#ffcf5a'; x.fill();
  }
  x.lineWidth = 6; x.strokeStyle = 'rgba(24,16,56,.9)'; x.strokeText(text, x0 + cw, 37, 300 - cw);
  x.fillStyle = mine ? '#ffd866' : '#ffffff'; x.fillText(text, x0 + cw, 37, 300 - cw);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
  s.scale.set(LBL_W, LBL_H, 1); s.renderOrder = 10;
  return s;
}

// stiker emoji di atas kepala
// mahkota kecil di atas pemain terdepan (balapan & final)
const leadCrown = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d');
  x.beginPath(); x.moveTo(6, 16); x.lineTo(18, 26); x.lineTo(32, 6); x.lineTo(46, 26); x.lineTo(58, 16); x.lineTo(53, 42); x.lineTo(11, 42); x.closePath();
  x.lineJoin = 'round'; x.lineWidth = 6; x.strokeStyle = '#2a1e4a'; x.stroke(); x.fillStyle = '#ffcf5a'; x.fill();
  x.fillStyle = '#ff5f8a'; x.beginPath(); x.arc(32, 32, 4, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, fog: false })); sp.scale.set(0.5, 0.375, 1); sp.renderOrder = 10; sp.visible = false; return sp;
})();
// bintang berputar di atas kepala saat terpental (satu tekstur dipakai bersama)
const starTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 28, a = -Math.PI / 2 + i * Math.PI / 5; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.closePath();
  x.fillStyle = '#ffe14d'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#2a1e4a'; x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function dizzy(e) {
  if (!e.stars) {
    e.stars = new THREE.Group(); e.stars.position.y = 2.0;
    for (let i = 0; i < 3; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthTest: false, fog: false })); sp.renderOrder = 9; sp.scale.setScalar(0.32); e.stars.add(sp); }
    e.model.add(e.stars);
  }
  e.dizzyT = 1.6;
}
function tickDizzy(e, dt, tt) {
  if (!e.stars) return;
  e.dizzyT = Math.max(0, (e.dizzyT || 0) - dt);
  e.stars.visible = e.dizzyT > 0 && e.model.visible;
  if (!e.stars.visible) return;
  const k = Math.min(1, e.dizzyT * 2.5);
  e.stars.children.forEach((sp, i) => { const a = tt * 6 + i * 2.094; sp.position.set(Math.cos(a) * 0.55, Math.sin(tt * 9 + i) * 0.06, Math.sin(a) * 0.55); sp.material.opacity = k; sp.material.rotation = tt * 4; });
}
// tulisan komik di titik tabrakan: POW! BAM! BONK! WHAM!
const POW_WORDS = ['POW!', 'BAM!', 'BONK!', 'WHAM!'], POW_COL = ['#ffe14d', '#ff8a3a', '#7fe6ff', '#ff6ad5'], powTex = [], pows = [];
function powTexture(i) {
  if (powTex[i]) return powTex[i];
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  // ledakan bergerigi di belakang tulisan
  x.beginPath(); for (let k = 0; k < 24; k++) { const r = k % 2 ? 44 : 62, a = k * Math.PI / 12; x.lineTo(128 + Math.cos(a) * r * 1.7, 64 + Math.sin(a) * r * 0.95); } x.closePath();
  x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 6; x.strokeStyle = '#2a1e4a'; x.stroke();
  x.font = '700 52px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.lineWidth = 10; x.strokeStyle = '#2a1e4a'; x.strokeText(POW_WORDS[i], 128, 68);
  x.fillStyle = POW_COL[i]; x.fillText(POW_WORDS[i], 128, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (powTex[i] = t);
}
function pow(pos) {
  if (pos.distanceToSquared(camera.position) > 30 * 30) return;
  let p = pows.find(q => q.life <= 0);
  if (!p) { if (pows.length >= 5) return; p = { s: new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false })), life: 0 }; p.s.renderOrder = 12; scene.add(p.s); pows.push(p); }
  p.s.material.map = powTexture((Math.random() * POW_WORDS.length) | 0); p.s.material.needsUpdate = true;
  p.s.material.rotation = (Math.random() - 0.5) * 0.5; p.life = 0.75; p.y = pos.y + 1.7; p.s.position.set(pos.x + (Math.random() - 0.5) * 0.6, p.y, pos.z); p.s.visible = true;
}
// kubah cahaya yang mengembang saat kekuatan area dipakai (petir, ombak, tipu daya)
const domeGeo = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), domes = [];
function areaDome(pos, color, r) {
  let d = domes.find(q => q.life <= 0);
  if (!d) { if (domes.length >= 4) return; d = { m: new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })), life: 0 }; scene.add(d.m); domes.push(d); }
  d.m.material.color.set(color); d.m.position.set(pos.x, pos.y + 0.05, pos.z); d.life = 0.55; d.r = r; d.m.visible = true;
}
function tickDomes(dt) {
  for (const d of domes) {
    if (d.life <= 0) continue;
    d.life -= dt;
    const k = 1 - Math.max(0, d.life) / 0.55, e = 1 - (1 - k) * (1 - k);
    d.m.scale.set(d.r * e, d.r * e * 0.7, d.r * e); d.m.material.opacity = 0.45 * (1 - k);
    if (d.life <= 0) d.m.visible = false;
  }
}
// suasana langit: bintang jatuh (map malam) dan kilat + guntur (Storm Summit)
const NIGHT_LV = new Set([1, 5, 11]), STORM_LV = 11;
const starStreak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: softTex(x => { const g = x.createLinearGradient(0, 32, 64, 32); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 26, 64, 12); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
starStreak.visible = false; starStreak.renderOrder = -1; scene.add(starStreak);
const _kv = new THREE.Vector3(), _sd = new THREE.Vector3(), _sp1 = new THREE.Vector3(), _sp2 = new THREE.Vector3();
const tt0 = () => performance.now() / 1000;
function tickSkyFx(dt) {
  const mood = G.phase === 'play' && G.round && !G.round.lobby ? $('vig').dataset.m : '';
  if (mood === 'ice' && (G.moodT = (G.moodT || 0) - dt) <= 0) {
    G.moodT = 0.12;
    if (mood === 'ice') { // napas beruap dari karakter dekat kamera
      const near = [...G.ents.values()].filter(e => e.active && !e.far && e.pos.distanceToSquared(camera.position) < 15 * 15);
      const e = near[(Math.random() * near.length) | 0];
      if (e && (tt0() - (e.breathAt || 0)) > 1.6) { e.breathAt = tt0(); burst(tmpV.set(e.pos.x + Math.sin(e.yaw) * 0.45, e.pos.y + 1.45, e.pos.z + Math.cos(e.yaw) * 0.45), [0xffffff, 0xe6f2ff], 3, 0.6, FX_BREATH); }
    }
  }
  const lv = G.phase === 'play' && G.round && !G.round.lobby ? (G.round.level ?? G.round.idx) : -1;
  // bintang jatuh: garis cahaya melintas jauh di langit
  if (NIGHT_LV.has(lv)) {
    if (starStreak.visible) {
      G.ssT -= dt; const k = 1 - G.ssT / 0.9;
      starStreak.position.addScaledVector(_sd, dt); starStreak.material.opacity = Math.sin(Math.min(1, k) * Math.PI);
      // ekor selalu di belakang arah gerak: sudut dihitung dari arah gerak di layar
      _sp1.copy(starStreak.position).project(camera); _sp2.copy(starStreak.position).addScaledVector(_sd, 0.1).project(camera);
      starStreak.lookAt(camera.position); starStreak.rotateZ(Math.atan2(_sp2.y - _sp1.y, (_sp2.x - _sp1.x) * camera.aspect));
      if (G.ssT <= 0) starStreak.visible = false;
    } else if ((G.ssWait = (G.ssWait ?? 3) - dt) <= 0) {
      G.ssWait = 4 + Math.random() * 6; G.ssT = 0.9;
      const a = cam.yaw + (Math.random() - 0.5) * 1.6;
      starStreak.position.set(camera.position.x + Math.sin(a) * 160, camera.position.y + 55 + Math.random() * 30, camera.position.z + Math.cos(a) * 160);
      _sd.set(Math.cos(a) * 90, -35, -Math.sin(a) * 90); starStreak.scale.set(28, 1.6, 1); starStreak.visible = true;
    }
  } else starStreak.visible = false;
  // badai: kilat menerangi layar lalu guntur menyusul
  if (lv === STORM_LV) {
    if ((G.boltWait = (G.boltWait ?? 5) - dt) <= 0) {
      G.boltWait = 7 + Math.random() * 6;
      const f = $('flashFx'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
      setTimeout(() => { noise(1.6, 0.11, 'lowpass', 260, 60); beep(55, 0.9, 'sine', 0.06, -20); }, 250 + Math.random() * 500);
    }
  }
}
// teks kecil melayang naik dari kepala karakter (mis. +1 apel)
const floats = [], floatTex = {};
function floatText(pos, text, col) {
  const key = text + col;
  if (!floatTex[key]) {
    const wide = text.length > 4, c = document.createElement('canvas'); c.width = wide ? 384 : 128; c.height = 64; const x = c.getContext('2d'); // teks panjang: kanvas lebar
    x.font = '700 44px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = 9; x.strokeStyle = '#2a1e4a'; x.strokeText(text, c.width / 2, 34); x.fillStyle = col; x.fillText(text, c.width / 2, 34);
    floatTex[key] = new THREE.CanvasTexture(c); floatTex[key].colorSpace = THREE.SRGBColorSpace;
  }
  let f = floats.find(q => q.life <= 0);
  if (!f) { if (floats.length >= 6) return; f = { s: new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false })), life: 0 }; f.s.renderOrder = 12; scene.add(f.s); floats.push(f); }
  f.s.material.map = floatTex[key]; f.s.material.needsUpdate = true; f.w = floatTex[key].image.width / 128; f.life = 1; f.y = pos.y + 2.6; f.s.position.set(pos.x, f.y, pos.z); f.s.visible = true;
}
function tickFloats(dt) {
  for (const f of floats) {
    if (f.life <= 0) continue;
    f.life -= dt; const age = 1 - f.life, q = Math.min(1, age / 0.2);
    f.s.scale.set(1.1 * q * (f.w || 1), 0.55 * q, 1); f.s.position.y = f.y + age * 1.2; f.s.material.opacity = Math.min(1, f.life / 0.3);
    if (f.life <= 0) f.s.visible = false;
  }
}
function tickPows(dt) {
  for (const p of pows) {
    if (p.life <= 0) continue;
    p.life -= dt;
    const age = 0.75 - p.life, q = Math.min(1, age / 0.16) - 1, pop = 1 + 2.7 * q * q * q + 1.7 * q * q;
    p.s.scale.set(2.0 * pop, 1.0 * pop, 1); p.s.position.y = p.y + age * 0.9; p.s.material.opacity = Math.min(1, p.life / 0.25);
    if (p.life <= 0) p.s.visible = false;
  }
}
// stiker emot: gambar orisinal di /assets/emotes/e0..e7.svg (pesta, menari, melambai, tertawa, marah, takut, jempol, suka)
const EMO_N = 8, emoTex = {}, emoImg = [];
// gerak badan untuk tiap stiker: sorak, menari, melambai, tertawa, marah, takut, jempol, suka
const EMO_ANIM = [5, 8, 9, 10, 11, 12, 14, 15];
for (let k = 0; k < EMO_N; k++) { const im = new Image(); im.onload = () => { if (emoTex[k]) drawEmo(k); }; im.src = `/assets/emotes/e${k}.svg`; emoImg[k] = im; }
function drawEmo(k) {
  const c = emoTex[k].image, x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,0.95)'; x.strokeStyle = '#2a1e4a'; x.lineWidth = 6;
  x.beginPath(); x.arc(64, 58, 50, 0, 7); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(50, 104); x.lineTo(64, 124); x.lineTo(78, 104); x.fill();
  if (emoImg[k].complete && emoImg[k].naturalWidth) x.drawImage(emoImg[k], 14, 8, 100, 100);
  emoTex[k].needsUpdate = true;
}
function showEmo(e, k) {
  const ch = k >= 0 && k < EMO_N ? k | 0 : 0;
  if (!emoTex[ch]) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    emoTex[ch] = new THREE.CanvasTexture(c); emoTex[ch].colorSpace = THREE.SRGBColorSpace; drawEmo(ch);
  }
  if (!e.bubble) { e.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false })); e.bubble.renderOrder = 11; e.model.add(e.bubble); }
  e.bubble.material.map = emoTex[ch]; e.bubble.material.needsUpdate = true; emoTex[ch].needsUpdate = true;
  e.bubble.visible = true; e.bubbleT = 2.2; e.reactT = 1.8; e.reactK = ch;
  // suara emot: bunyi pendamping + ucapan dengan suara dewanya; makin jauh makin pelan
  const mine = e.id === G.me, vol = mine ? 1 : Math.pow(Math.max(0, 1 - e.pos.distanceTo(cam.look) / 26), 1.3) * 0.8;
  if (vol > 0.05) { EMO_SFX[ch](vol); vox(EMO_VOX[ch], e.god, vol); }
}

// how: 'up' = lolos (terangkat sambil berputar jadi cahaya), 'pop' = gugur (mengecil dengan kepulan); kosong = langsung hilang
function deactivate(e, how) {
  e.active = false; e.shadow.visible = false;
  if (how && e.model.visible) { e.vanT = VAN_T; e.vanHow = how; if (e.label) e.label.visible = false; if (e.bubble) e.bubble.visible = false; }
  else { e.model.visible = false; e.vanT = 0; }
}
const VAN_T = 0.45;

function clearRound() {
  if (leadCrown.parent) leadCrown.parent.remove(leadCrown); leadCrown.visible = false;
  for (const e of G.ents.values()) { scene.remove(e.model, e.shadow); disposeTree(e.model); }
  G.ents.clear();
  if (G.L) { scene.remove(G.L.group); disposeTree(G.L.group); G.L = null; }
  G.round = null; G.roundOver = false; G.outcome = null; G.celebrate = null; G.cine = false; document.body.classList.remove('cine'); cam.dist = 9.5; guide.visible = false; meRing.visible = false; crownBeam.visible = false; spot.visible = false; spotRing.visible = false; $('speed').classList.remove('on'); $('timer').classList.remove('low'); $('vig').classList.remove('low'); music.fast = false; music.final = false; G.fallK = G.fallShown = 0; $('fallFx').style.opacity = 0; cam.zoom = 1;
  $('end').classList.add('hidden'); $('card').classList.add('hidden'); $('big').textContent = '';
}

function startRound(m) {
  cut(); clearRound();
  preview.visible = false;
  if (m.players) G.roster = new Map(m.players.map(p => [p.id, p]));
  if (m.hostId) G.hostId = m.hostId;
  G.serverPhase = 'playing';
  const lv = m.level ?? m.idx;
  const L = G.L = buildLevel(lv, m.seed);
  prepLevel(L);
  const n = m.contenders.length;
  m.contenders.forEach((id, i) => addEnt(id, i, n));
  G.round = m; G.roundOver = false; G.fin = 0; G.alive = n; G.lastCount = 99; G.apples = 0; G.countKey = null; G.hintI = 0; G.abWasCd = false; G.ledTip = false; G.rstat = { falls: 0, hits: 0, dives: 0 };
  $('vig').dataset.m = { 4: 'lava', 8: 'ice', 5: 'eerie' }[lv] || '';
  duckMusic(false);
  music.final = m.type === 'final'; music.fast = false; G.dust = DUST[lv]; G.fallK = 0; G.annLeft = 0;
  music.setMood(lv); setAmbient(lv === 9 ? 3 : lv); setLights(lv === 9 ? 3 : lv); ambience(AMB_SOUND[lv]);
  G.phase = 'play';
  cam.yaw = 0; cam.pitch = 0.42; cam.init = false;
  startRoundUI(m, lv, n);
}

// suasana cahaya tiap map: [warna matahari, kuat, langit, pantulan tanah, kuat]
const LIGHTS = {
  def: [0xfff4dc, 2.3, 0xffffff, 0x9a8fc0, 1.55],
  1: [0xb9a6ff, 1.7, 0x7a6cff, 0x2a0a4a, 1.35], 2: [0xffd9a0, 2.6, 0xffe6c4, 0xb08a70, 1.5], 3: [0xffffff, 2.4, 0xcfffff, 0x3a8aa0, 1.6],
  4: [0xffa060, 2.1, 0xff8a50, 0x4a0d08, 1.3], 5: [0x8affc8, 1.6, 0x7a5cd0, 0x0e3a2a, 1.3], 7: [0xfff2c0, 2.3, 0xd9ffe0, 0x4a7a3a, 1.55], 8: [0xeaf6ff, 2.3, 0xdff1ff, 0x7fa8c8, 1.75], 10: [0xffb890, 2.4, 0xffc9d8, 0x6a4a8a, 1.45], 11: [0xc9d8ff, 2.0, 0x9fb0e8, 0x2a3050, 1.4],
};
function setLights(key) {
  const l = LIGHTS[key] || LIGHTS.def;
  // warna dilunakkan ke putih supaya warna asli tiap dewa tetap terbaca
  const W = new THREE.Color(0xffffff);
  sun.color.set(l[0]).lerp(W, 0.5); sun.intensity = l[1] * 1.12; hemi.color.set(l[2]).lerp(W, 0.5); hemi.groundColor.set(l[3]).lerp(new THREE.Color(0x9a8fc0), 0.4); hemi.intensity = Math.max(l[4], 1.5) * 0.86;
}
function prepLevel(L) {
  L.group.traverse(o => {
    if (!o.isMesh || o.material.transparent || o.material.isMeshBasicMaterial) return;
    o.receiveShadow = true;
    // hanya benda di sekitar lintasan yang membuat bayangan (hiasan jauh tidak perlu)
    o.getWorldPosition(tmpV);
    o.castShadow = Math.abs(tmpV.x) < 20 && tmpV.y > -4 && tmpV.y < 40;
  });
  try { optimizeLevel(L); } catch (e) { report('optimize gagal ' + (e.stack || e)); }
  quality.wait = 2.5; quality.acc = quality.n = 0;
  scene.add(L.group);
  setSky(L.sky, L.fog, L.skyFx); setCloudFloor(L.cloudFloor);
}

function addEnt(id, i, n) {
  {
    const L = G.L, info = G.roster.get(id);
    if (!info) return;
    const e = newEnt(id);
    e.name = info.name; e.bot = !!info.bot; e.god = info.god;
    e.local = id === G.me; // bot disimulasikan server
    e.model = makeGod(GODS.find(g => g.id === info.god) || GODS[0], info.skin);
    const label = makeLabel(info.name, id === G.me, info.wins, godColor(info.god));
    label.position.y = LBL_Y; e.model.add(label); e.label = label;
    e.shadow = new THREE.Mesh(shGeo, shMat); e.shadow.rotation.x = -Math.PI / 2;
    scene.add(e.model, e.shadow);
    e.net = new THREE.Vector3(); e.netVel = new THREE.Vector3(); e.netYaw = 0; e.got = false; e.trail = info.trail;
    spawnAt(e, L, i, n);
    e.net.copy(e.pos);
    G.ents.set(id, e);
  }
}

// lobby yang bisa dimainkan: semua pemain berlarian di pulau lobby
function enterLobbyScene() {
  cut(); clearRound();
  preview.visible = false;
  G.L = buildPlaza();
  prepLevel(G.L);
  G.round = { lobby: true, type: 'lobby', startAt: serverNow() - 60000, contenders: [], limit: 0, Q: 0, idx: -1 };
  G.lastCount = 0; G.roundOver = false;
  cam.yaw = 0; cam.pitch = 0.42; cam.init = false;
  duckMusic(false);
  music.setMood(-1); setAmbient('plaza'); setLights('def'); ambience('wind'); G.dust = DUST[0]; $('vig').dataset.m = '';
  syncLobbyEnts();
  setupAbHud((G.roster.get(G.me) || {}).god);
  $('touch').classList.toggle('hidden', !IS_TOUCH);
}
function syncLobbyEnts() {
  if (!G.round || !G.round.lobby) return;
  for (const e of [...G.ents.values()]) if (!G.roster.has(e.id)) { burst(e.pos, [0xffffff, 0xd9d4ee], 12, 3.5, FX_DUST); ring(e.pos, 0xffffff, 1.6); scene.remove(e.model, e.shadow); G.ents.delete(e.id); }
  const humans = [...G.roster.values()].filter(p => !p.bot), had = G.ents.size > 0;
  humans.forEach((p, i) => {
    if (G.ents.has(p.id)) return;
    addEnt(p.id, i, Math.max(humans.length, 6));
    const e = G.ents.get(p.id);
    if (had && e && p.id !== G.me) { e.spawnPop = 0.4; ring(e.pos, 0xffe07a, 1.8); burst(e.pos, [0xffe07a, 0xffffff], 12, 4, FX_RISE); vox('hi', e.god, 0.7); feed(`${p.name || 'Pemain'} bergabung`, 'user', p.id); }
  });
  G.round.contenders = humans.map(p => p.id);
}

const cdTxtPc = me => me.abCd > 0 ? String(Math.ceil(me.abCd)) : '';
function startRoundUI(m, lv, n) {
  const info = LEVELS[lv];
  if (m.type === 'final') { // drum roll yang makin rapat lalu dentum + simbal
    let tt0 = 300; for (let i = 0; i < 22; i++) { const gap = 150 - i * 5; setTimeout(() => noise(0.06, 0.02 + i * 0.002, 'bandpass', 220, 140), tt0); tt0 += gap; }
    setTimeout(() => { beep(70, 0.5, 'sine', 0.12, -30); noise(1.2, 0.05, 'highpass', 5000); }, tt0);
  }
  setupAbHud((G.roster.get(G.me) || {}).god);
  $('rname').innerHTML = `Ronde <b>${m.idx + 1}/${m.total}</b><span class="mn">· ${esc(info.name)}</span>`;
  $('goal').textContent = info.goal;
  const tIco = { race: 'flag', survival: 'skull', collect: 'star', final: 'crown' }[m.type] || 'flag';
  $('cardSub').innerHTML = `${ico(tIco)} Ronde ${m.idx + 1} · ${esc(info.sub)}`;
  $('cardDots').innerHTML = m.total > 1 ? Array.from({ length: m.total }, (_, i) => `<i class="${i < m.idx ? 'done' : i === m.idx ? 'now' : ''}"></i>`).join('') : '';
  $('cardName').textContent = info.name;
  $('cardGoal').innerHTML = esc(info.goal + (m.type === 'final' ? '' : m.type === 'race' || m.type === 'collect' ? ` (${m.Q} tercepat lolos)` : n > m.Q ? ` (${m.Q} terakhir lolos)` : ''))
    + (save.best[lv] ? `<span class="rec">Rekormu ${fmtT(save.best[lv])}</span>` : '');
  $('card').classList.remove('hidden', 'bye');
  $('help').classList.toggle('hidden', IS_TOUCH);
  $('touch').classList.toggle('hidden', !IS_TOUCH);
  show('hud');
}

// transisi antaradegan: layar menggelap sekejap lalu memudar, supaya pergantian map tidak terasa mendadak
function hideCard() { const c = $('card'); if (c.classList.contains('hidden') || c.classList.contains('bye')) return; c.classList.add('bye'); setTimeout(() => { c.classList.add('hidden'); c.classList.remove('bye'); }, 220); }
// kilau tepi layar sekejap; c = "r,g,b"
function glow(c) { const el = $('glow'); el.style.setProperty('--gc', c); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
function cut() { const f = $('fade'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on'))); }
// banner emas di atas layar (naik level, rekor baru)
function banner(ic, text, notes) {
  const el = $('lvlUp'); el.innerHTML = `<b>${ico(ic)}${esc(text)}</b>`; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  (notes || []).forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', 0.07), 500 + i * 90));
}
let tipTimer = 0;
function tipShow(text, ic) {
  const el = $('tip'); el.innerHTML = (ic ? ico(ic) : '') + '<span>' + esc(text) + '</span>';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(tipTimer); tipTimer = setTimeout(() => el.classList.remove('on'), 4200);
}
function confettiRain(n = 44) {
  const box = $('confetti'), cols = ['#ff4d6d', '#ffe14d', '#5fe07a', '#4dc3ff', '#c05cff', '#ffffff', '#ff9d2e'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${Math.random() * 0.6}s;animation-duration:${1.8 + Math.random() * 1.3}s;--x:${(Math.random() - 0.5) * 120}px;--r:${(Math.random() - 0.5) * 1440}deg;width:${6 + Math.random() * 5}px${i % 3 === 0 ? ';border-radius:50%;height:8px' : i % 5 === 1 ? ';height:18px;width:4px' : ''}`;
    box.appendChild(p);
    setTimeout(() => p.remove(), 3600);
  }
}
function hurt() { const el = $('hurt'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
// who (opsional): id pemain yang dibicarakan -> potret dewanya ditampilkan, baris tentang dirimu bertepi emas
function feed(text, ic, who) {
  const el = $('feed'), d = document.createElement('div'), pt = who !== undefined && PORTRAITS[(G.roster.get(who) || G.ents.get(who) || {}).god];
  if (who !== undefined && who === G.me) d.className = 'me';
  d.innerHTML = (pt ? `<img src="${pt}" alt="">` : '') + (ic ? ico(ic) : '') + '<span>' + esc(text) + '</span>'; el.appendChild(d);
  while (el.children.length > 4) el.firstChild.remove();
  setTimeout(() => d.remove(), 4800);
}
let bigTimer = 0;
function flash(text, ms) {
  const el = $('big'), kind = /^\d$/.test(text) ? 'pop' : text === 'MULAI!' ? 'go' : 'sm';
  el.textContent = text;
  el.className = ''; void el.offsetWidth; el.className = kind + (kind === 'pop' ? ' n' + text : '');
  el.style.animationDuration = kind === 'sm' ? (ms || 1600) / 1000 + 's' : '';
  if (kind !== 'sm') { const r = $('ringFx'); r.className = ''; void r.offsetWidth; r.className = kind === 'go' ? 'on go' : 'on'; } // gelombang cincin di tiap hitungan
  clearTimeout(bigTimer);
  if (ms) bigTimer = setTimeout(() => { $('big').textContent = ''; }, ms);
}

// ------------------------------------------------------------ input
const keys = {}, joy = { x: 0, y: 0 };
let jumpBuf = 0, diveQ = false, abQ = false, emoteQ = false, specIdx = 0;
const cam = { zoom: 1, yaw: 0, pitch: 0.42, dist: 9.5, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, shake: 0, dip: 0, lastDrag: 0, fov: 60 };
// panah penunjuk apel terdekat
// cincin emas di kaki pemain sendiri, supaya mudah menemukan diri di tengah keramaian
// lampu sorot juara: kerucut cahaya keemasan dari atas + lingkaran terang di kakinya
const spotTex = softTex(x => { const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0.9)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 2.3, 12.4, 24, 1, true), new THREE.MeshBasicMaterial({ map: spotTex, color: 0xffcf70, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
spot.visible = false; spot.renderOrder = 4; scene.add(spot);
const beamTex = softTex(x => { const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,0.6)'); g.addColorStop(0.88, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
const crownBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.75, 36, 16, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffd866, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
crownBeam.visible = false; crownBeam.renderOrder = 4; scene.add(crownBeam);
const spotRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, color: 0xffd866, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
spotRing.rotation.x = -Math.PI / 2; spotRing.visible = false; scene.add(spotRing);
const meRing = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), new THREE.MeshBasicMaterial({ map: ringTex, color: 0xffd866, transparent: true, opacity: 0.75, depthWrite: false }));
meRing.rotation.x = -Math.PI / 2; meRing.visible = false; meRing.renderOrder = 1; scene.add(meRing);
const guide = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 10), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
guide.visible = false; scene.add(guide);

window.addEventListener('keydown', e => {
  if (G.phase !== 'play' && G.phase !== 'lobby') return;
  keys[e.code] = true;
  if (e.code === 'Space') { jumpBuf = 0.15; e.preventDefault(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE' || e.code === 'KeyF') diveQ = true;
  if (e.code === 'KeyQ') abQ = true;
  if (e.code === 'KeyR') emoteQ = 5;
  if (e.code === 'Digit1' && tray.classList.contains('hidden')) emoteQ = 8;
  if (e.code === 'Digit2' && tray.classList.contains('hidden')) emoteQ = 9;
  if (/^Digit[3-6]$/.test(e.code) && tray.classList.contains('hidden')) sendEmo(+e.code.slice(5));
  if (e.code === 'KeyT') openTray(tray.classList.contains('hidden'));
  if (!tray.classList.contains('hidden') && /^Digit[1-8]$/.test(e.code)) { sendEmo(+e.code.slice(5) - 1); return; }
  if (e.code === 'Escape') openTray(false);
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let dragId = null, dragX = 0, dragY = 0, joyId = null;
const joyEl = $('joy'), knob = $('knob');
canvas.addEventListener('pointerdown', e => {
  // HP: sentuh sisi kiri layar -> joystick muncul di bawah jari
  const p = P(e);
  if (IS_TOUCH && e.pointerType !== 'mouse' && joyId === null && p.x < lay().w * 0.45 && (G.phase === 'play' || G.phase === 'lobby')) {
    joyEl.classList.add('dyn'); joyEl.style.left = p.x + 'px'; joyEl.style.top = p.y + 'px';
    joyId = e.pointerId; moveJoy(e); return;
  }
  if (dragId === null) { dragId = e.pointerId; dragX = p.x; dragY = p.y; } if (e.button === 2) abQ = true; specIdx++; });
window.addEventListener('pointermove', e => {
  if (e.pointerId === joyId && joyEl.classList.contains('dyn')) return moveJoy(e);
  if (e.pointerId !== dragId) return;
  cam.lastDrag = performance.now();
  const p = P(e);
  if (G.phase === 'menu') { const d = (p.x - dragX) * 0.012; G.pvYaw = (G.pvYaw || 0) + d; G.pvVel = d * 60; dragX = p.x; dragY = p.y; return; }
  cam.yaw -= (p.x - dragX) * 0.006 * opts.sens;
  cam.pitch = Math.max(0.08, Math.min(1.2, cam.pitch + (p.y - dragY) * 0.004 * opts.sens * (opts.invert ? -1 : 1)));
  dragX = p.x; dragY = p.y;
});
const endDrag = e => { if (e.pointerId === dragId) dragId = null; if (e.pointerId === joyId && joyEl.classList.contains('dyn')) { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; joyEl.classList.remove('act'); joyEl.classList.remove('dyn'); joyEl.style.left = joyEl.style.top = ''; } };
window.addEventListener('pointerup', endDrag);
// tampilan diputar: geser daftar menu & pengaturan sendiri (arah geser bawaan browser ikut layar fisik, bukan tampilan)
{
  let sc = null, sy = 0, st = 0, moved = false;
  document.addEventListener('pointerdown', e => {
    if (!isRot()) return;
    const el = e.target.closest && e.target.closest('.pbody, #settings');
    if (!el || e.target.closest('input[type=range]')) return;
    sc = el; sy = P(e).y; st = el.scrollTop; moved = false;
  }, true);
  document.addEventListener('pointermove', e => {
    if (!sc) return;
    const dy = P(e).y - sy;
    if (Math.abs(dy) > 6) moved = true;
    if (moved) sc.scrollTop = st - dy;
  }, true);
  const stop = () => { if (sc && moved) { const block = ev => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', block, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', block, true), 60); } sc = null; };
  document.addEventListener('pointerup', stop, true); document.addEventListener('pointercancel', () => { sc = null; }, true);
}
// sentuhan pertama di HP: layar penuh dan kunci mendatar (Android/Chrome; iPhone tidak mendukung, jadi game diputar sendiri)
if (IS_TOUCH && window.matchMedia('(pointer:coarse)').matches) {
  const fit = () => {
    const el = document.documentElement, fs = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fs || document.fullscreenElement || document.webkitFullscreenElement) return;
    try {
      const pr = fs.call(el, { navigationUI: 'hide' });
      const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch { /* */ } };
      if (pr && pr.then) pr.then(lock).catch(() => {}); else lock();
    } catch { /* */ }
  };
  window.addEventListener('pointerup', fit, { once: true });
}
window.addEventListener('pointercancel', endDrag);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

function moveJoy(e) {
  // pusat joystick dihitung di layar lalu diubah ke koordinat tampilan game (berlaku juga saat diputar)
  const r = joyEl.getBoundingClientRect(), c = P({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }), p = P(e);
  let x = (p.x - c.x) / (r.width / 2), y = (p.y - c.y) / (r.height / 2);
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  joy.x = x; joy.y = -y;
  knob.style.transform = `translate(${x * 40}px,${y * 40}px)`; joyEl.classList.add('act'); joyEl.classList.toggle('max', l > 0.95);
  joyEl.style.setProperty('--a', Math.atan2(x, -y) * 57.3 + 'deg'); joyEl.style.setProperty('--m', Math.min(1, Math.hypot(x, y) * 1.4));
}
joyEl.addEventListener('pointerdown', e => { joyId = e.pointerId; try { joyEl.setPointerCapture(e.pointerId); } catch { /* */ } moveJoy(e); e.preventDefault(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = e => { if (e.pointerId === joyId) { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; joyEl.classList.remove('act', 'max'); } };
joyEl.addEventListener('pointerup', endJoy);
joyEl.addEventListener('pointercancel', endJoy);
$('btnJump').addEventListener('pointerdown', e => { jumpBuf = 0.15; buzz(8); e.preventDefault(); });
$('btnDive').addEventListener('pointerdown', e => { diveQ = true; buzz(12); e.preventDefault(); });
$('btnAb').addEventListener('pointerdown', e => { abQ = true; e.preventDefault(); });
let emoteCycle = 0;
$('btnEmote').addEventListener('pointerdown', e => { emoteQ = [5, 8, 9][emoteCycle++ % 3]; e.preventDefault(); });
let emoCycle = 0;
// baki stiker: 8 gambar; HP lewat tombol stiker, PC lewat tombol T lalu klik atau angka 1-8
const tray = $('emoTray');
tray.innerHTML = Array.from({ length: 8 }, (_, k) => `<button data-k="${k}" aria-label="Stiker ${k + 1}"><img src="/assets/emotes/e${k}.svg" alt=""><small>${k + 1}</small></button>`).join('');
let trayTimer = 0, emoSentAt = 0;
function openTray(on) {
  if (on === tray.classList.contains('hidden')) (on ? sfxOpen : sfxClose)();
  tray.classList.toggle('hidden', !on); clearTimeout(trayTimer);
  if (on) trayTimer = setTimeout(() => tray.classList.add('hidden'), 5000);
}
function sendEmo(k) {
  const now = performance.now(); if (now - emoSentAt < 850) return; // server juga membatasi; ini supaya tombol tidak terasa mati
  emoSentAt = now; send({ t: 'emo', k }); openTray(false);
  for (const b of tray.children) b.classList.toggle('last', +b.dataset.k === k);
}
tray.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b) { sendEmo(+b.dataset.k); e.preventDefault(); e.stopPropagation(); } });
$('btnEmo').addEventListener('pointerdown', e => { openTray(tray.classList.contains('hidden')); e.preventDefault(); });

const inp = { x: 0, z: 0, jump: false, dive: false };
const NOINP = { x: 0, z: 0, jump: false, dive: false };
$('specPrev').onclick = () => { specIdx--; };
$('specNext').onclick = () => { specIdx++; };
// gamepad: stik kiri gerak, stik kanan kamera, A lompat, X/B terjang, Y kekuatan, LB sorak, RB stiker
const pad = { x: 0, y: 0, prev: [] };
function pollPad(dt) {
  pad.x = pad.y = 0;
  if (!navigator.getGamepads) return;
  let gp = null;
  try { for (const g of navigator.getGamepads()) if (g && g.connected) { gp = g; break; } } catch { return; }
  if (!gp) return;
  const dz = v => (Math.abs(v) < 0.18 ? 0 : v), ax = gp.axes, down = i => !!(gp.buttons[i] && gp.buttons[i].pressed), hit = i => down(i) && !pad.prev[i];
  pad.x = dz(ax[0] || 0) + (down(15) ? 1 : 0) - (down(14) ? 1 : 0); pad.y = -dz(ax[1] || 0) + (down(12) ? 1 : 0) - (down(13) ? 1 : 0);
  const rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
  if (rx || ry) { cam.lastDrag = performance.now(); cam.yaw -= rx * 2.6 * dt * opts.sens; cam.pitch = Math.max(0.08, Math.min(1.2, cam.pitch + ry * 1.6 * dt * opts.sens * (opts.invert ? -1 : 1))); }
  if (hit(0)) jumpBuf = 0.15; else if (down(0)) jumpBuf = Math.max(jumpBuf, 0.05);
  if (hit(2) || hit(1) || hit(7)) diveQ = true;
  if (hit(3) || hit(6)) abQ = true;
  if (hit(4)) emoteQ = [5, 8, 9][emoteCycle++ % 3];
  if (hit(5)) sendEmo(3 + (emoCycle++ % 5));
  for (let i = 0; i < 16; i++) pad.prev[i] = down(i);
}
function readInput() {
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x + pad.x;
  let iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joy.y + pad.y;
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
  pollPad(dt);

  for (const e of list) {
    if (!e.active) {
      if (e.vanT > 0 && e !== G.celebrate) {
        e.vanT -= dt;
        const k = Math.max(0, e.vanT / VAN_T), m = e.model;
        if (e.vanHow === 'up') { m.position.y += dt * 8 * (1 - k); m.rotation.y += dt * 16; m.scale.set(k, 1 + (1 - k) * 0.9, k); if (frameCount % 2 === 0) burst(m.position, [0xffe07a, 0xffffff], 1, 1.6, FX_RISE); }
        else m.scale.setScalar(k * (1 + (1 - k) * 0.5));
        if (e.vanT <= 0) m.visible = false;
      }
      continue;
    }
    if (e.local) {
      const mine = e.id === G.me;
      const i = !playing ? NOINP : readInput();
      if (playing && e.abCd <= 0 && abQ && L.survival && t < 8) { tipShow('Kekuatan aktif setelah 8 detik', 'bolt'); const sl = $('abSlot'); sl.classList.remove('no'); void sl.offsetWidth; sl.classList.add('no'); }
      else if (playing && e.abCd <= 0 && abQ) {
        const a = ABILITIES[e.god] || ABILITIES.zeus;
        if (a.self) castSelf(e); else e.abCd = AB_CD;
        send({ t: 'ab', id: e.id });
        if (mine) { quest('ab'); abCastFx(e.god); G.selfAbT = performance.now(); }
      }
      if (mine) abQ = false;
      stepEnt(e, i, dt, L, t);
      if (e.cp > (e.cpSeen || 0)) { e.cpSeen = e.cp; flash('CHECKPOINT!', 900); glow('255,214,110'); announce('Checkpoint!'); quest('cp'); beep(660, 0.12, 'triangle', 0.08, 330); setTimeout(() => beep(990, 0.14, 'triangle', 0.06, 200), 90); burst(e.pos, CONFETTI, 12, 6); ring(e.pos, 0xffe07a, 3); burst(e.pos, [0xffe07a, 0xffffff], 10, 4, FX_RISE); }
      if (e.speedT > 0 && e.grounded) burst(e.pos, [0x7fe6ff, 0xffffff], 1, 1.5, FX_GLOW);
      if (e.anim === 1 && (e.stepAcc = (e.stepAcc || 0) + dt * Math.hypot(e.vel.x, e.vel.z)) > 1.7) { e.stepAcc = 0; SFX.step(); }
      if (emoteQ) { e.emoteT = emoteQ === 5 ? 1.6 : 2.6; e.emoteK = emoteQ === true ? 5 : emoteQ; if (mine) send({ t: 'emo', k: { 8: 1, 9: 2 }[emoteQ] || 0 }); emoteQ = false; }
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
        if (e.fx === 'jump') { if (mine) { SFX.jump(VOX_P[e.god] || 1); jumpBuf = 0; } burst(e.pos, [0xffffff], 4, 2.5); e.sq = 1.28; }
        else if (e.fx === 'land') { e.sq = 0.74; e.landT = LAND_T; burst(e.pos, dustCols(), 6, 2.6, FX_DUST); ring(e.pos, 0xffffff, 1.3); if (mine) { SFX.land(); cam.dip = 0.25; if (e.ax && e.ax.vy < -14) { vox('uf', e.god, 0.8); beep(80, 0.18, 'sine', 0.09, -30); cam.shake = Math.max(cam.shake, 0.2); buzz(20); } } }
        else if (e.fx === 'hit') { e.flashT = 0.18; if (mine) { if (G.rstat) G.rstat.hits++; SFX.hit(); cam.shake = 0.45; buzz(60); hurt(); G.hitStop = 0.07; } burst(e.pos, [0xffe04a, 0xffffff, 0xff9d2e], 12, 7); burst(e.pos, [0xfff2b0, 0xffffff], 8, 9, FX_SPARK); ring(e.pos, 0xffe07a, 2); }
        else if (e.fx === 'dive' && mine) { SFX.dive(); quest('dive'); if (G.rstat) G.rstat.dives++; }
        else if (e.fx === 'boxSpeed' || e.fx === 'boxShield') { const sh = e.fx === 'boxShield', col = sh ? 0xb9a6ff : 0x7fe6ff; ring(e.pos, col, 2.4); burst(e.pos, [col, 0xffffff], 16, 6, FX_RISE); if (sh) { e.auraT = 3.5; e.auraColor = col; } if (mine) { glow(sh ? '185,166,255' : '120,220,255'); beep(700, 0.25, 'triangle', 0.09, 500); feed(sh ? 'Perisai 3,5 detik!' : 'Lari kencang 3,5 detik!', sh ? 'shield' : 'wind'); } }
        else if (e.fx === 'block') { ring(e.pos, 0xb9a6ff, 1.6); if (mine) beep(900, 0.08, 'sine', 0.06); }
        else if (e.fx === 'respawn') { e.spawnPop = 0.4; e.blinkT = 1.1; if (mine) { if (G.rstat) G.rstat.falls++; SFX.respawn(); glow('235,245,255'); } burst(e.pos, [0x9ff0ff, 0xffffff], 14, 3, FX_RISE); ring(e.pos, 0x9ff0ff, 2.2); bolts(e.pos, 0.2, 1, 0x9ff0ff); }
        e.fx = null;
      }
    } else {
      const k = 1 - Math.exp(-16 * dt), age = Math.min(0.12, performance.now() / 1000 - (e.netT || 0));
      if (e.anim === 1 && e.ax) { const d2 = e.pos.distanceToSquared(camera.position); if (d2 < 14 * 14 && (e.stepAcc = (e.stepAcc || 0) + dt * e.ax.speed) > 1.9) { e.stepAcc = 0; SFX.step(0.5 * (1 - Math.sqrt(d2) / 14)); } }
      if (e.netVel) e.pos.lerp(tmpV.copy(e.net).addScaledVector(e.netVel, age), k); else e.pos.lerp(e.net, k);
      e.yaw = lerpAngle(e.yaw, e.netYaw, k);
    }
    if (L.seaY !== undefined) {
      const wet = e.pos.y < L.seaY + 0.4;
      if (wet && !e.wet) { e.dripT = 2.2; burst(new THREE.Vector3(e.pos.x, L.seaY, e.pos.z), [L.seaColor, 0xffffff, L.seaColor], 22, 9); ring(new THREE.Vector3(e.pos.x, L.seaY, e.pos.z), 0xffffff, 3); if (e.id === G.me) SFX.splash(); }
      e.wet = wet;
    }
    if (e.dripT > 0 && !e.wet) { e.dripT -= dt; if ((e.dripA = (e.dripA || 0) + dt) > 0.12 && !e.far) { e.dripA = 0; burst(tmpV.set(e.pos.x + (Math.random() - 0.5) * 0.5, e.pos.y + 0.6, e.pos.z + (Math.random() - 0.5) * 0.5), [L.seaColor || 0x7fd0ff, 0xd8f4ff], 1, 0.3, FX_DUST); } } // basah: air menetes sebentar
    e.model.position.copy(e.pos);
    e.model.rotation.y = e.yaw;
    // remote: tebak lompat/mendarat dari perubahan animasi
    if (!e.local && e.anim !== e.prevAnim) { if (e.anim === 2) { e.sq = 1.25; if (!e.far) burst(e.pos, [0xffffff], 3, 2.2); } else if (e.prevAnim === 2) { e.sq = 0.78; e.landT = LAND_T; if (!e.far) { burst(e.pos, dustCols(), 4, 2.2, FX_DUST); ring(e.pos, 0xffffff, 1.1); } } if (e.anim === 4) { e.flashT = 0.18; burst(e.pos, [0xffe04a, 0xffffff, 0xff9d2e], 10, 6); const mm = G.ents.get(G.me); if (mm && mm.active && mm.pos.distanceToSquared(e.pos) < 36) cam.shake = Math.max(cam.shake, 0.12); } }
    // kilat putih sesaat ketika terpental
    if (e.flashT > 0 || e.flashOn) { e.flashT = (e.flashT || 0) - dt; const on = e.flashT > 0; if (on !== e.flashOn) { e.flashOn = on; e.model.traverse(n => { if (n.isSkinnedMesh && n.material.emissive) n.material.emissive.setScalar(on ? 0.55 : 0); }); } }
    if (e.anim === 4 && e.prevAnim !== 4 && e.id !== G.me) { const mm = G.ents.get(G.me); if (mm && mm.active && mm.anim === 3 && mm.pos.distanceToSquared(e.pos) < 4) { floatText(e.pos, 'Kena!', '#ffe14d'); buzz(35); beep(1320, 0.08, 'square', 0.04, 400); G.hitStop = 0.05; if (G.rstat) G.rstat.bonks = (G.rstat.bonks || 0) + 1; } }
    if (e.anim === 4 && e.prevAnim !== 4 && tt - (e.voxAt || -9) > 0.9) { e.voxAt = tt; vox(['ow', 'aw', 'ah'][(Math.random() * 3) | 0], e.god, e.id === G.me ? 1 : Math.max(0, 1 - e.pos.distanceTo(camera.position) / 22) * 0.7); }
    if (e.anim === 4 && e.prevAnim !== 4) { dizzy(e); if (tt - (e.powAt || -9) > 1.2) { e.powAt = tt; pow(e.pos); } }
    if (e.prevAnim === 3 && e.anim !== 3 && e.anim !== 4 && !e.far) burst(e.pos, dustCols(), 5, 2.4, FX_DUST);
    tickDizzy(e, dt, tt);
    e.prevAnim = e.anim;
    if (e.bubbleT > 0) {
      e.bubbleT -= dt;
      const age = 2.2 - e.bubbleT, q = Math.min(1, age / 0.28) - 1, pop = 1 + 2.7 * q * q * q + 1.7 * q * q; // membal (ease-out-back)
      e.bubble.scale.setScalar(1.25 * Math.max(0.05, pop));
      e.bubble.material.rotation = Math.sin(age * 11) * 0.16 * Math.exp(-age * 2.2);
      e.bubble.material.opacity = Math.min(1, e.bubbleT / 0.3);
      e.bubble.position.y = 3.3 + age * 0.12 + Math.sin(tt * 5) * 0.05; e.bubble.visible = e.bubbleT > 0;
    }
    if (e.auraT > 0) {
      e.auraT -= dt;
      if (!e.aura) { e.aura = makeAura(); e.aura.position.y = 0.9; e.model.add(e.aura); }
      e.aura.material.uniforms.uCol.value.set(e.auraColor); e.aura.material.uniforms.uT.value = tt; e.aura.visible = e.auraT > 0; e.aura.scale.setScalar(1 + Math.sin(tt * 14) * 0.05);
    }
    e.sq = 1 + ((e.sq || 1) - 1) * Math.exp(-9 * dt);
    const sx = 1 / Math.sqrt(e.sq);
    if (e.blinkT > 0) { e.blinkT -= dt; e.model.visible = e.blinkT <= 0 || Math.floor(e.blinkT * 14) % 2 === 0; } // berkedip setelah muncul kembali
    let pop = 1;
    if (e.spawnPop > 0) { e.spawnPop -= dt; const q = Math.min(1, 1 - e.spawnPop / 0.4) - 1; pop = Math.max(0.05, 1 + 2.7 * q * q * q + 1.7 * q * q); } // membal dari kecil
    e.model.scale.set(sx * pop, e.sq * pop, sx * pop);
    if (e.anim === 1 && (e.dustT = (e.dustT || 0) + dt) > 0.16) { e.dustT = 0; burst(e.pos, dustCols(), 1, 1.2, FX_DUST); }
    // jejak cahaya saat menerjang (warna jubah dewa)
    const tr = e.trailDef === undefined ? (e.trailDef = TRAILS.find(x => x.id === e.trail && x.cols) || null) : e.trailDef;
    if (!e.far && (e.anim === 3 || (tr && e.anim === 2)) && (e.trailT = (e.trailT || 0) + dt) > (e.anim === 3 ? 0.035 : 0.07)) { e.trailT = 0; burst(e.pos, tr ? tr.cols : [e.trailCol || (e.trailCol = godColor(e.god)), 0xffffff], 1, 0.8, FX_TRAIL); }
    // data gerak untuk animasi (pemain lain: diperkirakan dari perubahan posisi)
    const ax = e.ax || (e.ax = { x: e.pos.x, y: e.pos.y, z: e.pos.z, yaw: e.yaw, vy: 0, speed: 0, turn: 0 });
    const inv = 1 / Math.max(dt, 0.001), ka = Math.min(1, dt * 12);
    const dyaw = ((e.yaw - ax.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    ax.vy += ((e.local ? e.vel.y : (e.pos.y - ax.y) * inv) - ax.vy) * ka;
    ax.speed += ((e.local ? Math.hypot(e.vel.x, e.vel.z) : Math.hypot(e.pos.x - ax.x, e.pos.z - ax.z) * inv) - ax.speed) * ka;
    ax.turn += (dyaw * inv - ax.turn) * ka;
    ax.x = e.pos.x; ax.y = e.pos.y; ax.z = e.pos.z; ax.yaw = e.yaw;
    if (!e.far && e.anim === 1 && Math.abs(ax.turn) > 5 && ax.speed > 5 && (e.skidT = (e.skidT || 0) + dt) > 0.06) { e.skidT = 0; burst(e.pos, dustCols(), 2, 2, FX_DUST); }
    if (e.id === G.me && ax.vy < -12 && (e.windT = (e.windT || 0) + dt) > 0.05) { e.windT = 0; burst(tmpV.copy(e.pos).add(_kv.set((Math.random() - 0.5) * 1.6, 0.4 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6)), [0xffffff, 0xdfe8ff], 1, 0.3, FX_WIND); }
    // hemat: garis tepi hanya untuk karakter dekat, animasi dilewati untuk yang sangat jauh
    const cd = e.model.position.distanceToSquared(camera.position);
    const far = cd > LOD_FAR * LOD_FAR && e.id !== G.me && e !== G.celebrate;
    setGodLOD(e.model, far, cd < LOD_LINE * LOD_LINE, e.id === G.me || e === G.celebrate || cd < LOD_NEAR * LOD_NEAR);
    e.far = far;
    if (e.label) {
      // nama memudar halus menurut jarak (bukan muncul/hilang mendadak); makin jauh makin tipis
      const lo = cd < 1600 ? 1 : Math.max(0, 1 - (Math.sqrt(cd) - 40) / 16);
      e.label.visible = lo > 0.02; e.label.material.opacity = e.id === G.me ? 1 : lo * 0.95;
      if (e.id === G.me) { const p = t < 0 && t > -3.2 ? 1.35 + Math.sin(tt * 9) * 0.12 : 1; e.label.scale.set(LBL_W * p, LBL_H * p, 1); e.label.position.y = LBL_Y + (p - 1) * 0.5; }
    }
    if (cd > 95 * 95 && e.id !== G.me) continue;
    e.castT = Math.max(0, (e.castT || 0) - dt); e.reactT = Math.max(0, (e.reactT || 0) - dt);
    let shown = G.roundOver && G.outcome ? (G.outcome.has(e.id) ? 5 : 6) : (t < 0 && t > -3 && e.anim === 0 ? 7 : e.anim);
    if (e.castT > 0 && shown !== 3 && shown !== 4) shown = 13;
    else if (e.reactT > 0 && (shown === 0 || shown === 7)) shown = EMO_ANIM[e.reactK] ?? shown; // diam: badan ikut bereaksi sesuai stiker
    e.landT = Math.max(0, (e.landT || 0) - dt); ax.land = e.landT / LAND_T;
    if (leadCrown.parent === e.model) leadCrown.position.y = 2.72 + Math.sin(tt * 4) * 0.05;
    if (cd < 18 * 18 && (e.lookT = (e.lookT || 0) - dt) <= 0) {
      e.lookT = 0.25; let best = null, bd = 49;
      for (const o of list) { if (o === e || !o.active) continue; const d2 = (o.pos.x - e.pos.x) ** 2 + (o.pos.z - e.pos.z) ** 2; if (d2 < bd) { bd = d2; best = o; } }
      const rel = best ? ((Math.atan2(best.pos.x - e.pos.x, best.pos.z - e.pos.z) - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI : 0;
      e.lookTo = best && Math.abs(rel) < 1.7 ? Math.max(-0.85, Math.min(0.85, rel)) : 0;
    }
    ax.look = (ax.look || 0) + ((e.lookTo || 0) - (ax.look || 0)) * Math.min(1, dt * 5);
    animateGod(e.model, shown, tt, ax);
    const gy = L.groundAt(e.pos.x, e.pos.z, e.pos.y + 0.6);
    e.shadow.visible = gy > -1e8 && (!sun.castShadow || cd > LOD_LINE * LOD_LINE);
    if (e.shadow.visible) { e.shadow.position.set(e.pos.x, gy + 0.04, e.pos.z); e.shadow.scale.setScalar(Math.max(0.4, 1 - (e.pos.y - gy) * 0.08) * (1 + Math.max(0, 1 - e.sq) * 0.6)); }
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
  let target = me && me.active ? me : actives[((specIdx % Math.max(1, actives.length)) + actives.length) % Math.max(1, actives.length)] || me || list[0];
  if (!(me && me.active) && target && target !== G.specT) { if (G.specT && target.active) { ring(target.pos, 0xffe07a, 1.5); beep(700, 0.06, 'sine', 0.03, 200); } G.specT = target; }
  // selebrasi pemenang: kamera mengitari sang juara
  const champ = G.roundOver && G.celebrate;
  if (champ) {
    target = champ;
    cam.yaw = Math.sin(tt * 0.6) * 0.9; cam.pitch = 0.3;   // kamera berayun di depan juara (tidak tertutup singgasana)
    champ.model.position.copy(champ.pos); champ.model.scale.setScalar(1.25); champ.model.rotation.y = Math.PI;
    animateGod(champ.model, [5, 8, 5, 9][Math.floor(tt / 2.2) % 4], tt); // bersorak, menari, melambai bergantian
    if ((champ.confT = (champ.confT || 0) + dt) > 0.25) { champ.confT = 0; burst(champ.pos, CONFETTI, 8, 9); }
    if (!spot.visible) { spot.visible = true; spotRing.visible = true; }
    spot.position.set(champ.pos.x, champ.pos.y + 6.2, champ.pos.z); spot.rotation.y = tt * 0.4; spot.material.opacity = 0.16 + Math.sin(tt * 3) * 0.03;
    spotRing.position.set(champ.pos.x, champ.pos.y + 0.05, champ.pos.z); spotRing.scale.setScalar(3.4 + Math.sin(tt * 3) * 0.15);
    if ((champ.fwT = (champ.fwT || 0) + dt) > 0.75) { // kembang api di langit di belakang juara
      champ.fwT = 0; const c = [[0xff4d6d, 0xffe14d], [0x4dc3ff, 0xffffff], [0x5fe07a, 0xffe14d], [0xc05cff, 0xff9ad5]][(Math.random() * 4) | 0];
      burst(tmpV.set(champ.pos.x + (Math.random() - 0.5) * 16, champ.pos.y + 9 + Math.random() * 5, champ.pos.z - 4 - Math.random() * 6), c, 34, 10, FX_FIREWORK);
      setTimeout(() => { noise(0.25, 0.05, 'lowpass', 700, 120); beep(180, 0.2, 'sine', 0.04, -100); }, 120);
    }
    if ((champ.spT = (champ.spT || 0) + dt) > 0.12) { champ.spT = 0; const a = Math.random() * 6.28; burst(tmpV.set(champ.pos.x + Math.cos(a) * 1.4, champ.pos.y, champ.pos.z + Math.sin(a) * 1.4), [0xffe07a, 0xffffff], 1, 0.6, FX_TWINKLE); }
    if (L.crown) { L.crownTaken = true; L.crown.position.set(champ.pos.x, champ.pos.y + 2.5, champ.pos.z); L.crown.scale.setScalar(0.62); } // mahkota di kepala juara
  }
  if (target) {
    const intro = 0;
    // hitung mundur: kamera mendekat ke pemain, lalu mundur lagi saat MULAI
    const zT = !R.lobby && !champ && t < 0 && t > -3.2 ? 0.74 : 1;
    cam.zoom += (zT - cam.zoom) * Math.min(1, dt * (zT < 1 ? 2.2 : 3.5));
    const yaw = cam.yaw + intro * 0.55, dist = cam.dist * cam.zoom;
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
    const sh = opts.calm ? 0 : cam.shake * cam.shake * 1.6;
    camera.position.set(cam.look.x - s * f + (Math.random() - 0.5) * sh, cam.look.y + 1.5 + Math.sin(cam.pitch) * dist + (Math.random() - 0.5) * sh - cam.dip * cam.dip * 3, cam.look.z - c * f);
    camera.lookAt(cam.look.x, cam.look.y + 1.3, cam.look.z);
    // miring sedikit mengikuti belokan (maks ~2,5 derajat) supaya lari terasa dinamis
    const rollT = mv && me.ax ? Math.max(-0.045, Math.min(0.045, -me.ax.turn * 0.008)) : 0;
    cam.roll = (cam.roll || 0) + (rollT - (cam.roll || 0)) * Math.min(1, dt * 4);
    if (Math.abs(cam.roll) > 0.001 && !opts.calm) camera.rotateZ(cam.roll);
  }
  // efek lingkungan di sekitar kamera: bara lava, arwah Styx, kilau air, kerlip mahkota
  if ((G.fxT = (G.fxT || 0) + dt) > 0.16) {
    G.fxT = 0;
    if (L.seaFx) {
      tmpV.set(cam.look.x + (Math.random() - 0.5) * 46, L.seaY - 0.2, cam.look.z + Math.random() * 50 - 12);
      if (L.groundAt(tmpV.x, tmpV.z, 99) < -1e8) {
        if (L.seaFx === 'lava') burst(tmpV, [0xffb347, 0xff7a1a, 0xffe08a], 2, 1.6, FX_EMBER);
        else if (L.seaFx === 'wisp') burst(tmpV, [0x7dffc0, 0xc9a6ff], 1, 0.8, FX_EMBER);
        else burst(tmpV, [0xffffff], 1, 0.2, FX_GLINT);
      }
    }
    if (L.boxes) for (const b of L.boxes) if (b.g.visible && b.g.position.distanceToSquared(camera.position) < 35 * 35 && Math.random() < 0.5) burst(tmpV.copy(b.g.position).add(_kv.set((Math.random() - 0.5) * 1.4, -0.9, (Math.random() - 0.5) * 1.4)), [0xffffff, 0xc9f4ff], 1, 0.5, FX_TWINKLE);
    if (L.collect) L.collect.spots.forEach((sp, k) => { const on = L.collect.avail[k] <= t; if (on && L.collect.was && L.collect.was[k] === false && Math.hypot(sp.x - camera.position.x, sp.z - camera.position.z) < 40) { tmpV.set(sp.x, 0.8, sp.z); ring(tmpV, 0xffd23a, 1.4); burst(tmpV, [0xffd23a, 0xffffff], 10, 3.5, FX_RISE); } (L.collect.was || (L.collect.was = []))[k] = on; }); // apel tumbuh lagi
    if (L.collect) L.collect.spots.forEach((sp, k) => { if (L.collect.avail[k] <= t && Math.random() < 0.35 && Math.hypot(sp.x - camera.position.x, sp.z - camera.position.z) < 35) burst(tmpV.set(sp.x + (Math.random() - 0.5) * 0.9, 0.5, sp.z + (Math.random() - 0.5) * 0.9), [0xffe14d, 0xffffff], 1, 0.5, FX_TWINKLE); });
    if ((R.type === 'race') && L.wps.length > 1) { const fz = L.wps[L.wps.length - 1]; if (Math.abs(fz.z - camera.position.z) < 70) burst(tmpV.set(fz.x + (Math.random() - 0.5) * 12, (fz.y || 0) + 0.2, fz.z), [0xffe07a, 0xffffff, 0x9af07a], 2, 0.8, FX_RISE); }
    { const mm = G.ents.get(G.me), nc = mm && mm.active && R.type === 'race' && L.cps && L.cps[(mm.cp || 0) + 1];
      if (nc && Math.abs(nc.z - camera.position.z) < 60 && Math.random() < 0.6) burst(tmpV.set((nc.x || 0) + (Math.random() - 0.5) * 10, (nc.y || 0) + 0.2, nc.z), [0x9ff0ff, 0xffffff], 1, 0.6, FX_RISE); }
    if (L.crown && !L.crownTaken) burst(tmpV.set(L.crown.position.x + (Math.random() - 0.5) * 1.6, L.crown.position.y - 0.4, L.crown.position.z + (Math.random() - 0.5) * 1.6), [0xffe07a, 0xffffff], 1, 0.5, FX_TWINKLE);
  }
  {
    const gy = me && me.active && !champ ? L.groundAt(me.pos.x, me.pos.z, me.pos.y + 0.6) : -1e9;
    meRing.visible = gy > -1e8 && me.pos.y - gy < 6;
    const rc = me && me.abCd <= 0 && ABILITIES[me.god] ? ABILITIES[me.god].color : 0xffd866; // siap: warna kekuatan
    if (rc !== G.ringCol) { G.ringCol = rc; meRing.material.color.set(rc); }
    if (meRing.visible) { meRing.position.set(me.pos.x, gy + 0.06, me.pos.z); meRing.scale.setScalar((1 + Math.sin(tt * 4) * 0.05) * Math.max(0.5, 1 - (me.pos.y - gy) * 0.1)); }
  }
  crownBeam.visible = !!(L.crown && !L.crownTaken && !R.lobby);
  if (crownBeam.visible) { crownBeam.position.set(L.crown.position.x, L.crown.position.y + 17.5, L.crown.position.z); crownBeam.material.opacity = 0.18 + Math.sin(tt * 2.5) * 0.05; crownBeam.rotation.y = tt * 0.5; }
  if (L.boxes) for (const b of L.boxes) {
    const v = !(me && me.boxAt && me.boxAt[b.id] > t);
    if (v && b.g.visible === false && b.g.position.distanceToSquared(camera.position) < 40 * 40) { ring(b.g.position, 0xc9f4ff, 1.4); burst(b.g.position, [0xffffff, 0xc9f4ff], 8, 3, FX_RISE); } // kotak muncul lagi
    b.g.visible = v;
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
  if (G.debug && QS.has('fx') && me && me.active) { const f = +QS.get('fx'); if (t > f && G.fxTest !== 1) { G.fxTest = 1; dizzy(me); pow(me.pos); } if (t > f + 2.5 && G.fxTest === 1) { G.fxTest = 2; G.roundOver = true; G.celebrate = me; } }
  if (G.debug && QS.has('ab') && t > +QS.get('ab') && G.abTestR !== R) { G.abTestR = R; abQ = true; }
  if (QS.has('emo') && t > +QS.get('emo') && G.emoTestR !== R) { G.emoTestR = R; [3, 4, 5, 6, 7, 0, 1, 2].forEach((k, i) => setTimeout(() => send({ t: 'emo', k }), i * 900)); }
  if (G.debug && QS.has('die') && t > +QS.get('die') && me && me.active && !me.reported) { me.reported = true; send({ t: 'dead', id: me.id }); }
  if (G.debug && QS.has('tp') && t > 0 && me && !me.tpDone) { const [z, y] = QS.get('tp').split(',').map(Number); me.pos.set(0, (y || 0) + 0.5, z); me.vel.set(0, 0, 0); me.cp = L.cps.length - 1; me.tpDone = true; }
  const spectating = target && target.id !== G.me && !G.roundOver;
  $('spec').classList.toggle('hidden', !spectating);
  if (spectating && G.specName !== target.name) { G.specName = target.name; const pt = PORTRAITS[target.god]; $('specTxt').innerHTML = ico('eye') + (pt ? `<img src="${pt}" alt="">` : '') + esc(target.name); }
  if (!spectating) G.specName = null;

  // petunjuk singkat untuk dua game pertama
  if (!R.lobby && save.tut < 2 && me && me.active) {
    const hints = [[1, IS_TOUCH ? 'Sentuh sisi kiri untuk bergerak, tombol kuning untuk melompat' : 'WASD untuk bergerak, Spasi untuk melompat'],
      [7, IS_TOUCH ? 'Tombol biru: terjang & tabrak lawan' : 'Shift untuk menerjang & menabrak lawan'],
      [13, (IS_TOUCH ? 'Tombol ungu' : 'Tombol Q') + ': ' + (ABILITIES[me.god] || {}).name]];
    G.hintI = G.hintI || 0;
    if (G.hintI < hints.length && t > hints[G.hintI][0]) { tipShow(hints[G.hintI][1], 'info'); if (++G.hintI === hints.length) { save.tut++; persist(); } }
  }
  // efek kekuatan yang sedang berjalan (perisai, melayang, lari kencang): cincin durasi di HUD
  { const left = G.buffDur ? (G.buffEnd - performance.now()) / 1000 : 0, on = left > 0 && !!(me && me.active);
    if (on !== !!G.buffOn) { G.buffOn = on; $('abSlot').classList.toggle('buff', on); $('btnAb').classList.toggle('buff', on); }
    if (on) $('abSlot').style.setProperty('--b', Math.round(left / G.buffDur * 100)); }
  // jatuh dari map: layar menggelap pelan dan angin makin kencang
  {
    const falling = !!(me && me.active && playing && me.vel.y < -8 && L.groundAt(me.pos.x, me.pos.z, me.pos.y + 0.6) < -1e8);
    G.fallK = (G.fallK || 0) + ((falling ? 1 : 0) - (G.fallK || 0)) * Math.min(1, dt * (falling ? 2.2 : 6));
    if (Math.abs(G.fallK - (G.fallShown || 0)) > 0.02) { G.fallShown = G.fallK; $('fallFx').style.opacity = G.fallK.toFixed(2); }
    if (G.fallK > 0.15 && (G.windT = (G.windT || 0) + dt) > 0.22) { G.windT = 0; noise(0.32, 0.015 + G.fallK * 0.045, 'bandpass', 500 + G.fallK * 1100, 900 + G.fallK * 1400); }
  }
  // cincin pengisian kekuatan diperbarui tiap frame supaya mulus
  if (me && ABILITIES[me.god]) { const p = Math.round((1 - Math.max(0, me.abCd) / AB_CD) * 200) / 2; if (p !== G.abP) { G.abP = p; $('abSlot').style.setProperty('--p', p); } }
  // hitung mundur
  if (t < 0) {
    const n = Math.ceil(-t);
    if (n <= 3 && n !== G.lastCount) { G.lastCount = n; flash(String(n), 0); SFX.tick([0, 740, 620, 520][n] || 520); buzz(25); hideCard(); }
  } else if (G.lastCount !== 0) { G.lastCount = 0; flash('MULAI!', 900); SFX.go(); buzz([40, 30, 90]); if (me && me.active) { ring(me.pos, 0x9af07a, 3); burst(me.pos, [0x9af07a, 0xffffff, 0xffe07a], 16, 5, FX_RISE); } hideCard(); if (!opts.calm) cam.fov += 8; }

  hudAcc += dt;
  if (hudAcc > 0.2) {
    hudAcc = 0;
    const left = Math.max(0, Math.ceil(R.limit - Math.max(0, t)));
    $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    // 10 detik terakhir: timer memerah dan berdetak
    const low = playing && R.limit > 0 && left <= 10 && !!(me && me.active);
    if (playing && me && me.active && R.limit > 0 && left !== G.annLeft && (left === 60 && R.limit > 75 || left === 30 && R.limit > 45 || left === 10)) {
      G.annLeft = left;
      const tp = $('timer'); tp.classList.remove('ping'); void tp.offsetWidth; tp.classList.add('ping');
      if (left === 60) tipShow('Sisa 1 menit!', 'info'); else if (left === 30) tipShow('Sisa 30 detik!', 'info');
    }
    $('timer').classList.toggle('low', low);
    if (low && left !== G.lowTick) { G.lowTick = left; beep(left <= 3 ? 880 : 620, 0.07, 'square', 0.04); beep(62, 0.12, 'sine', 0.09, -10); setTimeout(() => beep(56, 0.1, 'sine', 0.06, -10), 160); }
    const racing = R.type !== 'survival' && R.type !== 'collect' && me && me.active;
    const rank = racing ? G.fin + 1 + actives.filter(e => e !== me && e.pos.z > me.pos.z).length : 0;
    // ikon + angka saja: bendera = yang sudah lolos, orang = yang tersisa, # = posisimu
    const cHtml = (R.type === 'collect' ? `Apel <b>${G.apples}/${L.collect ? L.collect.need : 5}</b><i>·</i>${ico('flag')}<b>${G.fin}/${R.Q}</b>` : R.type === 'race' ? `${ico('flag')}<b>${G.fin}/${R.Q}</b>` : R.type === 'survival' ? `${ico('users')}<b>${G.alive}</b>` : ico('crown') + 'Final') + (racing ? `<i>·</i><span class="pos">#<b>${rank}</b>/${R.contenders.length}</span>` : '');
    // posisi berubah: angka berkedip hijau (naik) atau merah (turun)
    if (racing && G.lastRank && rank !== G.lastRank && t > 1) { const c = $('count'); c.classList.remove('rkUp', 'rkDn'); void c.offsetWidth; c.classList.add(rank < G.lastRank ? 'rkUp' : 'rkDn'); clearTimeout(G.rkT); G.rkT = setTimeout(() => c.classList.remove('rkUp', 'rkDn'), 1200); if (rank < G.lastRank) beep(1250, 0.05, 'triangle', 0.025, 300); }
    if (racing && rank === 1 && G.lastRank > 1 && t > 3 && !G.ledTip) { G.ledTip = true; tipShow('Kamu terdepan!', 'crown'); }
    G.lastRank = racing ? rank : 0;
    if (cHtml !== G.countHtml) {
      const c = $('count'), key = G.fin + '|' + G.alive + '|' + G.apples;
      c.innerHTML = G.countHtml = cHtml;
      if (G.countKey !== null && G.countKey !== key) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } // angka membal saat berubah
      G.countKey = key;
    }
    $('vig').classList.toggle('low', low); music.fast = low;
    // garis laju di tepi layar saat menerjang atau lari kencang
    $('speed').classList.toggle('on', !!(playing && me && me.active && (me.anim === 3 || Math.hypot(me.vel.x, me.vel.z) > 10.5)));
    // papan peringkat mini (3 terdepan)
    const lead = $('lead'), showLead = R.type === 'race' || R.type === 'final';
    lead.classList.toggle('hidden', !showLead || G.roundOver);
    { // pindahkan mahkota ke pemain terdepan
      const ld = showLead && !G.roundOver ? actives.reduce((b, e) => (!b || e.pos.z > b.pos.z ? e : b), null) : null;
      if (ld && leadCrown.parent !== ld.model) ld.model.add(leadCrown);
      leadCrown.visible = !!ld;
    }
    if (showLead) {
      const lh = actives.slice().sort((a, b) => b.pos.z - a.pos.z).slice(0, 3).map((e, i) => `<div class="${e === me ? 'me' : ''}"><span>${G.fin + i + 1}</span>${esc(e.name)}</div>`).join('');
      if (lh !== G.leadHtml) lead.innerHTML = G.leadHtml = lh;
    }
    const prog = $('prog'), showProg = showLead && L.wps.length > 1 && !G.roundOver;
    prog.classList.toggle('hidden', !showProg);
    if (showProg) {
      const z0 = L.spawn.z, z1 = L.wps[L.wps.length - 1].z, pct = z => Math.max(0, Math.min(100, (z - z0) / (z1 - z0) * 100)).toFixed(1);
      // titik pemain dibuat sekali lalu hanya digeser, supaya bergerak mulus (bukan melompat tiap pembaruan)
      const pk = actives.map(e => e.id).join();
      if (prog._k !== pk || prog._L !== L) {
        prog._k = pk; prog._L = L;
        prog.innerHTML = L.cps.slice(1).map(cp => `<b style="left:${pct(cp.z)}%"></b>`).join('')
          + actives.map(e => `<i class="${e === me ? 'me' : ''}" style="left:${pct(e.pos.z)}%;background:${godColor(e.god)}"></i>`).join('');
      } else { const dots = prog.getElementsByTagName('i'); actives.forEach((e, i) => { dots[i].style.left = pct(e.pos.z) + '%'; }); }
    }
    const ap = $('abPill'), ab = me && ABILITIES[me.god];
    ap.classList.toggle('hidden', !(me && me.active && ab));
    $('abSlot').classList.toggle('hidden', !(me && me.active && ab && !G.roundOver));
    if (me && ab) {
      const ready = me.abCd <= 0;
      const ah = ico('bolt') + (ready ? '<kbd>Q</kbd>' : Math.ceil(me.abCd) + 's');
      if (ah !== G.abHtml) { ap.innerHTML = G.abHtml = ah; ap.title = ab.name; }
      // kekuatan baru saja siap lagi: bunyi kecil + denyut di tombol
      if (ready && G.abWasCd && me.active) { ring(me.pos, ab.color, 1.8); burst(me.pos, [ab.color, 0xffffff], 10, 2.5, FX_RISE); beep(1040, 0.12, 'sine', 0.05, 300); const bt = $('btnAb'); bt.classList.remove('ping'); void bt.offsetWidth; bt.classList.add('ping'); }
      G.abWasCd = !ready;
      ap.classList.toggle('ready', ready); $('btnAb').classList.toggle('cd', !ready);
      const sl = $('abSlot'); sl.classList.toggle('ready', ready); sl.classList.toggle('cd', !ready); if (cdTxtPc(me) !== G.abSecTxt) $('abSec').textContent = G.abSecTxt = cdTxtPc(me);
      const cdTxt = ready ? '' : String(Math.ceil(me.abCd)); if (cdTxt !== G.abCdTxt) $('abCd').textContent = G.abCdTxt = cdTxt;
      const pc = Math.round((1 - Math.max(0, me.abCd) / AB_CD) * 100);
      $('btnAb').style.background = ready ? '' : `conic-gradient(rgba(${hexRgb(ab.color)},.6) ${pc}%, rgba(40,30,70,.4) 0)`;
    }
  }
}

function tickMenu(dt, now) {
  const L0 = lay(), portrait = L0.w < L0.h, wide = WIDE.matches;
  if (QS.has('lineup')) {
    let i = 0;
    for (const m of preview.children) if (m.userData.lineup) { animateGod(m, [0, 0, 5, 1, 0][Math.floor(now / 3000 + i) % 5], now / 1000, { speed: 7 }); m.rotation.y = Math.sin(now * 0.0006 + i++) * 0.5; }
    camera.position.set(0, 1.6, 9.5); camera.lookAt(0, 0.9, 2.2);
    return;
  }
  const ts = now / 1000;
  for (const c of preview.children) {
    const u = c.userData;
    if (u.crowd) { const ph = Math.floor(now / 2600 + u.crowd * 1.7) % 6; animateGod(c, ph === 0 ? 5 : ph === 3 ? 9 : ph === 4 && u.crowd % 2 ? 8 : 0, ts); } // penonton: sorak, melambai, menari bergantian
    else if (u.drift) { c.position.x += u.drift * dt; if (c.position.x > 16) c.position.x = -16; c.position.y = u.y0 + Math.sin(ts * 0.5 + u.y0) * 0.25; }   // awan melayang pelan
    else if (u.pvRing) c.scale.setScalar(1 + Math.sin(ts * 2.2) * 0.012);
  }
  G.pvT = (G.pvT || 0) - dt; // dewa yang baru dipilih bersorak sebentar, lalu melambai
  if (previewGod) {
    if (dragId === null) { G.pvYaw = (G.pvYaw || 0) + (G.pvVel || 0) * dt; G.pvVel = (G.pvVel || 0) * Math.exp(-3 * dt); G.pvYaw *= Math.exp(-0.6 * dt); } // berputar lalu pelan kembali
    previewGod.rotation.y = Math.sin(now * 0.0008) * 0.7 + 0.2 + (G.pvYaw || 0);
    if (QS.has('looktest')) previewGod.rotation.y = 0; // tes arah menoleh: badan menghadap kamera
    animateGod(previewGod, QS.has('looktest') ? 0 : G.pvT > 0 ? 5 : G.pvT > -1.6 ? 9 : 0, ts, QS.has('looktest') ? { look: +QS.get('looktest') } : undefined);
    G.pvPop = Math.max(0, (G.pvPop || 0) - dt);
    const q = 1 - G.pvPop / 0.4, sc = G.pvPop > 0 ? 0.55 + 0.45 * (1 + 2.6 * Math.pow(q - 1, 3) + 1.6 * Math.pow(q - 1, 2)) : 1; // membal (ease-out-back)
    previewGod.scale.setScalar(sc);
  }
  // kerlip cahaya naik di sekitar panggung
  if ((G.pvFx = (G.pvFx || 0) + dt) > 0.3) { G.pvFx = 0; const a = Math.random() * 6.28; burst(_pv.set(Math.cos(a) * 2.1, -0.3, Math.sin(a) * 2.1), [G.pvCol || (G.pvCol = stageCol()), 0xffe07a, 0xffffff], 1, 0.4, FX_TWINKLE); }
  camera.position.set((wide ? 2.2 : 0) + Math.sin(ts * 0.35) * 0.22, 2.0 + Math.sin(ts * 0.5) * 0.07, portrait ? 6.5 : 5.2); // kamera bernapas pelan
  camera.lookAt(wide ? 2.2 : 0, wide ? 0.9 : portrait ? -0.9 : -0.4, 0);
}

let last = performance.now(), fpsAcc = 0, fpsN = 0, dtS = 1 / 60;
function frame(now) {
  if (testDone) return;
  requestAnimationFrame(frame);
  if (opts.cap30 && now - last < 31) return; // hemat baterai: lewati tiap frame kedua
  frameCount++;
  // bayangan diperbarui tiap frame: kalau hanya tiap 2-3 frame, bayangan karakter tertinggal dan beban frame jadi
  // tidak rata (satu frame berat, dua ringan) sehingga karakter terlihat patah-patah di mode Tinggi
  renderer.shadowMap.needsUpdate = sun.castShadow;
  perf.acc += now - last; perf.n++;
  fpsAcc += now - last; fpsN++;
  if (fpsAcc > 500) { if (opts.fps) $('fps').textContent = Math.round(1000 * fpsN / fpsAcc) + ' fps · ' + Math.round(renderer.getPixelRatio() * 100) + '%' + (G.me && G.mode !== 'solo' && G.rtt ? ' · ' + G.rtt + ' ms' : ''); fpsAcc = fpsN = 0; }
  // dt dihaluskan: selisih waktu antarframe yang naik-turun membuat langkah karakter tidak sama panjang (bergetar);
  // sentakan besar tetap dipakai apa adanya supaya permainan tidak melambat
  const rawDt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  dtS = rawDt > dtS * 1.8 || rawDt < dtS * 0.55 ? rawDt : dtS + (rawDt - dtS) * 0.2;
  let dt = dtS;
  if (opts.calm) G.hitStop = G.slowT = 0;
  if (G.slowT > 0) { G.slowT -= rawDt; dt *= 0.35 + 0.65 * Math.max(0, 1 - G.slowT / 1.1) ** 2; } // detik kemenangan terasa melambat
  if (G.hitStop > 0) { G.hitStop -= rawDt; dt *= 0.3; } // jeda sekejap saat terpental supaya benturan terasa
  if ((G.phase === 'play' || G.phase === 'lobby') && G.L && G.round) tickGame(dt, now); else { tickMenu(dt, now); if (now > 4000) tuneQuality(dt); }
  tickParts(dt); tickRings(dt); tickBolts(dt); tickPows(dt); tickDomes(dt); tickFloats(dt); tickSkyFx(dt); tickAmbient(dt, now / 1000);
  dome.position.copy(camera.position); skyU.uT.value = now / 1000;
  if (cloudFloor.visible) { cloudFloor.position.x = camera.position.x; cloudFloor.position.z = camera.position.z; }
  sunSprite.position.copy(camera.position).addScaledVector(SUN_DIR, 440);
  renderer.render(scene, camera);
  if (shot.on && now > shot.next && shot.n < 16) {
    shot.next = now + shot.every; shot.n++;
    fetch('/debug/shot_' + String(shot.n).padStart(2, '0'), { method: 'POST', body: canvas.toDataURL('image/png') }).catch(() => {});
    if (QS.has('dom')) postDom(shot.n);
    report(`shot ${shot.n} phase=${G.phase} lvl=${G.round ? G.round.level : '-'} ents=${G.ents.size} q=${quality.level} s=${quality.scale.toFixed(2)}`);
  }
}
// mode tes (?dom=1): kirim salinan HTML halaman (kanvas diganti gambarnya) supaya tampilan menu/HUD bisa diperiksa tanpa tangkapan layar
function postDom(n) {
  try {
    const d = document.documentElement.cloneNode(true), cv = d.querySelector('#c'), img = document.createElement('img');
    img.src = canvas.toDataURL('image/jpeg', 0.7); img.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%');
    cv.replaceWith(img); d.querySelectorAll('script,link').forEach(x => x.remove()); const ld = d.querySelector('#loading'); if (ld) ld.remove();
    fetch('/debug/dom_' + String(n).padStart(2, '0'), { method: 'POST', body: 'x,' + btoa(unescape(encodeURIComponent('<!doctype html>' + d.outerHTML))) }).catch(() => {});
  } catch (e) { report('dom fail ' + e); }
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
const loadPct = p => { $('loadFill').style.width = p + '%'; $('loadTxt').textContent = p < 100 ? `Memuat ${p}%` : 'Siap!'; };
loadPct(35);
{ const TIPS = ['Terjang ke arah lawan untuk membuatnya terpental.', 'Tiap dewa punya kekuatan berbeda. Coba semuanya!', 'Di map es, mulailah berbelok lebih awal.', 'Kipas angin berputar dulu sebelum meniup: lewati saat ia diam.', 'Selesaikan misi harian untuk koin tambahan.', 'Lompat lalu terjang di udara untuk menjangkau lebih jauh.', 'Bumper memantulkanmu jauh. Lewati celahnya, jangan ditabrak.']; $('loadTip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
  { let ti = (Math.random() * TIPS.length) | 0; const tip = $('loadTip'), iv = setInterval(() => { if ($('loading').classList.contains('done')) return clearInterval(iv); tip.classList.add('swap'); setTimeout(() => { tip.textContent = TIPS[++ti % TIPS.length]; tip.classList.remove('swap'); }, 250); }, 3200); } }
Promise.allSettled([loadGodAssets().then(r => { loadPct(70); return r; }), loadProps()]).then(rs => {
  loadPct(100); $('loading').classList.add('ready'); setTimeout(() => $('loading').classList.add('done'), 650);
  if (rs.some(r => r.status !== 'fulfilled')) $('loadTxt').textContent = 'Sebagian aset gagal dimuat — game tetap jalan dengan tampilan sederhana.'; report('assets ' + rs.map(r => r.status + (r.reason ? ' ' + (r.reason.stack || r.reason) : '')).join(' | ')); makePortraits(); renderGods(); if (G.me) renderLobby(); if (G.phase === 'menu') buildPreview(); });
if (QS.has('auto')) {
  pickMode(QS.get('mode') === 'solo' ? 'solo' : 'lan');
  $('name').value = 'Tester';
  if (QS.has('god') && GODS.some(g => g.id === QS.get('god'))) G.god = QS.get('god');
  setTimeout(() => $('joinBtn').click(), 1200);
  if (!QS.has('nostart')) { let tries = 0; const iv = setInterval(() => { if (G.phase === 'play' || ++tries > 15) return clearInterval(iv); if (G.me && G.hostId === G.me && G.phase === 'lobby') send({ t: 'start', level: QS.has('level') ? +QS.get('level') : undefined }); }, 1500); }
}
enterMenuScene();
if (!QS.has('auto')) show('mode');
// tes suara seruan tanpa speaker: render tiap seruan di OfflineAudioContext, laporkan puncak & RMS dibanding bunyi 'hit'
if (QS.has('voxtest')) (async () => {
  const res = [];
  for (const kind of [...Object.keys(VOX), '_hit']) {
    const oc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100), keep = [actx, master, bus, sfxBus, noiseBuf, voxLive];
    actx = oc; master = bus = sfxBus = oc.destination; noiseBuf = null; voxLive = 0;
    try { noise(0.01, 0.0001); if (kind === '_hit') SFX.hit(); else vox(kind, 'zeus', 1); } catch (err) { res.push(kind + ' ERR ' + err); }
    [actx, master, bus, sfxBus, noiseBuf, voxLive] = keep;
    const d = (await oc.startRendering()).getChannelData(0); let pk = 0, sq = 0, n = 0;
    for (const v of d) { pk = Math.max(pk, Math.abs(v)); if (Math.abs(v) > 0.002) { sq += v * v; n++; } }
    res.push(`${kind} pk=${pk.toFixed(3)} rms=${Math.sqrt(sq / Math.max(1, n)).toFixed(3)}`);
  }
  report('voxtest ' + res.join(' | '));
})().catch(err => report('voxtest ERR ' + (err.stack || err)));
if (QS.has('ui')) { pickMode(QS.get('mode') === 'solo' ? 'solo' : 'lan'); const tb = $('tabs').querySelector(`[data-tab="${QS.get('ui')}"]`); if (tb) tb.click(); if (QS.get('ui') === 'all') { let i = 0; setInterval(() => $('tabs').children[++i % 3].click(), shot.every); } }
requestAnimationFrame(frame);

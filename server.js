// Asgardian - server LAN: file statis + WebSocket untuk lobby, ronde, dan relay posisi.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { pathToFileURL } = require('url');

const PORT = +process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const VENDOR = path.join(__dirname, 'node_modules', 'three', 'build');
const JSM = path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm');
const DEBUG = !!process.env.DEBUG; // mode tes: /debug/shot, /debug/log, pilih level
const SHOTS = process.env.SHOT_DIR || path.join(os.tmpdir(), 'asgardian-shots');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary',
};

const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); } catch { u = '/'; }
  if (DEBUG && req.method === 'POST' && u.startsWith('/debug/')) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      fs.mkdirSync(SHOTS, { recursive: true });
      if (u === '/debug/log') fs.appendFileSync(path.join(SHOTS, 'log.txt'), body + '\n');
      else fs.writeFileSync(path.join(SHOTS, path.basename(u) + '.png'), Buffer.from(body.split(',')[1] || '', 'base64'));
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  if (u === '/') u = '/index.html';
  let base = PUB, rel = u;
  if (u.startsWith('/vendor/')) { base = VENDOR; rel = u.slice(7); }
  else if (u.startsWith('/jsm/')) { base = JSM; rel = u.slice(4); }
  const file = path.join(base, path.normalize(rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    // modul contoh three.js mengimpor 'three' -> arahkan ke salinan yang sama dengan game
    if (base === JSM) data = data.toString().replace(/from 'three'/g, "from '/vendor/three.module.js'");
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- game room
// indeks = nomor map di public/js/levels.js
const MAPS = [
  { type: 'race', limit: 120 },      // 0 Bifrost Dash
  { type: 'survival', limit: 85 },   // 1 Meteor Storm
  { type: 'final', limit: 150 },     // 2 Throne of Olympus
  { type: 'race', limit: 120 },      // 3 Tidal Trial
  { type: 'race', limit: 130 },      // 4 Muspelheim Run
  { type: 'survival', limit: 75 },   // 5 Hades' Wheel
  { type: 'collect', limit: 110 },   // 6 Golden Garden
  { type: 'final', limit: 150 },     // 7 Yggdrasil Climb
  { type: 'race', limit: 130 },      // 8 Jotunheim Slide
];
const POOLS = [[0, 3, 4, 6, 8], [1, 5], [2, 7]];       // ronde 1: balapan, ronde 2: bertahan, ronde 3: final
const wins = new Map();              // nama -> jumlah mahkota
const GOD_IDS = ['zeus', 'poseidon', 'athena', 'hades', 'apollo', 'ares', 'hermes', 'thor', 'loki', 'odin'];
const INTRO_MS = 6000;

// Simulasi bot berjalan di server (memakai modul fisika yang sama dengan browser),
// jadi bot tetap bergerak walau tab host disembunyikan.
let SIM = null, LV = null;
(async () => {
  const { register } = require('node:module');
  const three = pathToFileURL(path.join(VENDOR, 'three.module.js')).href, jsm = pathToFileURL(JSM).href;
  const hook = `export async function resolve(s, c, n) {
    if (s === '/vendor/three.module.js' || s === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true };
    if (s.startsWith('/jsm/')) return { url: ${JSON.stringify(jsm)} + s.slice(4), shortCircuit: true };
    return n(s, c);
  }`;
  register('data:text/javascript,' + encodeURIComponent(hook));
  SIM = await import(pathToFileURL(path.join(PUB, 'js', 'sim.js')).href);
  LV = await import(pathToFileURL(path.join(PUB, 'js', 'levels.js')).href);
  console.log('  Simulasi bot aktif di server.\n');
})().catch(e => console.error('Gagal memuat simulasi bot (bot akan diam):', e));

let nextId = 1;

function lanAddrs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${PORT}`);
  return out;
}
function send(ws, m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

// Satu ruang permainan: lobby + ronde + bot. 'lan' = ruang bersama di WiFi yang sama;
// tiap pemain mode main-sendiri mendapat ruang pribadi. (Mode online nanti cukup menambah ruang berkode.)
function createRoom(roomId, opts = {}) {
  const players = new Map(); // id -> {id,name,god,bot,ws,state}
  let hostId = null, phase = 'lobby', botCount = opts.solo ? 7 : 5, round = null, timers = [], plan = [0, 1, 2];

  function broadcast(m) {
    const s = JSON.stringify(m);
    for (const p of players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
  function roster() { return [...players.values()].map(p => ({ id: p.id, name: p.name, god: p.god, skin: p.skin || 'default', bot: !!p.bot, wins: wins.get(p.name) || 0 })); }
  function lobbyMsg() { broadcast({ t: 'lobby', players: roster(), hostId, botCount, phase }); }
  function humans() { return [...players.values()].filter(p => !p.bot); }
  function later(fn, ms) {
    const h = setTimeout(() => { timers = timers.filter(x => x !== h); fn(); }, ms);
    timers.push(h);
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function toLobby() {
    clearTimers();
    for (const p of [...players.values()]) if (p.bot) players.delete(p.id);
    phase = 'lobby'; round = null;
    for (const p of players.values()) p.state = null;
    lobbyMsg();
  }

  function startGame(forced) {
    if (phase !== 'lobby') return;
    plan = POOLS.map(pool => pool[(Math.random() * pool.length) | 0]);
    if (DEBUG && Number.isInteger(forced) && MAPS[forced]) plan = [forced];
    const pool = GOD_IDS.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < botCount; i++) {
      const id = 'b' + nextId++;
      const god = pool[i % pool.length];
      players.set(id, { id, name: 'Bot ' + god[0].toUpperCase() + god.slice(1), god, bot: true, ws: null, state: null });
    }
    phase = 'playing';
    startRound(0, [...players.keys()]);
  }

  function startRound(idx, contenders) {
    const level = plan[idx], def = MAPS[level], n = contenders.length;
    const racy = def.type === 'race' || def.type === 'collect';
    let Q = def.type === 'final' ? 1 : racy ? Math.ceil(n * 0.6) : Math.ceil(n * 0.5);
    Q = Math.max(1, Q);
    if (racy && n > 1) Q = Math.min(Q, n - 1);
    let limit = def.limit;
    if (def.type === 'survival' && n <= Q) limit = 35; // main sendirian: cukup bertahan 35 detik
    round = { idx, type: def.type, startAt: Date.now() + INTRO_MS, seed: (Math.random() * 1e9) | 0, contenders, n0: n, Q, limit, finished: [], dead: [], over: false };
    for (const p of players.values()) { p.state = null; p.abAt = 0; }
    round.L = null; round.bots = new Map(); round.scores = {};
    if (SIM) {
      try {
        round.L = LV.buildLevel(level, round.seed);
        contenders.forEach((id, i) => {
          const p = players.get(id);
          if (!p || !p.bot) return;
          const e = SIM.newEnt(id);
          e.god = p.god; e.ai = SIM.newAI();
          SIM.spawnAt(e, round.L, i, n);
          round.bots.set(id, e);
        });
      } catch (e) { console.error('buildLevel gagal', e); round.L = null; }
    }
    broadcast({ t: 'round', idx, level, total: plan.length, type: def.type, startAt: round.startAt, seed: round.seed, contenders, Q, limit, players: roster(), hostId });
    later(() => endRound(), INTRO_MS + limit * 1000);
  }

  function liveContenders() { return round.contenders.filter(id => players.has(id)); }
  function progress(id) {
    if (round.type === 'collect') return round.scores[id] || 0;
    const p = players.get(id);
    return p && p.state ? p.state[3] : -1e9;
  }

  function endRound() {
    if (!round || round.over) return;
    round.over = true;
    clearTimers();
    const r = round, live = liveContenders();
    let qualified;
    if (r.type === 'survival') {
      qualified = live.filter(id => !r.dead.includes(id));
    } else {
      qualified = r.finished.filter(id => players.has(id)).slice(0, r.Q);
      const rest = live.filter(id => !qualified.includes(id)).sort((a, b) => progress(b) - progress(a));
      while (qualified.length < r.Q && rest.length) qualified.push(rest.shift());
    }
    const eliminated = r.contenders.filter(id => !qualified.includes(id));
    const final = r.idx === plan.length - 1;
    const humanLeft = qualified.some(id => players.get(id) && !players.get(id).bot);
    const over = final || !humanLeft || qualified.length === 0;
    const winner = final && qualified.length ? qualified[0] : null;
    if (winner && players.get(winner) && !players.get(winner).bot) { const nm = players.get(winner).name; wins.set(nm, (wins.get(nm) || 0) + 1); }
    broadcast({ t: 'roundEnd', qualified, eliminated, over, final, winner });
    if (over) later(toLobby, 9000);
    else later(() => startRound(r.idx + 1, qualified.filter(id => players.has(id))), 6500);
  }

  function checkRound() {
    if (!round || round.over) return;
    const live = liveContenders();
    if (round.type === 'survival') {
      const alive = live.filter(id => !round.dead.includes(id)).length;
      if ((round.n0 > round.Q && alive <= round.Q) || alive === 0) endRound();
    } else {
      const fin = round.finished.filter(id => players.has(id)).length;
      if (fin >= Math.min(round.Q, live.length)) endRound();
    }
  }

  function controls(ws, id) { return id === ws.pid; }

  function markFinish(id) {
    if (!round || round.over || round.type === 'survival' || Date.now() < round.startAt) return;
    if (!round.contenders.includes(id) || round.finished.includes(id)) return;
    round.finished.push(id);
    const b = round.bots.get(id);
    if (b) b.active = false;
    broadcast({ t: 'finished', id, n: round.finished.length, Q: round.Q });
    checkRound();
  }
  function markDead(id) {
    if (!round || round.over || round.type !== 'survival' || Date.now() < round.startAt) return;
    if (!round.contenders.includes(id) || round.dead.includes(id)) return;
    round.dead.push(id);
    const b = round.bots.get(id);
    if (b) b.active = false;
    const alive = liveContenders().filter(x => !round.dead.includes(x)).length;
    broadcast({ t: 'dead', id, alive });
    checkRound();
  }
  // kekuatan dewa (cooldown dijaga server); efek area ke bot dihitung di sini, ke pemain di perangkatnya
  function cast(id) {
    const p = players.get(id);
    if (!p || !round || round.over || Date.now() < round.startAt || !round.contenders.includes(id)) return;
    const now = Date.now();
    if (p.abAt && now - p.abAt < 10000) return;
    p.abAt = now;
    const a = SIM && SIM.ABILITIES[p.god], be = round.bots.get(id);
    if (a && be) { if (a.self) SIM.castSelf(be); else be.abCd = SIM.AB_CD; }
    if (a && a.area) {
      const src = be ? be.pos : p.state ? { x: p.state[1], y: p.state[2], z: p.state[3] } : null;
      if (src) for (const v of round.bots.values()) if (v.active && v.id !== id) SIM.applyArea(a, src.x, src.y, src.z, v);
    }
    broadcast({ t: 'ab', id });
  }
  // rebutan apel emas
  function pick(id, k) {
    const L = round && round.L;
    if (!L || !L.collect || round.over || round.finished.includes(id)) return;
    const t = (Date.now() - round.startAt) / 1000, c = L.collect;
    if (t < 0 || !Number.isInteger(k) || k < 0 || k >= c.spots.length || c.avail[k] > t) return;
    c.avail[k] = t + c.respawn;
    const n = round.scores[id] = (round.scores[id] || 0) + 1;
    broadcast({ t: 'picked', k, id, n, at: c.avail[k] });
    if (n >= c.need) markFinish(id);
  }

  const NONE = { x: 0, z: 0, jump: false, dive: false };
  const r2 = v => Math.round(v * 100) / 100;
  const botTick = setInterval(() => {
    if (!round || round.over || !round.L || !round.bots.size) return;
    const r = round, L = r.L, t = (Date.now() - r.startAt) / 1000, dt = 1 / 30, playing = t >= 0;
    try {
      L.update(t);
      const all = [...r.bots.values()];
      for (const p of players.values())
        if (!p.bot && p.state && r.contenders.includes(p.id) && !r.finished.includes(p.id) && !r.dead.includes(p.id))
          all.push({ id: p.id, active: true, anim: p.state[5], pos: { x: p.state[1], y: p.state[2], z: p.state[3] } });
      for (const e of r.bots.values()) {
        if (!e.active) continue;
        const p = players.get(e.id);
        if (!p) { e.active = false; continue; }
        const inp = playing ? SIM.botInput(e, L, t, dt) : NONE;
        if (!playing && Math.random() < 0.01) e.emoteT = 1.2; // bot bersorak saat hitung mundur
        e.emoteT = (e.emoteT || 0) - dt;
        if (playing && SIM.botWantsAbility(e, L, all)) cast(e.id);
        SIM.stepEnt(e, inp, dt, L, t);
        SIM.separate(e, all);
        if (playing) SIM.diveBump(e, all);
        e.fx = null;
        if (playing) {
          const res = SIM.postStep(e, L);
          if (res === 'finish') markFinish(e.id); else if (res === 'dead') markDead(e.id);
          if (round !== r || r.over) return;
          if (L.collect && e.active) { const k = SIM.touchApple(e, L, t); if (k >= 0) pick(e.id, k); if (r.over) return; }
        } else if (e.pos.y < L.killY) SIM.spawnAt(e, L, r.contenders.indexOf(e.id), r.contenders.length);
        p.state = [e.id, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.yaw), e.emoteT > 0 && e.anim === 0 ? 5 : e.anim];
      }
    } catch (err) { console.error('bot sim error', err); r.L = null; }
  }, 33);

  const H = {
    join(ws, m) {
      if (ws.pid) return;
      const id = 'p' + nextId++;
      const name = String(m.name || '').replace(/[<>&"]/g, '').trim().slice(0, 14) || 'Dewa ' + id.slice(1);
      const god = GOD_IDS.includes(m.god) ? m.god : 'zeus';
      const skin = ['default', 'es', 'mawar', 'bayangan', 'emas'].includes(m.skin) ? m.skin : 'default';
      players.set(id, { id, name, god, skin, bot: false, ws, state: null });
      ws.pid = id;
      if (!hostId || !players.has(hostId)) hostId = id;
      send(ws, { t: 'welcome', id, addrs: opts.solo ? [] : lanAddrs(), mode: opts.solo ? 'solo' : 'lan' });
      lobbyMsg();
    },
    ping(ws, m) { send(ws, { t: 'pong', c: m.c, s: Date.now() }); },
    bots(ws, m) {
      if (ws.pid !== hostId || phase !== 'lobby') return;
      botCount = Math.max(opts.solo ? 1 : 0, Math.min(11, m.n | 0));
      lobbyMsg();
    },
    start(ws, m) { if (ws.pid === hostId) startGame(m.level); },
    s(ws, m) {
      if ((!round && phase !== 'lobby') || !ws.pid || !Array.isArray(m.e)) return;
      for (const a of m.e.slice(0, 24)) {
        if (!Array.isArray(a) || a.length < 6 || !controls(ws, a[0])) continue;
        if (!a.slice(1, 6).every(Number.isFinite)) continue;
        const p = players.get(a[0]);
        if (p) p.state = a.slice(0, 6);
      }
    },
    finish(ws, m) {
      if (ws.pid && m.id === ws.pid && round && round.type !== 'collect') markFinish(ws.pid);
    },
    pick(ws, m) {
      const p = players.get(ws.pid);
      if (!p || !round || !round.L || !round.L.collect || !p.state || !round.contenders.includes(p.id)) return;
      const s = round.L.collect.spots[m.k];
      if (s && Math.hypot(s.x - p.state[1], s.z - p.state[3]) < 4) pick(p.id, m.k);
    },
    ab(ws, m) { // kekuatan dewa: teruskan ke semua pemain (cooldown dijaga server)
      if (ws.pid && m.id === ws.pid) cast(ws.pid);
    },
    dead(ws, m) {
      if (ws.pid && m.id === ws.pid) markDead(ws.pid);
    },
  };

  function leave(ws) {
    const id = ws.pid;
    if (!id || !players.has(id)) return;
    players.delete(id);
    if (!humans().length) { hostId = null; toLobby(); return; }
    if (hostId === id) hostId = humans()[0].id;
    lobbyMsg();
    checkRound();
  }

  // siaran posisi semua pemain 15x per detik
  const snapTick = setInterval(() => {
    if (!round && phase !== 'lobby') return;
    const e = [];
    for (const p of players.values()) if (p.state) e.push(p.state);
    if (e.length) broadcast({ t: 'snap', e });
  }, 66);

  return {
    id: roomId, H, leave,
    humanCount: () => humans().length,
    destroy() { clearTimers(); clearInterval(botTick); clearInterval(snapTick); },
  };
}

const rooms = new Map();
rooms.set('lan', createRoom('lan'));

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!ws.room) {
      if (m.t === 'ping') return send(ws, { t: 'pong', c: m.c, s: Date.now() });
      if (m.t !== 'join') return;
      if (m.mode === 'solo') { const id = 'solo' + nextId++; ws.room = createRoom(id, { solo: true }); rooms.set(id, ws.room); }
      else ws.room = rooms.get('lan');
    }
    const H = ws.room.H;
    if (!Object.hasOwn(H, m.t)) return;
    try { H[m.t](ws, m); } catch (e) { console.error('handler error', m.t, e); }
  });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    room.leave(ws);
    if (room.id !== 'lan' && room.humanCount() === 0) { room.destroy(); rooms.delete(room.id); }
  });
  ws.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ⚡ ASGARDIAN server jalan!\n');
  console.log(`  Di komputer ini : http://localhost:${PORT}`);
  for (const a of lanAddrs()) console.log(`  Di HP (WiFi sama): ${a}`);
  console.log('');
});

// Tes otomatis: `npm test`
// 1) simulasi bot di semua map (tidak boleh ada NaN; balapan/final harus bisa diselesaikan; ronde bertahan harus berakhir)
// 2) tes protokol server: room main-sendiri, room berkode, kode salah, mode latihan, papan skor
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const three = pathToFileURL(path.join(ROOT, 'node_modules/three/build/three.module.js')).href;
const jsm = pathToFileURL(path.join(ROOT, 'node_modules/three/examples/jsm')).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) {
  if (s === '/vendor/three.module.js' || s === 'three') return { url: ${JSON.stringify(three)}, shortCircuit: true };
  if (s.startsWith('/jsm/')) return { url: ${JSON.stringify(jsm)} + s.slice(4), shortCircuit: true };
  return n(s, c);
}`));
const S = await import(pathToFileURL(path.join(ROOT, 'public/js/sim.js')).href);
const { buildLevel, LEVELS } = await import(pathToFileURL(path.join(ROOT, 'public/js/levels.js')).href);

let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  GAGAL ') + msg); if (!ok) failed++; };

console.log('Simulasi bot per map:');
for (let idx = 0; idx < LEVELS.length; idx++) {
  const L = buildLevel(idx, 4242), n = 8, ents = [], dt = 1 / 30;
  for (let i = 0; i < n; i++) { const e = S.newEnt('b' + i); e.ai = S.newAI(); S.spawnAt(e, L, i, n); ents.push(e); }
  let fin = 0, dead = 0, nan = false;
  for (let t = -1; t < 130 && ents.some(e => e.active); t += dt) {
    L.update(t);
    for (const e of ents) {
      if (!e.active) continue;
      S.stepEnt(e, t < 0 ? { x: 0, z: 0 } : S.botInput(e, L, t, dt), dt, L, t); e.fx = null;
      S.separate(e, ents);
      if (!Number.isFinite(e.pos.x + e.pos.y + e.pos.z)) nan = true;
      if (t < 0) continue;
      if (L.collect) { const k = S.touchApple(e, L, t); if (k >= 0) { L.collect.avail[k] = t + L.collect.respawn; if ((e.score = (e.score || 0) + 1) >= L.collect.need) { e.active = false; fin++; } } continue; }
      const r = S.postStep(e, L);
      if (r === 'finish') { e.active = false; fin++; } else if (r === 'dead') { e.active = false; dead++; }
    }
  }
  const type = LEVELS[idx].type;
  check(!nan && (type === 'survival' ? dead >= n / 2 : fin >= 2), `${LEVELS[idx].name} (${type}): selesai ${fin}, gugur ${dead}${nan ? ', ADA NaN' : ''}`);
}

console.log('Protokol server:');
const PORT = 3999;
const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), DEBUG: '' }, stdio: 'ignore' });
const { WebSocket } = await import(pathToFileURL(path.join(ROOT, 'node_modules/ws/wrapper.mjs')).href);
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2500);
function client(join) {
  const ws = new WebSocket('ws://localhost:' + PORT), got = [];
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', god: 'thor', ...join })));
  ws.on('message', d => got.push(JSON.parse(d)));
  ws.on('error', () => {});
  return { ws, got, find: t => got.find(m => m.t === t), send: m => ws.send(JSON.stringify(m)) };
}
try {
  const a = client({ name: 'A', mode: 'room', create: true }); await sleep(500);
  const code = a.find('welcome')?.code;
  check(/^[A-Z]{4}$/.test(code || ''), 'buat room privat memberi kode 4 huruf (' + code + ')');
  const b = client({ name: 'B', mode: 'room', code }); const c = client({ name: 'C', mode: 'room', code: 'ZZZQ' }); const lan = client({ name: 'L', mode: 'lan' }); await sleep(600);
  check(b.got.filter(m => m.t === 'lobby').pop()?.players.length === 2, 'gabung dengan kode masuk ke room yang sama');
  check(!!c.find('joinErr'), 'kode salah ditolak dengan pesan');
  check(lan.got.filter(m => m.t === 'lobby').pop()?.players.length === 1, 'room WiFi umum terpisah dari room privat');
  const solo = client({ name: 'S', mode: 'solo' }); await sleep(400);
  solo.send({ t: 'bots', n: 3 }); solo.send({ t: 'start', level: 5 }); await sleep(800);
  const rd = solo.find('round');
  check(rd && rd.level === 5 && rd.total === 1 && rd.contenders.length === 4, 'mode latihan: main sendiri memulai map pilihan dengan bot');
  await sleep(6500); solo.send({ t: 'dead', id: solo.find('welcome').id });
  for (let i = 0; i < 80 && !solo.find('roundEnd'); i++) await sleep(1000);
  const re = solo.find('roundEnd');
  check(re && Array.isArray(re.standings) && re.standings.length > 0, 'akhir ronde mengirim papan skor');
  check(solo.got.some(m => m.t === 'snap' && m.e.some(x => x[0][0] === 'b')), 'server menyiarkan posisi bot');
  for (const x of [a, b, c, lan, solo]) x.ws.close();
} catch (e) { check(false, 'tes server melempar error: ' + e.message); }
srv.kill();
console.log(failed ? `\n${failed} tes GAGAL` : '\nSemua tes lulus');
process.exit(failed ? 1 : 0);

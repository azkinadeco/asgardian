// Fisika karakter + AI bot. Tidak menyentuh DOM supaya bisa dites di Node.
import * as THREE from '/vendor/three.module.js';

export const R = 0.5, H = 1.6, SPEED = 8, JUMP = 9.5;

export function newEnt(id) {
  return {
    id, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0,
    grounded: false, ground: null, stun: 0, diveT: 0, diveCd: 0, coyote: 0,
    cp: 0, anim: 0, active: true, fx: null, reported: false,
    god: 'zeus', abCd: 3, speedT: 0, floatT: 0, shieldT: 0, confuseT: 0,
  };
}

export function newAI() {
  const r = Math.random;
  return { wp: 0, lane: r() * 2 - 1, lane2: r() * 2 - 1, speed: 0.72 + r() * 0.2, skill: r(), tile: null, re: 0, warned: -1, stuckT: 0, lastZ: 0, delay: r() * 0.7 };
}

export function knock(e, vx, vy, vz, stun) {
  if (e.shieldT > 0) { e.fx = e.fx || 'block'; return; }
  e.vel.set(vx, vy, vz);
  e.stun = Math.max(e.stun, stun);
  e.grounded = false; e.ground = null; e.diveT = 0;
  e.fx = 'hit';
}

function lerpAngle(a, b, k) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * k;
}
export { lerpAngle };

export function spawnAt(e, L, i, n) {
  if (L.survival || L.ringSpawn) {
    const a = (i / Math.max(1, n)) * Math.PI * 2, r = n > 1 ? 5 : 0;
    e.pos.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
    e.yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
  } else {
    const col = i % 5, row = Math.floor(i / 5);
    e.pos.set((col - 2) * 2.4, L.spawn.y + 0.3, L.spawn.z - row * 2.2);
    e.yaw = 0;
  }
  e.vel.set(0, 0, 0); e.cp = 0; e.stun = 0; e.diveT = 0;
}

export function respawn(e, L) {
  const c = L.cps[e.cp] || L.cps[0];
  e.pos.set(c.x + (Math.random() - 0.5) * 3, c.y + 0.6, c.z);
  e.vel.set(0, 0, 0); e.stun = 0; e.diveT = 0; e.yaw = 0;
  if (e.ai) { e.ai.wp = 0; e.ai.stuckT = 0; }
  e.fx = 'respawn';
}

// inp: {x,z} arah dunia (panjang <= 1), jump, dive
export function stepEnt(e, inp, dt, L, t) {
  const wasG = e.grounded;
  e.diveCd -= dt; e.abCd -= dt; e.speedT -= dt; e.floatT -= dt; e.shieldT -= dt; e.confuseT -= dt;
  if (e.confuseT > 0) inp = { x: -inp.x, z: -inp.z, jump: inp.jump, dive: inp.dive };
  const SPD = SPEED * (e.speedT > 0 ? 1.5 : 1);
  if (e.stun > 0) {
    e.stun -= dt;
    if (wasG) { const k = Math.max(0, 1 - (L.ice ? 1.2 : 5) * dt); e.vel.x *= k; e.vel.z *= k; }
  } else if (e.diveT > 0) {
    e.diveT -= dt;
    if (wasG) { const k = Math.max(0, 1 - 4 * dt); e.vel.x *= k; e.vel.z *= k; }
  } else {
    const a = Math.min(1, (wasG ? (L.ice ? 3.2 : 14) : 5) * dt); // es: licin, lambat berbelok
    e.vel.x += (inp.x * SPD - e.vel.x) * a;
    e.vel.z += (inp.z * SPD - e.vel.z) * a;
    if (inp.x || inp.z) e.yaw = lerpAngle(e.yaw, Math.atan2(inp.x, inp.z), Math.min(1, 14 * dt));
    e.coyote = wasG ? 0.12 : e.coyote - dt;
    if (inp.jump && e.coyote > 0) {
      e.vel.y = JUMP; e.coyote = 0; e.fx = 'jump';
    } else if (inp.dive && e.diveCd <= 0) {
      if (inp.x || inp.z) e.yaw = Math.atan2(inp.x, inp.z);
      e.vel.x = Math.sin(e.yaw) * 13; e.vel.z = Math.cos(e.yaw) * 13;
      e.vel.y = Math.max(e.vel.y, 5);
      e.diveT = 0.55; e.diveCd = 1.1; e.coyote = 0; e.fx = 'dive';
    }
  }
  e.vel.y = Math.max(-40, e.vel.y - L.gravity * (e.floatT > 0 && e.vel.y < 0 ? 0.22 : 1) * dt);
  e.pos.addScaledVector(e.vel, dt);
  if (e.ground && !e.ground.off) { e.pos.x += e.ground.dx; e.pos.y += e.ground.dy; e.pos.z += e.ground.dz; }

  e.grounded = false; e.ground = null;
  for (const P of L.plats) {
    if (P.off) continue;
    const dx = e.pos.x - P.x, dz = e.pos.z - P.z, hx = P.w / 2, hz = P.d / 2;
    const ax = Math.abs(dx), az = Math.abs(dz);
    if (ax > hx + R || az > hz + R) continue;
    const top = L.topAt(P, e.pos.z), bottom = P.y - P.h;
    const snap = wasG && e.vel.y <= 0 ? 0.35 : 0;
    if (ax <= hx + 0.25 && az <= hz + 0.25 && e.vel.y <= 0.01 && e.pos.y <= top + snap && e.pos.y >= top - 0.6 + Math.min(0, e.vel.y * dt)) {
      e.pos.y = top; e.vel.y = 0; e.grounded = true; e.ground = P;
    } else if (e.pos.y < top - 0.6 && e.pos.y + H > bottom) {
      const px = hx + R - ax, pz = hz + R - az;
      if (px < pz) { e.pos.x += Math.sign(dx) * px; e.vel.x = 0; }
      else { e.pos.z += Math.sign(dz) * pz; e.vel.z = 0; }
    }
  }
  if (e.stun <= 0.25) for (const o of L.obs) o.hit(e, t);
  if (!wasG && e.grounded && !e.fx) e.fx = 'land';
  e.anim = e.stun > 0 ? 4 : e.diveT > 0 ? 3 : !e.grounded ? 2 : (Math.hypot(e.vel.x, e.vel.z) > 1 ? 1 : 0);
}

// dorong pelan antar karakter supaya tidak menumpuk
export function separate(e, ents) {
  for (const o of ents) {
    if (o === e || !o.active) continue;
    const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.81 || Math.abs(e.pos.y - o.pos.y) > 1.4) continue;
    const d = Math.sqrt(d2) || 0.01, push = (0.9 - d) * 0.5;
    e.pos.x += (dx / d) * push; e.pos.z += (dz / d) * push;
  }
}

// apel emas yang sedang disentuh (indeks) atau -1
export function touchApple(e, L, t) {
  const sp = L.collect.spots, av = L.collect.avail;
  for (let k = 0; k < sp.length; k++) {
    if (av[k] > t) continue;
    if (Math.hypot(sp[k].x - e.pos.x, sp[k].z - e.pos.z) < 1.4 && Math.abs(e.pos.y - sp[k].y) < 2.2) return k;
  }
  return -1;
}

// diterjang pemain lain (anim 3 = terjang) -> terpental sedikit. Dihitung di sisi korban.
export function diveBump(e, others) {
  if (e.stun > 0 || e.shieldT > 0 || e.diveT > 0) return false;
  for (const o of others) {
    if (o === e || o.id === e.id || !o.active || o.anim !== 3) continue;
    const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.15 && Math.abs(e.pos.y - o.pos.y) < 1.3) { const k = d || 1; knock(e, (dx / k) * 7, 4.5, (dz / k) * 7, 0.45); return true; }
  }
  return false;
}

// return: 'finish' | 'dead' | null
export function postStep(e, L) {
  if (e.pos.y < L.killY) {
    if (L.survival) return 'dead';
    respawn(e, L);
    return null;
  }
  while (e.grounded && e.cp + 1 < L.cps.length && e.pos.z >= L.cps[e.cp + 1].z) e.cp++;
  if (!L.survival && L.finish(e)) return 'finish';
  return null;
}

const NONE = { x: 0, z: 0, jump: false, dive: false };

// ------------------------------------------------------------ kekuatan dewa
export const AB_CD = 12;
export const ABILITIES = {
  zeus: { name: 'Petir Zeus', desc: 'Setrum lawan di sekitarmu', area: 'zap', r: 5, color: 0xffe04a },
  poseidon: { name: 'Ombak Besar', desc: 'Dorong semua lawan di dekatmu', area: 'push', r: 6.5, color: 0x4dc3ff },
  athena: { name: 'Perisai Aegis', desc: 'Kebal rintangan selama 3 detik', self: 'shield', dur: 3, color: 0xb9a6ff },
  hades: { name: 'Langkah Bayangan', desc: 'Teleport 6 langkah ke depan', self: 'blink', color: 0x9b5cff },
  apollo: { name: 'Sayap Surya', desc: 'Melayang pelan selama 3 detik', self: 'float', dur: 3, color: 0xffb347 },
  ares: { name: 'Amuk Perang', desc: 'Terjang jauh sambil kebal', self: 'charge', dur: 1.2, color: 0xff4d4d },
  hermes: { name: 'Sandal Bersayap', desc: 'Lari kencang selama 3,5 detik', self: 'speed', dur: 3.5, color: 0x8fe3c0 },
  thor: { name: 'Lompatan Mjolnir', desc: 'Lompat super tinggi', self: 'leap', color: 0xd9e4ff },
  loki: { name: 'Tipu Daya', desc: 'Balik arah kontrol lawan di dekatmu', area: 'confuse', r: 6, color: 0xff6a2b },
  odin: { name: 'Berkah Allfather', desc: 'Cepat dan ringan selama 3 detik', self: 'bless', dur: 3, color: 0xc9d2e0 },
};
// efek pada diri sendiri (dipanggil di perangkat pemilik karakter)
export function castSelf(e) {
  const a = ABILITIES[e.god] || ABILITIES.zeus, s = Math.sin(e.yaw), c = Math.cos(e.yaw);
  e.abCd = AB_CD;
  switch (a.self) {
    case 'shield': e.shieldT = 3; break;
    case 'blink': e.pos.x += s * 6; e.pos.z += c * 6; e.vel.y = Math.max(e.vel.y, 2); break;
    case 'float': e.floatT = 3; e.vel.y = Math.max(e.vel.y, 7); e.grounded = false; break;
    case 'charge': e.vel.set(s * 17, 4, c * 17); e.shieldT = 1.2; e.diveT = 0.5; e.stun = 0; break;
    case 'speed': e.speedT = 3.5; break;
    case 'leap': e.vel.y = 16; e.grounded = false; e.coyote = 0; break;
    case 'bless': e.speedT = 3; e.floatT = 3; break;
  }
}
// efek area pada korban (dipanggil di perangkat pemilik korban)
export function applyArea(a, cx, cy, cz, e) {
  const dx = e.pos.x - cx, dz = e.pos.z - cz, d = Math.hypot(dx, dz);
  if (d > a.r || Math.abs(e.pos.y - cy) > 3.5 || e.shieldT > 0) return false;
  const k = d || 1;
  if (a.area === 'zap') knock(e, (dx / k) * 3, 8, (dz / k) * 3, 0.9);
  else if (a.area === 'push') knock(e, (dx / k) * 12, 6, (dz / k) * 12, 0.5);
  else if (a.area === 'confuse') e.confuseT = 2.5;
  return true;
}
// kapan bot memakai kekuatannya
export function botWantsAbility(e, L, ents) {
  if (e.abCd > 0 || e.stun > 0 || Math.random() > 0.02) return false;
  const a = ABILITIES[e.god];
  if (!a) return false;
  if (a.area) return ents.some(o => o !== e && o.active && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < a.r * 0.8 && Math.abs(o.pos.y - e.pos.y) < 3);
  if (a.self === 'blink' || a.self === 'charge') {
    const k = a.self === 'blink' ? 6 : 9;
    return e.grounded && L.groundAt(e.pos.x + Math.sin(e.yaw) * k, e.pos.z + Math.cos(e.yaw) * k, e.pos.y + 1) > e.pos.y - 1.5;
  }
  if (L.survival) return a.self === 'shield' || a.self === 'leap';
  return true;
}

export function botInput(e, L, t, dt) {
  const ai = e.ai;
  if (e.stun > 0 || t < ai.delay) return NONE;
  const inp = { x: 0, z: 0, jump: false, dive: false };
  let tx, tz;
  if (L.survival) {
    ai.re -= dt;
    if (!ai.tile || ai.re <= 0 || ai.tile.time < t + 1.7) {
      const safe = L.tiles.filter(T => T.time > t + 3.2);
      const near = safe.filter(T => Math.hypot(T.P.x - e.pos.x, T.P.z - e.pos.z) < 9.5);
      const pool = near.length ? near : safe;
      ai.tile = pool.length ? pool[(Math.random() * pool.length) | 0] : null;
      ai.re = 1.5 + Math.random() * 2.5;
    }
    if (!ai.tile) return NONE;
    tx = ai.tile.P.x + ai.lane * 1.1; tz = ai.tile.P.z + ai.lane2 * 1.1;
    if (Math.hypot(tx - e.pos.x, tz - e.pos.z) < 0.6) return NONE;
  } else if (L.collect) {
    // kejar apel emas terdekat yang tersedia
    let best = -1, bd = 1e9;
    const sp = L.collect.spots, av = L.collect.avail;
    for (let k = 0; k < sp.length; k++) {
      if (av[k] > t) continue;
      const d = Math.hypot(sp[k].x - e.pos.x, sp[k].z - e.pos.z) * (1 + 0.35 * Math.abs(Math.sin(k * 12.9898 + ai.lane * 78.233)));
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return NONE;
    tx = sp[best].x; tz = sp[best].z;
  } else {
    while (ai.wp < L.wps.length - 1 && e.pos.z > L.wps[ai.wp].z - 0.6) ai.wp++;
    const w = L.wps[ai.wp];
    tx = w.x + ai.lane * (w.w || 0); tz = w.z;
    // macet terlalu lama -> ulang dari checkpoint
    ai.stuckT += dt;
    if (Math.abs(e.pos.z - ai.lastZ) > 1) { ai.lastZ = e.pos.z; ai.stuckT = 0; }
    if (ai.stuckT > 10) { respawn(e, L); return NONE; }
  }
  let dx = tx - e.pos.x, dz = tz - e.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;

  // hindari rintangan (batu menggelinding dll)
  if (ai.skill > 0.25) {
    for (const o of L.obs) {
      if (!o.avoid) continue;
      const a = o.avoid(e);
      if (a) { dx += a * 1.4; const l = Math.hypot(dx, dz); dx /= l; dz /= l; break; }
    }
  }
  if (e.grounded) {
    const y = e.pos.y;
    const g1 = L.groundAt(e.pos.x + dx * 1.3, e.pos.z + dz * 1.3, y + 0.7);
    if (g1 < y - 1.5) {
      const reach = SPEED * ai.speed * 2 * JUMP / L.gravity;
      let ok = false;
      for (const k of [reach * 0.65, reach * 0.85, reach]) {
        if (L.groundAt(e.pos.x + dx * k, e.pos.z + dz * k, y + 1.3, 0) > y - 3) { ok = true; break; }
      }
      if (ok) inp.jump = true; else return NONE; // tunggu platform lewat
    }
    // lompati palang berputar
    let warn = -1;
    for (let i = 0; i < L.obs.length; i++) if (L.obs[i].warn && L.obs[i].warn(e, t)) { warn = i; break; }
    if (warn >= 0 && warn !== ai.warned && Math.random() < 0.55 + ai.skill * 0.45) inp.jump = true;
    // kalau masih terancam setelah setengah detik, coba lagi
    ai.warnT = warn >= 0 && warn === ai.warned ? (ai.warnT || 0) + dt : 0;
    ai.warned = ai.warnT > 0.5 ? -1 : warn;
  }
  inp.x = dx * ai.speed; inp.z = dz * ai.speed;
  return inp;
}

# Asgardian

Party royale para dewa: 3 ronde eliminasi, multiplayer lewat WiFi yang sama, bisa dimainkan di browser PC, Android, dan iOS.

## Menjalankan
- Klik dua kali `start.command` (Mac), atau jalankan `npm install` sekali lalu `npm start`.
- Di komputer: buka `http://localhost:3000`.
- Di HP (WiFi yang sama): buka alamat `http://192.168.x.x:3000` yang tampil di terminal dan di lobby.
- Pemain pertama yang masuk jadi host dan menekan MULAI GAME.

## Struktur
- `server.js` — server file + WebSocket: lobby, ronde, simulasi bot, kekuatan dewa, apel emas.
- `public/js/sim.js` — fisika karakter, AI bot, kekuatan dewa (dipakai browser dan server).
- `public/js/levels.js` — 9 map, pulau lobby, dan rintangannya.
- `public/js/gods.js`, `props.js` — karakter dan aset dekorasi.
- `public/js/main.js` — render, kontrol, UI, jaringan di sisi pemain.
- `tools/make_character.py`, `tools/make_props.py` — skrip Blender pembuat `public/assets/*.glb`:
  `/Applications/Blender.app/Contents/MacOS/Blender --background --python tools/make_props.py`

## Mode tes
`DEBUG=1 node server.js`, lalu buka `http://localhost:3000/?auto=1&level=N` untuk langsung masuk ke map nomor N (0–8).
Tambahkan `&shot=3&ttl=30` supaya halaman mengirim screenshot tiap 3 detik ke folder `SHOT_DIR` dan menutup dirinya setelah 30 detik; `?lineup=1` menampilkan barisan semua dewa di menu.

## Menuju APK / app
Game ini butuh server. Untuk dirilis sebagai app: taruh `server.js` di hosting (HTTPS/WSS), lalu bungkus folder `public` dengan Capacitor (Android/iOS) yang mengarah ke alamat server tersebut.

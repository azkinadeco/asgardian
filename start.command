#!/bin/bash
# Klik dua kali file ini di Finder untuk menjalankan Asgardian.
cd "$(dirname "$0")" || exit 1
[ -d node_modules ] || npm install
(sleep 2; open "http://localhost:3000") &
node server.js

#!/usr/bin/env bash
set -euo pipefail
cd /home/deploy/anki-battle
umask 077
mkdir -p backups
docker exec anki-battle-app node --import tsx scripts/backup.ts /data/backups
# Copy the already-consistent completed backup, never the live SQLite WAL files.
docker cp anki-battle-app:/data/backups/. backups/
find backups -maxdepth 1 -type d -name '20*' -mtime +14 -exec rm -rf -- {} +

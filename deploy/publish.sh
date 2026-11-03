#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
target="${ANKI_SSH:-deploy@165.22.7.160}"
key="${ANKI_SSH_KEY:-$HOME/.ssh/mb_serraria_deploy}"
npm test
npm run build
ssh -i "$key" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes "$target" 'mkdir -p /home/deploy/anki-battle'
rsync -az --exclude .git --exclude node_modules --exclude data --exclude tmp --exclude backups --exclude '.env*' --exclude test-results --exclude playwright-report --exclude docs/screenshots --exclude deploy/evidence -e "ssh -i $key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes" ./ "$target:/home/deploy/anki-battle/"
ssh -i "$key" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes "$target" 'set -eu; cd /home/deploy/anki-battle; if docker inspect anki-battle-app >/dev/null 2>&1; then bash deploy/backup.sh; fi; docker compose build app; if ! docker volume inspect anki-battle_anki_data >/dev/null 2>&1; then docker volume create anki-battle_anki_data; docker run --rm --user 0 -v anki-battle_anki_data:/data anki-battle:local sh -c "chown 1000:1000 /data && chmod 700 /data"; fi; docker compose up -d --wait --wait-timeout 90; docker compose ps'
curl --fail --silent --show-error https://anki.aneblober.com/api/health

#!/usr/bin/env bash
# Publishes the public site and the HR portal to the Fide web server.
#
#   FIDE_DEPLOY_HOST=fide-web ./deploy/deploy.sh
#
# FIDE_DEPLOY_HOST is an ssh host alias with key authentication (no passwords
# here). The server needs Docker Compose and a one-time setup (deploy/README.md).
# Each run uploads a new release next to the previous ones and switches to it;
# rolling back means pointing `www` at an older release (deploy/README.md).
set -euo pipefail

host="${FIDE_DEPLOY_HOST:?set FIDE_DEPLOY_HOST to an ssh host alias (see deploy/README.md)}"
dir="${FIDE_DEPLOY_DIR:-/opt/fide-web}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$repo/app/apps/web-portal/.env.production"

if ! grep -q '^VITE_SUPABASE_URL=https://' "$env_file" 2>/dev/null || ! grep -q '^VITE_SUPABASE_PUBLISHABLE_KEY=.' "$env_file"; then
  echo "Create $env_file with VITE_SUPABASE_URL=https://<project>.supabase.co and VITE_SUPABASE_PUBLISHABLE_KEY=<key>." >&2
  exit 1
fi

cd "$repo/app"
npm ci --no-audit --no-fund
npm run build --workspace apps/site
npm run build --workspace apps/web-portal

release="$(date -u +%Y%m%d%H%M%S)"
target="$dir/releases/$release"
echo "Uploading release $release to $host:$dir"
ssh "$host" "mkdir -p '$target/site' '$target/portal'"
# Cloudflare-only files stay behind; Caddy has its own copy of those rules.
tar -C apps/site/dist --exclude=./_headers --exclude=./_redirects -cf - . | ssh "$host" "tar -C '$target/site' -xf -"
tar -C apps/web-portal/dist --exclude=./_headers --exclude=./_redirects -cf - . | ssh "$host" "tar -C '$target/portal' -xf -"
tar -C "$repo/deploy/caddy" -cf - Caddyfile docker-compose.yml | ssh "$host" "tar -C '$dir' -xf -"

# Switch, recreate the container (bind mounts resolve the symlink at start;
# certificates live in a volume, so this takes a second), keep 5 releases.
ssh "$host" "set -e
  cd '$dir'
  ln -sfn 'releases/$release' www
  docker compose up -d --force-recreate --remove-orphans
  ls -1dt releases/* | tail -n +6 | xargs -r rm -rf"

echo "Published $release. Check: curl -sI https://fide-work.it https://app.fide-work.it"

#!/usr/bin/env bash
# Publishes the public site and the HR portal to the Fide web server.
#
#   FIDE_DEPLOY_HOST=fide-web ./deploy/deploy.sh
#
# FIDE_DEPLOY_HOST is an ssh host alias (or user@host) with key authentication
# (no passwords here); FIDE_DEPLOY_SSH_KEY optionally names the key file. It
# only uploads static files: the nginx config is installed once, by an
# administrator, as described in deploy/README.md. Each run uploads a new
# release next to the previous ones and points `www` at it; nginx serves the new
# files immediately (no reload). Rolling back = pointing `www` at an older release.
set -euo pipefail

host="${FIDE_DEPLOY_HOST:?set FIDE_DEPLOY_HOST to an ssh host alias (see deploy/README.md)}"
dir="${FIDE_DEPLOY_DIR:-/opt/fide-web}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$repo/app/apps/web-portal/.env.production"
ssh_opts=()
if [ -n "${FIDE_DEPLOY_SSH_KEY:-}" ]; then ssh_opts=(-i "$FIDE_DEPLOY_SSH_KEY"); fi

if ! grep -q '^VITE_SUPABASE_URL=https://' "$env_file" 2>/dev/null || ! grep -q '^VITE_SUPABASE_PUBLISHABLE_KEY=.' "$env_file"; then
  echo "Create $env_file with VITE_SUPABASE_URL=https://<project>.supabase.co and VITE_SUPABASE_PUBLISHABLE_KEY=<key>." >&2
  exit 1
fi

cd "$repo/app"
# A clean install only when dependencies changed: `npm ci` deletes node_modules
# first, which fails on Windows while dev servers hold files open.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi
npm run build --workspace apps/site
npm run build --workspace apps/web-portal

release="$(date -u +%Y%m%d%H%M%S)"
target="$dir/releases/$release"
echo "Uploading release $release to $host:$dir"
ssh "${ssh_opts[@]}" "$host" "mkdir -p '$target/site' '$target/portal'"
# Cloudflare-only files stay behind; nginx has its own copy of those rules.
tar -C apps/site/dist --exclude=./_headers --exclude=./_redirects -cf - . | ssh "${ssh_opts[@]}" "$host" "tar --no-same-owner -C '$target/site' -xf -"
tar -C apps/web-portal/dist --exclude=./_headers --exclude=./_redirects -cf - . | ssh "${ssh_opts[@]}" "$host" "tar --no-same-owner -C '$target/portal' -xf -"

# Atomic switch (rename over the old symlink), then keep the last 5 releases.
ssh "${ssh_opts[@]}" "$host" "set -e
  cd '$dir'
  ln -sfn 'releases/$release' www.next && mv -T www.next www
  ls -1dt releases/* | tail -n +6 | xargs -r rm -rf"

echo "Published $release. Check: curl -sI https://fide-work.it https://app.fide-work.it"

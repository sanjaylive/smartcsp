#!/bin/sh
# Runs ON the production host (called by .github/workflows/deploy.yml). Pulls the commit's images,
# backs up the database, applies migrations (release step), then rolls out api/worker/web/admin.
#   echo "$GHCR_TOKEN" | IMAGE_PREFIX=ghcr.io/owner/smartcsp TAG=<sha> GHCR_USER=<user> sh remote-deploy.sh
set -eu
: "${IMAGE_PREFIX:?}" "${TAG:?}" "${GHCR_USER:?}"
cd /opt/csp2all/docker

if grep -q CHANGE_ME /etc/csp2all/api.env; then
  echo "ERROR: /etc/csp2all/api.env still has CHANGE_ME values (SMTP?). Fill them in, then redeploy." >&2
  exit 1
fi

export CSP2ALL_API_IMAGE="$IMAGE_PREFIX-api:$TAG"
export CSP2ALL_WEB_IMAGE="$IMAGE_PREFIX-web:$TAG"
export CSP2ALL_ADMIN_IMAGE="$IMAGE_PREFIX-admin:$TAG"
C="docker compose -f compose.prod.yml --env-file /etc/csp2all/prod.env"

echo "==> Pulling images for $TAG"
docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
$C pull api web admin
docker logout ghcr.io >/dev/null

echo "==> Starting data services"
$C up -d postgres redis s3
i=0
# TCP check: on first boot the init scripts run against a socket-only server, so -h 127.0.0.1
# only succeeds once roles + database exist and the real server is up.
until $C exec -T postgres pg_isready -h 127.0.0.1 -U postgres -d csp2all >/dev/null 2>&1; do
  i=$((i + 1)); [ $i -gt 60 ] && { echo "postgres not ready" >&2; exit 1; }; sleep 2
done

echo "==> Backing up database"
mkdir -p /var/backups/csp2all
BACKUP="/var/backups/csp2all/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$(echo "$TAG" | cut -c1-12).dump"
$C exec -T postgres pg_dump -U postgres --format=custom --compress=9 csp2all > "$BACKUP"
echo "    $BACKUP ($(du -h "$BACKUP" | cut -f1))"
find /var/backups/csp2all -name 'pre-deploy-*.dump' -mtime +14 -delete

echo "==> Migrating (owner role) + reference data"
$C --profile release run --rm migrate

echo "==> Rolling out"
$C up -d --remove-orphans api worker web admin caddy

i=0
until $C exec -T api node -e "fetch('http://127.0.0.1:4610/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ $i -gt 45 ]; then
    echo "api did not become ready; recent logs:" >&2
    $C logs --tail 80 api >&2
    exit 1
  fi
  sleep 2
done

echo "$TAG" > /opt/csp2all/DEPLOYED
docker image prune -f >/dev/null
echo "==> Deployed $TAG"

#!/bin/sh
# Runs ON the shared production host (called by .github/workflows/deploy.yml over SSH):
#   echo "$GHCR_TOKEN" | IMAGE_PREFIX=ghcr.io/owner/smartcsp TAG=<sha> GHCR_USER=<user> sh remote-deploy.sh
#
# Layout (/opt/csp2all, owned by the deploy user):
#   docker/        compose.smart-outlet.yml, postgres-init-prod/, smart-outlet.caddy (uploaded per deploy)
#   api.env        API/worker settings + secrets, generated on the first deploy (mode 600, never in git)
#   secrets/       generated passwords (Postgres roles, Redis)
# Steps: first-run secrets → pull images → DB up → backup → migrate → roll out (wait for health)
#        → make sure the edge Caddy (pay2all stack) serves smart-outlet.in → prune.
set -eu
: "${IMAGE_PREFIX:?}" "${TAG:?}" "${GHCR_USER:?}"
BASE=${CSP2ALL_HOME:-/opt/csp2all}
DOMAIN=${DOMAIN:-smart-outlet.in}
EDGE_CONTAINER=${EDGE_CONTAINER:-pay2all-caddy-1}
ENV_FILE="$BASE/api.env"

log() { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy] %s\033[0m\n' "$*" >&2; exit 1; }

docker info >/dev/null 2>&1 || die "$(id -un) cannot use Docker"
EDGE_NETWORK=${EDGE_NETWORK:-$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$EDGE_CONTAINER" 2>/dev/null | awk '{print $1}')}
[ -n "$EDGE_NETWORK" ] || die "edge proxy container $EDGE_CONTAINER not found"

# ---- first deploy: secrets + env (kept forever after) -----------------------------------------
umask 077
mkdir -p "$BASE/secrets"
secret() { f="$BASE/secrets/$1"; [ -s "$f" ] || openssl rand -hex "$2" > "$f"; chmod 644 "$f"; cat "$f"; }
PG_OWNER=$(secret pg_owner_password 24)
PG_APP=$(secret pg_app_password 24)
secret pg_superuser_password 24 >/dev/null
REDIS_PASSWORD=$(secret redis_password 24)
chmod 711 "$BASE/secrets" # postgres container reads the bind-mounted files as its own uid

if [ ! -f "$ENV_FILE" ]; then
  log "First deploy: generating $ENV_FILE with fresh secrets"
  rnd() { openssl rand -hex "$1"; }
  cat > "$ENV_FILE" <<ENV
# smartcsp (smart-outlet.in) production settings. Generated $(date -u +%FT%TZ) by remote-deploy.sh.
# Stays on the server; never commit. PUBLIC_API_URL, WEB_ORIGINS and storage are set in compose.
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=postgresql://csp2all_app:$PG_APP@csp-postgres:5432/csp2all
MIGRATION_DATABASE_URL=postgresql://csp2all_owner:$PG_OWNER@csp-postgres:5432/csp2all
REDIS_URL=redis://:$REDIS_PASSWORD@csp-redis:6379/0
COOKIE_SECURE=true
TRUST_PROXY=true
OTP_PEPPER=$(rnd 32)
SECRETS_ENCRYPTION_KEY=$(rnd 32)
FILE_URL_SIGNING_KEY=$(rnd 32)
IP_HASH_SALT=$(rnd 16)
METRICS_TOKEN=$(rnd 24)
API_DOCS_ENABLED=false
QUEUE_DRIVER=bullmq
CONNECTOR_SIMULATOR_ENABLED=false
ATTACHMENT_SCAN_DRIVER=none
# Sign-in codes are emailed: set a real SMTP account, then redeploy (or restart csp-api/csp-worker).
EMAIL_DRIVER=smtp
EMAIL_DELIVERY=queue
EMAIL_FROM="Smart Outlet <no-reply@$DOMAIN>"
SMTP_HOST=CHANGE_ME
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=CHANGE_ME
SMTP_PASSWORD=CHANGE_ME
ENV
fi
chmod 600 "$ENV_FILE"
umask 022
if grep -q '^SMTP_HOST=CHANGE_ME' "$ENV_FILE"; then
  log "WARNING: SMTP is not configured in $ENV_FILE — sign-in emails will not be delivered."
fi

export APP_DOMAIN="$DOMAIN" REDIS_PASSWORD EDGE_NETWORK CSP2ALL_ENV_FILE="$ENV_FILE"
export CSP2ALL_API_IMAGE="$IMAGE_PREFIX-api:$TAG"
export CSP2ALL_WEB_IMAGE="$IMAGE_PREFIX-web:$TAG"
export CSP2ALL_ADMIN_IMAGE="$IMAGE_PREFIX-admin:$TAG"
C="docker compose -p smartcsp -f $BASE/docker/compose.smart-outlet.yml"

log "Pulling images for $TAG"
docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
$C pull csp-api csp-web csp-admin
docker logout ghcr.io >/dev/null

log "Starting data services"
$C up -d --wait --wait-timeout 180 csp-postgres csp-redis
# The API image runs as uid 1000 with a read-only root FS: the storage volume must be writable by it.
docker run --rm -v smartcsp_storage:/s alpine:3.22 chown 1000:1000 /s

log "Backing up database"
mkdir -p "$BASE/backups"
BACKUP="$BASE/backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$(echo "$TAG" | cut -c1-12).dump"
$C exec -T csp-postgres pg_dump -U postgres --format=custom --compress=9 csp2all > "$BACKUP"
chmod 600 "$BACKUP"
log "  $BACKUP ($(du -h "$BACKUP" | cut -f1))"
find "$BASE/backups" -name 'pre-deploy-*.dump' -mtime +14 -delete

log "Migrating (owner role) + reference data"
$C --profile release run --rm csp-migrate

log "Rolling out"
if ! $C up -d --remove-orphans --wait --wait-timeout 180 csp-api csp-worker csp-web csp-admin; then
  $C logs --tail 60 csp-api csp-worker >&2 || true
  die "stack did not become healthy"
fi

# ---- edge Caddy: same approach as park2all. The Caddyfile is a single-file bind mount from the
# pay2all release; edit it in place (same inode) between our markers, validate, reload, restore on error.
log "Edge proxy: $DOMAIN"
CADDYFILE=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$EDGE_CONTAINER")
BLOCK="$BASE/docker/smart-outlet.caddy"
VLOG="$BASE/caddy-validate.log"
[ -n "$CADDYFILE" ] && [ -w "$CADDYFILE" ] || die "cannot edit the edge Caddyfile ($CADDYFILE); add $BLOCK to it by hand"
# Current Caddyfile minus any previous smartcsp section, plus the given block.
build_candidate() {
  awk '/^# BEGIN smartcsp/{skip=1}
       !skip { if ($0 == "") blank++; else { for (; blank > 0; blank--) print ""; print } }
       /^# END smartcsp$/{skip=0}' "$CADDYFILE"
  printf '\n'
  cat "$1"
}
# Shop custom domains need a global on_demand_tls ask: Caddy only issues on-demand certs it approves.
# It goes in the global options block (a lone "{" before any site); one is created if there is none.
add_ask() {
  grep -qE '^[[:space:]]*on_demand_tls' "$1" && return 0
  T=$(mktemp)
  if grep -vE '^[[:space:]]*(#|$)' "$1" | head -1 | grep -qE '^[[:space:]]*\{[[:space:]]*$'; then
    awk '{print} !done && /^[[:space:]]*\{[[:space:]]*$/ {
           print "\ton_demand_tls {"; print "\t\task http://csp-api:4610/v1/public/tls-check"; print "\t}"; done=1}' "$1" > "$T"
  else
    { printf '{\n\ton_demand_tls {\n\t\task http://csp-api:4610/v1/public/tls-check\n\t}\n}\n\n'; cat "$1"; } > "$T"
  fi
  mv "$T" "$1"
}
validate() {
  docker exec -i "$EDGE_CONTAINER" sh -c 'cat > /tmp/smartcsp.Caddyfile && caddy validate --config /tmp/smartcsp.Caddyfile --adapter caddyfile' \
    < "$1" > "$VLOG" 2>&1
}
show_errors() { grep -iE 'error|Error' "$VLOG" | tail -8 | sed 's/^/    /' >&2 || true; }

CANDIDATE=$(mktemp)
build_candidate "$BLOCK" > "$CANDIDATE"
add_ask "$CANDIDATE"
if ! validate "$CANDIDATE"; then
  log "WARNING: edge Caddy rejected the shop custom-domain block:"
  show_errors
  log "  applying $DOMAIN without custom domains (main site unaffected)"
  BASIC=$(mktemp)
  awk '/^# >>> custom-domains/{s=1} !s{print} /^# <<< custom-domains/{s=0}' "$BLOCK" > "$BASIC"
  build_candidate "$BASIC" > "$CANDIDATE"
  rm -f "$BASIC"
  if ! validate "$CANDIDATE"; then
    show_errors
    rm -f "$CANDIDATE"
    die "edge Caddy rejected the smartcsp block; Caddyfile left unchanged (full output: $VLOG)"
  fi
fi
if cmp -s "$CANDIDATE" "$CADDYFILE"; then
  log "Edge Caddyfile already up to date"
else
  cp "$CADDYFILE" "$BASE/Caddyfile.edge.bak"
  cat "$CANDIDATE" > "$CADDYFILE"
  docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
    || { cat "$BASE/Caddyfile.edge.bak" > "$CADDYFILE"; rm -f "$CANDIDATE"; die "edge Caddy rejected the reload; its Caddyfile was restored"; }
  log "Edge Caddy reloaded (previous file: $BASE/Caddyfile.edge.bak)"
fi
rm -f "$CANDIDATE"

echo "$TAG" > "$BASE/DEPLOYED"
docker image ls --format '{{.Repository}}:{{.Tag}}' | grep "^$IMAGE_PREFIX-" | grep -v ":$TAG\$" | xargs -r docker image rm >/dev/null 2>&1 || true
log "Done: https://$DOMAIN is on $TAG"

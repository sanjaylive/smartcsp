#!/bin/sh
# One-time production host setup for smart-outlet.in. Run as root on the server:
#
#   DEPLOY_PUBKEY='ssh-ed25519 AAAA... smartcsp-deploy' sh server-bootstrap.sh
#
# Installs Docker, creates the `deploy` user (key-only, docker group) used by GitHub Actions, and
# writes /etc/csp2all/{prod.env,api.env,seaweedfs-s3.json,secrets/*} with freshly generated secrets.
# Re-running is safe: existing secrets and env files are never overwritten.
# Afterwards, fill the SMTP_* values in /etc/csp2all/api.env (deploys refuse while CHANGE_ME remains).
set -eu
: "${DEPLOY_PUBKEY:?set DEPLOY_PUBKEY to the deploy public key}"
APP_DOMAIN="${APP_DOMAIN:-smart-outlet.in}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-admin.$APP_DOMAIN}"
API_DOMAIN="${API_DOMAIN:-api.$APP_DOMAIN}"
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

# --- Ports 80/443 must be free for the stack's Caddy container --------------------------------
busy=$(ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v docker-proxy || true)
if [ -n "$busy" ]; then
  if [ "${REPLACE_EXISTING_PROXY:-}" = 1 ]; then
    for svc in caddy nginx apache2 httpd; do
      systemctl disable --now "$svc" 2>/dev/null && echo "Stopped and disabled host service: $svc" || true
    done
  else
    echo "Ports 80/443 are in use by a host service:" >&2
    echo "$busy" >&2
    echo "The stack runs its own Caddy (TLS for $APP_DOMAIN, $ADMIN_DOMAIN, $API_DOMAIN)." >&2
    echo "Re-run with REPLACE_EXISTING_PROXY=1 to stop/disable it, or free the ports yourself." >&2
    exit 1
  fi
fi

# --- Docker -----------------------------------------------------------------------------------
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null

# --- deploy user --------------------------------------------------------------------------------
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$DEPLOY_PUBKEY" /home/deploy/.ssh/authorized_keys || echo "$DEPLOY_PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

install -d -o deploy -g deploy /opt/csp2all /var/backups/csp2all
install -d -m 750 -o root -g deploy /etc/csp2all /etc/csp2all/secrets

# --- secrets (generated once) -------------------------------------------------------------------
secret() { # name, bytes
  f="/etc/csp2all/secrets/$1"
  # 644: the postgres container reads these as its own uid; the 750 root:deploy directory is what
  # keeps other host users out.
  [ -s "$f" ] || { openssl rand -hex "$2" > "$f"; chmod 644 "$f"; }
  cat "$f"
}
PG_SUPER=$(secret pg_superuser_password 24)
PG_OWNER=$(secret pg_owner_password 24)
PG_APP=$(secret pg_app_password 24)
REDIS_PW=$(secret redis_password 24)
S3_KEY=$(secret s3_access_key 12)
S3_SECRET=$(secret s3_secret_key 24)
OTP_PEPPER=$(secret otp_pepper 32)
ENC_KEY=$(secret secrets_encryption_key 32)
URL_KEY=$(secret file_url_signing_key 32)
IP_SALT=$(secret ip_hash_salt 16)
METRICS=$(secret metrics_token 24)
: "$PG_SUPER"

write_once() { # path, then content on stdin
  if [ -e "$1" ]; then echo "kept existing $1"; cat >/dev/null; else cat > "$1"; chmod 640 "$1"; chgrp deploy "$1"; echo "wrote $1"; fi
}

write_once /etc/csp2all/prod.env <<EOF
APP_DOMAIN=$APP_DOMAIN
ADMIN_DOMAIN=$ADMIN_DOMAIN
API_DOMAIN=$API_DOMAIN
REDIS_PASSWORD=$REDIS_PW
EOF

write_once /etc/csp2all/seaweedfs-s3.json <<EOF
{ "identities": [ { "name": "csp2all", "credentials": [ { "accessKey": "$S3_KEY", "secretKey": "$S3_SECRET" } ],
  "actions": ["Admin", "Read", "Write", "List", "Tagging"] } ] }
EOF
chmod 644 /etc/csp2all/seaweedfs-s3.json # read by the seaweedfs container user

write_once /etc/csp2all/api.env <<EOF
NODE_ENV=production
PORT=4610
LOG_LEVEL=info
DATABASE_URL=postgresql://csp2all_app:$PG_APP@postgres:5432/csp2all
MIGRATION_DATABASE_URL=postgresql://csp2all_owner:$PG_OWNER@postgres:5432/csp2all
REDIS_URL=redis://:$REDIS_PW@redis:6379/0
WEB_ORIGINS=https://$APP_DOMAIN,https://$ADMIN_DOMAIN
PUBLIC_API_URL=https://$API_DOMAIN
COOKIE_SECURE=true
TRUST_PROXY=true
OTP_PEPPER=$OTP_PEPPER
SECRETS_ENCRYPTION_KEY=$ENC_KEY
FILE_URL_SIGNING_KEY=$URL_KEY
IP_HASH_SALT=$IP_SALT
EMAIL_DRIVER=smtp
EMAIL_DELIVERY=queue
EMAIL_FROM="Smart Outlet <no-reply@$APP_DOMAIN>"
SMTP_HOST=CHANGE_ME
SMTP_PORT=587
SMTP_USER=CHANGE_ME
SMTP_PASSWORD=CHANGE_ME
SMTP_SECURE=false
STORAGE_DRIVER=s3
S3_ENDPOINT=http://s3:8333
S3_REGION=ap-south-1
S3_BUCKET=csp2all
S3_ACCESS_KEY_ID=$S3_KEY
S3_SECRET_ACCESS_KEY=$S3_SECRET
S3_FORCE_PATH_STYLE=true
ATTACHMENT_SCAN_DRIVER=none
QUEUE_DRIVER=bullmq
CONNECTOR_SIMULATOR_ENABLED=false
METRICS_TOKEN=$METRICS
API_DOCS_ENABLED=false
EOF

echo
echo "Done. Next:"
echo "  1. Edit /etc/csp2all/api.env and set SMTP_HOST / SMTP_USER / SMTP_PASSWORD (and SMTP_PORT/SECURE)."
echo "  2. DNS A records for $APP_DOMAIN, $ADMIN_DOMAIN, $API_DOMAIN → this server."
echo "  3. From your laptop: npm run deploy"

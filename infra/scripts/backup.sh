#!/bin/sh
# Nightly logical backup of the CSP2All database (custom format, compressed), optionally encrypted
# with `age` and uploaded to a private bucket. Schedule via cron/systemd timer, e.g. 01:30 IST.
#   BACKUP_DATABASE_URL=postgresql://csp2all_owner:...@host/csp2all \
#   BACKUP_DIR=/var/backups/csp2all AGE_RECIPIENT=age1... S3_BACKUP_URI=s3://bucket/csp2all ./backup.sh
set -eu
: "${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL}"
DIR="${BACKUP_DIR:-./backups}"; mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$DIR/csp2all-$STAMP.dump"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file "$FILE" "$BACKUP_DATABASE_URL"
pg_restore --list "$FILE" > /dev/null   # sanity check the archive is readable
if [ -n "${AGE_RECIPIENT:-}" ]; then age -r "$AGE_RECIPIENT" -o "$FILE.age" "$FILE" && rm "$FILE" && FILE="$FILE.age"; fi
sha256sum "$FILE" > "$FILE.sha256"
if [ -n "${S3_BACKUP_URI:-}" ]; then aws s3 cp "$FILE" "$S3_BACKUP_URI/" --sse AES256 && aws s3 cp "$FILE.sha256" "$S3_BACKUP_URI/"; fi
find "$DIR" -name 'csp2all-*.dump*' -mtime +"${RETENTION_DAYS:-14}" -delete
echo "Backup written: $FILE"

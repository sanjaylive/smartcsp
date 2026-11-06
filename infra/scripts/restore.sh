#!/bin/sh
# Restores a CSP2All backup into an EMPTY database whose roles already exist (see postgres-init-prod).
# Always restore into a new database first, verify, then switch the application over.
#   RESTORE_DATABASE_URL=postgresql://csp2all_owner:...@host/csp2all_restore ./restore.sh backup.dump[.age]
set -eu
: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL}"
IN="$1"
case "$IN" in *.age) age -d -i "${AGE_IDENTITY:?set AGE_IDENTITY}" -o "${IN%.age}" "$IN"; IN="${IN%.age}";; esac
[ -f "$IN.sha256" ] && sha256sum -c "$IN.sha256" || true
pg_restore --exit-on-error --no-owner --role=csp2all_owner --dbname "$RESTORE_DATABASE_URL" "$IN"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "GRANT USAGE ON SCHEMA public TO csp2all_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO csp2all_app;"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "REVOKE UPDATE, DELETE ON journal_lines, audit_events, record_status_events, payment_allocations, provider_operation_events, subscription_events FROM csp2all_app;"
psql "$RESTORE_DATABASE_URL" -c "SELECT count(*) AS tenants FROM tenants; SELECT count(*) AS unbalanced FROM (SELECT \"entryId\" FROM journal_lines GROUP BY 1 HAVING sum(\"debitPaise\") <> sum(\"creditPaise\")) x;"
echo "Restore complete. Verify the counts above (unbalanced must be 0) before switching traffic."

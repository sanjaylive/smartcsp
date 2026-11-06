#!/bin/sh
# Drops and recreates a LOCAL development/test database, then applies migrations.
# Refuses to run against anything but the local compose Postgres.
set -eu
DB="${1:-csp2all_dev}"
case "$DB" in csp2all_dev|csp2all_test|csp2all_e2e) ;; *) echo "refusing: $DB"; exit 1;; esac
C=csp2all-dev-postgres-1
docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1 <<SQL
DROP DATABASE IF EXISTS $DB WITH (FORCE);
CREATE DATABASE $DB OWNER csp2all_owner;
SQL
docker exec -i $C psql -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO csp2all_owner;
GRANT USAGE ON SCHEMA public TO csp2all_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csp2all_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csp2all_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csp2all_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO csp2all_app;
SQL
cd "$(dirname "$0")/../../apps/api"
DATABASE_URL="postgresql://csp2all_owner:owner_dev_only@127.0.0.1:56632/$DB" npx prisma migrate deploy

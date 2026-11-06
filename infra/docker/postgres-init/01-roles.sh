#!/bin/sh
# Creates separate owner (migrations) and app (runtime, RLS-enforced) roles plus dev/test DBs.
# The app role is NOT the table owner and has no BYPASSRLS, so row-level security applies to it.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE csp2all_owner LOGIN PASSWORD '${CSP2ALL_OWNER_PASSWORD}';
CREATE ROLE csp2all_app LOGIN PASSWORD '${CSP2ALL_APP_PASSWORD}' NOBYPASSRLS;
CREATE DATABASE csp2all_dev OWNER csp2all_owner;
CREATE DATABASE csp2all_test OWNER csp2all_owner;
CREATE DATABASE csp2all_e2e OWNER csp2all_owner;
SQL
for db in csp2all_dev csp2all_test csp2all_e2e; do
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d "$db" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO csp2all_owner;
GRANT USAGE ON SCHEMA public TO csp2all_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csp2all_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csp2all_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csp2all_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO csp2all_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csp2all_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO csp2all_app;
SQL
done

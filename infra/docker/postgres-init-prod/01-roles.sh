#!/bin/sh
# Production role bootstrap: owner role runs migrations; app role is RLS-restricted (no BYPASSRLS).
set -eu
OWNER_PW=$(cat "$CSP2ALL_OWNER_PASSWORD_FILE"); APP_PW=$(cat "$CSP2ALL_APP_PASSWORD_FILE")
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE csp2all_owner LOGIN PASSWORD '${OWNER_PW}';
CREATE ROLE csp2all_app LOGIN PASSWORD '${APP_PW}' NOBYPASSRLS;
CREATE DATABASE csp2all OWNER csp2all_owner;
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d csp2all <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO csp2all_owner;
GRANT USAGE ON SCHEMA public TO csp2all_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csp2all_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csp2all_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csp2all_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO csp2all_app;
SQL

-- Run as migration administrator. No password in versioned SQL.
-- The dedicated login is enabled privately only after migrations and data validation.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'puzoto_runtime') THEN
    CREATE ROLE puzoto_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA puzoto TO puzoto_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA puzoto TO puzoto_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA puzoto TO puzoto_runtime;
DO $$ DECLARE entry record; BEGIN
  FOR entry IN SELECT tablename FROM pg_tables WHERE schemaname = 'puzoto' LOOP
    EXECUTE format('DROP POLICY IF EXISTS backend_owner ON puzoto.%I', entry.tablename);
    EXECUTE format('CREATE POLICY backend_owner ON puzoto.%I TO puzoto_runtime USING (true) WITH CHECK (true)', entry.tablename);
  END LOOP;
END $$;
-- Deliberately no membership in this role for anon/authenticated/service_role.
-- All end-user access goes through the backend's exact owner-UUID authorization.
-- A multiuser product requires owner columns and row isolation BEFORE more owners.

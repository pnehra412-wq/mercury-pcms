-- Mercury is a private, authenticated single-owner workspace.
-- Remove public API table access and privileges that bypass row-level security.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;

-- RLS does not protect TRUNCATE; these object-management privileges are not
-- required by the Mercury client and should never be granted to app users.
REVOKE TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Office views are read-only reporting surfaces. Keep authenticated SELECT,
-- but remove write/object-management grants from every public view.
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT schemaname, viewname
    FROM pg_views
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM authenticated',
      v.schemaname, v.viewname
    );
    EXECUTE format(
      'GRANT SELECT ON TABLE %I.%I TO authenticated',
      v.schemaname, v.viewname
    );
  END LOOP;
END $$;

-- Prevent future objects created by the migration owner from reopening
-- anonymous access or granting RLS-bypassing table privileges by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

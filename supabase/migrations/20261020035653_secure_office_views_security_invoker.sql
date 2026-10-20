-- Applied directly to the production Supabase project on 2026-10-20.
-- Idempotent record of the view hardening; does not change base-table data.
begin;
alter view public.office_court_watch set (security_invoker = true);
alter view public.office_document_inbox set (security_invoker = true);
revoke all privileges on table public.office_court_watch from anon;
revoke all privileges on table public.office_document_inbox from anon;
grant select on table public.office_court_watch to authenticated;
grant select on table public.office_document_inbox to authenticated;
commit;

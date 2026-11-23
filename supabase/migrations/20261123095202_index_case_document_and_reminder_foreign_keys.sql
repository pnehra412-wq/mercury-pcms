-- Add indexes for foreign-key lookups identified by the Supabase advisor.
create index if not exists cases_latest_order_document_id_idx on public.cases (latest_order_document_id);
create index if not exists hearing_reminders_case_id_idx on public.hearing_reminders (case_id);

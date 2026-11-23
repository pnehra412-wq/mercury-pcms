-- Enable row-change events for the authenticated single-user Mercury workspace.
-- Realtime applies the existing table RLS policies to authenticated subscribers.
alter publication supabase_realtime add table public.cases, public.tasks, public.fees, public.hearing_history, public.hearing_reminders, public.documents, public.document_analysis, public.court_watch, public.case_activity, public.case_notes, public.case_issues, public.case_contacts, public.case_ai_chats;

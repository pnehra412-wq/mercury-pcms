-- Set the authenticated owner automatically on inserts.
-- Existing rows are untouched; RLS policies continue to enforce auth.uid().
alter table public.case_activity alter column user_id set default auth.uid();
alter table public.case_ai_chats alter column user_id set default auth.uid();
alter table public.case_contacts alter column user_id set default auth.uid();
alter table public.case_issues alter column user_id set default auth.uid();
alter table public.case_notes alter column user_id set default auth.uid();
alter table public.cases alter column user_id set default auth.uid();
alter table public.court_watch alter column user_id set default auth.uid();
alter table public.document_analysis alter column user_id set default auth.uid();
alter table public.documents alter column user_id set default auth.uid();
alter table public.fees alter column user_id set default auth.uid();
alter table public.hearing_history alter column user_id set default auth.uid();
alter table public.hearing_reminders alter column user_id set default auth.uid();
alter table public.tasks alter column user_id set default auth.uid();

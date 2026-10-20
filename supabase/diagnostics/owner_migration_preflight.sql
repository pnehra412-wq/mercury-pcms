-- Mercury PCMS owner/RLS migration preflight (READ ONLY).
-- Safe to run against the live project: SELECT-only; no data or schema changes.
-- Run immediately before any proposed migration and retain the output privately.
-- Do not paste client/document contents into issues or public reports.

-- 1) Row counts for the tables that need ownership scoping.
select 'cases' as table_name, count(*)::bigint as row_count from public.cases
union all select 'tasks', count(*) from public.tasks
union all select 'hearing_history', count(*) from public.hearing_history
union all select 'documents', count(*) from public.documents
union all select 'document_analysis', count(*) from public.document_analysis
union all select 'case_ai_chats', count(*) from public.case_ai_chats
union all select 'case_contacts', count(*) from public.case_contacts
union all select 'case_issues', count(*) from public.case_issues
union all select 'case_notes', count(*) from public.case_notes
union all select 'court_watch', count(*) from public.court_watch
union all select 'fees', count(*) from public.fees
order by table_name;

-- 2) Relationship exceptions. These counts should be reviewed before backfill.
select 'cases_null_cino' as check_name, count(*)::bigint as issue_count
from public.cases where cino is null
union all
select 'documents_null_cino', count(*) from public.documents where cino is null
union all
select 'document_analysis_null_cino', count(*) from public.document_analysis where cino is null
union all
select 'documents_unmatched_cino', count(*) from public.documents d
where d.cino is not null and not exists (select 1 from public.cases c where c.cino=d.cino)
union all
select 'analysis_unmatched_cino', count(*) from public.document_analysis a
where a.cino is not null and not exists (select 1 from public.cases c where c.cino=a.cino)
union all
select 'analysis_missing_document', count(*) from public.document_analysis a
where not exists (select 1 from public.documents d where d.id=a.document_id)
union all
select 'tasks_unmatched_cino', count(*) from public.tasks t
where t.cino is not null and not exists (select 1 from public.cases c where c.cino=t.cino)
union all
select 'hearing_history_unmatched_cino', count(*) from public.hearing_history h
where h.cino is not null and not exists (select 1 from public.cases c where c.cino=h.cino)
order by check_name;

-- 3) Owner column presence. Expected to be empty before the owner migration.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in (
    'cases','tasks','hearing_history','documents','document_analysis',
    'case_ai_chats','case_contacts','case_issues','case_notes','court_watch','fees'
  )
  and column_name='owner_id'
order by table_name;

-- 4) Current RLS policies on the relevant tables. Inspect USING and WITH CHECK.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in (
    'cases','tasks','hearing_history','documents','document_analysis',
    'case_ai_chats','case_contacts','case_issues','case_notes','court_watch','fees'
  )
order by tablename, policyname;

-- 5) Existing FK actions; preserve intended delete/update semantics in any migration.
select conrelid::regclass as source_table, conname,
       confrelid::regclass as target_table,
       pg_get_constraintdef(oid) as definition,
       confdeltype as delete_action_code,
       confupdtype as update_action_code
from pg_constraint
where contype='f'
  and connamespace='public'::regnamespace
  and conrelid::regclass::text like 'public.%'
order by source_table::text, conname;

-- 6) View options for the two previously flagged views.
select c.relname as view_name, c.reloptions
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind='v'
  and c.relname in ('office_court_watch','office_document_inbox')
order by c.relname;

-- This file deliberately does not create users, alter policies, alter views,
-- backfill ownership, change Storage, or deploy Edge Functions.

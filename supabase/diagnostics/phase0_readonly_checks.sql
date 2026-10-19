-- Mercury PCMS Phase 0 diagnostics
-- READ-ONLY: safe for Supabase SQL Editor. This file contains no DDL/DML.
-- Run before and after a test deployment. Do not paste case content or object
-- names into public issues/commits. Record counts and review them locally.

-- 1) Application table counts (expect to change only when normal app use changes data).
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

-- 2) Storage inventory by bucket only (no object names or document metadata).
select bucket_id,
       count(*)::bigint as object_count,
       count(*) filter (where position('/' in name) > 0)::bigint as nested_path_count,
       count(*) filter (where position('/' in name) = 0)::bigint as root_path_count
from storage.objects
group by bucket_id
order by bucket_id;

-- 3) Bucket privacy state.
select id, public as is_public, file_size_limit
from storage.buckets
where id in ('case-files', 'mercury-web')
order by id;

-- 4) RLS enabled state for application tables.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p')
  and c.relname in (
    'cases','tasks','hearing_history','documents','document_analysis',
    'case_ai_chats','case_contacts','case_issues','case_notes','court_watch','fees'
  )
order by c.relname;

-- 5) Current policies. Review both target roles and USING/WITH CHECK expressions.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage')
  and (tablename in (
    'cases','tasks','hearing_history','documents','document_analysis',
    'case_ai_chats','case_contacts','case_issues','case_notes','court_watch','fees'
  ) or (schemaname = 'storage' and tablename = 'objects'))
order by schemaname, tablename, policyname;

-- 6) View options: check whether security_invoker is set.
select n.nspname as schema_name, c.relname as view_name, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in ('office_court_watch','office_document_inbox')
order by c.relname;

-- 7) Grants relevant to exposed application tables and views.
-- Grants alone do not determine row access; evaluate them together with RLS.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'cases','tasks','hearing_history','documents','document_analysis',
    'case_ai_chats','case_contacts','case_issues','case_notes','court_watch','fees',
    'office_court_watch','office_document_inbox'
  )
  and grantee in ('anon','authenticated','PUBLIC')
order by table_name, grantee, privilege_type;

-- 8) Confirm the bigint ID types that the reminders design must reference.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('cases','id'), ('tasks','id'), ('documents','id'),
    ('document_analysis','id'), ('hearing_history','id')
  )
order by table_name, column_name;

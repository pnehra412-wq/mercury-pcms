-- Assertions for the disposable PostgreSQL migration test. Raise on any failure.
do $$
declare
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  t text;
  v_count bigint;
begin
  foreach t in array array[
    'cases','tasks','hearing_history','documents','document_analysis',
    'case_ai_chats','case_contacts','case_issues','case_notes','court_watch','fees'
  ] loop
    execute format('select count(*) from public.%I where owner_id is distinct from $1',t)
      into v_count using v_owner;
    if v_count <> 0 then raise exception 'Owner backfill failed for %',t; end if;
    if not (select relrowsecurity from pg_class where oid=format('public.%I',t)::regclass) then
      raise exception 'RLS not enabled on %',t;
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_owner_all' and 'authenticated'=any(roles)) then
      raise exception 'Owner policy missing for %',t;
    end if;
    if has_table_privilege('anon',format('public.%I',t),'select') then
      raise exception 'Anonymous SELECT grant remains on %',t;
    end if;
    if not has_table_privilege('authenticated',format('public.%I',t),'select') then
      raise exception 'Authenticated SELECT missing on %',t;
    end if;
    if has_table_privilege('authenticated',format('public.%I',t),'truncate') then
      raise exception 'Authenticated TRUNCATE grant remains on %',t;
    end if;
  end loop;
  if (select file_data from public.documents where file_path='preserve.pdf') <> 'preserve-file-data' then
    raise exception 'Document file_data was altered';
  end if;
  if not exists (select 1 from public.document_analysis where analysis='{"status":"preserve"}'::jsonb and owner_id=v_owner) then
    raise exception 'Unlinked document analysis was not preserved';
  end if;
  if not exists (select 1 from public.documents where cino is null and owner_id=v_owner) then
    raise exception 'Unlinked document was not preserved';
  end if;
  if has_sequence_privilege('anon','public.cases_id_seq','usage') then
    raise exception 'Anonymous sequence USAGE remains';
  end if;
  if not has_sequence_privilege('authenticated','public.cases_id_seq','usage') then
    raise exception 'Authenticated sequence USAGE missing';
  end if;
end
$$;
select 'OWNER_MIGRATION_ASSERTIONS_PASSED' as result;

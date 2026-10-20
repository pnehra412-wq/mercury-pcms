-- Mercury PCMS: single-owner RLS hardening.
-- SAFETY GATE: intentionally aborts unless exactly one Auth user exists.
-- This migration is committed for review only and has NOT been applied to production.
-- Preconditions: verified DB restore point + recoverable Storage bytes; owner account
-- created through Supabase Auth administration; app code reviewed; migration tested.
-- No case/document contents are modified. Existing IDs, paths, and file_data are preserved.

begin;

do $$
declare
  v_user_count bigint;
begin
  select count(*) into v_user_count from auth.users;
  if v_user_count <> 1 then
    raise exception 'Mercury PCMS owner migration aborted: expected exactly one Auth user, found %', v_user_count
      using errcode = 'P0001';
  end if;
end
$$;

create temporary table mercury_owner_migration_owner on commit drop as
select id as owner_id from auth.users;

-- Validate CINO-based references before any data backfill. Do not guess links.
do $$
begin
  if exists (
    select 1 from public.tasks t
    where t.cino is not null and not exists (select 1 from public.cases c where c.cino=t.cino)
  ) then raise exception 'Owner migration aborted: tasks contain unmatched CINO'; end if;
  if exists (
    select 1 from public.hearing_history h
    where h.cino is not null and not exists (select 1 from public.cases c where c.cino=h.cino)
  ) then raise exception 'Owner migration aborted: hearing_history contains unmatched CINO'; end if;
  if exists (
    select 1 from public.documents d
    where d.cino is not null and not exists (select 1 from public.cases c where c.cino=d.cino)
  ) then raise exception 'Owner migration aborted: documents contain unmatched CINO'; end if;
  if exists (
    select 1 from public.document_analysis a
    where not exists (select 1 from public.documents d where d.id=a.document_id)
  ) then raise exception 'Owner migration aborted: document_analysis references a missing document'; end if;
  if exists (
    select 1 from public.document_analysis a
    where a.cino is not null and not exists (select 1 from public.cases c where c.cino=a.cino)
  ) then raise exception 'Owner migration aborted: document_analysis contains unmatched CINO'; end if;
end
$$;

-- owner_id is independent of CINO so unlinked documents and analyses are retained.
do $$
declare
  t text;
  v_owner uuid;
  v_seq regclass;
  v_has_other_owner boolean;
  p record;
begin
  select owner_id into strict v_owner from pg_temp.mercury_owner_migration_owner;

  foreach t in array array[
    'cases','tasks','hearing_history','documents','document_analysis',
    'case_ai_chats','case_contacts','case_issues','case_notes','court_watch','fees'
  ] loop
    execute format('alter table public.%I add column if not exists owner_id uuid', t);

    -- Never silently reassign records already attributed to a different owner.
    execute format('select exists(select 1 from public.%I where owner_id is not null and owner_id <> $1)', t)
      into v_has_other_owner using v_owner;
    if v_has_other_owner then
      raise exception 'Owner migration aborted: public.% has owner_id values for another user', t;
    end if;

    execute format(
      'update public.%I set owner_id = $1 where owner_id is null', t
    ) using v_owner;

    execute format('alter table public.%I alter column owner_id set default auth.uid()', t);
    execute format('alter table public.%I alter column owner_id set not null', t);

    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', t)::regclass
        and conname = t || '_owner_id_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (owner_id) references auth.users(id) on delete restrict',
        t, t || '_owner_id_fkey'
      );
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Remove old permissive policies on these application tables before installing
    -- a single owner predicate; a permissive USING(true) policy would OR around it.
    for p in
      select policyname from pg_policies
      where schemaname='public' and tablename=t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format('create policy %I on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t || '_owner_all', t);

    execute format('revoke all privileges on table public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);

    v_seq := pg_get_serial_sequence(format('public.%I', t), 'id')::regclass;
    if v_seq is not null then
      execute format('revoke all privileges on sequence %s from anon, public', v_seq);
      execute format('grant usage, select on sequence %s to authenticated', v_seq);
    end if;
  end loop;
end
$$;

-- Confirmation is retry-safe after partial client/network failures.
alter table public.tasks
  add column if not exists source_document_analysis_id bigint;
alter table public.hearing_history
  add column if not exists source_document_analysis_id bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='tasks_source_document_analysis_id_fkey') then
    alter table public.tasks add constraint tasks_source_document_analysis_id_fkey
      foreign key (source_document_analysis_id) references public.document_analysis(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='hearing_history_source_document_analysis_id_fkey') then
    alter table public.hearing_history add constraint hearing_history_source_document_analysis_id_fkey
      foreign key (source_document_analysis_id) references public.document_analysis(id) on delete set null;
  end if;
end
$$;

create unique index if not exists tasks_source_analysis_once
  on public.tasks(source_document_analysis_id) where source_document_analysis_id is not null;
create unique index if not exists hearing_history_source_analysis_once
  on public.hearing_history(source_document_analysis_id) where source_document_analysis_id is not null;

commit;

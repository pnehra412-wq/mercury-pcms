-- Isolated PostgreSQL fixture for the Mercury single-owner migration.
-- This file is used only in a disposable GitHub Actions PostgreSQL service.
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.cases (id bigserial primary key, cino text unique, case_status text);
create table public.tasks (id bigserial primary key, cino text, description text);
create table public.hearing_history (id bigserial primary key, cino text, hearing_date date);
create table public.documents (id bigserial primary key, cino text, file_path text, file_data text);
create table public.document_analysis (id bigserial primary key, document_id bigint, cino text, analysis jsonb);
create table public.case_ai_chats (id bigserial primary key, cino text not null, chat jsonb);
create table public.case_contacts (id bigserial primary key, cino text not null, contact jsonb);
create table public.case_issues (id bigserial primary key, cino text not null, issue text);
create table public.case_notes (id bigserial primary key, cino text not null, note text);
create table public.court_watch (id bigserial primary key, cino text, watch jsonb);
create table public.fees (id bigserial primary key, cino text, amount numeric);

-- Test roles mimic Supabase API roles; they exist only in this disposable database.
create role anon;
create role authenticated;
-- Mimic legacy broad grants so the migration must reset them.
grant all privileges on all tables in schema public to anon;
grant all privileges on all tables in schema public to authenticated;
grant all privileges on all sequences in schema public to anon;
grant all privileges on all sequences in schema public to authenticated;

-- Seed only the disposable PostgreSQL CI database.
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
insert into public.cases(cino,case_status) values ('CINO-TEST-1','Pending');
insert into public.tasks(cino,description) values ('CINO-TEST-1','preserve task');
insert into public.hearing_history(cino,hearing_date) values ('CINO-TEST-1','2026-10-20');
insert into public.documents(cino,file_path,file_data) values (null,'preserve.pdf','preserve-file-data');
insert into public.document_analysis(document_id,cino,analysis)
  select id,null,'{"status":"preserve"}'::jsonb from public.documents where file_path='preserve.pdf';
insert into public.case_ai_chats(case_id,chat) select id,'{"chat":"preserve"}'::jsonb from public.cases;
insert into public.case_contacts(case_id,contact) select id,'{"name":"preserve"}'::jsonb from public.cases;
insert into public.case_issues(case_id,issue) select id,'preserve issue' from public.cases;
insert into public.case_notes(case_id,note) select id,'preserve note' from public.cases;
insert into public.court_watch(cino,watch) values ('CINO-TEST-1','{"watch":true}'::jsonb);
insert into public.fees(case_id,amount) select id,123.45 from public.cases;

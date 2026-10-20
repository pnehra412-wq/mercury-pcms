-- Seed only the disposable PostgreSQL CI database.
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
insert into public.cases(cino,case_status) values ('CINO-TEST-1','Pending');
insert into public.tasks(cino,description) values ('CINO-TEST-1','preserve task');
insert into public.hearing_history(cino,hearing_date) values ('CINO-TEST-1','2026-10-20');
insert into public.documents(cino,file_path,file_data) values (null,'preserve.pdf','preserve-file-data');
insert into public.document_analysis(document_id,cino,analysis)
  select id,null,'{"status":"preserve"}'::jsonb from public.documents where file_path='preserve.pdf';
insert into public.case_ai_chats(cino,chat) values ('CINO-TEST-1','{"chat":"preserve"}'::jsonb);
insert into public.case_contacts(cino,contact) values ('CINO-TEST-1','{"name":"preserve"}'::jsonb);
insert into public.case_issues(cino,issue) values ('CINO-TEST-1','preserve issue');
insert into public.case_notes(cino,note) values ('CINO-TEST-1','preserve note');
insert into public.court_watch(cino,watch) values ('CINO-TEST-1','{"watch":true}'::jsonb);
insert into public.fees(cino,amount) values ('CINO-TEST-1',123.45);

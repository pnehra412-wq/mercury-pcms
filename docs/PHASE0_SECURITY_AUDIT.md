# Phase 0 — Live Security Audit (Read-only)

Audit date: 2026-10-19
Repository: https://github.com/pnehra412-wq/mercury-pcms
Branch: phase-0-safe-foundation
Supabase project ref: hmtcnatqowokeyrdjujq

## Safety status

- Production database and Storage were inspected read-only during this audit.
- No production schema, policies, grants, Storage objects, or Edge Functions were changed.
- Supabase Dashboard reported "Last backup: No backups". Treat a verified database + Storage recovery point as a deployment blocker.
- Existing application records and document paths must be preserved; no reset, bulk import, table recreation, or destructive migration is authorized by this audit.

## Confirmed baseline from previous read-only inventory

- cases: 158
- tasks: 1
- hearing_history: 2
- documents: 7
- document_analysis: 5
- case-files Storage objects: 8

Re-run row counts and enumerate Storage object paths immediately before and after any future production release; these values are a prior baseline, not a guarantee that the live data has not since changed.

## Findings

### Critical: public views use owner privileges

Supabase Security Advisor reports two SECURITY DEFINER views:

1. `public.office_court_watch`
   - Joins `court_watch` to `cases`.
   - Returns CNR, case type, parties, court/establishment, district, next hearing date, purpose, provider, enabled state, check timestamps, order date/fingerprint and derived watch status.
2. `public.office_document_inbox`
   - Joins `documents` to `cases`.
   - Returns case parties/court, document name/type/source/order date/upload date, processing status, match confidence, Storage bucket/path and AI summary.
   - Includes pending/review/ready documents and eCourts-sourced documents.

Read-only inspection found SELECT privileges for `anon` and `authenticated` on both views. The privilege report also showed other view privileges. Do not rely on the public/publishable API key to protect records; it is not a secret.

**Do not apply a blanket revoke yet.** First map every frontend and Edge Function query against these views, determine whether the application intentionally runs without sign-in, and decide the desired single-user/multi-device authentication model. Then test a least-privilege fix in an isolated environment.

### High: broad table RLS policies

Read-only inspection found permissive policies using `true` for all rows on:
- `public.cases` — ALL
- `public.hearing_history` — ALL
- `public.tasks` — ALL
- `public.documents` — SELECT, INSERT, UPDATE and DELETE

These policies effectively do not restrict rows for the roles covered by the policies. Confirm the intended access model and test the complete UI before replacing them.

### Medium: RLS enabled but no policies

Security Advisor reports seven tables with RLS enabled but no policies:
- `case_ai_chats`
- `case_contacts`
- `case_issues`
- `case_notes`
- `court_watch`
- `document_analysis`
- `fees`

No-policy tables are typically inaccessible through the API to roles subject to RLS, but this must be verified against grants, ownership, service-role use and actual call paths. Do not add blanket permissive policies just to silence the advisor.

### Backup / Storage

The Dashboard showed no listed database backups. Database backups do not necessarily include Storage object bytes. Before production changes:
1. Obtain a recoverable database backup/export.
2. Inventory the Storage bucket names and object paths, including the eight known `case-files` objects.
3. Verify document bytes can be recovered separately.
4. Store recovery material securely; never commit exports, case documents, secrets, or service-role keys to GitHub.
5. Record the backup timestamp and perform a restore/readability check where possible.

## Existing app implementation observations

- The app is primarily a single-page React application embedded in `index.html`.
- The file already links `manifest.json`, so inspect the actual manifest/service-worker setup before adding or replacing offline behaviour.
- The current task form writes directly to `tasks`; the application also reads case hearing dates from `cases`. Reminder delivery needs a durable backend queue, not just browser timers.
- Keep existing ChatGPT/Claude links and `document_analysis` records; build draft versioning additively.
- Use Asia/Kolkata for display and a consistent timezone strategy for stored reminder timestamps.
- AI-detected hearing dates and case matches must be confirmed by the user before updating authoritative records.

## Recommended next actions (in order)

1. Verify database and Storage recovery independently.
2. Inventory all tables, views, grants, RLS policies, Storage policies, Edge Functions and their JWT/authentication requirements.
3. Map every view/table read/write in `index.html` and each Edge Function.
4. Establish a working authenticated model for the same user on Windows and Android. Do not deploy a login requirement without a tested migration path.
5. Prepare a versioned, additive security migration on a non-production database. Prefer `security_invoker` views where supported and appropriate, then add least-privilege grants/policies matched to the confirmed auth model.
6. Regression-test case list, dashboard, calendar, tasks, court watch, document inbox, upload, analysis confirmation and AI workspace with both allowed and denied requests.
7. Only after security tests and recovery verification, implement reminder queue and daily diary enhancements.

## Release gates

- [ ] Verified recoverable database backup/export
- [ ] Verified independent Storage recovery method
- [ ] Baseline counts and Storage paths recorded
- [ ] Authentication/access model documented
- [ ] All frontend and Edge Function access paths mapped
- [ ] Development-only migration and negative permission tests pass
- [ ] Windows and Android regression tests pass
- [ ] Rollback procedure reviewed

## Explicit non-actions

This audit does not apply a production migration, change any production grant or RLS policy, modify a view, delete or move any document, or deploy an Edge Function.

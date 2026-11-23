# Mercury PCMS — Production Readiness Plan

This document records release blockers identified while reviewing PR #13. It is non-destructive and does not alter Supabase or existing case records.

## Current release decision
**Do not deploy or merge PR #13 to production yet.**

The frontend embeds the Supabase project URL and legacy anon key. A browser-visible anon/publishable key is expected, but it must be paired with correctly configured Row Level Security (RLS). The current frontend has no Supabase Auth login/session flow. The connected Supabase project reported INACTIVE during this review, so live schema, RLS policies, Auth users, and Storage policies could not be verified.

## Confirmed frontend risks
1. The REST helper resolves HTTP errors and network failures to an empty array. Callers cannot distinguish a successful empty result from a failed operation.
2. Task creation reports success and closes the modal even when the insert fails or returns no inserted row.
3. Similar optimistic success handling exists in fee and case creation. This should be corrected before relying on the app for professional records.
4. TODAY and todayDt are calculated once at page load. A page left open across local midnight can use a stale date.
5. Mobile navigation has no direct Tasks entry, although desktop navigation exposes Tasks.
6. Browser Notification API reminders are not dependable background delivery when the browser/app is closed. A server-side scheduler and delivery infrastructure is required.
7. The app loads pending cases only. A zero-row result must not be interpreted as proof that the database has no records.

## Safe implementation sequence
### Phase 1 — Preserve and verify
- Take a database backup/snapshot before any schema or policy change.
- Confirm Supabase is active and inspect actual columns, keys, RLS state, policies, and Storage buckets.
- Record row counts for cases, tasks, fees, hearing_history, documents, document_analysis, and case_ai_chats.
- Do not truncate, recreate, rename, or bulk-upsert existing user-maintained tables.

### Phase 2 — Correct frontend data handling
- Replace the error-swallowing REST wrapper with a typed result/error contract.
- Distinguish non-2xx responses, invalid JSON, timeouts, and zero-row updates.
- Show success only after a confirmed successful database response; preserve UI state on failure.
- Add Tasks to mobile navigation.
- Derive local date at use-time and refresh date-dependent views after local midnight.
- Test task create/complete/reopen/delete, including network and RLS failures.

### Phase 3 — Authentication and authorization
- Implement Supabase Auth sign-in/sign-out and session restoration.
- Create the owner account through the Supabase Auth flow; never hardcode or commit a password.
- Establish the ownership model before writing policies. Do not authorize using user-editable user_metadata.
- Enable RLS on every exposed table and Storage bucket; write least-privilege policies for the verified schema.
- Ensure UPDATE policies have USING and WITH CHECK, with corresponding SELECT policies.
- Test unauthenticated access, authorized owner access, and other authenticated users.

### Phase 4 — Background reminders
- Use a server-side scheduled job to query upcoming hearings/tasks and deliver reminders.
- Preserve reminder windows: 7, 3, 1, and 0 days before hearings.
- Use idempotency keys per case/date/reminder window to prevent duplicates.
- Store delivery attempts and outcomes; do not rely on browser localStorage for server deduplication.
- Keep provider credentials in server-side secrets only.

### Phase 5 — Release
- Run browser tests on Windows and Android-sized viewports.
- Verify case notes, fee entries, documents, and hearing history remain intact.
- Deploy to staging first; promote only after successful verification.
- Keep a rollback commit and database backup available.

## Explicitly not done
- No Supabase schema, data, Auth user, RLS policy, Storage object, or project status was changed.
- No password was set or stored.
- PR #13 was not merged and production was not deployed.

## Acceptance criteria
- All database writes report accurate success/failure.
- Existing records remain unchanged unless explicitly edited by the user.
- Unauthorized sessions cannot read or modify private records.
- Mobile users can reach every primary workspace.
- Background reminders are delivered while the app is closed and are deduplicated.
- Windows and Android smoke tests pass before production promotion.

## Work completed in the development branch (2026-11-23)
The following frontend corrections have now been committed to `mercury-hearing-reminders-ecourts-ui` after the original review:
- Added a checked PostgREST request helper for mutations. Case, task, fee, hearing-history, note, and next-hearing-date writes now report success only when the server confirms returned rows; errors remain visible to the user.
- Task completion, reopening, and deletion now wait for confirmed database responses before changing the local task list.
- Mobile navigation now exposes Home, Cause List, Tasks, Cases, and Fees directly.
- Date-difference calculations use the current local date at call time; new task and fee forms use the current local date when opened.
- Initial loading now checks HTTP errors for cases, tasks, fees, and hearing history rather than treating failed reads as successful empty arrays.

These are source-level changes only. They have not been browser-tested against the live database. The Supabase project still reported INACTIVE, and no production deployment or database migration was performed. Authentication, RLS verification, document-storage policies, reliable closed-app notifications, and full end-to-end testing remain release blockers.


## Installability and source validation
A valid web app manifest and Mercury SVG app icon have been added to the development branch to repair the existing manifest reference and provide install metadata. A GitHub Actions validation workflow and script have also been added. The workflow parses the React/JSX application source, validates the manifest and icon paths, and checks for key reliability/mobile-navigation safeguards. The workflow result must be inspected before this branch can be considered validated.

The first CI attempt exposed an escaping error in the JSX-extraction regular expression; the validator was corrected to locate the Babel script by explicit string boundaries. The updated validator is committed and must pass a fresh CI run before release.


## Additional document-security finding
The current case-document upload handler reads each selected file as a base64 data URL and writes it into the `documents.file_data` field through the REST API. This can inflate database rows and does not provide a safe substitute for private object storage. Before enabling document uploads for confidential client/court records, inspect the existing Storage buckets and policies, verify the `documents` schema and historical file records, then use a private bucket with authenticated, short-lived signed URLs. Do not delete or migrate existing `file_data` rows until a verified backup and checksum-based migration plan exists.


## Supabase restoration and authentication integration (2026-11-23)
The existing Supabase project was restored to `ACTIVE_HEALTHY` and inspected before any further database work. Verified counts at inspection time: 158 cases, 1 task, 2 hearing-history rows, 7 documents, 5 document-analysis rows, 54 court-watch rows, and 0 fee rows. There is one existing Auth account. The rows in the principal office tables checked (`cases`, `tasks`, `fees`, `hearing_history`, `documents`, `court_watch`, and `document_analysis`) all belong to that existing account; no `user_id`-null rows were found in the checked tables. Existing private `case-files` storage contained 8 objects; all 7 document records had storage bucket/path references and none used legacy inline `file_data`.

The frontend now initializes Supabase Auth, checks/restores the persisted session, gates the workspace behind sign-in, supports password-reset email requests, sends the current session JWT with REST and authenticated Edge Function calls, and provides sign-out. No password or credential was added to source control. The existing Auth account was not reset or modified, and an interactive sign-in was not attempted because the user's password was not available in this development session.

A non-destructive database migration `20261123093353_set_authenticated_user_id_defaults` was applied and versioned in `supabase/migrations/`. It sets `user_id` defaults to `auth.uid()` on all 13 existing user-owned public tables. It changes no existing rows; row counts were rechecked after the migration and remained unchanged. Existing RLS owner policies remain enabled.

The case-document upload path now writes file bytes to the existing private `case-files` bucket and stores only metadata/path in `documents`; the UI no longer writes new base64 file payloads into the database. Existing document records and storage objects were not migrated, deleted, or rewritten. Document deletion removes metadata first and then attempts private object cleanup.

Remaining release work: test interactive login and all workflows in a real browser using the existing account; inspect/fix the Auth leaked-password-protection warning; verify all Edge Function authorization paths; complete background push/reminder scheduling; and test Windows/Android behaviour. No production deployment has been performed.

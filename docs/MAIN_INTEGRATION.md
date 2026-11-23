# Mercury PCMS — Main-branch integration

## Foundation preserved
This branch is based directly on the repository production main branch (2026-10-20 calendar release). It preserves the existing Case Intelligence, Case Board, Cause List, Case Diary, Tasks, Fee Ledger, Analytics, Notion sync, reminders, document intelligence, and authenticated single-user workspace.

## Changes on this integration branch
- New non-order case-document uploads use the existing private case-files Storage bucket and store metadata/path in documents; no new base64 file payloads are written to the database.
- Document deletion verifies the database delete, then attempts private object cleanup. Existing document rows and files are not migrated or deleted.
- Database DELETE requests request returned rows so the UI can verify that a row was actually deleted.
- Case/task/fee create flows and advocate-note, next-date, and hearing-history updates report errors rather than showing false success; save controls are released in finally blocks.
- Date differences use the current local date; task/fee defaults use the date when the form opens; date-sensitive task filters and browser reminders refresh after midnight.
- Mobile navigation now exposes Home, Cause List, Case Diary, Tasks, Cases, and Fees.
- Added the missing PWA manifest, Mercury icon, service worker, and service-worker registration.
- Added source validation that parses the React/JSX app, validates PWA files, checks Auth/private Storage usage, and checks the owner-default migration.

## Database changes already applied to the existing Supabase project
Migration 20261123093353_set_authenticated_user_id_defaults sets user_id defaults to auth.uid() on the 13 existing user-owned public tables. It changes no existing rows. Verified record counts remained unchanged after applying it: 158 cases, 54 court-watch rows, 7 documents, 5 document-analysis rows, 2 hearing-history rows, 1 task, and 0 fee rows. Existing document records all point to Storage objects; existing files were not rewritten.

## Security work performed in Supabase
- Restored the existing project and verified RLS owner policies and the single existing Auth user.
- The case capture share-target now requires sign-in; its previous Origin-only bypass has been removed. The upload Edge Function now has gateway JWT verification enabled and independently checks the owner session.
- The Mercury Office cases endpoint no longer accepts the hardcoded query-string key; it requires a valid owner session and filters rows to that user.
- The public web-publish endpoint no longer uses a hardcoded publish token; it requires a valid owner JWT and gateway verification.
- The capture and office pages provide sign-in using the existing account on the Supabase project origin. No password has been stored in source control.

## Release gates still outstanding
- Automated validation on this branch must pass.
- Interactive browser sign-in must be tested with the existing account; no password reset or account change was performed by this work.
- Test case CRUD, tasks, fee ledger, hearing diary, private document upload/open/delete, order capture, AI analysis and Notion sync end-to-end.
- Review the Auth leaked-password-protection advisory and remaining public Edge Functions.
- Confirm Windows and Android behaviour, background notification strategy, backup/restore, and production deployment.
- Do not merge or publish until the tests above pass. No production main application code has been modified by this branch.


## Further database and Edge Function hardening
- Applied migration 20261123095202_index_case_document_and_reminder_foreign_keys, adding indexes for cases.latest_order_document_id and hearing_reminders.case_id. This is additive and does not alter rows.
- The court-order capture service now validates the authenticated user against the existing case owner and scopes document, case, analysis, task, hearing-history, activity and court-watch operations to that user. The fixed owner UUID was removed from this endpoint.
- The shared-order capture endpoint is now a JWT-protected proxy to the same secured capture service.
- The Mercury Office API and web-publish endpoint derive the workspace owner from the existing cases table instead of relying on a hardcoded query/publish token or user ID.
- The capture PWA now has an account sign-in screen; it keeps a shared PDF in its local cache until the user signs in, then forwards the session JWT to the protected capture endpoint.
- Fixed the GitHub Pages CORS allowlist for case-AI chat links and added proper preflight/response CORS headers to Notion sync.

The Supabase security advisor currently reports one remaining warning: leaked-password protection is disabled. This requires an Auth dashboard setting not exposed by the connected database tools and remains a release gate. Performance advisor foreign-key warnings were addressed by the new indexes; unused-index informational findings were not acted on.


## Backup restore preservation fix
The existing backup restore path previously used merge-upsert semantics, which could overwrite newer manual records with older backup values. It has been changed to an add-only restore: it checks current IDs and natural keys, skips existing records, uses ignore-duplicates on inserts, restores documents before cases, and maps document IDs before setting case links. It never updates or deletes existing case/client/fee/note rows. The UI confirmation and completion message explicitly state how many rows were added and how many existing rows were left unchanged. This is covered by both automated validation scripts.

# DeepSeek Handoff — Reviewed Against the Live Mercury PCMS Project

Review date: 2026-10-19
Repository: https://github.com/pnehra412-wq/mercury-pcms
Branch: phase-0-safe-foundation
Supabase project ref: hmtcnatqowokeyrdjujq

## Purpose

The user supplied a proposed single-user secure-foundation plan from a separate AI conversation. This note distinguishes reusable design ideas from statements and SQL that do not match the connected application. It is a review note, not a production migration.

## Confirmed from connected read-only inspection

- Project is active and healthy; PostgreSQL 17.6.
- Current table counts: cases 158; tasks 1; hearing_history 2; documents 7; document_analysis 5; case_ai_chats 0; case_contacts 0; case_issues 0; case_notes 0; court_watch 54; fees 0.
- `cases.id`, `tasks.id`, `hearing_history.id`, `documents.id`, and `document_analysis.id` are `bigint`, not UUID.
- The six tables proposed for an ownership column do not currently have `user_id` or `owner_id`.
- Existing relationship fields are important: child records generally reference a case through `cino`; `document_analysis.document_id` and `matched_case_id` are bigint.
- Views `public.office_court_watch` and `public.office_document_inbox` exist. The former joins `court_watch` to `cases`; the latter joins `documents` to `cases` and includes Storage bucket/path and AI summary fields.
- The `case-files` bucket already has `public = false`. Do not blindly apply a bucket-privacy change or assume that existing object paths start with a user's UUID.
- The frontend references `manifest.json`, but a fetch of that path on this branch returned 404. Confirm whether this is intentionally supplied by a deployment step before treating it as a production defect.
- The app is a single HTML page with React/Babel from CDN and a custom PostgREST wrapper. The wrapper currently sends the public anon key in both `apikey` and `Authorization: Bearer ...` headers. The inspected file does not initialize a Supabase Auth client or call `signInWithPassword` / `getSession`.
- Frontend calls to `get-document-url`, `prepare-document-share`, and `case-ai-chats` currently omit an Authorization bearer token. Requiring JWT verification without updating those callers will break those workflows.
- Current Supabase Security Advisor findings include 2 SECURITY DEFINER views and 7 RLS-enabled tables without policies. Broad public policies remain on `cases`, `tasks`, `hearing_history`, and CRUD operations on `documents`.
- Read-only counts match the earlier Phase 0 baseline. Counts alone do not prove backup recoverability.

## Reusable ideas from the proposed plan

- Single-user Supabase Auth across Windows and Android is a sensible target for this solo practice.
- Use `auth.uid()`-based least-privilege policies after establishing the authenticated request path.
- Keep the service-role key server-side; authenticate and authorize each document/case operation in Edge Functions.
- Use a durable reminders queue, not browser-only timers.
- Preserve source documents and require advocate confirmation before extracted hearing dates update authoritative case records.
- Keep changes additive, versioned, tested, and reversible.

## Problems in the proposed SQL / implementation

1. **Reminder foreign-key type mismatch:** it declares `case_id uuid references public.cases(id)` and `task_id uuid references public.tasks(id)`, but both referenced IDs are bigint. Change these to bigint, or deliberately use a different relation design.
2. **Incomplete RLS coverage:** it adds ownership columns/policies to six tables but leaves `case_contacts`, `case_issues`, `case_notes`, `court_watch`, and `fees` without matching authenticated access policies. A security-invoker view can return no rows or fail when underlying relations are inaccessible unless the base-table grants/policies are deliberately designed.
3. **Login screen alone is insufficient:** the custom REST wrapper and every direct `fetch` to Edge Functions must send the current session access token. Do not assume the existing wrapper automatically becomes authenticated.
4. **Existing data and object paths:** adding a `<uid>/...` Storage path convention does not move or re-own existing objects. Existing object paths must be inventoried and explicitly accommodated; do not break references.
5. **The rollback is not a true full rollback:** it does not restore original grants/policies exactly, and changing a view back to `security_invoker = false` is not an adequate substitute for capturing the original view options and access state.
6. **Unverified column assumption:** the live `documents` table does have `storage_path`, but function request payloads and app code must be matched exactly before changing function code.
7. **Backup gate:** the user reports taking a backup. Still independently confirm the database recovery artifact and a separate recoverable copy of Storage object bytes before production changes. A dashboard backup indicator or row counts alone are not sufficient proof.

## Safe implementation sequence

1. Confirm the actual database export can be restored and separately verify the Storage objects can be recovered. Do not commit case data, PDFs, credentials, or keys to GitHub.
2. Map all frontend REST calls, Edge Function callers, policies, grants, view dependencies, and existing object paths.
3. Build an isolated development copy/branch and test Supabase Auth end-to-end without changing production.
4. Design ownership/access policies across every table and view using the actual bigint/CNR relationships; include negative tests for anonymous callers and unrelated resources.
5. Secure and test the Edge Functions and update all Windows/Android callers to send session tokens.
6. Run the full app regression checklist before any production release.
7. Only then add the durable reminders schema and diary UI; preserve existing records and make all changes additive.

## Current status

This review was based on connected read-only project inspection and GitHub source reads. No production SQL, RLS policy, grant, view, Storage object, or Edge Function was changed by this review.


## Additional live Edge Function / privilege verification

A second read-only inspection retrieved the currently deployed function sources and queried current grants:

- `get-document-url`: active, `verify_jwt=false`; uses the service-role client to select documents and sign Storage URLs for 3,600 seconds. The source checks an allowlisted Origin but does not validate the caller's JWT or authorize the requested document for a user. The frontend calls it without Authorization.
- `prepare-document-share`: active, `verify_jwt=false`; CORS is `*`; uses service-role access to read caller-supplied document IDs, issue signed URLs, and migrate legacy inline `file_data` to Storage while setting `file_data = null`. This endpoint has data-changing behaviour, so an authorization patch must preserve legitimate migration use and include tests.
- `case-ai-chats`: active, `verify_jwt=false`; uses the service role to read/write case chat links based on a supplied CNR and checks Origin only. The frontend calls it without Authorization.
- Storage object inventory by counts only: 8 objects in `case-files` (all have nested paths), 3 objects in `mercury-web` (root paths). Object names were not copied into this note.
- The current role-grant query shows broad grants to `anon` and `authenticated` on the reviewed application tables and both views. RLS policies—not the public key—are currently the principal row filter, and some policies are `true` for public roles.

These findings increase the urgency of the security work. They do **not** authorize an immediate production deployment: first establish a working auth migration and confirm separate Storage recovery, then test the exact caller paths and denied-resource cases in non-production.

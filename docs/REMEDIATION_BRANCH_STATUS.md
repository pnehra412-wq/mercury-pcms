# Mercury PCMS — Remediation Branch Status

Updated: 2026-10-19
Branch: `security-hardening-2026-10-19`
Base branch: `phase-0-safe-foundation`
Supabase project: `hmtcnatqowokeyrdjujq`

## Current state

This is a branch-only preparation effort. No production schema, data, Storage configuration, view, grant, policy, or deployed Edge Function has been changed. The new source files below are not yet a releasable build because the required `owner_id` schema migration is not present and no isolated test environment is available.

## Branch-only code prepared

### Frontend

- Added a Supabase JS v2 UMD client and sign-in-only Auth gate to `index.html`.
- Session restoration occurs before mounting the case-management app.
- The custom `sbReq` wrapper uses the authenticated access token as `Authorization`; the anon key remains only in `apikey`.
- Updated both direct REST case fetches to use the session token.
- Updated the `case-ai-chats`, `prepare-document-share`, and `get-document-url` calls to send both the project `apikey` and the session bearer token.
- Public sign-up is deliberately absent. The first owner account must be created securely through Supabase Auth administration.

### Shared Edge Function authentication

Added `supabase/functions/_shared/mercury-auth.ts`. It extracts a bearer token, calls Supabase Auth `getUser(token)`, fails closed when the token or required environment is missing, and only then creates a server-side service-role client. Each caller must still authorize the exact resource.

### Private case/document function source prepared

- `supabase/functions/get-document-url/index.ts`
- `supabase/functions/prepare-document-share/index.ts`
- `supabase/functions/case-ai-chats/index.ts`
- `supabase/functions/analyze-court-document/index.ts`
- `supabase/functions/confirm-document-analysis/index.ts`
- `supabase/functions/capture-court-order/index.ts`
- `supabase/functions/capture-mobile-order/index.ts`

These source drafts require `owner_id` on the relevant tables and scope their database operations to the authenticated user. Do not deploy them before the schema migration is tested and applied in a non-production environment.

The document-share draft verifies uploaded bytes against the source before updating the document reference and clearing legacy inline data. It uses the private `case-files` bucket and 15-minute signed URLs. The current live database has no non-null `file_data`, but the frontend can create new inline-file records, so the migration path still needs regression testing.

The mobile capture draft now requires an authenticated session, scopes duplicate detection and case/document updates by owner, and forwards the caller's session token plus the public project key to the analysis function. The capture page is also updated to require sign-in and to retain the shared file if a request fails.

### Office dashboard and publishing source prepared

- `supabase/functions/mercury-office/index.ts`: removes the hard-coded shared office key, adds a sign-in screen, and filters the server-side case query by authenticated owner.
- `supabase/functions/publish-mercury-web/index.ts`: removes the hard-coded publishing token and requires an authenticated owner matching the `MERCURY_OWNER_USER_ID` environment variable.

The live deployed versions remain unchanged. Configure the owner ID after the initial Auth user exists and before deploying the publisher source.

## Live schema facts affecting the migration

- Current `auth.users` count: 0.
- No current `owner_id` column exists on the application tables.
- Current rows with a null `cino`: 3 in `documents` and 1 in `document_analysis`; these must still be assigned to the owner. A case-only ownership join would not cover them.
- Current `cases.cino` is unique.
- `fees` uses text `cino` and has no `case_id`; it currently has zero rows.
- Current row counts remain: cases 158, tasks 1, hearing_history 2, documents 7, document_analysis 5, case_ai_chats 0, case_contacts 0, case_issues 0, case_notes 0, court_watch 54, fees 0.
- Storage currently contains 8 objects in private `case-files` and 3 root-level objects in public `mercury-web`.
- The user reports taking a backup. Neither a recoverable database restore nor a separate Storage-byte recovery copy has been independently verified in this work.

## Still unresolved

1. **Schema migration:** add and backfill `owner_id` on all application tables, enforce owner-consistent relationships, revoke anonymous access, add the appropriate authenticated grants, and make the two office views security-invoker. Also add the unique `source_document_analysis_id` references on `hearing_history` and `tasks` required for idempotent order confirmation. Preserve the current rows and the three unlinked documents/one unlinked analysis row. The migration is not written or applied yet.
2. **Initial owner account:** there are zero Auth users. Do not invent an owner UUID or place credentials in GitHub/chat. Create the account through Supabase Auth administration and verify the intended owner.
3. **Isolated test environment:** no Supabase development branch exists. The user has directed that fees be avoided. Do not create a billable branch; use free local/static checks and do not deploy changes that require isolated database validation.
4. **Backups:** verify database restoreability and separately recoverable Storage bytes before production changes.
5. **`capture-shared-court-order`:** deployed metadata is available, but the connector returned an empty source body. Its behavior and authorization cannot be verified or patched safely until its source is retrieved.
6. **Hard-coded deployed credentials:** the branch versions of `mercury-office` and `publish-mercury-web` remove the source literals, but the live versions still contain the old values. Rotate/invalidate them only as part of an approved transition.
7. **Other public functions:** `mercury-app` appears to serve public static assets; confirm it does not return private data. Recheck the final deployed `verify_jwt` settings and all service-role call paths during release.

## Tests and validation status

### Static checks performed

- Confirmed the branch frontend contains the Auth gate.
- Confirmed the frontend no longer uses the anon key as an `Authorization: Bearer` value.
- Confirmed both direct REST requests use `SB_ACCESS_TOKEN`.
- Confirmed the three direct private Edge Function callers include both the project `apikey` and `Authorization: Bearer <session token>`.
- Confirmed the shared helper calls Supabase Auth `getUser(token)`.
- Confirmed the new branch source no longer contains the prior hard-coded office or web-publishing token literals.
- Confirmed the mobile capture page preserves the shared file until the server confirms success and defers asynchronous work out of the Auth state-change callback.

### Not run

- JavaScript/Babel compilation.
- Deno type-check or Edge Runtime tests.
- Browser/device tests on Windows or Android.
- Auth login/refresh/logout integration tests.
- Cross-user RLS tests.
- Unauthorized Edge Function tests.
- Storage signed URL tests.
- Document upload/share/legacy-file recovery tests.
- Full application regression tests.

Do not treat the static checks as a successful build or security certification.

## Follow-up review — 2026-10-20

- Re-ran the live Supabase Security Advisor: the same seven RLS-enabled/no-policy tables and two SECURITY DEFINER views remain reported. No production changes were made.
- Reconfirmed live `auth.users` count is 0 and the project has no development branches.
- Reconfirmed the deployed `capture-shared-court-order` function is ACTIVE with `verify_jwt=false`, version 5, but the Supabase connector returned an empty `index.ts` body. The repository also has no `supabase/functions/capture-shared-court-order/` source directory on the remediation branch. This endpoint remains an explicit release blocker; do not replace or disable it until its actual callers and source are recovered.
- Supabase quoted development-branch compute at USD $0.01344/hour (approximately USD $0.32256 per 24 hours, excluding other charges). No branch was created. The user has instructed us to avoid fees; do not create a paid branch or request payment approval. Use free local/static checks and document any tests that cannot safely be run without an isolated database.
- Additional branch-only fix: `capture-mobile-order` no longer returns raw Storage or database error messages to the caller for upload/metadata-insert failures. It emits generic client errors and keeps the details out of the HTTP response.
- The migration specification remains non-executable. No migration file has been applied or tested because the Auth owner account and isolated test environment are not yet available.

### Follow-up checks still required

- Compile/test the frontend and type-check all Edge Function sources in a real Deno/Supabase workspace.
- Inspect the full request paths in the Auth gate, especially logout/data clearing and all pre-login network calls.
- Test document share/upload idempotency and failure ordering; Storage and Postgres writes are not atomic.
- Reconcile source vs deployed function versions and rotate legacy hard-coded credentials only during an approved transition.
- Do not mark any security fix as deployed until the corresponding live configuration and negative tests are verified.

## Free-first next steps (user instruction: avoid fees)

1. Obtain a verified database recovery point and separate Storage recovery copy.
2. Create/confirm the single owner Auth account in Supabase administration.
3. Continue with free local/static checks. If isolated database validation is essential, first investigate a genuinely no-cost option; never create a billable branch or project without a new explicit request.
4. Generate the migration using the Supabase CLI in a real project workspace, test it against the isolated environment, and compare schema/data before and after.
5. Retrieve and inspect `capture-shared-court-order` source and finish the remaining function review.
6. Run the full security and regression matrix.
7. Present the exact production deployment steps for explicit approval.

No production action should be taken from this branch until these gates pass.


## Autonomous free-first follow-up — 2026-10-20

- User instruction reaffirmed: continue autonomously, avoid fees, and do not repeatedly ask for permission for safe branch-only work.
- Updated the scheduled task to require concrete progress each run, prohibit billable services, prohibit production changes without explicit approval, and continue branch-only work while blocked. Requested an immediate run; the automation system confirmed that the run was queued, not completed.
- Updated this status report and the owner/RLS specification to state clearly that the sign-in screen alone does not secure the live database: current broad policies on `cases`, `tasks`, `hearing_history`, and `documents` still use permissive `true` predicates for the `public` role.
- Re-queried live schema metadata read-only. Confirmed the current broad policy definitions and exact view SELECT definitions. `office_court_watch` joins `court_watch` to `cases`; `office_document_inbox` joins `documents` to `cases` and includes Storage path metadata. Both remain release blockers until owner isolation and view access are corrected and tested.
- No paid branch/project was created; no production data, policies, grants, views, Storage, or deployed functions were modified.
- No free isolated PostgreSQL/Supabase test database is available through the current connected tools. A local attempt to clone the repository from the execution container failed because external DNS/network access is unavailable; no paid CI or testing service was enabled.
- Continued code review of `mercury-office`: the branch draft authenticates the API request and filters the service-role case query by `owner_id`; this depends on the un-applied owner schema and is not deployable yet. Its public HTML endpoint is intentionally served separately from the authenticated `?api=cases` route.
- Confirmed the migration spec remains explicitly non-executable. The immediate safe next work is branch-only source review, documenting exact schema assumptions, and adding free/static validation that can run in the available environment. Runtime validation, cross-user tests, and deployment remain blocked until a no-cost isolated test path and owner account exist.


### Additional source review — 2026-10-20

- Removed 94 lines (4,685 characters) of unreachable PDF extraction/case-matching code after an unconditional return in the branch draft of `capture-mobile-order`. This is a branch-only cleanup; no deployed function changed.
- Rechecked the live Security Advisor at 2026-10-20 02:44 UTC. The same seven RLS-enabled/no-policy tables and two SECURITY DEFINER views remain; no live security remediation has been applied.
- Retried retrieval of deployed `capture-shared-court-order`: Supabase still reports ACTIVE version 5 with `verify_jwt=false`, but returns an empty `index.ts` source body. GitHub repository searches did not find the function name or a source directory. Do not replace this endpoint blindly because its external callers and contract are unknown.
- Ran free source-level checks against the current branch copies of ten function sources and the frontend. The private-document functions reviewed all include the shared JWT verification helper; their relevant database access paths showed owner filters or owner IDs in the inspected code. The frontend scan found no use of the public anon key as the bearer token; direct REST requests use the session token. These are text/static inspections only, not compilation or security tests.
- Confirmed the branch copy of `prepare-document-share` retains wildcard CORS while requiring JWT authentication. Tightening its origin list may be desirable, but was not changed without confirming every intended web/mobile caller origin; a CORS change could break legitimate sharing flows.
- Remaining critical blocker: the frontend sign-in gate does not repair the current broad public database policies. Until ownership columns/policies/grants and the two views are migrated and negative tests pass, the live database must not be described as owner-isolated.

- Opened draft-only PR #1 against `phase-0-safe-foundation` to keep the remediation reviewable without merging or deploying: https://github.com/pnehra412-wq/mercury-pcms/pull/1. It explicitly lists the owner-schema, public-policy, view, unavailable-source, and test blockers. The PR remains unmerged and marked draft.


### Repeatable free static guardrails — 2026-10-20

- Added `scripts/mercury-security-static-check.mjs`, a dependency-free Node.js script to check for common regressions in the auth gate, bearer-token handling, shared JWT helper usage, owner-scope markers, mobile upload limits/error sanitization, and legacy credential literals.
- Ran `node --check` against a local copy of the script; syntax validation passed. The repository itself could not be cloned into the execution container because external network/DNS access is unavailable, so the static script has **not** yet been executed against a complete local checkout.
- This script is a guardrail only. Its passing checks cannot prove database RLS isolation or replace compilation, runtime, cross-user, and Storage tests.


### Live recheck — 2026-10-20 08:30 IST (read-only)

Evidence source: connected Supabase project metadata, Security Advisor, deployed function source retrieval, and read-only SQL metadata queries. No case names, client details, credentials, or document contents are included here.

- **VERIFIED — Security Advisor:** seven RLS-enabled tables have no policies: `case_ai_chats`, `case_contacts`, `case_issues`, `case_notes`, `court_watch`, `document_analysis`, and `fees`. Two views are flagged as SECURITY DEFINER: `office_court_watch` and `office_document_inbox`. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy and https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view.
- **VERIFIED — view options:** SQL metadata reports both flagged views have `reloptions = NULL` and owner `postgres`. This supports that no per-view `security_invoker=true` option is present. Do not change view definitions until their exact definitions, grants, and caller expectations have been captured and tested.
- **VERIFIED — deployed function configuration:** `capture-shared-court-order`, `mercury-app`, `capture-mobile-order`, `mercury-capture`, `mercury-office`, `publish-mercury-web`, `get-document-url`, `case-ai-chats`, and `prepare-document-share` report `verify_jwt=false`. This setting alone does not prove exploitability, but each endpoint must implement caller authentication and authorization itself or be changed only after its callers are understood.
- **VERIFIED — critical source-level authorization gap in retrieved `get-document-url`:** deployed source constructs a Supabase client with `SUPABASE_SERVICE_ROLE_KEY`, accepts a document ID, queries `documents` by ID, and signs the Storage path. Its visible handler checks HTTP method and Origin but does not validate an Authorization bearer token, resolve the caller identity, or authorize document ownership before signing. Origin validation is not authentication. This is a high-priority live exposure; it is documented only, not changed or redeployed by this audit.
- **VERIFIED — `prepare-document-share` source:** deployed source uses the service-role key and wildcard `Access-Control-Allow-Origin: *`; the visible handler has no caller-token validation or per-document ownership check before querying documents/signing URLs. Its legacy inline-file path uploads to Storage and then sets `file_data = null`; although it uploads before clearing, the handler does not verify byte-level recoverability by downloading/checksumming the uploaded object before clearing the database copy. Do not run this migration path against production until authorization, bucket/path validation, idempotency, and recovery checks are implemented and tested.
- **VERIFIED — unresolved function source retrieval:** Supabase reports `capture-shared-court-order` ACTIVE version 5 with `verify_jwt=false`, but the connector returned an empty `index.ts` body. Source remains unavailable; no replacement or deployment is safe without its contract and caller inventory.
- **VERIFIED — schema relationships from metadata:** `cases.id` and `cases.latest_order_document_id` are bigint; `documents.id` and `document_analysis.document_id` are bigint; `documents` associates with cases by `cino`; `case_ai_chats.cino` references `cases.cino`; `fees` uses `cino` and has no `case_id` in the inspected columns. Ownership migration must respect these existing relationship types and cannot apply a blanket UUID foreign key to all child tables.
- **BLOCKER — no fee incurred:** no Supabase development branch was created because the user instruction is to avoid all fees. No production tables, policies, grants, views, Storage objects, Auth users, or deployed functions were changed by this run.
- **Next safe actions:** inspect the exact deployed view definitions and relevant grants; review current branch copies of `get-document-url` and `prepare-document-share`; prepare branch-only patches that require caller authentication and enforce resource ownership, with no reliance on CORS as a security boundary; add tests for missing/invalid JWT, unknown document ID, cross-owner document ID, wrong bucket/path, and partial upload/database failure. Do not deploy without a verified owner account, recoverable database and Storage backups, and explicit production-release approval.
- **Validation honesty:** this was a read-only live audit and documentation update. No application build, Deno check, browser test, cross-user test, or migration execution was performed in this run.


## Follow-up recheck — 2026-10-20 03:51 UTC

Read-only Supabase Security Advisor recheck confirms the production database findings are still present:
- 7 tables with RLS enabled but no policies: `case_ai_chats`, `case_contacts`, `case_issues`, `case_notes`, `court_watch`, `document_analysis`, and `fees`.
- 2 views still flagged as SECURITY DEFINER: `office_court_watch` and `office_document_inbox`.

No production DDL, policies, views, Auth users, Storage objects, or Edge Functions were changed during this recheck. These findings remain release blockers; do not infer that the source-branch fixes have secured production.


## Production change and verification — 2026-10-20 04:xx UTC

The user explicitly requested the outstanding security remediation to proceed. Applied a narrowly scoped database migration named `secure_office_views_security_invoker`:
- Set `security_invoker=true` on `public.office_court_watch` and `public.office_document_inbox`.
- Revoked view privileges from `anon`.
- Granted SELECT on the two views to `authenticated`.

Read-only verification confirmed both views now have `security_invoker=true`, `anon_select=false`, and `authenticated_select=true`. A fresh Security Advisor response no longer listed the two prior SECURITY DEFINER view findings; it still reports seven RLS-enabled tables without policies.

Added guarded migration `supabase/migrations/20261020041000_owner_scoped_rls_single_user.sql` to the review branch. It aborts unless exactly one Auth user exists. It has NOT been applied. It installs owner_id columns/backfill, owner policies, anonymous privilege revocation, and analysis-confirmation idempotency references only after its owner precondition passes.

**Remaining live exposure:** `cases`, `tasks`, `hearing_history`, and `documents` still have permissive policies scoped to `public` with `USING (true)` / `WITH CHECK (true)`. Removing those policies before the intended owner Auth user is established and the guarded backfill is ready would interrupt existing app access without a safe owner policy. Complete the owner account + migration + negative tests as one controlled release; do not describe the whole production app as secured yet.

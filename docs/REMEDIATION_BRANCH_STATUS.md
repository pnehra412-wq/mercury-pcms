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
- Updated the `case-ai-chats`, `prepare-document-share`, and `get-document-url` calls to send the session token.
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

The mobile capture draft now requires an authenticated session, scopes duplicate detection and case/document updates by owner, and forwards the caller's session token to the analysis function. The capture page is also updated to require sign-in and to retain the shared file if a request fails.

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
- Previous audit notes reported no listed database backups. Neither a recoverable database restore nor separate Storage-byte recovery has been verified in this work.

## Still unresolved

1. **Schema migration:** add and backfill `owner_id` on all application tables, enforce ownership policies, revoke anonymous access, add the appropriate authenticated grants, and make the two office views security-invoker. Preserve the current rows and the three unlinked documents/one unlinked analysis row. The migration is not written or applied yet.
2. **Initial owner account:** there are zero Auth users. Do not invent an owner UUID or place credentials in GitHub/chat. Create the account through Supabase Auth administration and verify the intended owner.
3. **Isolated test environment:** no Supabase development branch exists. Branch creation may incur compute charges; none was created.
4. **Backups:** verify database restoreability and separately recoverable Storage bytes before production changes.
5. **`capture-shared-court-order`:** deployed metadata is available, but the connector returned an empty source body. Its behavior and authorization cannot be verified or patched safely until its source is retrieved.
6. **Hard-coded deployed credentials:** the branch versions of `mercury-office` and `publish-mercury-web` remove the source literals, but the live versions still contain the old values. Rotate/invalidate them only as part of an approved transition.
7. **Other public functions:** `mercury-app` appears to serve public static assets; confirm it does not return private data. Recheck the final deployed `verify_jwt` settings and all service-role call paths during release.

## Tests and validation status

### Static checks performed

- Confirmed the branch frontend contains the Auth gate.
- Confirmed the frontend no longer uses the anon key as an `Authorization: Bearer` value.
- Confirmed both direct REST requests use `SB_ACCESS_TOKEN`.
- Confirmed the three direct private Edge Function callers include `Authorization: Bearer <session token>`.
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

## Safe next steps

1. Obtain a verified database recovery point and separate Storage recovery copy.
2. Create/confirm the single owner Auth account in Supabase administration.
3. Obtain approval for an isolated Supabase test branch if its cost is acceptable.
4. Generate the migration using the Supabase CLI in a real project workspace, test it against the isolated environment, and compare schema/data before and after.
5. Retrieve and inspect `capture-shared-court-order` source and finish the remaining function review.
6. Run the full security and regression matrix.
7. Present the exact production deployment steps for explicit approval.

No production action should be taken from this branch until these gates pass.

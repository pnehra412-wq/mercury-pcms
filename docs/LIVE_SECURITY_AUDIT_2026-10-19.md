# Mercury PCMS — Live Security Audit and Remediation Status

Audit date: 2026-10-19
Repository: https://github.com/pnehra412-wq/mercury-pcms
Inspected branch: `phase-0-safe-foundation`
Remediation branch: `security-hardening-2026-10-19`
Supabase project ref: `hmtcnatqowokeyrdjujq`
Scope: read-only production inspection; no production changes made.

## 1. Safety and execution status

- GitHub repository access and Supabase project access were verified using connected tools.
- The production database was queried read-only.
- Deployed Edge Function metadata and source were retrieved where the connector returned source content.
- No production SQL, grants, RLS policies, views, Storage objects, or Edge Functions were changed.
- A dedicated GitHub remediation branch was created from `phase-0-safe-foundation`.
- No isolated Supabase development branch exists. Creating one may incur hourly compute charges and has not been done.
- The user reports taking a backup. This session has not independently verified that the database backup can be restored, nor a separate recoverable copy of Storage object bytes. Production deployment remains blocked until recovery is confirmed.

## 2. Live database baseline

The following current counts were returned by read-only SQL:

| Table | Rows |
|---|---:|
| cases | 158 |
| tasks | 1 |
| hearing_history | 2 |
| documents | 7 |
| document_analysis | 5 |
| case_ai_chats | 0 |
| case_contacts | 0 |
| case_issues | 0 |
| case_notes | 0 |
| court_watch | 54 |
| fees | 0 |

Additional integrity checks:
- `cases.cino` is UNIQUE; no null CNRs or duplicate non-null CNR groups were found.
- Child tables `case_ai_chats`, `case_contacts`, `case_issues`, `case_notes`, and `court_watch` have foreign keys to `cases(cino)`.
- `documents` has 0 CNR values that fail to match a case in the current data, but its CNR relationship is not enforced by a foreign key.
- `fees` has a nullable text `cino` column and no `case_id`; it currently has 0 rows and no unmatched non-null CNRs.
- `document_analysis.document_id` is bigint and references `documents(id)`; `matched_case_id` is bigint and references `cases(id)`.
- All 7 current document rows have both `storage_bucket` and `storage_path`; none currently has non-null `file_data`.
- These checks are snapshots only. Re-run them before and after any approved release.

## 3. Confirmed database security findings

### Critical — broad public row policies

Current policies are permissive and use `true` for:
- `cases`: ALL
- `tasks`: ALL
- `hearing_history`: ALL
- `documents`: SELECT, INSERT, UPDATE, DELETE

The policies target `public`, and the inspected role grants include `anon` and `authenticated` privileges on these tables. Because the public anon key is not a secret, these policies do not provide meaningful row isolation.

### High — RLS-enabled tables with no policies

The live Security Advisor reports 7 tables with RLS enabled but no policies:
- `case_ai_chats`
- `case_contacts`
- `case_issues`
- `case_notes`
- `court_watch`
- `document_analysis`
- `fees`

The live grants query shows broad privileges for `anon` and `authenticated` on several of these tables. With RLS enabled and no applicable policy, direct API access is normally denied to those roles, but the Edge Functions using the service role can bypass RLS. Do not add permissive policies merely to make the UI work.

### Critical — two SECURITY DEFINER views

The live Security Advisor reports:
- `public.office_court_watch`
- `public.office_document_inbox`

Both currently have `reloptions = NULL`, not `security_invoker=true`, and have API-role grants including SELECT. The first joins court-watch records to cases. The second joins documents to cases and exposes document metadata including Storage bucket/path and AI summary. Owner-privileged view execution can bypass underlying-table RLS on supported PostgreSQL configurations. Correct these only after testing the intended view access model.

### Storage

Current bucket metadata:
- `case-files`: private; 8 objects, all with nested paths.
- `mercury-web`: public; 3 objects, all root-level paths.
- The inspected `storage.objects` policy query returned no policies.

Do not make `mercury-web` private blindly: it may serve intentionally public web assets. Inspect object purpose and deployment dependencies first. Keep case documents private and authorize each object through its document/case relationship.

### Authentication

- The live `auth.users` count is 0.
- The current frontend does not initialize Supabase Auth or use `getSession`, `signInWithPassword`, or `onAuthStateChange`.
- Do not deploy owner-based RLS until an initial Auth account and the ownership/backfill model are deliberately established and tested.

## 4. Frontend findings

The current `index.html` on `phase-0-safe-foundation` has blob SHA `0720bc09acfdf66b87aabbf684efb939c2a02c15`.

- React 18 and Babel are loaded from CDNs.
- The custom XHR wrapper `sbReq` sends the public anon key as the bearer token.
- Two direct REST fetches to `/rest/v1/cases` also use the anon key as bearer.
- The app's data-loading effect runs on mount; a login gate must prevent protected loading from starting before session restoration completes.
- Direct Edge Function calls exist for `case-ai-chats`, `prepare-document-share`, and `get-document-url`, currently without Authorization headers.
- Manual document upload writes inline `file_data`; opening and sharing may use Storage-backed records. Preserve this legacy path during a tested transition.

A login form alone will not fix the problem. The wrapper, direct REST calls, and every private Edge Function caller must use the real user access token; the database policies must then enforce ownership.

## 5. Deployed Edge Function inventory

The live function inventory reports the following `verify_jwt` settings:

| Function | verify_jwt | Source-level observation |
|---|---:|---|
| `capture-court-order` | true | Source includes `auth.getUser`; uses a separate elevated client for Storage operations. Further resource authorization and input validation review remains required. |
| `capture-shared-court-order` | false | Connector returned an empty source body; source-level authorization could not be verified. |
| `mercury-app` | false | Public static app asset endpoint; verify it only serves intended public assets. |
| `capture-mobile-order` | false | Uses service-role access and Origin checks; no caller JWT validation was visible in inspected source. Source performs document and case/hearing/court-watch writes. |
| `mercury-capture` | false | Public capture UI endpoint; no service-role use was visible in the inspected source. Review its upload and downstream call paths. |
| `mercury-office` | false | Uses service-role database reads and contains a hard-coded access credential in source. Do not publish its value; replace it with managed authentication/secrets after mapping existing callers. |
| `publish-mercury-web` | false | Uses service-role access and contains a hard-coded publishing token in source. Do not publish the value; move it to a managed secret and rotate after a safe transition. |
| `analyze-court-document` | true | Uses service-role access; no explicit `auth.getUser` or caller-specific authorization was visible in inspected source. Gateway JWT verification alone must not be treated as document authorization. |
| `confirm-document-analysis` | true | Uses service-role access; no explicit `auth.getUser` or caller-specific authorization was visible in inspected source. Must authorize the specific analysis/document/case before writing. |
| `get-document-url` | false | Uses service-role access to fetch a document and issue a signed URL valid for 3,600 seconds. Origin allowlisting is not authentication; no caller JWT/resource authorization was visible. |
| `case-ai-chats` | false | Uses service-role access to read/write chat links by caller-supplied CNR. Origin allowlisting is not authentication; no caller JWT/resource authorization was visible. |
| `prepare-document-share` | false | CORS allows all origins; uses service-role access, reads caller-supplied document IDs, may migrate inline data, and returns signed URLs. No caller authentication/resource authorization was visible. |

These are source/configuration findings, not proof that every endpoint is exploitable in every deployment context. They are high-priority because private-data endpoints use elevated credentials without visible per-user authorization. The exact public behavior of functions whose source could not be inspected remains unverified.

### Edge Function remediation requirements

- Distinguish intentionally public asset/capture endpoints from private case-data endpoints.
- Require a real authenticated user or a narrowly scoped, expiring share token where public inbound sharing is a genuine requirement.
- Authorize the exact case/document/analysis row before every service-role read or write.
- Validate method, request shape, ID type/range, payload size, file type, and idempotency.
- Keep service-role credentials server-side; remove hard-coded access/publishing credentials and rotate them after transition testing.
- Preserve legitimate mobile and document workflows.
- Test unauthorized IDs, forged Origin headers, invalid/missing JWTs, duplicate submissions, and partial failures.
- Do not simply switch `verify_jwt` to true without updating all current callers and checking internal authorization.

## 6. Security and performance advisors

Security Advisor (current read-only query):
- 2 `SECURITY DEFINER` view findings.
- 7 RLS-enabled/no-policy findings.

Performance Advisor:
- 1 unindexed foreign key: `cases.latest_order_document_id` (performance-only; not a security blocker).
- Multiple indexes reported unused. Do not drop them solely on this observation; the dataset is small and usage statistics may be reset or incomplete.

## 7. Blockers and safe next sequence

1. Verify a recoverable database backup/export and a separate recoverable copy of Storage object bytes. The current connected tools have not verified restoreability.
2. Create or identify a dedicated non-production Supabase environment. No Supabase development branch currently exists; creation may incur charges and has not been authorized.
3. Establish the intended single-user/multi-device Auth model. There are currently zero Auth users; do not invent or hard-code a user UUID.
4. Prepare the frontend Auth gate and token propagation on the GitHub remediation branch, preserving current wrapper behavior and all direct request paths.
5. Prepare schema-specific ownership/RLS/grant changes only after the Auth account and ownership/backfill plan are confirmed. Keep production rows inaccessible only after the backfill has been validated in a test environment.
6. Patch private Edge Functions with explicit JWT and resource authorization, and update all callers in the same tested release plan.
7. Test view security, Storage paths, mobile capture, document upload/open/share, AI analysis confirmation, and the existing Windows/Android workflows.
8. Only after recovery and negative tests pass, present exact production changes for explicit approval.

## 8. Explicit non-actions

No production changes have been made. No user was created. No database migration was applied. No function was deployed. No bucket, grant, policy, view, or document was modified. No destructive action was taken.

Tests not run in an isolated environment are marked NOT TESTED; this report is not a penetration-test certification.

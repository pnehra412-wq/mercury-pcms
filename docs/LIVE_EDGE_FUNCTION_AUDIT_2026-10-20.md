# Mercury PCMS — Live Edge Function Audit

Date: 2026-10-20
Project: `hmtcnatqowokeyrdjujq`
Purpose: inventory of deployed function configuration/source as retrieved read-only. This is not a penetration test.

## High-priority findings

| Deployed function | Deployed `verify_jwt` | Read-only source observation | Release action |
|---|---:|---|---|
| `prepare-document-share` | false | Retrieved source has wildcard `Access-Control-Allow-Origin: *`; it uses a service-role client and has no `auth.getUser` or `owner_id` check in the retrieved source. | Treat as critical. Do not replace with the branch version until owner schema is applied and tested; current branch code depends on `documents.owner_id`. Coordinate the owner migration and deploy the hardened version together. |
| `get-document-url` | false | Retrieved source lacks `owner_id`; CORS code falls back to `https://mercuryandroid.vercel.app` when Origin is not in the allowlist. | Must deploy the owner-scoped branch version only after schema migration and negative tests. |
| `case-ai-chats` | false | Retrieved source lacks `owner_id`; CORS code also falls back to the Vercel origin for unapproved/missing origins. | Must deploy owner-scoped branch version after schema migration and tests. |
| `capture-mobile-order` | false | Retrieved source uses a fallback CORS origin for unapproved/missing origins. The branch version has explicit origin handling and shared authentication, but requires the owner schema. | Keep deployment gated on owner migration and Android regression tests. |
| `capture-court-order` | true | Retrieved source calls `auth.getUser` to validate a bearer token, but the retrieved source contains no `owner_id` predicate. | Authentication alone does not establish ownership. Add owner scoping in the coordinated release. |
| `analyze-court-document` | true | Retrieved source uses a service-role client and contains no `owner_id` predicate. | Review resource authorization and deploy only with tested owner scoping. |
| `confirm-document-analysis` | true | Retrieved source uses a service-role client and contains no `owner_id` predicate. | Review resource authorization and deploy only with tested owner scoping. |
| `capture-shared-court-order` | false | The management connector returns deployment metadata but no source files/body. | Do not overwrite blindly. Retrieve its source through Supabase Dashboard/CLI and review its callers before replacement. |
| `mercury-office`, `publish-mercury-web` | false | Public gateway JWT verification is disabled. Source is present; branch versions add application-level bearer/owner checks. | Confirm current application-level authorization and migrate/deploy in a controlled sequence. |
| `mercury-app`, `mercury-capture` | false | These serve app/static content in the retrieved deployment inventory. | Public delivery may be intentional; confirm they expose no secrets or private case data. |

The deployed function list and source were retrieved from the connected Supabase project on 2026-10-20. Function configuration alone does not prove exploitability; however, the combination of disabled gateway JWT verification, service-role access, absent owner predicates, and public database policies is not an acceptable final state for a legal case-management system.

## Related live database facts

- `case-files` Storage bucket is already private (`public=false`).
- `mercury-web` bucket is public (`public=true`); this may be intentional for published static assets and should not be made private without reviewing the publish flow.
- Production currently has zero rows in `auth.users`.
- `cases`, `tasks`, `hearing_history`, and `documents` still have permissive policies for the `public` role with true predicates and broad grants to `anon`.
- The two flagged office views have already been changed to `security_invoker=true`; anonymous SELECT was revoked and authenticated SELECT retained.
- The branch owner migration has not been applied. It now revokes existing table and sequence grants from `anon`, `authenticated`, and `public` before granting only required authenticated privileges. This change has not yet received a fresh CI run or database runtime test.

## Safe release order

1. Create the intended single owner through Supabase Auth administration (never invent a UUID or share a password in chat).
2. Verify the database backup is restorable and Storage objects can be recovered independently.
3. Test the owner migration in a free isolated PostgreSQL/Supabase environment. Do not create a paid branch/project without cost approval.
4. Test anonymous requests, invalid/expired tokens, cross-owner IDs, unlinked documents, Storage failure paths, and Windows/Android share flows.
5. Apply owner schema/policies and deploy all dependent Edge Function/frontend changes in a coordinated release window.
6. Re-run Security Advisor, inspect grants/policies, and verify no private data is reachable anonymously.

**Do not claim production is secured until steps 1–6 are complete.** No deployed Edge Function or Storage object was changed during this audit.

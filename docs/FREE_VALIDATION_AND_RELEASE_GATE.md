# Mercury PCMS — Free Validation and Release Gate

Date: 2026-10-20
Branch: `security-hardening-2026-10-19`

This checklist is intentionally a release gate, not a claim that the app is complete.

## Verified source-level risks to close

1. The current branch copies of `get-document-url` and `prepare-document-share` use explicit origin allowlists, do not emit wildcard CORS, and support native requests without an Origin header while still requiring bearer authentication. The allowlist must be confirmed against real deployed browser origins before release.
2. The branch copies of `get-document-url` and `prepare-document-share` query `owner_id`, which does not exist in the live schema. Do not deploy these functions before the matching schema migration and negative tests.
3. The shared helper calls Auth `getUser(token)` before creating a service-role client. Each function still needs a resource-specific owner check. Review every service-role query/update, not only the presence of the helper import.
4. Production still has permissive `public` policies with true predicates on `cases`, `tasks`, `hearing_history`, and `documents`. The owner migration is not applied, and branch code does not remediate those live database policies.

## Free checks to run when a local checkout is available

- `node --check scripts/mercury-security-static-check.mjs`
- Run `node scripts/mercury-security-static-check.mjs` from repository root and save the actual output.
- Use a locally installed Deno runtime: `deno check supabase/functions/_shared/mercury-auth.ts` and each modified function. Do not install paid services or upload private data.
- Compile/test the frontend with the repository's existing toolchain only; do not introduce a paid CI dependency.
- Review diff for all modified paths and compare function contracts with their callers.
- Run negative tests: missing bearer, invalid/expired bearer, unknown ID, cross-owner ID, unexpected bucket, malformed legacy base64, oversized payload, Storage upload failure, checksum mismatch, and metadata update failure. For every failure case, confirm legacy data remains intact.
- Verify logout clears in-memory case/document data and prevents pre-login requests to private APIs.
- Test Windows and Android flows, including native requests without an Origin header.

## Database/release blockers

- No owner Auth user has been verified yet.
- No free isolated database is available through the current connected tools; do not create a billable Supabase branch/project.
- Verify a restorable database backup and separate recoverable Storage bytes.
- Retrieve source and caller contract for deployed `capture-shared-court-order`; the Supabase source connector returned an empty body.
- Build an explicit owner-scoped migration that preserves unlinked documents/analysis and respects bigint IDs and existing `cino` relationships. Never use guessed foreign-key types.
- Test view security, grants, RLS and cross-user access in an isolated database.
- Production release requires explicit approval. No production migration/function deployment is authorized by this checklist.

## Completion criteria

Do not call Mercury PCMS complete until all of these are true: frontend and function type checks pass; owner schema migration is tested; negative cross-user tests pass; document recovery/idempotency tests pass; the missing function is reviewed; all relevant Security Advisor findings are either fixed or documented with a justified exception; and Windows/Android core workflows pass regression tests.


## Latest free CI evidence (2026-10-20)

- The free GitHub Actions run [39366296206](https://github.com/pnehra412-wq/mercury-pcms/actions/runs/39366296206) passed on commit `1c28662adfb85b5127ca2f3e06c72b3faa39f8b2`.
- Passed: Node syntax check for the guardrail script, all dependency-free static checks, and Deno type-checks for the shared auth helper plus the listed document, capture, chat, office, and publishing Edge Functions.
- The type-check run found and prompted fixes for a Web Crypto typed-array incompatibility and a catch-variable typing issue.
- This is source/type validation only. It does not test live Auth, owner/RLS behavior, Storage operations, browser CORS end-to-end, Android sharing, or data migration safety. Any new source commit should be validated by a fresh CI run before release.


## Latest code-validation run — 2026-10-20

- [GitHub Actions run 39366551236](https://github.com/pnehra412-wq/mercury-pcms/actions/runs/39366551236) passed on commit `f737204965078105fe87d69d5ba2946e03db5919`.
- This run includes the CORS allowlist/fallback checks for `get-document-url`, plus the Deno type checks for the listed Edge Functions.
- The previous type-check failures were fixed and the full configured job passed. This still does not prove runtime correctness, owner/RLS enforcement, browser/device compatibility, or migration safety.


## Production view remediation and guarded owner migration — 2026-10-20

- Production migration `secure_office_views_security_invoker` has been applied and verified. Both `office_court_watch` and `office_document_inbox` now have `security_invoker=true`; `anon` no longer has SELECT, and `authenticated` retains SELECT. The two corresponding view findings no longer appear in the latest Security Advisor response.
- The latest advisor still reports seven RLS-enabled tables without policies: `case_ai_chats`, `case_contacts`, `case_issues`, `case_notes`, `court_watch`, `document_analysis`, and `fees`.
- The existing permissive `public` policies on `cases`, `tasks`, `hearing_history`, and `documents` remain a critical exposure. They must be replaced together with ownership backfill; do not claim full production security until that is completed.
- Added guarded SQL migration `supabase/migrations/20261020041000_owner_scoped_rls_single_user.sql`. It aborts unless exactly one Auth user exists, backfills all current rows (including documents/analysis with null CINO), removes old policies, applies owner-only policies, revokes anonymous/public table privileges, and adds retry-idempotency references. It is committed on the branch but NOT applied to production.
- Latest configured static and Deno validation passed: [GitHub Actions run 39367450466](https://github.com/pnehra412-wq/mercury-pcms/actions/runs/39367450466). This checks source/type safety, not runtime RLS or migration behavior.
- Remaining release blocker: establish the intended single owner in Supabase Auth, verify backup restoration including Storage bytes, test the guarded migration in a free isolated database, then run cross-user/anonymous negative tests before deployment. No paid branch/project was created.


- Final branch verification after aligning the view migration version with Supabase history: [GitHub Actions run 39367983216](https://github.com/pnehra412-wq/mercury-pcms/actions/runs/39367983216) passed on commit `eb257d71a865c0e48138ac78122f2a45dbaa68df`.
- Production migration history confirms the view fix is recorded as version `20261020035653`; the matching branch migration filename is `supabase/migrations/20261020035653_secure_office_views_security_invoker.sql`.


## Re-review after owner-migration grant audit — 2026-10-20

- A second review found that the draft owner migration revoked anonymous/public table grants but did not first revoke legacy grants from `authenticated`. This matters because RLS does not protect `TRUNCATE`. The branch migration now revokes all existing table and sequence privileges from `anon`, `authenticated`, and `public`, then grants only SELECT/INSERT/UPDATE/DELETE and sequence USAGE/SELECT to `authenticated`.
- The static guardrail now checks both table-grant and sequence-grant resets. These are source assertions only until a fresh CI run passes.
- Live read-only verification found **zero rows in `auth.users`**. Therefore the migration's single-owner preflight will correctly abort today; no owner identity or UUID will be guessed, and the migration must not be applied until the owner account is created through Supabase Auth administration.
- Live read-only inspection confirms the `public`-role `USING(true)` / `WITH CHECK(true)` policies and broad `anon` table grants remain on `cases`, `tasks`, `hearing_history`, and `documents`. These cannot safely be removed in isolation because the current frontend has not completed the Auth transition. This is still a critical production exposure.
- The migration remains untested against a live-like PostgreSQL database; do not treat static checks as SQL runtime validation.


## Targeted source assertion recheck — 2026-10-20

- Strengthened `scripts/mercury-security-static-check.mjs`: each protected Edge Function must contain an actual owner predicate (`.eq("owner_id", auth.user.id)` or the explicit REST owner filter), rather than merely mentioning `owner_id` somewhere in its source.
- Directly rechecked the seven branch function sources (`get-document-url`, `prepare-document-share`, `case-ai-chats`, `analyze-court-document`, `confirm-document-analysis`, `capture-court-order`, `capture-mobile-order`): all contain the expected owner predicate, none contains wildcard CORS, and all call the shared auth helper.
- Directly checked the draft owner migration revokes legacy table and sequence privileges from `anon`, `authenticated`, and `public` before applying least-privilege grants.
- This targeted source assertion is not a substitute for the complete GitHub Actions workflow or PostgreSQL runtime testing. The latest source commits have no fresh workflow status reported by the GitHub connector.

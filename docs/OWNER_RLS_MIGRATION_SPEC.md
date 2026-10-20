# Mercury PCMS — Owner/RLS Migration Specification (NOT EXECUTABLE SQL)

Status: guarded migration drafted on the review branch; not applied to production. File: `supabase/migrations/20261020041000_owner_scoped_rls_single_user.sql`.
Target: the single-user Mercury PCMS model.
Production project ref: `hmtcnatqowokeyrdjujq`.

## Preconditions that must pass

1. Create the intended owner account through Supabase Auth administration. Live `auth.users` currently has 0 rows. Do not insert a guessed UUID or put credentials in GitHub/chat.
2. Confirm the owner identity through the authenticated session. The migration should abort unless exactly one intended owner is configured for the initial single-user backfill.
3. Verify a recoverable database restore point and a separate recoverable copy of Storage object bytes. The user reports a backup; restoreability and Storage recovery have not been independently verified.
4. **Fee constraint:** the user has directed that no fees be incurred. Do not create a Supabase branch or new project. Use free local/static validation and keep all unverified schema changes out of production.
5. Re-capture table definitions, FK delete actions, grants, policies, view definitions, Storage policies, row counts, and relationship checks immediately before migration generation.

## Ownership model

Add `owner_id uuid` referencing `auth.users(id)` to:
- `cases`
- `tasks`
- `hearing_history`
- `documents`
- `document_analysis`
- `case_ai_chats`
- `case_contacts`
- `case_issues`
- `case_notes`
- `court_watch`
- `fees`

Use `auth.uid()` as the default for ordinary authenticated-client inserts. Service-role Edge Functions must set `owner_id` explicitly from the authenticated caller after validating the caller JWT.

After safe backfill, make `owner_id` NOT NULL on all eleven tables. A preflight must abort if the expected owner is missing or ambiguous.

## Backfill rules

- Backfill all 158 existing cases to the verified owner.
- For child rows with a non-null `cino`, derive ownership from the matching `cases` row and abort on unmatched/ambiguous relationships.
- Three current document rows have null `cino`; one current `document_analysis` row has null `cino`. They still need explicit owner assignment. Do not use a case-only join to backfill them.
- Backfill `document_analysis.owner_id` from its referenced `documents` row, then verify any `matched_case_id` points to a case with the same owner.
- `fees` currently has zero rows, uses text `cino`, and has no `case_id`. Include it in ownership policies anyway.
- Preserve all existing primary keys, bigint IDs, document metadata, Storage paths, and inline content. Do not clear `file_data` as part of this schema migration.
- If any row cannot be mapped confidently, abort and report the row ID and relationship issue without exposing its confidential contents.

## Relationship integrity

Add composite uniqueness where required and enforce owner-consistent relationships:
- Cases: unique `(cino, owner_id)` and `(id, owner_id)`.
- Documents: unique `(id, owner_id)`.
- Child records with a case CNR must not be able to reference a case owned by a different user. Use composite FKs `(cino, owner_id)` to `cases(cino, owner_id)`, preserving the existing on-delete semantics.
- `document_analysis` must reference a document with the same owner; any matched case must also have the same owner.
- `cases.latest_order_document_id` must not point to a document owned by another user.
- Keep CNR nullable on tables where it is currently nullable; ownership must still work for unlinked rows.

## Retry/idempotency fields required by the Edge Function drafts

Add nullable `source_document_analysis_id bigint` references to `document_analysis(id)` on:
- `hearing_history`
- `tasks`

Add a unique partial index for non-null `source_document_analysis_id` on each table. This makes retries of `confirm-document-analysis` idempotent and prevents duplicate hearing/task creation after partial failure. Existing rows remain null.

## RLS and grants

**Critical finding:** the frontend sign-in gate is not, by itself, a security boundary. The live `cases`, `tasks`, `hearing_history`, and `documents` policies still have permissive `true` predicates applying to `public`; merely changing the browser bearer token to a signed-in user's token does not isolate records. Do not describe the live system as secured until these policies/grants are replaced and anonymous/other-user negative tests pass.

- Enable RLS on all eleven application tables.
- Remove the existing broad public policies from `cases`, `tasks`, `hearing_history`, and `documents`.
- Create owner policies for `authenticated` using `owner_id = auth.uid()` for read/write operations, with matching `WITH CHECK` on inserts and updates.
- Do not create permissive `USING (true)` policies.
- Revoke direct table privileges from `anon`; grant only the required table privileges to `authenticated` and preserve server-only service-role access.
- Inspect and correct sequence grants needed for bigint ID inserts.
- Review default privileges so future application tables are not accidentally granted to `anon`.

## Views and Storage

- Recreate `office_court_watch` and `office_document_inbox` with `security_invoker=true` only after the base-table policies are in place; grant SELECT to `authenticated` and revoke anonymous access.
- Keep `case-files` private. The current design uses authenticated Edge Functions and short-lived signed URLs; do not add a blanket authenticated Storage policy.
- Keep `mercury-web` public only for the intended public app assets. Review its three current objects before any visibility change.
- Preserve current Storage paths and object bytes.

## Required isolated tests (must pass before release)

- Migration preflight fails safely when Auth user count is 0 or ambiguous.
- Every existing row receives the intended owner without changing row IDs or document bytes.
- Authenticated owner can read/write owned rows.
- Anonymous and other-user requests cannot read or modify any case, child row, view row, analysis, or document.
- Cross-owner CNR/document/case references fail at the database constraint layer.
- The two views return only owner-authorized rows.
- Document signed URL is issued only to the owner and expires as configured.
- Duplicate confirmation retries do not create duplicate hearing history or tasks.
- Record counts, relationship counts, and document hashes match the pre-migration baseline.
- Rollback must not re-enable the broad public policies. If a safe rollback cannot preserve confidentiality, stop and use a forward fix instead.

## Implementation status\n\n- Production views `office_court_watch` and `office_document_inbox` have now been changed to `security_invoker=true`; anonymous SELECT was revoked and authenticated SELECT retained. Read-only verification confirmed both settings and grants.\n- The Security Advisor no longer reports the two previously flagged SECURITY DEFINER views; seven RLS-enabled tables still have no policies.\n- The owner migration is guarded to abort unless exactly one Auth user exists. It backfills all existing rows to that verified owner, removes permissive legacy policies on the eleven application tables, installs owner policies, revokes anonymous/public table grants, and adds idempotency references for analysis confirmation.\n- The migration has not been applied because the connected project currently has no verified owner identity and there is no free isolated database for runtime testing. Applying it before the intended owner account exists would intentionally fail; bypassing that guard would be unsafe.\n\n## Tooling and no-fee limitation

The connected environment has no local Supabase CLI or Deno runtime, and the user has instructed that fees must be avoided. No Supabase development branch/project will be created. Free GitHub Actions runs Node static guardrails and Deno type checks for the modified Edge Functions; latest run: [39367568409](https://github.com/pnehra412-wq/mercury-pcms/actions/runs/39367568409). This is source/type validation only. The guarded migration file exists on the review branch, but its SQL has not been executed in a test database. Before production application, obtain a verified recovery point and separate Storage backup, establish the intended owner Auth account, test the migration in a genuinely free isolated database environment, and complete cross-owner and document-recovery tests. If no free isolated environment exists, do not deploy the owner schema/function changes.

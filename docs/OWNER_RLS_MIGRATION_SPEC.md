# Mercury PCMS — Owner/RLS Migration Specification (NOT EXECUTABLE SQL)

Status: design specification only. No migration file has been generated or applied.
Target: the single-user Mercury PCMS model.
Production project ref: `hmtcnatqowokeyrdjujq`.

## Preconditions that must pass

1. Create the intended owner account through Supabase Auth administration. Live `auth.users` currently has 0 rows. Do not insert a guessed UUID or put credentials in GitHub/chat.
2. Confirm the owner identity through the authenticated session. The migration should abort unless exactly one intended owner is configured for the initial single-user backfill.
3. Verify a recoverable database restore point and a separate recoverable copy of Storage object bytes. The user reports a backup; restoreability and Storage recovery have not been independently verified.
4. Create a non-production Supabase branch or isolated project only after cost approval. None exists at present.
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

## Required isolated tests

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

## Tooling limitation

The connected environment has no Supabase CLI and no Deno runtime; GitHub and Supabase connectors do not provide a non-production database branch for this project. Therefore no executable migration file or runtime test has been claimed. Generate the actual migration with `supabase migration new` in a real project workspace after the preconditions above pass, then test it on the isolated database before any production approval.

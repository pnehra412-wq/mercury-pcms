# Mercury PCMS — Read-only schema recheck
Date: 2026-10-20
Branch: `security-hardening-2026-10-19`

This recheck used read-only Supabase schema/SQL queries. No production data or schema was changed.

## Live row counts

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

These are counts only; no client names, document text, case notes, file bytes, tokens, or credentials were retrieved for this report.

## Relationship checks observed

- `cases.cino` has no null values in the current data.
- 3 document rows have null `cino`; ownership must be derived from the verified Auth owner, not a case join.
- 1 `document_analysis` row has null `cino`; ownership should be derived from its referenced document.
- No unmatched non-null `cino` values were found in `documents`, `document_analysis`, `tasks`, or `hearing_history`.
- No `document_analysis` rows were found without a referenced document.

These checks do not prove the database is safe to migrate. Re-run the included preflight SQL immediately before any migration and compare results against a verified restorable backup.

## Implementation consequence

The owner migration must preserve all 158 cases, 54 court-watch rows, 5 analysis rows, 7 document rows, 2 hearing rows, and 1 task row. It must explicitly backfill unlinked documents/analysis rows, preserve existing bigint identifiers and FK delete actions, and must not clear `file_data`. The preflight is read-only and intentionally does not attempt to make changes.

## Validation status

- Read-only schema and relationship queries: completed.
- Production DDL/data/Storage/function changes: none.
- Isolated migration test: not available without a free isolated database; no paid Supabase branch/project will be created.
- Do not merge/deploy the owner-scoped Edge Function drafts until the matching owner schema exists and negative cross-owner tests pass.

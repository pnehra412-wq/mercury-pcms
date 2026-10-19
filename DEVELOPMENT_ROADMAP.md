# Mercury PCMS Development Roadmap

## Scope
Improve the existing Mercury PCMS application in place. Preserve the current PostgreSQL records, Storage objects, existing case identifiers, and current user workflows. Do not rebuild the app or bulk-reimport cases.

## Implementation principles
- Make schema changes additive and versioned.
- Never run destructive SQL against production without a verified recovery point and explicit review.
- Keep all secrets and service-role credentials server-side.
- Test changes on a development/staging environment before production.
- Every automated action must be observable, retry-safe, and auditable.
- AI-generated case facts and drafts must cite source documents/pages when available and require advocate review before external use.
- Keep Windows and Android behaviour consistent.

## Phase 0 — Safe baseline
- [ ] Verify a recoverable Supabase database backup and Storage recovery strategy.
- [ ] Record baseline row counts for all application tables and inventory Storage object paths.
- [ ] Review authentication, grants, RLS policies, views, Storage policies, and Edge Function authorization.
- [ ] Record current migration versions and production deployment versions.
- [ ] Create a regression checklist for Windows and Android.
- [ ] Do not modify production policies until the intended user/access model is confirmed and existing workflows are mapped.

## Phase 1 — Case diary and reminders
- [ ] Add a daily dashboard for today's cases, overdue tasks, and the next seven days.
- [ ] Improve hearing-outcome entry: order/result, next date, next purpose, and follow-up tasks.
- [ ] Add a durable reminder queue with delivery status, retries, and idempotency.
- [ ] Add printable daily diary and CSV/PDF exports.
- [ ] Store timestamps consistently and display local time in Asia/Kolkata.
- [ ] Require confirmation for AI-extracted dates before they update official case dates.

## Phase 2 — Document centre
- [ ] Reuse existing document and analysis records.
- [ ] Provide upload, preview, categorisation, versioning, and case association.
- [ ] Show a review queue for unmatched documents and failed/incomplete analysis.
- [ ] Preserve originals; do not overwrite source documents with AI-generated content.
- [ ] Use private object storage and authorized, short-lived download links for confidential files.

## Phase 3 — Case-specific AI drafting
- [ ] Generate a case brief and chronology from selected documents.
- [ ] Build editable drafts from selected source material and saved case facts.
- [ ] Track draft versions, source documents, and review status.
- [ ] Show source references and mark uncertain or missing facts.
- [ ] Keep provider secrets server-side; retain existing external ChatGPT/Claude links as a fallback.
- [ ] Require human review before filing, sending, or treating generated content as an official record.

## Phase 4 — Windows/Android sync
- [ ] Add initial load plus live change subscriptions where supported.
- [ ] Refresh after reconnect and when the app returns to the foreground.
- [ ] Add a visible pending/synced/failed state for offline-capable writes.
- [ ] Add version/conflict detection; never silently discard a concurrent edit.
- [ ] Test simultaneous edits, offline edits, reconnects, and duplicate submissions.

## Acceptance gates
1. Existing case, task, hearing, document, and analysis records remain intact.
2. Existing Storage object references continue to resolve.
3. Unauthenticated and unauthorized access tests fail safely.
4. Windows and Android workflows pass the same regression cases.
5. Reminder delivery is idempotent and failures are visible/retryable.
6. AI outputs are editable, traceable, and never automatically filed or sent.
7. Rollback instructions exist before production deployment.

## Current execution status (updated 2026-10-19)
- Development branch: `phase-0-safe-foundation`.
- Read-only live inspection confirms the previous baseline still holds: 158 cases, 1 task, 2 hearing-history rows, 7 documents, 5 document-analysis rows, and 54 court-watch rows. The `case-files` bucket is already private and contains 8 objects; `mercury-web` contains 3 objects.
- Added `docs/DEEPSEEK_HANDOFF_REVIEW.md`, which checks the supplied single-user SQL against the actual schema and current deployed Edge Function sources.
- The proposed DeepSeek migration is not ready to run: actual primary keys are bigint (so the draft reminder UUID foreign keys are incompatible); the app uses a custom REST wrapper without a Supabase Auth session; and direct Edge Function callers omit Authorization.
- Current read-only findings remain: 2 SECURITY DEFINER views, broad public RLS policies on cases/tasks/hearing_history/documents, 7 RLS-enabled tables without policies, and service-role Edge Functions with `verify_jwt=false` and no visible per-resource JWT authorization in the reviewed functions.
- No production data, schema, RLS policies, grants, views, Storage objects, or Edge Functions have been changed by this work.
- The user reports having taken a backup. Database recovery has not been independently verified through the connected tools, and separate Storage-byte recovery remains a release gate.
- Next: map all app/function access paths and design a schema-matched authenticated request model; test security patches on a non-production environment before any production change.

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

## Current execution status
- A development branch has been created for safe preparatory work.
- No production data, schema, RLS policies, Storage objects, or Edge Functions have been changed by this roadmap commit.
- Production implementation is gated on confirming and verifying a recovery point, because a directly verifiable database/Storage export is not available through the current connected actions.

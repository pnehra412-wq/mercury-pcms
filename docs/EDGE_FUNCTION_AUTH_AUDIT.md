# Phase 0 — Edge Function Authorization Review

Audit date: 2026-10-19
Project ref: hmtcnatqowokeyrdjujq
Repository: https://github.com/pnehra412-wq/mercury-pcms
Branch: phase-0-safe-foundation

## Scope and safety

Read-only inspection of deployed Edge Function metadata and selected source code. No deployed function or production data was changed. This is a targeted triage, not a complete penetration test.

## High-priority findings

### 1. `prepare-document-share` — urgent authorization review

- Deployed with `verify_jwt=false`.
- Uses `SUPABASE_SERVICE_ROLE_KEY` to read document rows and create signed Storage URLs.
- CORS allows `*`.
- Request accepts caller-supplied document IDs and returns signed URLs; it can also migrate legacy inline file data to Storage and clear `file_data` from the database.
- No user authentication/authorization check was visible in the inspected function source.

**Risk:** a caller who can invoke this endpoint may request documents by ID and receive signed URLs; the endpoint's legacy migration branch can also mutate data. CORS is not an authorization boundary.

**Action:** do not expose new workflows through this endpoint until authorization is enforced. Before any production fix, map current app callers and test a secured replacement. Do not simply flip JWT verification on without checking existing clients and migration needs.

### 2. `get-document-url` — urgent authorization review

- Deployed with `verify_jwt=false`.
- Uses the service-role key to fetch a document and create a signed URL valid for 3,600 seconds.
- Authorization visible in source is based on the request Origin allowlist; no user/session or per-document authorization check was visible.

**Risk:** browser Origin restrictions do not authenticate a caller; non-browser clients can forge the header. If the function is reachable, document IDs may be enough to request a signed URL.

**Action:** require a valid authenticated session or a separate strong, expiring, scoped share token, and authorize access to each requested document. Reduce signed URL lifetime after confirming workflow needs.

### 3. `capture-mobile-order` — urgent integrity review

- Deployed with `verify_jwt=false`.
- Uses the service-role key and Origin allowlist, with no user/session authorization visible in the inspected path.
- Accepts a PDF upload and performs database writes.
- Source contains paths that update `cases.date_next_list`, purpose/order metadata, insert `hearing_history`, update `court_watch`, and may create a case when a CNR is not found.
- The duplicate-file refresh path can also update a case's next date and related metadata.

**Risk:** Origin checks alone do not prevent scripted calls. An unauthenticated caller may be able to inject documents or influence case diary dates/history if endpoint validation allows the request.

**Action:** authenticate and authorize uploads, validate file type/content/size and idempotency, and keep AI-detected dates in review until an authorized user confirms them. Do not deploy a change until mobile-share clients are regression-tested.

### 4. `case-ai-chats` — authorization review

- Deployed with `verify_jwt=false`.
- Uses service-role access to read and write case chat links.
- Source uses an Origin allowlist but no visible user/session authorization.
- GET returns chat links for a caller-supplied CNR; POST creates/updates a chat link.

**Risk:** case-linked AI conversation URLs and metadata may be readable or editable by callers who can reach the endpoint.

**Action:** require authentication and case-level authorization before returning or changing chat links.

## Other observed deployed functions

The deployed function inventory includes `mercury-app`, `capture-court-order`, `capture-shared-court-order`, `mercury-capture`, `mercury-office`, `publish-mercury-web`, `analyze-court-document`, and `confirm-document-analysis`. The inventory shows mixed `verify_jwt` settings. Each function needs source-level review for authorization, validation, side effects, rate limits, and secret handling before the security phase can be considered complete.

Specific note: `mercury-office` contains a hard-coded access key in its deployed source. Treat that as a credential exposure risk; replace it with a managed secret or proper authentication only after mapping the current office link usage and testing a transition. Do not publish the key in logs, commits, or user-facing material.

## Required remediation design

1. Decide the intended single-user identity model for Mercury on Windows and Android (Supabase Auth is the preferred baseline).
2. Require and validate JWTs on private data endpoints; inside each function validate the user and authorize the case/document operation. JWT verification alone is not a substitute for per-resource authorization.
3. If a public inbound-share workflow must remain unauthenticated, issue a high-entropy, expiring, one-purpose token bound to the upload action and enforce rate limits; do not grant general read access or service-role actions based only on Origin.
4. Remove hard-coded access credentials; rotate any exposed credential after the replacement path is tested.
5. Audit every service-role use. Keep the service key server-side, and ensure each endpoint limits the exact rows/actions it can access.
6. Test allowed and denied cases: no token, invalid token, valid user with unrelated CNR/document ID, expired share token, malformed input, duplicate submission, and rate-limited requests.
7. Keep all changes on the development branch/non-production environment until recovery and regression gates pass.

## Production status

No production functions were changed in this review. Because the Dashboard reported no listed backup and Storage recovery has not been verified, production remediation remains gated on a recoverable database and separate Storage recovery point.

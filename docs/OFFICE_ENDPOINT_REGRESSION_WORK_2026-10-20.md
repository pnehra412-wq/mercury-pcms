# Mercury PCMS — Office Endpoint Regression Work

Date: 2026-10-20
Branch: security-hardening-2026-10-19

## Completed

- Added scripts/check-office-endpoint.mjs, a dependency-free regression test for the office endpoint.
- Added .github/workflows/mercury-office-guardrail.yml to run the test on branch pushes using GitHub Actions.
- The test checks authentication-helper usage, authenticated-owner filtering, absence of a URL query credential gate, absence of a static office-key variable, explicit query field selection, and generic error handling.
- The checks are static and do not call the production API or read case records.

## Follow-up items

- The deployed office function still differs from the reviewed branch version. Keep the replacement and credential rotation in the controlled release plan; do not make a live change as part of this branch-only run.
- The branch query still selects some fields that the dashboard does not render. Review and remove unnecessary fields in a follow-up source edit.
- The owner-scoped API query depends on the owner schema and the authenticated account being established. Do not release until the owner migration, recovery checks, and negative authorization tests are complete.

## Safety and validation

- The new test and workflow were committed on the security-hardening branch.
- CI must be inspected before describing the checks as passed.
- No production database, Storage, Auth, policies, grants, views, or deployed functions were changed.
- No paid Supabase branch/project or paid service was created.

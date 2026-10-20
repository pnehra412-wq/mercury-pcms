# Follow-up source review — 2026-10-20

Branch: `security-hardening-2026-10-19`

- A deeper reread found that the earlier removal of unreachable code in `capture-mobile-order` had left a malformed stale handler tail after an empty catch. Removed that tail completely, removed its unused PDF extraction import, and restored one sanitized outer catch. This likely fixes a parse/compile blocker in the branch source; compilation has not been run because Deno is unavailable here.
- Added static guardrails to detect reintroduction of the stale legacy handler's distinctive variables and to require the sanitized outer error response.
- Added a 25 MB decoded-byte cap to the legacy inline-file migration path in `prepare-document-share`. It estimates decoded size before calling `atob`, limiting avoidable memory allocation from oversized base64 content.
- Extended the static guardrail to check that this migration limit remains in place.
- These are branch-only commits. No production function was deployed, no database/storage mutation was performed, and no billable resource was created.
- Validation limitation: the static guardrail script has not yet been executed against a complete checkout; Deno type-check, browser tests, isolated RLS tests, and Storage tests remain unrun. Keep PR #1 draft-only until those checks and the ownership migration are resolved.

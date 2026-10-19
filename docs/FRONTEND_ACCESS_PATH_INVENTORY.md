# Mercury PCMS — Frontend Access-Path Inventory

Date: 2026-10-19
Branch: `phase-0-safe-foundation`
Source inspected: `index.html` (current blob SHA `0720bc09acfdf66b87aabbf684efb939c2a02c15`)

## Purpose

This inventory maps the current frontend's data access before authentication/RLS work. It is not a penetration test and contains no case content, object names, API keys, or secret values.

## Current API wrapper

- The frontend is a single HTML file using React 18 and Babel from CDNs.
- A custom `sbReq(method, path, body)` wrapper sends requests to Supabase PostgREST.
- The wrapper currently sends the public anon key as both `apikey` and `Authorization: Bearer ...`. No Supabase Auth session is initialized in the inspected file.
- The wrapper supports GET/POST/PATCH/DELETE. Its `sb.from(table)` facade supports `select`, `insert`, `update`, and `delete`.
- The wrapper is used for these table/method combinations: `cases.insert`, `cases.update`, `fees.insert`, `fees.select`, `hearing_history.insert`, `hearing_history.select`, `tasks.delete`, `tasks.insert`, `tasks.select`, `tasks.update`.
- Case list and calendar also issue direct `fetch` requests to `/rest/v1/cases`, with the same public-key bearer header.
- This means adding a login form alone is insufficient: the wrapper and direct REST calls must use the current access token, and every direct Edge Function call must include the session token too.

## Direct Edge Function callers

- `case-ai-chats`: GET by cino and POST create/update link; current fetch omits Authorization.
- `prepare-document-share`: POST selected document IDs; returns signed links; current fetch omits Authorization.
- `get-document-url`: POST document_id; returns signed link; current fetch omits Authorization.

Deployed functions have `verify_jwt=false` in the inspected live metadata. Function-level authentication and per-resource authorization must be added and tested before relying on a JWT-only gateway setting.

## Document workflow

- Manual document upload currently reads the selected file as a data URL/base64 and inserts it into `documents.file_data`; this is not a direct upload to Storage.
- Document opening checks `storage_bucket` and `storage_path` and calls `get-document-url` to request a signed link.
- Sharing selected documents calls `prepare-document-share`. That function can migrate legacy `file_data` into Storage and then clear `file_data`, so it is a data-mutating endpoint, not merely a link generator.
- Preserve this legacy-file path when securing the function. Do not revoke access or change function auth without updating the current callers and regression-testing upload, open, and share.

## Authentication/security implementation implications

1. Add a Supabase Auth client and a visible login/logout/session-expiry state.
2. Gate mounting/loading the main app until a valid session exists; do not let unauthenticated requests race ahead of login.
3. Change `sbReq` and both direct REST calls to use the current session access token. Fail closed if no session is available; never silently fall back to the anon key as a bearer token.
4. Add the access token to each Edge Function call and enforce `getUser`/JWT validation plus document/case authorization inside functions that use the service role.
5. Establish table ownership/policies for every table actually used, including related rows reached by CNR and views' base tables. Existing IDs are bigint; CNR is the principal relationship key for several child tables.
6. Keep `case-files` private (it already is) and preserve the existing object paths. Do not assume current objects are under a UID folder.
7. Test unauthenticated denial, valid owner reads/writes, unrelated document/CNR denial, expired sessions, duplicate uploads, legacy inline-file migration, and Windows/Android behaviour.

## Known limits / next inspection

This is a frontend-focused map. Continue reviewing every deployed Edge Function and any Android native/webview caller before finalizing the shared auth contract. No production changes were made by this inventory.

#!/usr/bin/env node
/**
 * Free, dependency-free static guardrails for Mercury PCMS security remediation.
 * Run from repository root: node scripts/mercury-security-static-check.mjs
 *
 * This does NOT replace Deno type-checking, browser/device tests, RLS tests,
 * Storage tests, or review of the deployed Supabase configuration.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const checks = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`Missing required file: ${path}`);
    return "";
  }
  return readFileSync(full, "utf8");
}
function check(label, condition, detail) {
  checks.push({ label, passed: Boolean(condition) });
  if (!condition) failures.push(`${label}: ${detail}`);
}

const frontend = read("index.html");
const authHelper = read("supabase/functions/_shared/mercury-auth.ts");
check("Frontend auth gate exists", frontend.includes("function MercuryAuthGate"), "missing MercuryAuthGate");
check("Frontend uses Supabase Auth session", frontend.includes("sbAuth.auth.getSession()") && frontend.includes("sbAuth.auth.signInWithPassword"), "session restore or password sign-in missing");
check("Frontend does not send public key as bearer token", !/setRequestHeader\(["']Authorization["']\s*,\s*`Bearer \${SB_KEY}`\)/.test(frontend), "found an Authorization bearer header using SB_KEY");
check("Shared helper verifies the supplied token", authHelper.includes("auth.getUser(match[1])"), "Supabase Auth getUser(token) validation missing");
check("Shared helper fails closed without a bearer token", authHelper.includes("Authentication required") && authHelper.includes("Invalid or expired session"), "missing authentication failure responses");

const protectedFunctions = [
  "get-document-url",
  "prepare-document-share",
  "case-ai-chats",
  "analyze-court-document",
  "confirm-document-analysis",
  "capture-court-order",
  "capture-mobile-order",
];
for (const name of protectedFunctions) {
  const src = read(`supabase/functions/${name}/index.ts`);
  check(`${name} verifies JWT`, src.includes("authenticateMercuryRequest(req)"), "shared authentication helper call missing");
  check(`${name} contains owner scoping`, src.includes("owner_id"), "owner_id scoping is absent; review before release");
}
for (const name of ["capture-court-order", "analyze-court-document", "get-document-url"]) {
  const src = read(`supabase/functions/${name}/index.ts`);
  check(`${name} handles CORS preflight`, src.includes('req.method === "OPTIONS"'), "OPTIONS preflight handler missing");
  check(`${name} avoids wildcard CORS`, !src.includes('"Access-Control-Allow-Origin": "*"'), "wildcard CORS remains");
  check(`${name} uses explicit origin allowlist`, src.includes("ALLOWED_ORIGINS.has(origin)"), "explicit origin allowlist missing");
  check(`${name} does not echo a fallback browser origin`, !src.includes(' : "https://mercuryandroid.vercel.app"'), "unapproved origins receive a fallback ACAO header");
}
const office = read("supabase/functions/mercury-office/index.ts");
check("mercury-office authenticates API requests", office.includes("authenticateMercuryRequest(req)"), "authenticated API route missing");
check("mercury-office query is owner scoped", office.includes("owner_id=eq.") && office.includes("auth.user.id"), "case API query lacks owner filter");

const mobile = read("supabase/functions/capture-mobile-order/index.ts");
check("Mobile capture dead extraction block removed", !mobile.includes('let extracted = ""'), "unreachable extraction block remains");
check("Mobile capture has no stale legacy handler tail", !mobile.includes("aiSummary?.order_date") && !mobile.includes("finalOrderDate"), "stale pre-refactor capture handler remains");
check("Mobile capture catch returns a sanitized error", mobile.includes('error:"Could not process the shared court order"'), "sanitized catch response missing");

check("Mobile capture limits PDF size", mobile.includes("25 * 1024 * 1024"), "25 MB file-size cap missing");
check("Mobile capture does not return raw upload errors", !/return json\(req,\s*\{[^}]*error:\s*\w+Error\.message/s.test(mobile), "possible raw database/storage error exposed");

const sharing = read("supabase/functions/prepare-document-share/index.ts");
check("Legacy document migration has a decoded-size cap", sharing.includes("MAX_LEGACY_FILE_BYTES") && sharing.includes("estimatedBytes > MAX_LEGACY_FILE_BYTES"), "legacy inline-file migration can allocate oversized decoded content");
check("Document sharing does not grant wildcard browser CORS", !sharing.includes('"Access-Control-Allow-Origin": "*"'), "wildcard CORS remains on private document sharing");
check("Document sharing only echoes explicitly allowed origins", sharing.includes("ALLOWED_ORIGINS.has(origin)") && sharing.includes("function corsHeaders(req: Request)"), "explicit origin allowlist missing");

const chatLinks = read("supabase/functions/case-ai-chats/index.ts");
check("Case chat links do not fall back to an allowed origin", !chatLinks.includes(' : "https://mercuryandroid.vercel.app"'), "unapproved origins receive a fallback ACAO header");
check("Case chat links use explicit CORS allowlist", chatLinks.includes("ALLOWED_ORIGINS.has(origin)") && chatLinks.includes("responseHeaders[\"Access-Control-Allow-Origin\"] = origin"), "explicit origin allowlist missing");

const confirmation = read("supabase/functions/confirm-document-analysis/index.ts");
check("Analysis confirmation does not fall back to an allowed origin", !confirmation.includes(' : "https://mercuryandroid.vercel.app"'), "unapproved origins receive a fallback ACAO header");
check("Analysis confirmation uses explicit CORS allowlist", confirmation.includes("ALLOWED_ORIGINS.has(origin)") && confirmation.includes("responseHeaders[\"Access-Control-Allow-Origin\"] = origin"), "explicit origin allowlist missing");

check("Mobile capture supports clients without Origin", mobile.includes('if (origin && !ALLOWED_ORIGINS.has(origin))'), "missing Origin is rejected, potentially breaking native share");
check("Mobile capture does not fall back to an allowed ACAO origin", !mobile.includes(' : "https://mercuryandroid.vercel.app"'), "unapproved origins receive a fallback ACAO header");

const publisher = read("supabase/functions/publish-mercury-web/index.ts");
check("Publisher verifies JWT", publisher.includes("authenticateMercuryRequest(req)"), "shared authentication helper call missing");
check("Publisher restricts caller to configured owner", publisher.includes("OWNER_USER_ID") && publisher.includes("auth.user.id !== OWNER_USER_ID"), "configured owner-only gate missing");
check("Publisher no longer uses legacy token literal", !publisher.includes("MERCURY_PUBLISH_TOKEN") && !publisher.includes("MERCURY_WEB_PUBLISH_TOKEN"), "legacy publishing-token reference found");
const officeLower = office.toLowerCase();
check("Office source has no legacy shared-key variable", !officeLower.includes("mercury_office_key"), "legacy office key variable found");

const ownerMigration = read("supabase/migrations/20261020041000_owner_scoped_rls_single_user.sql");
check("Owner migration aborts unless exactly one Auth user exists", ownerMigration.includes("v_user_count <> 1") && ownerMigration.includes("expected exactly one Auth user"), "missing single-owner preflight");
check("Owner migration preserves unlinked documents", ownerMigration.includes("owner_id is independent of CINO") && ownerMigration.includes("update public.%I set owner_id = $1 where owner_id is null"), "owner backfill may skip unlinked records");
check("Owner migration removes old permissive policies before owner policy", ownerMigration.includes("drop policy %I on public.%I") && ownerMigration.includes("for all to authenticated using (owner_id = (select auth.uid()))"), "owner policy may be bypassed by old permissive policy");
check("Owner migration revokes anonymous table access", ownerMigration.includes("revoke all privileges on table public.%I from anon, public"), "anonymous/public table privileges remain");
check("Owner migration does not erase document bytes", !/update public\.documents\s+set\s+file_data\s*=\s*null/i.test(ownerMigration), "migration clears legacy document contents");

for (const result of checks) {
  process.stdout.write(`${result.passed ? "PASS" : "FAIL"}  ${result.label}\n`);
}
process.stdout.write(`\n${checks.filter(x => x.passed).length}/${checks.length} static checks passed.\n`);
if (failures.length) {
  process.stderr.write("\nReview required:\n" + failures.map(x => `- ${x}`).join("\n") + "\n");
  process.exitCode = 1;
}

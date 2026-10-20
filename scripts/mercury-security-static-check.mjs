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
  "publish-mercury-web",
];
for (const name of protectedFunctions) {
  const src = read(`supabase/functions/${name}/index.ts`);
  check(`${name} verifies JWT`, src.includes("authenticateMercuryRequest(req)"), "shared authentication helper call missing");
  check(`${name} contains owner scoping`, src.includes("owner_id"), "owner_id scoping is absent; review before release");
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

const publisher = read("supabase/functions/publish-mercury-web/index.ts");
check("Publisher no longer uses legacy token literal", !publisher.includes("MERCURY_PUBLISH_TOKEN") && !publisher.includes("MERCURY_WEB_PUBLISH_TOKEN"), "legacy publishing-token reference found");
const officeLower = office.toLowerCase();
check("Office source has no legacy shared-key variable", !officeLower.includes("mercury_office_key"), "legacy office key variable found");

for (const result of checks) {
  process.stdout.write(`${result.passed ? "PASS" : "FAIL"}  ${result.label}\n`);
}
process.stdout.write(`\n${checks.filter(x => x.passed).length}/${checks.length} static checks passed.\n`);
if (failures.length) {
  process.stderr.write("\nReview required:\n" + failures.map(x => `- ${x}`).join("\n") + "\n");
  process.exitCode = 1;
}

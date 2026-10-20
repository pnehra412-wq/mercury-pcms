#!/usr/bin/env node
/**
 * Targeted dependency-free regression checks for the Mercury office endpoint.
 * Run from the repository root: node scripts/check-office-endpoint.mjs
 */
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/mercury-office/index.ts", "utf8");
const failures = [];
const checks = [];
function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
  if (!ok) failures.push(name);
}
check("API uses Supabase Auth helper", source.includes("authenticateMercuryRequest(req)"));
check("case query includes owner filter", source.includes("owner_id=eq.") && source.includes("auth.user.id"));
check("no query-string shared-key gate", !source.includes('searchParams.get("key")'));
check("no static office-key variable", !/\bOFFICE_KEY\b/i.test(source));
check("dashboard query uses an explicit field allowlist", /select=id,cino,type_name,/.test(source) && !/select=\*/.test(source));
check("database errors are not returned verbatim", !source.includes("error:String(e)") && source.includes('error:"Could not retrieve case dashboard"'));
for (const item of checks) console.log((item.ok ? "PASS " : "FAIL ") + item.name);
console.log(`${checks.filter((x) => x.ok).length}/${checks.length} office endpoint checks passed.`);
if (failures.length) {
  console.error("Review required: " + failures.join("; "));
  process.exitCode = 1;
}

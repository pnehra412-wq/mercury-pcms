const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const parser = require("@babel/parser");

const html = fs.readFileSync("index.html", "utf8");
const scriptStart = html.indexOf('<script type="text/babel"');
assert(scriptStart >= 0, "Babel application script was not found");
const scriptBodyStart = html.indexOf(">", scriptStart) + 1;
const scriptBodyEnd = html.indexOf("</script>", scriptBodyStart);
assert(scriptBodyStart > 0 && scriptBodyEnd > scriptBodyStart, "Babel application script is incomplete");
parser.parse(html.slice(scriptBodyStart, scriptBodyEnd), { sourceType: "script", plugins: ["jsx", "optionalChaining", "objectRestSpread"] });

const manifestHref = html.match(/<link rel="manifest" href="([^"]+)"/);
assert(manifestHref, "Manifest link is missing");
const manifestPath = path.resolve(manifestHref[1]);
assert(fs.existsSync(manifestPath), "Linked web app manifest does not exist");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert(manifest.name && manifest.short_name && manifest.start_url && manifest.display, "Manifest is missing required install metadata");
for (const icon of manifest.icons || []) assert(fs.existsSync(path.resolve(icon.src)), "Manifest icon is missing: " + icon.src);

for (const marker of ["const sbChecked =", "Could not save task:", "Could not save fee:", "Could not save case:", 'label:"Tasks"', 'label:"Fees"', "window.supabase.createClient", "signInWithPassword", "auth.updateUser({password:newPassword})", "mercuryFunctionHeaders", 'storage.from("case-files").upload', 'sbChecked("POST","documents"']) {
  assert(html.includes(marker), "Expected reliability/security feature is missing: " + marker);
}
assert(!html.includes("file_data:base64"), "New uploads must not store base64 payloads in the database");
const ownerDefaultsMigration = "supabase/migrations/20261123093353_set_authenticated_user_id_defaults.sql";
assert(fs.existsSync(ownerDefaultsMigration), "Authenticated owner-default migration is missing");
assert(fs.readFileSync(ownerDefaultsMigration, "utf8").includes("default auth.uid()"), "Owner-default migration does not use auth.uid()");
console.log("Mercury PCMS validation passed: JSX, PWA metadata, authentication, private uploads, and owner-default migration.");

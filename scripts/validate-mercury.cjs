const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const parser = require("@babel/parser");

const html = fs.readFileSync("index.html", "utf8");
const app = html.match(/<script type="text\\/babel"[^>]*>([\\s\\S]*?)<\\/script>/);
assert(app, "Babel application script was not found");
parser.parse(app[1], { sourceType: "script", plugins: ["jsx", "optionalChaining", "objectRestSpread"] });

const manifestHref = html.match(/<link rel="manifest" href="([^"]+)"/);
assert(manifestHref, "Manifest link is missing");
const manifestPath = path.resolve(manifestHref[1]);
assert(fs.existsSync(manifestPath), "Linked web app manifest does not exist");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert(manifest.name && manifest.short_name && manifest.start_url && manifest.display, "Manifest is missing required install metadata");
for (const icon of manifest.icons || []) assert(fs.existsSync(path.resolve(icon.src)), "Manifest icon is missing: " + icon.src);

for (const marker of ["const sbChecked =", "Could not save task:", "Could not save fee:", "Could not save case:", 'label:"Tasks"', 'label:"Fees"']) {
  assert(html.includes(marker), "Expected reliability/mobile feature is missing: " + marker);
}
console.log("Mercury PCMS validation passed: JSX parses, manifest and icons exist, and core safeguards are present.");

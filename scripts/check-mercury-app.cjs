const fs = require("node:fs");
const assert = require("node:assert/strict");
const babel = require("@babel/core");

const html = fs.readFileSync("index.html", "utf8");
const match = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, "React/Babel application script exists");
babel.transformSync(match[1], {
  filename: "mercury-app.jsx",
  babelrc: false,
  configFile: false,
  presets: ["@babel/preset-env", "@babel/preset-react"]
});
for (const [label, pattern] of [
  ["case diary view", /const DiaryView\s*=/],
  ["diary navigation mount", /view==="diary"\s*&&\s*<DiaryView\/>/],
  ["CSV export utility", /const downloadCsv\s*=/],
  ["case registry export", /mercury-case-registry\.csv/],
  ["diary export", /mercury-case-diary\.csv/],
  ["browser reminder permission", /Notification\.requestPermission/],
  ["local timezone date", /const TODAY = \(\(\)=>\{const d=new Date\(\)/]
]) assert.match(html, pattern, "Missing expected feature: " + label);
assert.equal((html.match(/const DiaryView\s*=/g) || []).length, 1, "Diary view should be defined exactly once");
console.log("Mercury PCMS checks passed: JSX parses and diary, exports, local date, and reminders are present.");

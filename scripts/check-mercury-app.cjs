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
  ["diary next-date sync", /Hearing logged and next hearing date updated/],
  ["browser reminder permission", /Notification\.requestPermission/],
  ["upcoming hearing reminders", /Mercury cause-list reminder/],
  ["daily hearing reminder guard", /mercury-reminder-hearings-/],
  ["case document filename search", /Search this case's documents by filename/],
  ["case drafting brief", /copyCaseDraftingBrief/],
  ["drafting brief source limitations", /contents are not included in this brief/],
  ["task search", /Search tasks/],
  ["task export", /mercury-tasks\.csv/],
  ["mobile bottom search uses direct focus", /input\.focus\(\);input\.scrollIntoView\(\{block:"nearest"\}\)/],
  ["mobile search active state", /className=\{view===n\.id \? "active":""\}/],
  ["search safely handles missing fields", /String\(v\|\|""\)\.toLowerCase\(\)\.includes\(q\)/],
  ["task scope filters", /value="overdue">Overdue only/],
  ["dashboard quick actions", /mercury-quick-actions/],
  ["local timezone date", /const TODAY = \(\(\)=>\{const d=new Date\(\)/]
]) assert.match(html, pattern, "Missing expected feature: " + label);
assert.equal((html.match(/const DiaryView\s*=/g) || []).length, 1, "Diary view should be defined exactly once");
console.log("Mercury PCMS checks passed: JSX parses; dashboard, diary, exports, reminders, document search, task filters, and drafting brief are present.");

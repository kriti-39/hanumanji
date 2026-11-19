/* ------------------------------------------------------------
   Meaning translations: spreadsheets in, site data out.

   npm run translations:sheets
       Makes one spreadsheet per language in  translations/
       (opens in Excel or Google Sheets). Existing ones are kept.

   npm run translations:import -- translations/ta.csv "Checked by name"
       Reads a filled spreadsheet and writes src/data/meanings/ta.json.
       The language appears in the site only when every verse is
       filled AND a checker's name is given.
   ------------------------------------------------------------ */

import fs from "node:fs";
import path from "node:path";
import { chalisa } from "../src/data/chalisa.js";

const LANGS = {
  bn: ["বাংলা", "Bengali"],
  ta: ["தமிழ்", "Tamil"],
  te: ["తెలుగు", "Telugu"],
  kn: ["ಕನ್ನಡ", "Kannada"],
  pa: ["ਪੰਜਾਬੀ", "Punjabi"],
};
const COLS = ["ref", "verse_hindi", "meaning_hindi", "meaning_english", "translation"];
const SHEETS = "translations";
const OUT = "src/data/meanings";

const refs = (() => {
  let c = 0;
  return chalisa.verses.map((v) => (v.kind === "चौपाई" ? `Chaupai ${++c}` : "Doha"));
})();

const quote = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function sheets() {
  fs.mkdirSync(SHEETS, { recursive: true });
  for (const [code, [label, name]] of Object.entries(LANGS)) {
    const file = path.join(SHEETS, `${code}.csv`);
    if (fs.existsSync(file)) {
      console.log(`kept      ${file}`);
      continue;
    }
    const lines = [COLS.join(",")];
    chalisa.verses.forEach((v, i) => lines.push([refs[i], v.dev.join(" / "), v.hi, v.en, ""].map(quote).join(",")));
    // the BOM makes Excel show every script correctly
    fs.writeFileSync(file, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
    console.log(`made      ${file}  (${name} · ${label})`);
  }
}

function importSheet(file, checker) {
  const code = path.basename(file, path.extname(file)).toLowerCase();
  if (!LANGS[code]) throw new Error(`Unknown language "${code}". Name the file after one of: ${Object.keys(LANGS).join(", ")}`);
  const [head, ...rows] = parseCsv(fs.readFileSync(file, "utf8"));
  const col = head.map((h) => h.trim().toLowerCase()).indexOf("translation");
  if (col < 0) throw new Error('The sheet has no "translation" column.');
  if (rows.length !== chalisa.verses.length) throw new Error(`Expected ${chalisa.verses.length} verses, found ${rows.length}. Do not add or remove rows.`);
  const verses = rows.map((r, i) => ({ ref: refs[i], text: (r[col] || "").trim() }));
  const missing = verses.filter((v) => !v.text).map((v) => v.ref);
  const [label, name] = LANGS[code];
  const verified = Boolean(checker) && missing.length === 0;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${code}.json`), JSON.stringify({ code, label, name, verified, checked_by: checker || "", verses }, null, 2) + "\n");
  console.log(`wrote ${OUT}/${code}.json — ${verses.length - missing.length}/${verses.length} verses filled`);
  if (missing.length) console.log(`still empty: ${missing.join(", ")}`);
  console.log(verified ? `${name} will now appear under Meaning.` : `${name} stays hidden until every verse is filled and a checker's name is given.`);
}

const [cmd, file, ...rest] = process.argv.slice(2);
if (cmd === "sheets") sheets();
else if (cmd === "import" && file) importSheet(file, rest.join(" ").trim());
else console.log('Use:  npm run translations:sheets   or   npm run translations:import -- translations/ta.csv "Checker Name"');

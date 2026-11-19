/* ------------------------------------------------------------
   Meaning languages beyond Hindi and English.

   Files live in src/data/meanings/ (see the README there). A
   language is offered only when every verse has a meaning and
   the file is marked "verified": true by a person who checked it.
   ------------------------------------------------------------ */

const files = import.meta.glob("./meanings/*.json", { eager: true, import: "default" });

export const EXTRA_LANGS = Object.values(files)
  .filter((f) => f && f.verified === true && Array.isArray(f.verses) && f.verses.length === 43 && f.verses.every((v) => v && typeof v.text === "string" && v.text.trim()))
  .map((f) => ({ code: f.code, label: f.label, name: f.name, texts: f.verses.map((v) => v.text.trim()) }));

# Meanings in more languages

Each file here holds the meaning of every verse in one language. A language
appears in the site's menu (under **Meaning**) only when its file is complete
**and** marked as checked.

Files ready for translators: `ta.json` (Tamil), `te.json` (Telugu), `bn.json` (Bengali).
To add another language, copy one of them, rename it with the language code
(for example `mr.json` for Marathi) and change `code`, `label` and `name`.

## For the translator

Each verse looks like this:

```json
{
  "ref": "Chaupai 1",
  "verse": "जय हनुमान ज्ञान गुन सागर। / जय कपीस तिहुँ लोक उजागर॥",
  "hindi_meaning": "…",
  "english_meaning": "…",
  "text": ""
}
```

Write the meaning in your language inside `"text": ""`. Do not change the
other fields. Please translate from the Hindi meaning, using the English one
only as a help.

## Before it goes live

Someone who knows the language well, and the Chalisa, should read every
meaning. Then set:

```json
"verified": true,
"checked_by": "Name of the person who checked it"
```

Until `verified` is `true`, the language stays hidden, even if every verse is filled in.

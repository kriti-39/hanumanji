# Meanings in more languages

The site shows the meaning in Hindi and English. More languages appear under
**Meaning** in the menu as soon as a checked translation is added.

## 1. Send a spreadsheet to a translator

Ready-made sheets are in the `translations/` folder at the top of the project:

| File | Language |
|---|---|
| `bn.csv` | Bengali · বাংলা |
| `ta.csv` | Tamil · தமிழ் |
| `te.csv` | Telugu · తెలుగు |
| `kn.csv` | Kannada · ಕನ್ನಡ |
| `pa.csv` | Punjabi · ਪੰਜਾਬੀ |

Each opens in Excel or Google Sheets. Every row is one verse, with the verse,
its Hindi meaning and its English meaning. The translator fills only the last
column, **translation**, and must not add, remove or reorder rows.

## 2. Have it checked

Someone who knows the language well, and the Chalisa, reads every meaning.

## 3. Add it to the site

Save the filled sheet back into `translations/` with the same name, then run:

```bash
npm run translations:import -- translations/ta.csv "Name of the person who checked it"
```

This writes `src/data/meanings/ta.json`. The language shows on the site only
when every verse is filled **and** a checker's name is given; otherwise it
stays hidden. Then commit and push as usual.

To make sheets again (existing ones are kept): `npm run translations:sheets`

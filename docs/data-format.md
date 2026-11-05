# Book data format — `bilingual-reader-book` v1

A **book file** (`<id>.book.json`, optionally gzipped as `.book.json.gz`) holds one book:
Japanese text split into sentences, word tokens with readings, and the aligned English
translation. The reader app ships without any book text. You load book files on each
device, and they're stored in that browser (IndexedDB). They are never uploaded.

Machine-checkable definition: [`schema/book.schema.json`](../schema/book.schema.json).
`npm run book -- <id>` validates every file it writes against it.

## Top level

```jsonc
{
  "format": "bilingual-reader-book",   // fixed
  "version": 1,                        // format version (breaking changes bump it)
  "id": "three-days-of-happiness",     // slug: a-z, 0-9, "-". Same id = same book
  "revision": "2026-11-05T10:00:00Z",  // build time. Importing a file replaces the stored copy
  "title":  { "ja": "…", "en": "…" },
  "author": { "ja": "…", "en": "…" },
  "languages": { "text": "ja", "translation": "en" },
  "chapters": [ Chapter, … ]           // only chapters that are aligned so far, in reading order
}
```

## Chapter

```jsonc
{
  "n": 1,                               // reading order, unique, used in bookmarks
  "label": "Chapter 1",                 // optional; shown above the title ("Afterword", …)
  "title": { "ja": "…", "en": "…" },
  "blocks": [ Block, … ]
}
```

## Block: one aligned unit

A block pairs one or more Japanese sentences with the English that translates them.
Translators merge and split sentences, so blocks are the smallest units that line up.

```jsonc
{
  "ja": [ Sentence, … ],      // at least one
  "en": "She <em>smiled</em>.", // inline HTML: only <em> and <strong>. "" = no English
  "para": true,               // optional: block starts a new paragraph
  "scene": true               // optional: a scene break comes before this block
}
```

## Sentence

```jsonc
{ "tokens": [ Token, … ], "para": true }   // "para": starts a new paragraph inside the block
```

## Token

Tokens are compact arrays because a chapter has thousands of them.

| Shape | Meaning |
|---|---|
| `"。"` | Plain text with no lookup (punctuation, symbols) |
| `{ "f": [Frag, …] }` | Formatted text with no lookup (for example, emphasized punctuation) |
| `[frags, reading, lemma, lemmaReading, pos]` | A **word**: tappable, shows a dictionary popover |

The word fields:

- `frags`: the word's text, either a plain string or a list of `Frag`s (when it has furigana or emphasis)
- `reading`: hiragana reading of the word as written in the text (`""` if same as the text or unknown)
- `lemma`: dictionary form if different from the text (`食べた` → `食べる`), else `""`
- `lemmaReading`: hiragana reading of `lemma` (`""` if none)
- `pos`: part of speech in English (`"verb"`, `"noun · proper noun"`, `"particle"`, …)

**Frag**: `[text]` · `[text, ruby]` · `[text, ruby | null, flags]`

| Flag | Meaning |
|---|---|
| `b` | `ruby` is the **book's own furigana** (always shown in “Book” mode, used by read-aloud) |
| `a` | `ruby` is **auto-generated** (shown only in “All kanji” mode) |
| `e` | Emphasis dots (傍点) |

Example, with invented text:

```json
{
  "ja": [{ "tokens": [
    [[["猫", "ねこ", "a"]], "ねこ", "", "", "noun"],
    ["が", "", "", "", "particle"],
    [[["好", "す", "a"], ["き"]], "すき", "", "", "na-adjective"],
    ["です", "", "", "", "auxiliary verb"],
    "。"
  ]}],
  "en": "I like cats.",
  "para": true
}
```

## Compatibility rules

- Readers must ignore unknown keys. New optional keys don't need a version bump.
- Removing or changing the meaning of a key bumps `version`. The reader refuses newer major versions with a clear message.
- Bookmarks refer to `id` + chapter `n` + block index, and also store the start of the
  block's Japanese text. If a re-alignment shifts block indices, the reader finds the sentence again by its text.

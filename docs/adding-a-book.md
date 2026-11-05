# Adding a book (or a chapter)

Converting a book means turning a **Japanese EPUB + English EPUB** of the same book into
one book file (`out/<id>.book.json`). It's written so an AI agent can do it chapter by
chapter, with `npm run check` and the build catching mistakes.

```
books/<id>/
  book.json          metadata + which EPUB file holds which chapter   (committed)
  align/chNN.txt     sentence alignment for chapter NN                (committed)
  source/ja.epub     the books themselves                              (git-ignored, never commit)
  source/en.epub
```

## 1. Set up the book

1. Pick an id: lowercase words with dashes, for example `kimi-no-suizou-wo-tabetai`.
2. Copy the EPUBs to `books/<id>/source/ja.epub` and `books/<id>/source/en.epub`.
3. Create `books/<id>/book.json`:

```json
{
  "id": "<id>",
  "title": { "ja": "日本語の題名", "en": "English Title" },
  "author": { "ja": "著者名", "en": "Author Name" },
  "sources": {
    "ja": { "epub": "source/ja.epub" },
    "en": { "epub": "source/en.epub" }
  },
  "chapters": []
}
```

4. Run `npm run inspect -- <id>`. It lists each EPUB's files in reading order with their
   size and first heading. Match the chapters up and fill in `chapters`:

```json
{ "n": 1, "ja": "text/part0004.html", "en": "OEBPS/Text/chapter001.xhtml" }
```

- Skip covers, tables of contents, copyright pages, and illustration-only pages.
- `n` is the reading order (1, 2, 3…). Bookmarks use it, so don't renumber chapters once people read them.
- For non-numbered parts (prologue, afterword), add `"label": "Prologue"`, and also
  `"title": { "ja": "…", "en": "…" }` if the title can't be found automatically.
- If titles come out wrong in step 2, set a CSS selector per source:
  `"ja": { "epub": "…", "titleSelector": "p[id^=toc-]" }`, `"en": { …, "titleSelector": "h1.chapter-title" }`.
  Without one, the first `h1`–`h3` is used (English skips headings that are only a number).

## 2. Extract a chapter

```bash
npm run extract -- <id> <n>
```

This writes numbered sentences to `work/<id>/chNN.jp.txt` and `work/<id>/chNN.en.txt`, and
creates `books/<id>/align/chNN.txt` with a header if it doesn't exist. Check the summary
line: the paragraph counts and titles should look plausible.

In the dumps:
- `[¶12]` starts paragraph 12.
- `* * *` is a scene break.
- `J34` and `E31` are sentence ids.

## 3. Write the alignment

`align/chNN.txt` has one **group** per line, in reading order:

```
J1 = E1            one Japanese sentence ↔ one English sentence
J3 = E3-E4         translator split it into two
J28-J30 = E30      translator merged three into one
J12-J13 = E14-E15  2 ↔ 2 that don't line up one-to-one
J40 = -            no English (the translator left it out)
# comments and blank lines are ignored
```

Rules (the build enforces the first two):

1. **Every J and every E id is used exactly once, in order.** No gaps, no overlaps, no reordering.
2. Ranges are inclusive and only go forward (`J5-J7`).
3. **Use the smallest groups that are true.** A learner reads each Japanese line with the
   English under it. 1:1 is best; group only when the meaning really spans sentences.
4. Groups may cross paragraph breaks when the translator merged across them. The reader
   shows the break inside the group.
5. If the English reorders clauses, group the sentences involved rather than mismatching them.
6. If an English sentence has no Japanese counterpart (rare), add it to the neighbouring group it explains.
7. Dialogue tags: 「…」と彼は言った。 often becomes `"…," he said.` in one sentence, and the
   Japanese may split it in two (`「…」` / `と彼は言った。`). Group those.

Typical pace: walk both files side by side, and every few lines confirm you're still
in sync by checking names, numbers and quotes.

## 4. Check, then build

```bash
npm run check -- <id> <n>     # coverage + "this group looks too long/short" hints
npm run book -- <id>          # builds out/<id>.book.json(.gz), validates against the schema
```

- `check` lists groups whose English/Japanese length ratio is unusual. Each is either a
  real misalignment (usually off by one, so fix it) or a free translation (fine, leave it).
  Look at every hint. A run of consecutive hints means you lost sync somewhere above.
- The build stops if any id is missing, duplicated or out of order, and names the ids.
- Chapters without an `align/chNN.txt` are skipped, so you can publish chapter by chapter.

## 5. Read it

- `npm run dev` auto-loads every book in `out/` into the dev reader.
- To read on your devices, open the published reader and load `out/<id>.book.json.gz`
  (smaller) or `out/<id>.book.json`. Loading a newer file of the same book replaces the
  old one and keeps your bookmarks and position.

## Never commit or publish book content

EPUBs, `work/`, and `out/` hold copyrighted text and are git-ignored. Don't paste book
passages into issues, PRs, commit messages or docs either. Refer to sentence ids (`J34`) instead.

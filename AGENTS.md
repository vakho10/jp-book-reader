# AGENTS.md

**Japanese Book Reader**: a Japanese–English bilingual reader for learners. The **app** (`src/`, `index.html`) is
public and contains no book text. **Book files** are built locally from EPUBs the user owns
and are loaded into the app on each device (stored in IndexedDB, never uploaded).

## Layout

| Path | What |
|---|---|
| `src/` | Reader app: vanilla JS + Tailwind v4, built by Vite into one `dist/index.html` |
| `scripts/` | Node pipeline: EPUB → sentences → alignment → tokenized book file |
| `scripts/lib/epub.mjs` | EPUB reading, sentence splitting (JP and EN), chapter loading |
| `scripts/lib/tokenize.mjs` | kuromoji tokens, readings, auto furigana, small-kana fix |
| `scripts/lib/align.mjs` | Parser and validator for `align/chNN.txt` |
| `books/<id>/book.json` | Per-book config: metadata + chapter → EPUB file map |
| `books/<id>/align/` | Hand- or agent-written sentence alignments (committed) |
| `schema/book.schema.json`, `docs/data-format.md` | The book file format (v1) |
| `docs/adding-a-book.md` | **Step-by-step for converting a new book or chapter, start here** |

## Commands

```bash
npm run dev                      # reader at localhost, auto-loads out/*.book.json
npm run build                    # app only → dist/index.html (what GitHub Pages serves)
npm run inspect -- <id>          # list EPUB files to fill book.json "chapters"
npm run extract -- <id> <n>      # numbered sentences → work/<id>/chNN.{jp,en}.txt
npm run check -- <id> [n…]       # alignment coverage + suspicious groups
npm run book -- <id> [n…]        # build out/<id>.book.json(.gz), schema-validated
```

## Typical tasks

- **Align the next chapter:** follow `docs/adding-a-book.md` §2–4. In Claude Code: `/align-chapter <id> <n>`.
- **Add a new book:** `docs/adding-a-book.md` §1, then align chapter by chapter.
- **Change the format:** update `docs/data-format.md`, `schema/book.schema.json`,
  `scripts/build-book.mjs` and the reader (`src/main.js` token helpers, `src/library.js`
  validation) together. Additive optional keys keep `version: 1`. Breaking changes bump it.

## Rules

- **Never commit, publish, or paste book content.** EPUBs, `work/`, `out/`, and `*.book.json`
  are git-ignored. Don't quote passages in commits, PRs, issues or docs. Use sentence ids
  (`J34`, `E31`) and invented examples. The production build fails if it detects book data.
- Don't renumber chapters (`n`) or reshuffle existing alignments without need, because
  bookmarks point at chapter + block index. The reader re-finds moved sentences by text,
  but it's best not to rely on that.
- Changing the sentence splitter in `epub.mjs` renumbers J/E ids and invalidates existing
  `align/*.txt` files. If you must, re-run `npm run check` for every book and fix the alignments.
- Keep the app dependency-free at runtime (no frameworks). Icons are Heroicons inlined at build time.

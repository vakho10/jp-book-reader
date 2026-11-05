# 対訳リーダー · Bilingual Reader

Read Japanese books sentence by sentence, with the English translation under each line.
Features: furigana (the book's own, or for every kanji), tap-a-word readings and dictionary
forms, read-aloud with the device's Japanese voice, bookmarks, themes, and a phone and tablet layout.

**The app contains no books.** You build a *book file* from EPUBs you own and open it in
the reader on each device. It's stored in that browser and never uploaded. So the app can
be hosted publicly (GitHub Pages) while the books stay private.

## Use it

1. Open the reader (GitHub Pages, or `dist/index.html` locally).
2. Load your `*.book.json.gz` (or `.book.json`) file with **Choose file…**, or drop it on the page.
3. Load it once per device. Re-loading a newer file of the same book updates it and keeps your bookmarks.

## Make a book file

```bash
npm install
npm run book -- three-days-of-happiness     # → out/three-days-of-happiness.book.json(.gz)
```

Adding chapters or whole new books: **[docs/adding-a-book.md](docs/adding-a-book.md)**.
In Claude Code you can run `/align-chapter <book-id> <n>`.
The format is specified in [docs/data-format.md](docs/data-format.md) and [schema/book.schema.json](schema/book.schema.json).

## Develop

```bash
npm run dev      # reader with hot reload; auto-loads every book in out/
npm run build    # dist/index.html: the whole app in one file
```

Pushing to `main` deploys `dist/` to GitHub Pages via `.github/workflows/pages.yml`
(enable it under *Settings → Pages → Source: GitHub Actions*). EPUBs, `work/`, and `out/`
are git-ignored, and the build fails if book data ever gets bundled into the app.

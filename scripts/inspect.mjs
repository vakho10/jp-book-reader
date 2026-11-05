// Lists the files of an EPUB in reading order with a short preview, to fill in the
// "chapters" map of books/<id>/book.json.
// Usage: npm run inspect -- <id>            (both sources of a configured book)
//        npm run inspect -- path/to/file.epub
import path from 'node:path';
import { parse } from 'node-html-parser';
import { ROOT, loadBook, openEpub, spine, epubPath } from './lib/epub.mjs';

const arg = process.argv[2];
const targets = [];
if (arg?.endsWith('.epub')) targets.push(['epub', path.resolve(arg)]);
else {
  const book = await loadBook(arg);
  for (const lang of Object.keys(book.sources)) targets.push([lang, epubPath(book, lang)]);
}

for (const [label, file] of targets) {
  const zip = await openEpub(file);
  console.log(`\n== ${label}: ${path.relative(ROOT, file)} ==`);
  console.log('   file'.padEnd(36) + 'chars  ¶     first heading / text');
  for (const href of await spine(file)) {
    const entry = zip.file(href);
    if (!entry) { console.log(`   ${href} (missing)`); continue; }
    const root = parse(await entry.async('string'));
    const body = root.querySelector('body') ?? root;
    const text = body.text.replace(/\s+/g, ' ').trim();
    const heading = body.querySelector('h1, h2, h3, [id^=toc-]')?.text.replace(/\s+/g, ' ').trim();
    const preview = (heading || text).slice(0, 28);
    const paras = body.querySelectorAll('p').filter((p) => p.text.trim()).length;
    console.log(`   ${href.padEnd(33)}${String(text.length).padStart(6)} ${String(paras).padStart(4)}   ${preview}`);
  }
}
console.log('\nMap each chapter to its JP and EN file in book.json → "chapters": [{ "n": 1, "ja": "...", "en": "..." }].');

// Builds out/<id>.book.json (+ .gz) from books/<id>/: the EPUBs, book.json and align/chNN.txt.
// Only chapters that have an alignment file are included.
// Usage: npm run book -- <id>        (all aligned chapters)
//        npm run book -- <id> 1 2    (only these chapters, for quick checks)
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ROOT, loadBook, loadJpChapter, loadEnChapter, numberSentences, chapterTag } from './lib/epub.mjs';
import { parseAlignment } from './lib/align.mjs';
import { tokenizeSentence } from './lib/tokenize.mjs';

const [id, ...only] = process.argv.slice(2);
const book = await loadBook(id);
const wanted = only.map(Number);

async function buildChapter(chapter) {
  const tag = chapterTag(chapter.n);
  const alignFile = path.join(book.dir, 'align', `${tag}.txt`);
  const alignSrc = await fs.readFile(alignFile, 'utf8').catch(() => null);
  if (alignSrc == null) return null;

  const jpCh = await loadJpChapter(book, chapter);
  const enCh = await loadEnChapter(book, chapter);
  const jp = numberSentences(jpCh, 'J');
  const en = numberSentences(enCh, 'E');
  const jpById = new Map(jp.filter((x) => x.id).map((x) => [x.id, x]));
  const enById = new Map(en.filter((x) => x.id).map((x) => [x.id, x]));
  let groups;
  try {
    groups = parseAlignment(alignSrc, [...jpById.keys()], [...enById.keys()]);
  } catch (e) {
    throw new Error(`${tag}: ${e.message}\n  → run \`npm run extract -- ${book.id} ${chapter.n}\` and compare with align/${tag}.txt`);
  }

  // which JP sentences start a paragraph / follow a scene break
  const paraStart = new Set(), sceneBefore = new Set();
  let lastPi = 0, pendingScene = false;
  for (const x of jp) {
    if (x.sceneBreak) { pendingScene = true; continue; }
    if (x.pi !== lastPi) { paraStart.add(x.id); lastPi = x.pi; }
    if (pendingScene) { sceneBefore.add(x.id); pendingScene = false; }
  }

  const blocks = groups.map((g) => ({
    ...(sceneBefore.has(g.jp[0]) ? { scene: true } : {}),
    ...(paraStart.has(g.jp[0]) ? { para: true } : {}),
    ja: g.jp.map((sid) => ({
      ...(paraStart.has(sid) && sid !== g.jp[0] ? { para: true } : {}),
      tokens: tokenizeSentence(jpById.get(sid).s),
    })),
    en: g.en.map((sid) => enById.get(sid).s).join(' '),
  }));

  console.log(`  ${tag}: ${blocks.length} blocks (${jpById.size} JP / ${enById.size} EN sentences)`);
  return {
    n: chapter.n,
    ...(chapter.label ? { label: chapter.label } : {}),
    title: { ja: jpCh.title, en: enCh.title },
    blocks,
  };
}

console.log(`Building ${book.id}…`);
const chapters = [];
const skipped = [];
for (const chapter of book.chapters) {
  if (wanted.length && !wanted.includes(chapter.n)) continue;
  const ch = await buildChapter(chapter);
  if (ch) chapters.push(ch); else skipped.push(chapter.n);
}
if (!chapters.length) throw new Error(`No aligned chapters in books/${book.id}/align/ — see docs/adding-a-book.md`);

const out = {
  format: 'bilingual-reader-book',
  version: 1,
  id: book.id,
  revision: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  title: book.title,
  ...(book.author ? { author: book.author } : {}),
  languages: { text: 'ja', translation: 'en' },
  chapters,
};

// Validate against the published schema before writing anything.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const schema = JSON.parse(await fs.readFile(path.join(ROOT, 'schema', 'book.schema.json'), 'utf8'));
if (!ajv.validate(schema, out)) {
  console.error(ajv.errors.slice(0, 10));
  throw new Error('Output does not match schema/book.schema.json');
}

await fs.mkdir(path.join(ROOT, 'out'), { recursive: true });
const json = JSON.stringify(out);
const file = path.join(ROOT, 'out', `${book.id}.book.json`);
await fs.writeFile(file, json);
await fs.writeFile(file + '.gz', await promisify(zlib.gzip)(json, { level: 9 }));
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`✓ out/${book.id}.book.json (${kb(json.length)}, ${kb((await fs.stat(file + '.gz')).size)} gzipped) — ${chapters.length} chapter(s)`);
if (skipped.length) console.log(`  not aligned yet: ${skipped.join(', ')}`);

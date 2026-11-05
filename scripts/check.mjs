// Sanity-checks alignment files without building: coverage errors, plus groups whose
// English/Japanese length ratio is far from the chapter's typical ratio (likely off by one).
// Usage: npm run check -- <id> [n…]
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadBook, loadJpChapter, loadEnChapter, numberSentences, unitsText, chapterTag } from './lib/epub.mjs';
import { parseAlignment } from './lib/align.mjs';

const [id, ...only] = process.argv.slice(2);
const book = await loadBook(id);
const wanted = only.map(Number);
const clip = (s, n = 34) => (s.length > n ? s.slice(0, n) + '…' : s);
const plain = (h) => h.replace(/<[^>]+>/g, '');
let problems = 0;

for (const chapter of book.chapters) {
  if (wanted.length && !wanted.includes(chapter.n)) continue;
  const tag = chapterTag(chapter.n);
  const src = await fs.readFile(path.join(book.dir, 'align', `${tag}.txt`), 'utf8').catch(() => null);
  if (src == null) continue;

  const jp = numberSentences(await loadJpChapter(book, chapter), 'J').filter((x) => x.id);
  const en = numberSentences(await loadEnChapter(book, chapter), 'E').filter((x) => x.id);
  const J = new Map(jp.map((x) => [x.id, unitsText(x.s)]));
  const E = new Map(en.map((x) => [x.id, plain(x.s)]));

  let groups;
  try { groups = parseAlignment(src, [...J.keys()], [...E.keys()]); }
  catch (e) { console.log(`✗ ${tag}: ${e.message}`); problems++; continue; }

  // English characters per Japanese character, per group
  const rows = groups.map((g) => {
    const j = g.jp.map((x) => J.get(x)).join('');
    const e = g.en.map((x) => E.get(x)).join(' ');
    return { g, j, e, r: e.length / Math.max(1, j.length) };
  });
  const sorted = rows.filter((x) => x.e && x.j.length >= 8).map((x) => x.r).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;

  // Flag groups well outside the typical ratio. Short lines vary a lot, so they need a bigger gap.
  const flagged = rows.filter(({ j, e, r }) => {
    if (!e) return j.length > 12; // long Japanese with no English
    const tol = j.length < 15 ? 3.2 : j.length < 40 ? 2.4 : 1.9;
    return r > median * tol || r < median / tol;
  });

  console.log(`${flagged.length ? '!' : '✓'} ${tag}: ${groups.length} groups, typical ratio ${median.toFixed(2)} EN chars per JP char${flagged.length ? `, ${flagged.length} to review:` : ''}`);
  for (const { g, j, e, r } of flagged) {
    const ids = `${g.jp[0]}${g.jp.length > 1 ? '-' + g.jp.at(-1) : ''} = ${g.en.length ? g.en[0] + (g.en.length > 1 ? '-' + g.en.at(-1) : '') : '-'}`;
    console.log(`    ${ids.padEnd(16)} ×${(r / median).toFixed(1)}  ${clip(j)}  |  ${clip(e, 48)}`);
  }
  // review items are hints for a human/agent, not failures
}
process.exitCode = problems ? 1 : 0;

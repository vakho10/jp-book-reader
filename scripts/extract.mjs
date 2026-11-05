// Dumps a chapter's numbered sentences so an alignment file can be written.
// Usage: npm run extract -- <id> <n>
//   → work/<id>/chNN.jp.txt, work/<id>/chNN.en.txt  (work/ is git-ignored: it contains book text)
//   and, if align/chNN.txt doesn't exist yet, a starter file with a naive 1:1 draft.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, loadBook, loadJpChapter, loadEnChapter, numberSentences, unitsText, chapterTag } from './lib/epub.mjs';

const [id, nArg] = process.argv.slice(2);
const book = await loadBook(id);
const chapter = book.chapters.find((c) => c.n === Number(nArg));
if (!chapter) throw new Error(`Chapter "${nArg}" isn't in books/${id}/book.json (have: ${book.chapters.map((c) => c.n).join(', ')})`);
const tag = chapterTag(chapter.n);

const jpCh = await loadJpChapter(book, chapter);
const enCh = await loadEnChapter(book, chapter);
const jp = numberSentences(jpCh, 'J');
const en = numberSentences(enCh, 'E');

const dump = (title, list, text) => {
  let lastP = 0, out = `# ${title}\n`;
  for (const x of list) {
    if (x.sceneBreak) { out += '\n* * *\n'; continue; }
    if (x.pi !== lastP) { out += `\n[¶${x.pi}]\n`; lastP = x.pi; }
    out += `${x.id}\t${text(x.s)}\n`;
  }
  return out;
};

const dir = path.join(ROOT, 'work', book.id);
await fs.mkdir(dir, { recursive: true });
await fs.writeFile(path.join(dir, `${tag}.jp.txt`), dump(jpCh.title, jp, unitsText));
await fs.writeFile(path.join(dir, `${tag}.en.txt`), dump(enCh.title, en, (s) => s));

const nj = jp.filter((x) => x.id).length, ne = en.filter((x) => x.id).length;
console.log(`${tag}: ${nj} JP sentences (${jpCh.paragraphs.filter((p) => !p.sceneBreak).length} ¶), ${ne} EN sentences (${enCh.paragraphs.filter((p) => !p.sceneBreak).length} ¶)`);
console.log(`  titles: ${jpCh.title || '(none found)'} / ${enCh.title || '(none found)'}`);
console.log(`  → work/${book.id}/${tag}.jp.txt, work/${book.id}/${tag}.en.txt`);

const alignFile = path.join(book.dir, 'align', `${tag}.txt`);
if (!(await fs.stat(alignFile).catch(() => null))) {
  await fs.mkdir(path.dirname(alignFile), { recursive: true });
  await fs.writeFile(alignFile, [
    `# ${jpCh.title} / ${enCh.title}`,
    `# Source: ${nj} JP sentences, ${ne} EN sentences (from \`npm run extract -- ${book.id} ${chapter.n}\`).`,
    '# Format: J<a>[-J<b>] = E<c>[-E<d>]   or   J<a> = -   (no English). Every id once, in order.',
    '# DRAFT: replace this file with a real alignment; see docs/adding-a-book.md.',
    '',
  ].join('\n'));
  console.log(`  created align/${tag}.txt (header only — fill it in)`);
}

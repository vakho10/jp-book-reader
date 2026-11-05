// Converts an Aozora Bunko XHTML page (public-domain Japanese texts) into clean per-section
// HTML files the pipeline can read: one file per 見出し section, <h2> title + <p> paragraphs,
// <ruby> kept, gaiji images replaced by the real character where known.
// Usage: npm run aozora -- <downloaded.html> <out-dir>
//   → <out-dir>/01.html, 02.html, …  (a text with no headings becomes a single 01.html)
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'node-html-parser';

// JIS X 0213 codes Aozora marks as images (alt "※(…、第3水準1-87-71)") → Unicode.
// Add entries as new texts need them: https://www.aozora.gr.jp/gaiji_chuki/
const GAIJI = {
  '1-87-71': '犍',
};

const [src, outDir] = process.argv.slice(2);
if (!src || !outDir) throw new Error('Usage: npm run aozora -- <downloaded.html> <out-dir>');

const buf = await fs.readFile(src);
const head = buf.subarray(0, 1024).toString('latin1');
const enc = /charset=["']?(shift_jis|sjis|x-sjis)/i.test(head) ? 'shift_jis' : 'utf-8';
const html = new TextDecoder(enc).decode(buf);
const root = parse(html);
const main = root.querySelector('.main_text');
if (!main) throw new Error('No <div class="main_text"> — is this an Aozora Bunko XHTML file?');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const missing = new Set();

// Serialize inline content: text, ruby (rb/rt only), gaiji → character.
function inline(node) {
  let s = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) s += esc(c.text);
    else if (c.tagName === 'RUBY') {
      // the base may itself contain a gaiji image, so serialize it like any inline content
      const rbEl = c.querySelector('rb');
      const rb = rbEl ? inline(rbEl) : esc(c.childNodes.filter((n) => n.nodeType === 3).map((n) => n.text).join(''));
      const rt = c.querySelector('rt')?.text ?? '';
      s += `<ruby>${rb}<rt>${esc(rt)}</rt></ruby>`;
    } else if (c.tagName === 'IMG' && c.classList.contains('gaiji')) {
      const code = c.getAttribute('alt')?.match(/(\d+-\d+-\d+)/)?.[1];
      if (code && GAIJI[code]) s += GAIJI[code];
      else { missing.add(c.getAttribute('alt')); s += '〓'; }
    } else if (c.tagName === 'EM' && /sesame|dot/.test(c.getAttribute('class') || '')) {
      s += `<span class="em-sesame">${inline(c)}</span>`;
    } else if (c.tagName !== 'BR') s += inline(c);
  }
  return s;
}

// Walk the main text: headings start sections; <br> ends a line (= paragraph in Aozora).
const sections = [];
let cur = null, line = '';
const flush = () => {
  const t = line.replace(/^[\s　]+/, '').trimEnd();
  if (t) {
    if (!cur) sections.push((cur = { title: '', paras: [] }));
    cur.paras.push(t);
  }
  line = '';
};
for (const node of main.childNodes) {
  if (node.nodeType === 3) { line += esc(node.text.replace(/[\r\n]/g, '')); continue; }
  const heading = node.querySelector?.('h3, h4, h5') ?? (/^H[3-5]$/.test(node.tagName) ? node : null);
  if (heading) { flush(); sections.push((cur = { title: heading.text.trim(), paras: [] })); continue; }
  if (node.tagName === 'BR') { flush(); continue; }
  if (/chitsuki|jisage/.test(node.getAttribute?.('class') || '')) { flush(); line = inline(node); flush(); continue; }
  line += node.tagName === 'DIV' ? '' : inline({ childNodes: [node] });
  if (node.tagName === 'DIV') { flush(); line = inline(node); flush(); }
}
flush();

await fs.mkdir(outDir, { recursive: true });
for (const [i, s] of sections.entries()) {
  const file = path.join(outDir, `${String(i + 1).padStart(2, '0')}.html`);
  await fs.writeFile(file, `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><title>${esc(s.title)}</title></head>\n<body>\n<h2>${esc(s.title)}</h2>\n${s.paras.map((p) => `<p>${p}</p>`).join('\n')}\n</body></html>\n`);
  console.log(`${path.basename(file)}: “${s.title}” ${s.paras.length} paragraphs`);
}
if (missing.size) console.warn(`Unknown gaiji (shown as 〓) — add them to GAIJI in scripts/aozora.mjs:\n  ${[...missing].join('\n  ')}`);

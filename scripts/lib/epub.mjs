// Reads EPUBs and turns chapters into paragraphs of sentence segments.
// Everything book-specific (file names, title selectors) comes from books/<id>/book.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { parse } from 'node-html-parser';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

/* ---------------- books & EPUB access ---------------- */

export async function loadBook(id) {
  if (!id) throw new Error('Pass a book id, e.g. `npm run extract -- three-days-of-happiness 1`. Books: ' + (await listBooks()).join(', '));
  const dir = path.join(ROOT, 'books', id);
  const cfg = JSON.parse(await fs.readFile(path.join(dir, 'book.json'), 'utf8'));
  if (cfg.id !== id) throw new Error(`books/${id}/book.json has id "${cfg.id}" — they must match`);
  return { ...cfg, dir };
}

export async function listBooks() {
  const dir = path.join(ROOT, 'books');
  const out = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (d.isDirectory() && (await fs.stat(path.join(dir, d.name, 'book.json')).catch(() => null))) out.push(d.name);
  }
  return out;
}

const zipCache = new Map();
export async function openEpub(file) {
  if (!zipCache.has(file)) {
    const buf = await fs.readFile(file).catch(() => { throw new Error(`EPUB not found: ${path.relative(ROOT, file)}`); });
    zipCache.set(file, await JSZip.loadAsync(buf));
  }
  return zipCache.get(file);
}

export async function readEntry(file, entry) {
  const f = (await openEpub(file)).file(entry);
  if (!f) throw new Error(`Missing "${entry}" in ${path.basename(file)} — check the chapter map in book.json (\`npm run inspect\` lists the files)`);
  return f.async('string');
}

export const epubPath = (book, lang) => path.join(book.dir, book.sources[lang].epub);

/** Spine (reading order) of an EPUB: [{ href, size }] with hrefs relative to the zip root. */
export async function spine(file) {
  const zip = await openEpub(file);
  const container = parse(await zip.file('META-INF/container.xml').async('string'));
  const opfPath = container.querySelector('rootfile').getAttribute('full-path');
  const opfDir = path.posix.dirname(opfPath);
  const opf = parse(await zip.file(opfPath).async('string'));
  const items = new Map(opf.querySelectorAll('manifest item').map((i) => [i.getAttribute('id'), i.getAttribute('href')]));
  return opf.querySelectorAll('spine itemref').map((r) => {
    const href = decodeURIComponent(items.get(r.getAttribute('idref')) ?? '');
    return opfDir === '.' ? href : path.posix.join(opfDir, href);
  });
}

/* ---------------- Japanese ---------------- */

// A JP paragraph becomes a list of "units": a single character, or a ruby group.
// Each unit carries the emphasis flag (傍点) it was found under.
function jpUnits(node, em = false, out = []) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      for (const ch of decode(child.rawText)) out.push({ c: ch, em });
    } else if (child.tagName === 'RUBY') {
      // <ruby>寿<rt>じゆ</rt>命<rt>みよう</rt></ruby>: pair each base run with its rt
      let base = '';
      for (const r of child.childNodes) {
        if (r.nodeType === 3) base += decode(r.rawText);
        else if (r.tagName === 'RT') { out.push({ c: base, rt: r.text, em }); base = ''; }
        else if (r.tagName !== 'RP') base += r.text;
      }
      if (base) for (const ch of base) out.push({ c: ch, em });
    } else if (child.tagName === 'BR' || child.tagName === 'RP') {
      // ignore
    } else {
      const isEm = em || /em-|sesame|bouten|boten|emphasis/.test(child.getAttribute?.('class') || '');
      jpUnits(child, isEm, out);
    }
  }
  return out;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');

const JP_END = new Set(['。', '！', '？', '!', '?']);
const JP_CLOSE = new Set(['」', '』', '）', ')', '〉', '》', '】', '！', '？', '!', '?', '。']);
// A paragraph that is only decoration (◇, ＊＊＊, ◆◆◆, ……) is a scene break.
const SCENE_MARK = /^[\s　◇◆□■○●☆★＊*※・…─―〜~\-]+$/;

function splitJpSentences(units) {
  const sents = [];
  let cur = [];
  for (let i = 0; i < units.length; i++) {
    cur.push(units[i]);
    if (!units[i].rt && JP_END.has(units[i].c)) {
      while (i + 1 < units.length && !units[i + 1].rt && JP_CLOSE.has(units[i + 1].c)) cur.push(units[++i]);
      sents.push(cur);
      cur = [];
    }
  }
  if (cur.some((u) => u.c.trim() && u.c !== '　')) sents.push(cur);
  return sents.map(trimUnits).filter((s) => s.length);
}

function trimUnits(units) {
  let a = 0, b = units.length;
  while (a < b && !units[a].rt && /^[\s　]$/.test(units[a].c)) a++;
  while (b > a && !units[b - 1].rt && /^[\s　]$/.test(units[b - 1].c)) b--;
  return units.slice(a, b);
}

export const unitsText = (units) => units.map((u) => u.c).join('');
const stripNumber = (s) => s.replace(/^[\s　]*(?:第?[0-9０-９一二三四五六七八九十百]+[章話]?[．.、:：\s　]+)/, '').trim();

export async function loadJpChapter(book, chapter) {
  const root = parse(await readEntry(epubPath(book, 'ja'), chapter.ja));
  const sel = book.sources.ja.titleSelector;
  const titleEl = sel ? root.querySelector(sel) : root.querySelector('h1, h2, h3');
  const title = chapter.title?.ja ?? (titleEl ? stripNumber(titleEl.text) : '');

  const paragraphs = []; // { sceneBreak: true } | { sentences: units[][] }
  let blanks = 0;
  const body = root.querySelector('body') ?? root;
  for (const p of body.querySelectorAll('p, h1, h2, h3, h4')) {
    if (p === titleEl) { blanks = 0; continue; }
    if (/^H[1-4]$/.test(p.tagName)) continue; // other headings: not body text
    const units = trimUnits(jpUnits(p));
    const text = unitsText(units);
    if (!units.length) { blanks++; continue; }
    if (SCENE_MARK.test(text)) { if (paragraphs.length && !paragraphs.at(-1).sceneBreak) paragraphs.push({ sceneBreak: true }); blanks = 0; continue; }
    if (blanks >= 2 && paragraphs.length && !paragraphs.at(-1).sceneBreak) paragraphs.push({ sceneBreak: true });
    blanks = 0;
    paragraphs.push({ sentences: splitJpSentences(units) });
  }
  return { title, paragraphs };
}

/* ---------------- English ---------------- */

function enHtml(node) {
  let s = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) s += child.rawText;
    else if (child.tagName === 'EM' || child.tagName === 'I') s += `<em>${enHtml(child)}</em>`;
    else if (child.tagName === 'STRONG' || child.tagName === 'B') s += `<strong>${enHtml(child)}</strong>`;
    else if (child.tagName === 'BR') s += ' ';
    else s += enHtml(child); // <a id="page-N">, <span> etc.
  }
  return s;
}

// Split on sentence-final punctuation (+ closing quotes) followed by whitespace and a
// sentence start. Inline tags open across a split are closed and reopened, so every
// sentence is well-formed HTML on its own.
function splitEnSentences(html) {
  const out = [];
  let cur = '';
  const open = [];
  const push = () => {
    out.push((cur + open.map((t) => `</${t}>`).reverse().join('')).trim()
      .replace(/^((?:<\w+>)*)\s+/, '$1').replace(/<(\w+)><\/\1>/g, ''));
    cur = open.map((t) => `<${t}>`).join('');
  };
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === '<') {
      const end = html.indexOf('>', i);
      const tag = html.slice(i, end + 1);
      if (tag.startsWith('</')) open.pop(); else open.push(tag.slice(1, -1).split(/\s/)[0]);
      cur += tag;
      i = end;
      continue;
    }
    cur += ch;
    if (/[.!?…]/.test(ch)) {
      let j = i + 1;
      for (;;) {
        if (j < html.length && /[.!?…”’"')\]]/.test(html[j])) { cur += html[j++]; continue; }
        if (html.startsWith('</', j)) { const e = html.indexOf('>', j); cur += html.slice(j, e + 1); open.pop(); j = e + 1; continue; }
        break;
      }
      i = j - 1;
      const next = html.slice(j, j + 16);
      const abbrev = /\b(Mr|Mrs|Ms|Dr|St|vs|etc|Mt|Jr|Sr)\.$/.test(cur);
      if (/^\s+(?:<[a-z]+>)*[“"‘'(A-Z0-9…—]/.test(next) && !abbrev) push();
    }
  }
  if (cur.replace(/<[^>]+>/g, '').trim()) push();
  return out;
}

const EN_SCENE = /space-break|scene-break|section-break/;

export async function loadEnChapter(book, chapter) {
  const root = parse(await readEntry(epubPath(book, 'en'), chapter.en));
  const sel = book.sources.en.titleSelector;
  const titleEl = sel ? root.querySelector(sel)
    : root.querySelectorAll('h1, h2, h3').filter((h) => !/^\s*(chapter\s*)?[0-9ivxlc]+\.?\s*$/i.test(h.text)).at(0);
  const title = chapter.title?.en ?? titleEl?.text.trim() ?? '';
  const paragraphs = [];
  const body = root.querySelector('body') ?? root;
  for (const p of body.querySelectorAll('p')) {
    const html = enHtml(p).replace(/\s+/g, ' ').trim();
    const text = html.replace(/<[^>]+>/g, '');
    if (!text.trim()) continue;
    if (SCENE_MARK.test(text)) { if (paragraphs.length) paragraphs.push({ sceneBreak: true }); continue; }
    if (EN_SCENE.test(p.getAttribute('class') || '') && paragraphs.length && !paragraphs.at(-1).sceneBreak) paragraphs.push({ sceneBreak: true });
    paragraphs.push({ sentences: splitEnSentences(html) });
  }
  return { title, paragraphs };
}

/* ---------------- Numbering ---------------- */

// Flatten to globally numbered sentences: J1, J2… / E1, E2…, remembering paragraph index.
export function numberSentences(ch, prefix) {
  const list = [];
  let pi = 0, n = 0;
  for (const p of ch.paragraphs) {
    if (p.sceneBreak) { list.push({ sceneBreak: true, pi }); continue; }
    pi++;
    for (const s of p.sentences) list.push({ id: `${prefix}${++n}`, pi, s });
  }
  return list;
}

export const chapterTag = (n) => `ch${String(n).padStart(2, '0')}`;

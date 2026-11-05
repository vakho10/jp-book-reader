// Japanese tokenization (kuromoji): word boundaries, readings, dictionary forms,
// auto furigana, and modern small kana for the book's full-size-kana ruby.
// Output shapes are documented in docs/data-format.md (Token / Frag).
import path from 'node:path';
import { createRequire } from 'node:module';
import { unitsText } from './epub.mjs';

const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji');
export const tokenizer = await new Promise((res, rej) =>
  kuromoji.builder({ dicPath: path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict') })
    .build((err, t) => (err ? rej(err) : res(t))));

/* ---------------- kana helpers ---------------- */

const toHira = (s = '') => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const SMALL = { ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ', ゕ: 'か', ゖ: 'け' };
const bigKana = (s) => [...s].map((c) => SMALL[c] ?? c).join('');
const isKanji = (c) => /[㐀-鿿豈-﫿々〆ヶ]/.test(c);
const hasKanji = (s) => [...s].some(isKanji);
const isKana = (c) => /[ぁ-ゖァ-ヺー]/.test(c);

// Split a surface into [text, reading|null] pieces, aligning okurigana with the reading.
// 考え込む / かんがえこむ → [考,かんが][え][込,こ][む]
function autoRuby(surface, reading) {
  if (!reading || !hasKanji(surface)) return [[surface, null]];
  const runs = surface.match(/[㐀-鿿豈-﫿々〆ヶ]+|[^㐀-鿿豈-﫿々〆ヶ]+/g);
  if (runs.length === 1) return [[surface, reading]];
  if (runs.some((r) => !hasKanji(r) && ![...r].every(isKana))) return [[surface, reading]];
  const re = new RegExp('^' + runs.map((r) => (hasKanji(r) ? '(.+?)' : `(${toHira(r)})`)).join('') + '$');
  const m = reading.match(re);
  if (!m) return [[surface, reading]];
  return runs.map((r, i) => [r, hasKanji(r) ? m[i + 1] : null]);
}

const POS = {
  名詞: 'noun', 動詞: 'verb', 形容詞: 'i-adjective', 形容動詞: 'na-adjective', 副詞: 'adverb',
  連体詞: 'pre-noun adjectival', 接続詞: 'conjunction', 感動詞: 'interjection', 助詞: 'particle',
  助動詞: 'auxiliary verb', 接頭詞: 'prefix', フィラー: 'filler', 記号: 'symbol',
};
const POS_DETAIL = { 固有名詞: 'proper noun', 代名詞: 'pronoun', 数: 'number', 接尾: 'suffix', 非自立: 'dependent', 形容動詞語幹: 'na-adjective' };

function posLabel(t) {
  if (t.pos === '名詞' && t.pos_detail_1 === '形容動詞語幹') return 'na-adjective';
  const d = POS_DETAIL[t.pos_detail_1];
  const base = POS[t.pos] ?? t.pos;
  return d && d !== base ? `${base} · ${d}` : base;
}

const readingCache = new Map();
function readingOf(word) {
  if (!readingCache.has(word)) {
    readingCache.set(word, tokenizer.tokenize(word).map((t) => toHira(t.reading ?? t.surface_form)).join(''));
  }
  return readingCache.get(word);
}

/* ---------------- sentence → tokens ---------------- */

// Output token: [fragments, reading, base, baseReading, pos]
//   fragment: [text, rt, flags]  flags: 'b' book ruby, 'a' auto ruby, 'e' emphasis (傍点)
//   a token with plain text only is collapsed to a string.
export function tokenizeSentence(units) {
  const text = unitsText(units);
  const toks = tokenizer.tokenize(text);

  // char offset → unit index
  const unitStart = [];
  let off = 0;
  for (const u of units) { unitStart.push(off); off += u.c.length; }

  // Merge kuromoji tokens so no book-ruby unit straddles a token boundary.
  const merged = [];
  for (const t of toks) {
    const start = t.word_position - 1, end = start + t.surface_form.length;
    const prev = merged.at(-1);
    const straddles = prev && units.some((u, i) => u.rt && unitStart[i] < prev.end && unitStart[i] + u.c.length > prev.end);
    if (straddles) {
      prev.end = end;
      prev.surface += t.surface_form;
      prev.reading = prev.reading != null && t.reading ? prev.reading + toHira(t.reading) : null;
      prev.base = prev.surface;
    } else {
      merged.push({ start, end, surface: t.surface_form, reading: t.reading ? toHira(t.reading) : null,
        base: t.basic_form && t.basic_form !== '*' ? t.basic_form : t.surface_form, pos: posLabel(t), raw: t });
    }
  }

  return merged.map((m) => {
    const inTok = units.map((u, i) => ({ u, s: unitStart[i] })).filter(({ u, s }) => s >= m.start && s + u.c.length <= m.end);
    const hasBook = inTok.some(({ u }) => u.rt);
    let frags = [];

    if (hasBook) {
      // Book ruby uses full-size kana (traditional typesetting: じゆみよう).
      // If kuromoji's reading matches once small kana are enlarged, adopt its modern spelling.
      const bookReading = inTok.map(({ u }) => u.rt ?? toHira(u.c)).join('');
      const fixed = m.reading && bigKana(m.reading) === bookReading && m.reading !== bookReading ? m.reading : null;
      let p = 0;
      for (const { u } of inTok) {
        const r = u.rt ?? u.c;
        const rt = u.rt ? (fixed ? fixed.slice(p, p + r.length) : u.rt) : null;
        p += r.length;
        frags.push([u.c, rt, (rt ? 'b' : '') + (u.em ? 'e' : '')]);
      }
    } else {
      // Auto furigana, then re-split at emphasis boundaries.
      const pieces = m.raw?.pos === '記号' ? [[m.surface, null]] : autoRuby(m.surface, m.reading);
      let p = m.start;
      for (const [txt, rt] of pieces) {
        const ems = [...txt].map((_, k) => units.find((u, i) => unitStart[i] <= p + k && p + k < unitStart[i] + u.c.length)?.em);
        if (rt || ems.every((e) => e === ems[0])) frags.push([txt, rt, (rt ? 'a' : '') + (ems[0] ? 'e' : '')]);
        else [...txt].forEach((c, k) => frags.push([c, null, ems[k] ? 'e' : '']));
        p += txt.length;
      }
    }

    // collapse adjacent plain fragments with identical flags
    frags = frags.reduce((acc, f) => {
      const last = acc.at(-1);
      if (last && !last[1] && !f[1] && last[2] === f[2]) last[0] += f[0];
      else acc.push([...f]);
      return acc;
    }, []);
    const fr = frags.length === 1 && !frags[0][1] && !frags[0][2] ? frags[0][0] : frags.map((f) => (f[2] ? f : f[1] ? [f[0], f[1]] : [f[0]]));

    // punctuation / symbols: no lookup data (string, or {f} when it carries formatting)
    if (m.pos === 'symbol' || !/[\p{L}\p{N}]/u.test(m.surface)) return typeof fr === 'string' ? fr : { f: fr };
    const reading = m.reading && m.reading !== toHira(m.surface) ? m.reading : '';
    const base = m.base !== m.surface ? m.base : '';
    const baseReading = base && hasKanji(base) ? readingOf(base) : '';
    return [fr, reading, base, baseReading, m.pos];
  });
}


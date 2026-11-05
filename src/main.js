import { icon, hydrateIcons } from './icons.js';
import * as library from './library.js';
import * as speech from './speech.js';
import bookmarkSolidSvg from 'heroicons/24/solid/bookmark.svg?raw';

const $ = (s, el = document) => el.querySelector(s);
const root = document.documentElement;
const reader = $('#reader');
const pop = $('#pop');

hydrateIcons();
root.style.setProperty('--rib-icon', `url("data:image/svg+xml,${encodeURIComponent(bookmarkSolidSvg.replace('fill="currentColor"', 'fill="black"'))}")`);

/* ---------------- settings ---------------- */

const DEFAULTS = { theme: 'light', font: 'serif', size: 20, trSize: 80, tr: 'show', furi: 'book', book: '', chapter: 1, voice: '', rate: 0.9 };

let book = null; // the open book (bilingual-reader-book v1, see docs/data-format.md)
const bookTitle = (b = book) => b?.title.ja || b?.title.en || '';
const store = {
  get(k, d) { try { const v = localStorage.getItem('tdh:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tdh:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const isPhone = () => innerWidth < 640;
const settings = { ...DEFAULTS, ...store.get('settings', {}) };
if (!store.get('settings', null)) {
  if (matchMedia('(prefers-color-scheme: dark)').matches) settings.theme = 'dark';
  if (isPhone()) settings.size = 18;
}
const THEME_COLOR = { light: '#fbfaf7', sepia: '#f4ecd8', dark: '#16171a' };

const TR_LABEL = { show: 'EN', reveal: 'EN ◌', hide: 'EN ✕' };
const FURI_LABEL = { book: 'ふりがな', all: 'ふり＋', hover: 'ふり?', off: 'ふり✕' };
const CYCLE = { tr: ['show', 'reveal', 'hide'], furi: ['book', 'all', 'hover', 'off'] };

function applySettings() {
  root.dataset.theme = settings.theme;
  $('meta[name=theme-color]').content = THEME_COLOR[settings.theme];
  root.dataset.font = settings.font;
  root.dataset.tr = settings.tr;
  root.dataset.furi = settings.furi;
  root.style.setProperty('--jp-size', settings.size + 'px');
  root.style.setProperty('--tr-scale', settings.trSize / 100);
  $('#size').value = settings.size;
  $('#sizeVal').textContent = settings.size + 'px';
  $('#trSize').value = settings.trSize;
  $('#trSizeVal').textContent = settings.trSize + '%';
  $('#rate').value = settings.rate;
  $('#rateVal').textContent = settings.rate.toFixed(2) + '×';
  $('#plRate').textContent = settings.rate.toFixed(2).replace(/0$/, '') + '×';
  $('#trBtn').textContent = TR_LABEL[settings.tr];
  $('#furiBtn').textContent = FURI_LABEL[settings.furi];
  document.querySelectorAll('.seg').forEach((seg) => {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(settings[seg.dataset.setting] === b.dataset.v)));
  });
  store.set('settings', settings);
}

// Keep the sentence you're reading at the same screen position while the layout reflows.
function keepPlace(fn) {
  const anchor = topVisibleBlock();
  const top = anchor?.el.getBoundingClientRect().top;
  fn();
  if (anchor) scrollBy(0, anchor.el.getBoundingClientRect().top - top);
}

function set(key, value) {
  keepPlace(() => { settings[key] = value; applySettings(); });
}
const cycle = (key) => { const c = CYCLE[key]; set(key, c[(c.indexOf(settings[key]) + 1) % c.length]); };

/* ---------------- rendering ---------------- */

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function frag(f) {
  if (typeof f === 'string') return esc(f);
  const [text, rt, flags = ''] = f;
  let html = rt ? `<ruby>${esc(text)}<rt class="${flags.includes('b') ? 'b' : 'a'}">${esc(rt)}</rt></ruby>` : esc(text);
  if (flags.includes('e')) html = `<span class="emph">${html}</span>`;
  return html;
}

// Token shapes (docs/data-format.md): "text" | { f: Frag[] } | [frags, reading, lemma, lemmaReading, pos]
let wordData = [];
const isWordToken = (t) => Array.isArray(t);
const fragsText = (fr) => (typeof fr === 'string' ? fr : fr.map((f) => f[0]).join(''));
const tokenFrags = (t) => (typeof t === 'string' ? t : isWordToken(t) ? t[0] : t.f);
const tokenText = (t) => fragsText(tokenFrags(t));
const surfaceOf = (t) => fragsText(t[0]);

function token(t) {
  const fr = tokenFrags(t);
  const html = typeof fr === 'string' ? esc(fr) : fr.map(frag).join('');
  if (!isWordToken(t)) return html;
  wordData.push(t);
  return `<span class="w" data-w="${wordData.length - 1}">${html}</span>`;
}

// Only <em>/<strong> are allowed in translations; anything else in a loaded file is escaped.
const safeEn = (html) => esc(html).replace(/&lt;(\/?)(em|strong)&gt;/g, '<$1$2>');

const posKey = (n, id = book.id) => `pos:${id}:${n}`;

function renderChapter(n) {
  const ch = book.chapters.find((c) => c.n === n) ?? book.chapters[0];
  settings.chapter = ch.n;
  store.set('settings', settings);
  store.set('last:' + book.id, ch.n);
  wordData = [];

  let html = `<header class="ch-head">
    <div class="num">${esc(ch.label || `Chapter ${ch.n}`)}</div>
    <h1 class="jp">${esc(ch.title.ja)}</h1>
    ${ch.title.en ? `<div class="en">${esc(ch.title.en)}</div>` : ''}
  </header>`;

  ch.blocks.forEach((b, i) => {
    if (b.scene) html += '<div class="scene" aria-hidden="true"><span>◆</span><span>◆</span><span>◆</span></div>';
    const first = b.ja[0].tokens[0] ? tokenText(b.ja[0].tokens[0]) : '';
    const quote = /^[「『（]/.test(first) ? ' quote' : '';
    const sents = b.ja.map((s) => {
      const q = s.para && s.tokens[0] && /^[「『（]/.test(tokenText(s.tokens[0])) ? ' quote' : '';
      return `<span class="sent${s.para ? ' p' : ''}${q}">${s.tokens.map(token).join('')}</span>`;
    }).join('');
    const tr = b.en
      ? `<p class="tr" tabindex="0">${safeEn(b.en)}</p>`
      : '<p class="tr none" tabindex="0">(not in the English edition)</p>';
    const marked = isMarked(ch.n, i);
    html += `<section class="block${b.para ? ' p' : ''}${quote}${marked ? ' marked' : ''}" id="b${i}" data-i="${i}">`
      + `<button class="rib" data-rib aria-label="${marked ? 'Remove bookmark' : 'Bookmark this sentence'}" aria-pressed="${marked}"></button>`
      + (speech.supported ? `<button class="say" data-say aria-label="Read aloud from this sentence">${icon('speaker', 'size-4')}</button>` : '')
      + `<p class="jp">${sents}</p>${tr}</section>`;
  });

  const idx = book.chapters.indexOf(ch);
  const prev = book.chapters[idx - 1], next = book.chapters[idx + 1];
  html += `<nav class="mt-20 flex items-center justify-between gap-4 border-t border-line pt-6 text-sm">
    ${prev ? `<button class="pill" data-go="${prev.n}">← ${esc(prev.title.ja)}</button>` : '<span></span>'}
    ${next ? `<button class="pill" data-go="${next.n}">${esc(next.title.ja)} →</button>` : '<span class="text-muted text-xs">End of the loaded chapters</span>'}
  </nav>`;

  stopPlayer();
  reader.innerHTML = html;
  $('#hdrTitle').textContent = bookTitle();
  $('#hdrSub').textContent = `${ch.label || ch.n + '.'} ${ch.title.ja}${ch.title.en ? ' · ' + ch.title.en : ''}`;
  document.title = `${ch.title.ja} · ${bookTitle()}`;
  setReaderChrome(true);
  renderToc();
  closePop();

  const saved = store.get(posKey(ch.n), null);
  const target = location.hash.match(/^#b(\d+)$/) ? $(location.hash) : saved != null && $('#b' + saved);
  const restore = () => (target ? target.scrollIntoView({ block: 'start' }) : scrollTo(0, 0));
  requestAnimationFrame(restore);
  // Web fonts arriving later change line heights; re-anchor unless the reader already moved.
  const y = () => Math.round(scrollY);
  requestAnimationFrame(() => {
    const restoredAt = y();
    document.fonts?.ready.then(() => { if (target && Math.abs(y() - restoredAt) < 4) restore(); });
  });
}

/* ---------------- bookmarks ----------------
   Kept in localStorage: it survives closing the browser (unlike sessionStorage), has room
   for thousands of entries (cookies cap at ~4 KB and don't work on file:// pages), and we
   ask the browser to mark storage as persistent so it isn't evicted under disk pressure.
   Export/Import moves them between devices. */

// Bookmarks from before multi-book support have no `book`: they belong to the first book.
let bookmarks = store.get('bookmarks', []).map((m) => (m.book ? m : { ...m, book: 'three-days-of-happiness' }));
const isMarked = (ch, b) => bookmarks.some((m) => m.book === book.id && m.ch === ch && m.b === b);
const plain = (html) => html.replace(/<[^>]+>/g, '');
const blockJp = (ch, b) => ch.blocks[b].ja.map((s) => s.tokens.map(tokenText).join('')).join('');
let libraryIndex = []; // [{ id, title, … }] of stored books, for labels in lists

function saveBookmarks() {
  bookmarks.sort((a, b) => (a.book === b.book ? 0 : a.book === book?.id ? -1 : b.book === book?.id ? 1 : a.book.localeCompare(b.book)) || a.ch - b.ch || a.b - b.b);
  store.set('bookmarks', bookmarks);
  navigator.storage?.persist?.().catch(() => {});
  const n = bookmarks.length;
  $('#bmCount').textContent = n > 99 ? '99+' : n;
  $('#bmCount').classList.toggle('hidden', !n);
  if (!$('#bookmarks').classList.contains('hidden')) renderBookmarks();
}

function markBlock(chN, b, on, bookId = book?.id) {
  const el = bookId === book?.id && chN === settings.chapter && $('#b' + b);
  if (!el) return;
  el.classList.toggle('marked', on);
  const rib = $('.rib', el);
  rib.setAttribute('aria-pressed', String(on));
  rib.setAttribute('aria-label', on ? 'Remove bookmark' : 'Bookmark this sentence');
}

function addBookmark(b, chN = settings.chapter) {
  if (isMarked(chN, b)) return toast('Already bookmarked');
  const ch = book.chapters.find((c) => c.n === chN);
  const m = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), book: book.id, ch: chN, b, jp: blockJp(ch, b).slice(0, 80), en: plain(ch.blocks[b].en).slice(0, 100), at: Date.now() };
  bookmarks.push(m);
  saveBookmarks();
  markBlock(chN, b, true);
  toast('Bookmark added', () => removeBookmark(m.id, true));
}

function removeBookmark(id, silent = false) {
  const m = bookmarks.find((x) => x.id === id);
  if (!m) return;
  bookmarks = bookmarks.filter((x) => x !== m);
  saveBookmarks();
  markBlock(m.ch, m.b, false, m.book);
  if (!silent) toast('Bookmark removed', () => { bookmarks.push(m); saveBookmarks(); markBlock(m.ch, m.b, true, m.book); });
}

async function gotoBookmark(m) {
  if (m.book !== book?.id) {
    if (!libraryIndex.some((x) => x.id === m.book)) return toast('That book isn’t loaded on this device');
    await openBook(m.book, m.ch);
  }
  const ch = book.chapters.find((c) => c.n === m.ch);
  if (!ch) return toast('That chapter isn’t in the loaded book file yet');
  // if the alignment changed since saving, find the sentence again by its text
  let b = m.b;
  if (!ch.blocks[b] || !blockJp(ch, b).startsWith(m.jp.slice(0, 20))) {
    const found = ch.blocks.findIndex((_, i) => blockJp(ch, i).startsWith(m.jp.slice(0, 20)));
    if (found >= 0) { m.b = b = found; saveBookmarks(); }
  }
  togglePanel(null);
  if (ch.n !== settings.chapter) renderChapter(ch.n);
  requestAnimationFrame(() => {
    const el = $('#b' + b);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('target'); void el.offsetWidth; el.classList.add('target');
  });
}

const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [u, n] of [['minute', 60], ['hour', 3600], ['day', 86400], ['month', 2592000], ['year', 31536000]].reverse()) {
    if (s >= n) return rtf.format(-Math.floor(s / n), u);
  }
  return 'just now';
};

function renderBookmarks() {
  const list = $('#bmList');
  if (!bookmarks.length) {
    list.innerHTML = `<li class="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
      ${icon('bookmark', 'size-8 opacity-50')}
      <span>No bookmarks yet.</span>
      <span class="text-xs">Save the spot you’re reading, or pick any sentence.</span></li>`;
    return;
  }
  const multi = new Set(bookmarks.map((m) => m.book)).size > 1;
  list.innerHTML = bookmarks.map((m) => {
    const here = m.book === book?.id;
    const ch = here ? book.chapters.find((c) => c.n === m.ch) : null;
    const en = ch?.blocks[m.b] ? plain(ch.blocks[m.b].en) : m.en || '';
    const other = libraryIndex.find((x) => x.id === m.book);
    const where = `${multi ? esc(here ? bookTitle() : other ? bookTitle(other) : m.book) + ' · ' : ''}Ch. ${m.ch}${ch ? ` · ${esc(ch.title.ja)}` : ''}`;
    return `<li class="group flex items-stretch gap-1${!here && !other ? ' opacity-60' : ''}">
      <button data-bm-go="${m.id}" class="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-(--hl)">
        ${icon('bookmark-solid', 'size-4 mt-1 text-accent')}
        <span class="min-w-0 flex-1">
          <span class="block truncate font-jp text-[15px]">${esc(m.jp)}</span>
          ${en ? `<span class="mt-0.5 block truncate font-en text-xs italic text-muted">${esc(en)}</span>` : ''}
          <span class="mt-1 block text-[11px] text-muted">${where} · ${ago(m.at)}</span>
        </span>
      </button>
      <button data-bm-del="${m.id}" class="iconbtn self-center opacity-60 hover:opacity-100" aria-label="Delete bookmark">${icon('trash', 'size-4')}</button>
    </li>`;
  }).join('');
}

function exportBookmarks() {
  const blob = new Blob([JSON.stringify({ app: 'bilingual-reader', version: 2, exported: new Date().toISOString(), bookmarks }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `bookmarks-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importBookmarks(file) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = (Array.isArray(data) ? data : data.bookmarks || []).filter((m) => Number.isInteger(m.ch) && Number.isInteger(m.b));
    let added = 0;
    for (const m of incoming) {
      const bookId = typeof m.book === 'string' ? m.book : 'three-days-of-happiness';
      if (bookmarks.some((x) => x.book === bookId && x.ch === m.ch && x.b === m.b)) continue;
      bookmarks.push({ id: m.id || Date.now().toString(36) + added, book: bookId, ch: m.ch, b: m.b, jp: String(m.jp || ''), en: String(m.en || ''), at: Number(m.at) || Date.now() });
      markBlock(m.ch, m.b, true, bookId);
      added++;
    }
    saveBookmarks();
    toast(`Imported ${added} bookmark${added === 1 ? '' : 's'}`);
  } catch {
    toast('That file isn’t a bookmarks backup');
  }
}

// Pick mode: the next tap on a sentence bookmarks it.
let picking = false;
function setPicking(on) {
  picking = on;
  document.body.classList.toggle('picking', on);
  $('#pickBar').classList.toggle('hidden', !on);
  if (on) { togglePanel(null); closePop(); }
}

/* ---------------- read aloud ----------------
   Plays sentence by sentence from a block, highlighting and following along.
   Words with the book's own furigana are spoken by that reading, so rare kanji
   and names come out right even when the voice would guess wrong. */

const currentChapter = () => book.chapters.find((c) => c.n === settings.chapter);

function speechText(sentence) {
  return sentence.tokens.map((t) => {
    const fr = tokenFrags(t);
    if (typeof fr === 'string') return fr;
    return fr.map((f) => (f[2]?.includes('b') && f[1] ? f[1] : f[0])).join('');
  }).join('').replace(/[〝〟]/g, '').replace(/─{2,}|―{2,}/g, '、');
}

const player = { open: false, playing: false, b: 0, s: 0, repeat: false, run: 0 };

function setPlayerUi() {
  $('#player').classList.toggle('hidden', !player.open);
  document.body.classList.toggle('player-open', player.open);
  document.body.classList.toggle('listening', player.playing);
  $('#plPlay').innerHTML = icon(player.playing ? 'pause' : 'play', 'size-6');
  $('#plPlay').setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
  $('#plRepeat').setAttribute('aria-pressed', String(player.repeat));
  $('#plRepeat').classList.toggle('text-accent', player.repeat);
  const ch = currentChapter();
  $('#plStatus').textContent = `${player.playing ? 'Reading' : 'Paused'} · sentence ${player.b + 1} of ${ch.blocks.length}`;
}

function highlight() {
  reader.querySelectorAll('.speaking').forEach((el) => el.classList.remove('speaking'));
  if (!player.open) return;
  const block = $('#b' + player.b);
  if (!block) return;
  block.classList.add('speaking');
  block.querySelectorAll('.sent')[player.s]?.classList.add('speaking');
  // follow along: keep the sentence comfortably inside the visible area
  const r = block.getBoundingClientRect();
  const top = (parseInt(getComputedStyle(root).getPropertyValue('--bar-h')) || 53) + 16;
  const bottom = innerHeight - ($('#player').offsetHeight || 0) - 24;
  if (r.top < top || r.bottom > bottom) block.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function playLoop() {
  const run = ++player.run; // any newer play/jump/stop invalidates this loop
  const ch = currentChapter();
  while (player.playing && run === player.run) {
    const sent = ch.blocks[player.b]?.ja[player.s];
    if (!sent) break;
    highlight();
    setPlayerUi();
    const ok = await speech.speak(speechText(sent), { voiceURI: settings.voice, rate: settings.rate });
    if (!ok || run !== player.run || !player.playing) return;
    if (player.repeat) { await new Promise((r) => setTimeout(r, 600)); continue; }
    if (player.s + 1 < ch.blocks[player.b].ja.length) player.s++;
    else if (player.b + 1 < ch.blocks.length) { player.b++; player.s = 0; }
    else { player.playing = false; setPlayerUi(); toast('End of chapter'); return; }
  }
}

async function startPlayer(b = null) {
  if (!speech.supported) return toast('Read aloud isn’t supported in this browser');
  const voices = await speech.loadVoices();
  if (!voices.length) { togglePanel('settings'); return toast('No Japanese voice on this device — see Settings → Voice'); }
  if (b == null) { const top = topVisibleBlock(); b = top ? Number(top.el.dataset.i) : 0; }
  togglePanel(null);
  closePop();
  Object.assign(player, { open: true, playing: true, b, s: 0 });
  setPlayerUi();
  playLoop();
}

function pausePlayer() { player.playing = false; player.run++; speech.stop(); setPlayerUi(); }
function resumePlayer() { player.playing = true; setPlayerUi(); playLoop(); }
function stopPlayer() {
  if (!player.open) return;
  player.open = player.playing = false;
  player.run++;
  speech.stop();
  highlight();
  setPlayerUi();
}

function step(dir) {
  const ch = currentChapter();
  let { b, s } = player;
  if (dir > 0) {
    if (s + 1 < ch.blocks[b].ja.length) s++; else if (b + 1 < ch.blocks.length) { b++; s = 0; }
  } else if (s > 0) s--;
  else if (b > 0) { b--; s = ch.blocks[b].ja.length - 1; }
  jumpTo(b, s);
}

function jumpTo(b, s = 0) {
  Object.assign(player, { b, s });
  player.run++;
  speech.stop();
  highlight();
  if (player.playing) playLoop(); else setPlayerUi();
}

async function fillVoices() {
  const sel = $('#voice');
  if (!speech.supported) { sel.disabled = true; sel.innerHTML = '<option>Not supported in this browser</option>'; return; }
  const voices = await speech.loadVoices();
  if (!voices.length) {
    sel.disabled = true;
    sel.innerHTML = '<option>No Japanese voice found</option>';
    $('#voiceHelp').textContent = speech.noVoiceHelp();
    $('#voiceHelp').classList.remove('hidden');
    $('#listenBtn').classList.add('opacity-50');
    return;
  }
  sel.innerHTML = voices.map((v, i) => `<option value="${esc(v.voiceURI)}">${esc(speech.voiceLabel(v))}${i === 0 ? ' (best)' : ''}${v.localService ? '' : ' · online'}</option>`).join('');
  sel.value = speech.pickVoice(settings.voice)?.voiceURI ?? '';
  const best = voices[0];
  if (!speech.isPremium(best)) {
    $('#voiceHelp').textContent = /Windows/.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent)
      ? 'Tip: Microsoft Edge has free natural-sounding Japanese voices (Nanami, Keita); Chrome has Google 日本語.'
      : '';
    $('#voiceHelp').classList.toggle('hidden', !$('#voiceHelp').textContent);
  }
}

/* ---------------- toast ---------------- */

let toastTimer, toastUndo = null;
function toast(msg, undo = null) {
  $('#toastMsg').textContent = msg;
  toastUndo = undo;
  $('#toastUndo').classList.toggle('hidden', !undo);
  const el = $('#toast');
  el.classList.remove('hidden');
  el.classList.add('flex');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.add('hidden'); el.classList.remove('flex'); toastUndo = null; }, undo ? 5000 : 2500);
}
$('#toastUndo').addEventListener('click', () => { toastUndo?.(); toastUndo = null; $('#toast').classList.add('hidden'); });

function renderToc() {
  $('#tocList').innerHTML = book ? book.chapters.map((c) => `
    <li><button data-go="${c.n}" class="flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left hover:bg-(--hl) ${c.n === settings.chapter ? 'text-accent' : ''}">
      <span class="w-6 shrink-0 text-right text-xs text-muted">${c.label ? '·' : c.n}</span>
      <span class="font-jp">${esc(c.title.ja)}</span>
      <span class="truncate text-xs italic text-muted">${esc(c.title.en || '')}</span>
    </button></li>`).join('') : '';
  $('#tocBook').textContent = book ? bookTitle() : '';
  $('#tocBook').classList.toggle('hidden', !book);
  $('#libList').innerHTML = libraryIndex.map((b) => `
    <li class="flex items-center gap-1">
      <button data-open-book="${b.id}" class="flex min-w-0 flex-1 items-baseline gap-2 rounded-lg px-3 py-2 text-left hover:bg-(--hl) ${b.id === book?.id ? 'text-accent' : ''}">
        <span class="truncate font-jp">${esc(bookTitle(b))}</span>
        <span class="truncate text-xs text-muted">${esc(b.title.en && b.title.ja ? b.title.en : '')} · ${b.chapterCount} ch.</span>
      </button>
      <button data-del-book="${b.id}" class="iconbtn opacity-60 hover:opacity-100" aria-label="Remove ${esc(bookTitle(b))} from this device">${icon('trash', 'size-4')}</button>
    </li>`).join('') || '<li class="px-3 py-2 text-sm text-muted">No books on this device yet.</li>';
}

/* ---------------- library: loading & switching books ---------------- */

// Reader-only controls are hidden on the welcome screen.
function setReaderChrome(on) {
  for (const id of ['#trBtn', '#furiBtn', '#listenBtn', '#bmBtn']) $(id).classList.toggle('hidden', !on);
  $('#hdrSub').textContent = on ? $('#hdrSub').textContent : 'Japanese–English reading';
}

async function refreshLibrary() {
  libraryIndex = await library.listBooks().catch(() => []);
  renderToc();
  return libraryIndex;
}

async function openBook(id, chapter) {
  const b = await library.getBook(id);
  if (!b) return false;
  book = b;
  settings.book = b.id;
  const ch = chapter ?? store.get('last:' + b.id, b.chapters[0].n);
  renderChapter(b.chapters.some((c) => c.n === ch) ? ch : b.chapters[0].n);
  saveBookmarks();
  return true;
}

async function importBookFiles(files) {
  for (const file of files) {
    try {
      const data = await library.parseBookFile(file);
      const { book: b, replaced } = await library.putBook(data);
      await refreshLibrary();
      // re-open at the same place if this replaced the open book; otherwise open it
      const keep = book?.id === b.id ? settings.chapter : undefined;
      await openBook(b.id, keep);
      togglePanel(null);
      const n = b.chapters.length;
      toast(replaced ? `Updated “${bookTitle(b)}” — ${n} chapter${n === 1 ? '' : 's'}` : `Added “${bookTitle(b)}”`);
    } catch (e) {
      toast(e.message || 'Couldn’t open that file');
    }
  }
}

async function removeBook(id) {
  const meta = libraryIndex.find((b) => b.id === id);
  if (!meta || !confirm(`Remove “${bookTitle(meta)}” from this device?\n\nYour bookmarks and reading position are kept, so loading the file again restores them.`)) return;
  await library.deleteBook(id);
  await refreshLibrary();
  if (book?.id === id) {
    book = null;
    if (libraryIndex[0]) await openBook(libraryIndex[0].id); else showWelcome();
  }
  toast('Book removed from this device');
}

function showWelcome() {
  stopPlayer();
  book = null;
  setReaderChrome(false);
  $('#hdrTitle').textContent = 'Japanese Book Reader';
  document.title = 'Japanese Book Reader';
  renderToc();
  reader.innerHTML = `
    <section class="mx-auto max-w-lg py-10 text-center">
      <div class="text-3xl font-semibold tracking-tight">Japanese Book Reader</div>
      <p class="mt-2 font-jp text-lg text-muted">日本語の本を、対訳で。</p>
      <div id="dropZone" class="mt-10 rounded-2xl border-2 border-dashed border-line px-6 py-10 transition">
        ${icon('upload', 'size-8 mx-auto text-muted')}
        <p class="mt-3 text-sm">Open a book file (<code class="text-xs">.book.json</code> or <code class="text-xs">.book.json.gz</code>)</p>
        <button id="welcomeOpen" class="action mx-auto mt-5 px-6">Choose file…</button>
        <p class="mt-3 text-xs text-muted [@media(hover:none)]:hidden">or drop it anywhere on this page</p>
      </div>
      <p class="mt-8 text-xs leading-relaxed text-muted">
        Book files stay on this device. They are stored in this browser and never uploaded.
        Load the file once on each phone, tablet or computer you read on.
        To make a book file from your own EPUBs, see the project’s <code>docs/adding-a-book.md</code>.
      </p>
    </section>`;
}

$('#bookFile').addEventListener('change', (e) => { importBookFiles([...e.target.files]); e.target.value = ''; });

// Drag & drop a book file anywhere.
let dragDepth = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files.length) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  importBookFiles([...e.dataTransfer.files]);
});

/* ---------------- word popover ---------------- */

let activeWord = null;
function openPop(el) {
  const t = wordData[el.dataset.w];
  const [, reading, base, baseReading, pos] = t;
  const surface = surfaceOf(t);
  activeWord?.classList.remove('active');
  activeWord = el;
  el.classList.add('active');

  const dict = base || surface;
  const dictReading = base ? baseReading : reading;
  pop.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="word">${esc(dict)}</div>
        ${dictReading && dictReading !== dict ? `<div class="reading text-sm">${esc(dictReading)}</div>` : ''}
      </div>
      <button class="iconbtn -mr-2 -mt-2" data-close aria-label="Close">${icon('x-mark')}</button>
    </div>
    <div class="mt-2 text-xs uppercase tracking-wide text-muted">${esc(pos)}</div>
    ${base ? `<div class="mt-2 text-sm text-muted">In text: <span class="font-jp text-ink">${esc(surface)}</span>${reading ? ` <span class="font-jp">（${esc(reading)}）</span>` : ''}</div>` : ''}
    <div class="mt-3 flex flex-wrap gap-2 text-sm">
      <a class="pill inline-flex items-center gap-1.5" target="_blank" rel="noopener" href="https://jisho.org/search/${encodeURIComponent(dict)}">Jisho ${icon('external', 'size-3.5')}</a>
      ${/[㐀-鿿]/.test(dict) ? `<a class="pill inline-flex items-center gap-1.5" target="_blank" rel="noopener" href="https://jisho.org/search/${encodeURIComponent(dict + ' #kanji')}">Kanji ${icon('external', 'size-3.5')}</a>` : ''}
      <button class="pill inline-flex items-center gap-1.5" data-copy="${esc(dict)}">${icon('copy', 'size-3.5')}<span>Copy</span></button>
      ${speech.supported ? `<button class="pill inline-flex items-center gap-1.5" data-say-word="${esc(dictReading || dict)}">${icon('speaker', 'size-3.5')}<span>Listen</span></button>` : ''}
    </div>`;
  pop.classList.remove('hidden');
  placePop(el);
}

function placePop(el) {
  // phones: bottom sheet; tablets/desktop: floating card next to the word
  pop.classList.toggle('sheet', isPhone());
  if (isPhone()) {
    pop.style.top = pop.style.left = '';
    // keep the tapped word visible above the sheet
    const r = el.getBoundingClientRect(), sheetTop = innerHeight - pop.offsetHeight;
    if (r.bottom > sheetTop - 12) scrollBy({ top: r.bottom - sheetTop + 48, behavior: 'smooth' });
    return;
  }
  const r = el.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight, m = 12;
  let left = Math.min(Math.max(m, r.left + r.width / 2 - pw / 2), innerWidth - pw - m);
  let top = r.bottom + 8;
  if (top + ph > innerHeight - m) top = r.top - ph - 8;
  pop.style.left = left + 'px';
  pop.style.top = Math.max(m, top) + 'px';
}
function closePop() { pop.classList.add('hidden'); activeWord?.classList.remove('active'); activeWord = null; }

/* ---------------- progress & position ---------------- */

function topVisibleBlock() {
  const y = 70;
  for (const el of reader.querySelectorAll('.block')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > y) return { el, offset: y - r.top - 70 };
  }
  return null;
}

// Save the reading position at most every 400 ms instead of on every scroll frame,
// and flush it when the page is hidden (tab switch, app closed on a phone).
let posTimer, pendingPos = null;
function savePos(ch, b) {
  pendingPos = [book.id, ch, b];
  clearTimeout(posTimer);
  posTimer = setTimeout(flushPos, 400);
}
function flushPos() {
  if (pendingPos) store.set(posKey(pendingPos[1], pendingPos[0]), pendingPos[2]);
  pendingPos = null;
}
addEventListener('pagehide', flushPos);
document.addEventListener('visibilitychange', () => document.hidden && flushPos());

// Panels sit right under the top bar; its height varies (safe-area insets, wrapping).
new ResizeObserver(([e]) => root.style.setProperty('--bar-h', Math.round(e.target.getBoundingClientRect().height) + 'px')).observe($('#topbar'));

let lastY = scrollY, ticking = false;
addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    $('#progress').style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    const top = book && topVisibleBlock();
    if (top) savePos(settings.chapter, Number(top.el.dataset.i));
    // hide the bar while reading downward, show it when scrolling up
    $('#topbar').style.transform = scrollY > lastY && scrollY > 120 && !anyPanelOpen() && !picking ? 'translateY(-100%)' : '';
    lastY = scrollY;
    if (!pop.classList.contains('hidden') && activeWord && !isPhone()) placePop(activeWord);
    ticking = false;
  });
}, { passive: true });

/* ---------------- events ---------------- */

const PANELS = ['settings', 'toc', 'bookmarks'];
const anyPanelOpen = () => PANELS.some((p) => !$('#' + p).classList.contains('hidden'));
function togglePanel(id) {
  for (const p of PANELS) $('#' + p).classList.toggle('hidden', p !== id || !$('#' + p).classList.contains('hidden'));
  const open = anyPanelOpen();
  $('#backdrop').classList.toggle('hidden', !open);
  if (open) { closePop(); $('#topbar').style.transform = ''; }
  if (id === 'bookmarks' && open) renderBookmarks();
}

// Swipe a bottom sheet down to dismiss it (phones).
for (const sheet of [...PANELS.map((p) => $('#' + p)), pop]) {
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => { y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null || !isPhone()) return;
    const dy = Math.max(0, e.touches[0].clientY - y0);
    sheet.style.transform = dy ? `translateY(${dy}px)` : '';
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    const dy = y0 == null ? 0 : e.changedTouches[0].clientY - y0;
    sheet.style.transform = '';
    y0 = null;
    if (isPhone() && dy > 70) sheet === pop ? closePop() : togglePanel(null);
  });
}

document.addEventListener('click', (e) => {
  const t = e.target;
  if (picking) {
    if (t.closest('#pickCancel')) return setPicking(false);
    const block = t.closest('.block');
    if (block) { e.preventDefault(); setPicking(false); addBookmark(Number(block.dataset.i)); }
    return;
  }
  // library
  if (t.closest('#addBook, #welcomeOpen')) return $('#bookFile').click();
  const openB = t.closest('[data-open-book]');
  if (openB) { togglePanel(null); return openBook(openB.dataset.openBook); }
  const delB = t.closest('[data-del-book]');
  if (delB) return removeBook(delB.dataset.delBook);
  if (t.closest('#tocBtn')) return togglePanel('toc');
  if (t.closest('#setBtn')) return togglePanel('settings');
  if (t.closest('#backdrop')) return togglePanel(null);
  if (!book) return; // welcome screen: nothing below applies
  // read aloud
  if (t.closest('#listenBtn')) return player.open ? (player.playing ? pausePlayer() : resumePlayer()) : startPlayer();
  if (t.closest('#plPlay')) return player.playing ? pausePlayer() : resumePlayer();
  if (t.closest('#plPrev')) return step(-1);
  if (t.closest('#plNext')) return step(1);
  if (t.closest('#plClose')) return stopPlayer();
  if (t.closest('#plRepeat')) { player.repeat = !player.repeat; return setPlayerUi(); }
  if (t.closest('#plRate')) {
    const rates = [0.6, 0.75, 0.9, 1, 1.15];
    return set('rate', rates[(rates.findIndex((r) => r >= settings.rate - 0.001) + 1) % rates.length]);
  }
  if (t.closest('#voiceTest')) return speech.speak('こんにちは。日本語の読み上げのテストです。', { voiceURI: settings.voice, rate: settings.rate });
  const say = t.closest('[data-say]');
  if (say) return startPlayer(Number(say.closest('.block').dataset.i));
  const sayWord = t.closest('[data-say-word]');
  if (sayWord) return speech.speak(sayWord.dataset.sayWord, { voiceURI: settings.voice, rate: Math.min(settings.rate, 0.9) });
  if (player.playing) {
    const block = t.closest('#reader .block');
    if (block && !t.closest('.tr, .rib')) {
      const sents = [...block.querySelectorAll('.sent')];
      const s = Math.max(0, sents.findIndex((el) => el.contains(t)));
      return jumpTo(Number(block.dataset.i), s);
    }
  }
  const rib = t.closest('[data-rib]');
  if (rib) {
    const b = Number(rib.closest('.block').dataset.i);
    const m = bookmarks.find((x) => x.ch === settings.chapter && x.b === b);
    return m ? removeBookmark(m.id) : addBookmark(b);
  }
  const bmGo = t.closest('[data-bm-go]');
  if (bmGo) return gotoBookmark(bookmarks.find((m) => m.id === bmGo.dataset.bmGo));
  const bmDel = t.closest('[data-bm-del]');
  if (bmDel) return removeBookmark(bmDel.dataset.bmDel);
  if (t.closest('#bmHere')) {
    const top = topVisibleBlock();
    togglePanel(null);
    return top ? addBookmark(Number(top.el.dataset.i)) : undefined;
  }
  if (t.closest('#bmPick')) return setPicking(true);
  if (t.closest('#bmExport')) return exportBookmarks();
  if (t.closest('#bmImport')) return $('#bmFile').click();
  if (t.closest('#bmBtn')) return togglePanel('bookmarks');
  const w = t.closest('.w');
  if (w) { e.stopPropagation(); w === activeWord ? closePop() : openPop(w); return; }
  if (t.closest('[data-close]')) return closePop();
  const copy = t.closest('[data-copy]');
  if (copy) { navigator.clipboard?.writeText(copy.dataset.copy); copy.textContent = 'Copied'; return; }
  const tr = t.closest('.tr');
  if (tr && settings.tr === 'reveal') { tr.classList.toggle('open'); return; }
  const go = t.closest('[data-go]');
  if (go) { history.replaceState(null, '', ' '); renderChapter(Number(go.dataset.go)); togglePanel(null); return; }
  const segBtn = t.closest('.seg button');
  if (segBtn) return set(segBtn.closest('.seg').dataset.setting, segBtn.dataset.v);
  if (t.closest('#trBtn')) return cycle('tr');
  if (t.closest('#furiBtn')) return cycle('furi');
  if (!t.closest('#pop')) closePop();
});

$('#voice').addEventListener('change', (e) => set('voice', e.target.value));
$('#rate').addEventListener('input', (e) => set('rate', Number(e.target.value)));
addEventListener('pagehide', () => speech.stop());
$('#bmFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importBookmarks(f); e.target.value = ''; });
$('#size').addEventListener('input', (e) => set('size', Number(e.target.value)));
$('#trSize').addEventListener('input', (e) => set('trSize', Number(e.target.value)));

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tr') && settings.tr === 'reveal') {
    e.target.classList.toggle('open');
    return e.preventDefault();
  }
  if (!book) {
    if (e.key.toLowerCase() === 's') togglePanel('settings');
    else if (e.key.toLowerCase() === 'c') togglePanel('toc');
    else if (e.key === 'Escape') togglePanel(null);
    return;
  }
  const idx = book.chapters.findIndex((c) => c.n === settings.chapter);
  switch (e.key.toLowerCase()) {
    case 't': cycle('tr'); break;
    case 'f': cycle('furi'); break;
    case 's': togglePanel('settings'); break;
    case 'c': togglePanel('toc'); break;
    case 'b': togglePanel('bookmarks'); break;
    case 'p': if (!player.open) startPlayer(); else if (player.playing) pausePlayer(); else resumePlayer(); break;
    case '[': if (player.open) step(-1); else return; break;
    case ']': if (player.open) step(1); else return; break;
    case 'escape': closePop(); togglePanel(null); setPicking(false); stopPlayer(); break;
    case 'arrowleft': if (book.chapters[idx - 1]) renderChapter(book.chapters[idx - 1].n); break;
    case 'arrowright': if (book.chapters[idx + 1]) renderChapter(book.chapters[idx + 1].n); break;
    default: return;
  }
  e.preventDefault();
});

/* ---------------- startup ---------------- */

// Positions saved before multi-book support used "pos:<n>"; move them under the first book.
try {
  for (const k of Object.keys(localStorage)) {
    const m = k.match(/^tdh:pos:(\d+)$/);
    if (m) { localStorage.setItem(`tdh:pos:three-days-of-happiness:${m[1]}`, localStorage.getItem(k)); localStorage.removeItem(k); }
  }
} catch { /* storage blocked */ }

async function start() {
  applySettings();
  fillVoices();
  await refreshLibrary();
  // Dev server only: auto-load books built into out/ (never part of a production build).
  if (import.meta.env.DEV && !libraryIndex.length) {
    const ids = await fetch('/__dev/books').then((r) => (r.ok ? r.json() : [])).catch(() => []);
    for (const id of ids) {
      const blob = await fetch(`/out/${id}.book.json`).then((r) => r.blob());
      await library.putBook(await library.parseBookFile(blob));
    }
    if (ids.length) await refreshLibrary();
  }
  const id = libraryIndex.some((b) => b.id === settings.book) ? settings.book : libraryIndex[0]?.id;
  if (!id || !(await openBook(id, id === settings.book ? settings.chapter : undefined))) showWelcome();
  saveBookmarks();
}

start().catch((e) => {
  console.error(e);
  showWelcome();
  toast('Couldn’t open this browser’s book storage (private mode?)');
});

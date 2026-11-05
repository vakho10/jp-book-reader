// Local library: book files the reader loaded, kept in this browser's IndexedDB.
// Nothing is uploaded anywhere: a book file never leaves the device it was opened on.

const DB = 'bilingual-reader';
const STORE = 'books';
export const FORMAT = 'bilingual-reader-book';
export const MAX_VERSION = 1;

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage is full or blocked'));
  }));
}

/** Short descriptions of stored books (no chapter data), sorted by title. */
export async function listBooks() {
  const all = await tx('readonly', (s) => s.getAll());
  return all.map(({ id, title, author, revision, chapters, importedAt }) => ({
    id, title, author, revision, importedAt, chapterCount: chapters.length,
  })).sort((a, b) => (a.title.en || a.title.ja).localeCompare(b.title.en || b.title.ja));
}

export const getBook = (id) => tx('readonly', (s) => s.get(id));
export const deleteBook = (id) => tx('readwrite', (s) => s.delete(id));

/** Validate and store a parsed book object. Returns { book, replaced }. */
export async function putBook(data) {
  const problem = validate(data);
  if (problem) throw new Error(problem);
  const existing = await getBook(data.id).catch(() => null);
  const book = { ...data, importedAt: Date.now() };
  await tx('readwrite', (s) => s.put(book));
  navigator.storage?.persist?.().catch(() => {});
  return { book, replaced: existing ? existing.revision : null };
}

/** Read a .book.json or .book.json.gz File / Blob / Response into an object. */
export async function parseBookFile(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  let text;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open .gz files — use the .book.json file instead');
    text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } else {
    text = await blob.text();
  }
  try { return JSON.parse(text); } catch { throw new Error('That file isn’t valid JSON'); }
}

// Light structural check; the build validates fully against schema/book.schema.json.
function validate(d) {
  if (!d || typeof d !== 'object') return 'Not a book file';
  if (d.format !== FORMAT) return 'Not a book file (expected format "bilingual-reader-book")';
  if (!Number.isInteger(d.version)) return 'Book file has no version';
  if (d.version > MAX_VERSION) return `This book file uses format v${d.version}; this reader supports up to v${MAX_VERSION}. Update the reader.`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id || '')) return 'Book file has an invalid id';
  if (!d.title?.ja && !d.title?.en) return 'Book file has no title';
  if (!Array.isArray(d.chapters) || !d.chapters.length) return 'Book file has no chapters';
  for (const c of d.chapters) {
    if (!Number.isInteger(c.n) || !Array.isArray(c.blocks) || !c.blocks.length) return `Chapter ${c.n ?? '?'} is malformed`;
    const b = c.blocks[0];
    if (!Array.isArray(b.ja) || !Array.isArray(b.ja[0]?.tokens) || typeof b.en !== 'string') return `Chapter ${c.n} has malformed blocks`;
  }
  return null;
}

// Heroicons (MIT, https://heroicons.com), inlined at build time.
import bars3 from 'heroicons/24/outline/bars-3.svg?raw';
import adjustments from 'heroicons/24/outline/adjustments-horizontal.svg?raw';
import bookmark from 'heroicons/24/outline/bookmark.svg?raw';
import bookmarkSolid from 'heroicons/24/solid/bookmark.svg?raw';
import bookmarkSlash from 'heroicons/24/outline/bookmark-slash.svg?raw';
import xMark from 'heroicons/24/outline/x-mark.svg?raw';
import external from 'heroicons/24/outline/arrow-top-right-on-square.svg?raw';
import copy from 'heroicons/24/outline/document-duplicate.svg?raw';
import trash from 'heroicons/24/outline/trash.svg?raw';
import download from 'heroicons/24/outline/arrow-down-tray.svg?raw';
import upload from 'heroicons/24/outline/arrow-up-tray.svg?raw';
import chevronLeft from 'heroicons/24/outline/chevron-left.svg?raw';
import chevronRight from 'heroicons/24/outline/chevron-right.svg?raw';
import cursor from 'heroicons/24/outline/cursor-arrow-rays.svg?raw';
import plus from 'heroicons/24/outline/plus.svg?raw';
import speaker from 'heroicons/24/outline/speaker-wave.svg?raw';
import play from 'heroicons/24/solid/play.svg?raw';
import pause from 'heroicons/24/solid/pause.svg?raw';
import backward from 'heroicons/24/solid/backward.svg?raw';
import forward from 'heroicons/24/solid/forward.svg?raw';
import repeat from 'heroicons/24/outline/arrow-path.svg?raw';

const ICONS = {
  'bars-3': bars3, adjustments, bookmark, 'bookmark-solid': bookmarkSolid, 'bookmark-slash': bookmarkSlash,
  'x-mark': xMark, external, copy, trash, download, upload,
  'chevron-left': chevronLeft, 'chevron-right': chevronRight, cursor, plus,
  speaker, play, pause, backward, forward, repeat,
};

/** Inline SVG markup for an icon, sized by the given classes (default size-5). */
export function icon(name, cls = 'size-5') {
  return ICONS[name].replace('<svg ', `<svg class="${cls} shrink-0" `).replace(/\n\s*/g, ' ');
}

/** Replace every <i data-icon="name" class="..."> placeholder in the document. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, el.className || 'size-5'); });
}

/* find.js — in-document search over already-rendered DOM.

   Matches are wrapped in <mark> by splitting text nodes, so nothing is
   re-parsed from a string and no innerHTML is written. Undo restores the
   original text nodes exactly. */

import { el } from './ui.js';

/** Literal matches in the original UTF-16 text, without offsets drifting when
    case conversion changes a character's length (for example capital İ). */
export function findTextMatches(value, query) {
  const needle = String(query || '').trim();
  if (!needle) return [];
  const pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(String(value).matchAll(new RegExp(pattern, 'giu')), (match) => ({
    start: match.index, end: match.index + match[0].length,
  }));
}

export class Finder {
  constructor(container) {
    this.container = container;
    this.marks = [];
    this.index = -1;
  }

  clear() {
    this.marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
    this.marks = [];
    this.index = -1;
  }

  /** Highlight every case-insensitive occurrence. Returns the match count. */
  search(query) {
    this.clear();
    const needle = String(query || '').trim();
    if (!needle || !this.container) return 0;

    const walker = document.createTreeWalker(this.container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const tag = node.parentNode && node.parentNode.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const targets = [];
    let node = walker.nextNode();
    while (node) { targets.push(node); node = walker.nextNode(); }

    targets.forEach((textNode) => {
      let cursor = textNode;
      let offset = 0;
      for (const match of findTextMatches(textNode.nodeValue, needle)) {
        const after = cursor.splitText(match.start - offset);
        const rest = after.splitText(match.end - match.start);
        const mark = el('mark', { text: after.nodeValue });
        after.parentNode.replaceChild(mark, after);
        this.marks.push(mark);
        cursor = rest;
        offset = match.end;
      }
    });

    if (this.marks.length) this.go(0);
    return this.marks.length;
  }

  go(index) {
    if (!this.marks.length) return;
    this.index = ((index % this.marks.length) + this.marks.length) % this.marks.length;
    const target = this.marks[this.index];
    try { target.scrollIntoView({ block: 'center' }); } catch { target.scrollIntoView(); }
  }

  next() { this.go(this.index + 1); }
  previous() { this.go(this.index - 1); }
}

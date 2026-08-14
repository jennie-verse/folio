/* handlers/csv.js — read-only CSV and TSV (plan 6-5, decision 0-D).

   No cell editing, no sorting, no filtering. The delimiter is detected and can
   be changed; the encoding path is the same one the text viewer uses, because
   a Korean CSV out of Excel is usually CP949. */

import { el, clear, choose, toast, formatCount } from '../ui.js';
import { decodeBlob, ENCODINGS, labelFor } from './encoding.js';

export const kinds = ['csv'];

const DELIMITERS = [
  { value: ',', label: 'Comma  ,' },
  { value: '\t', label: 'Tab' },
  { value: ';', label: 'Semicolon  ;' },
  { value: '|', label: 'Pipe  |' },
];

const VIRTUAL_ROWS = 400;   // rendered at once; more are appended on scroll

const yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Search large tables without monopolizing the main thread. Options are
    injectable so the yielding and cancellation contract can be exercised in
    Node without a browser clock. A cancelled search returns null. */
export async function findRowsChunked(rows, value, {
  budgetMs = 8,
  now = () => performance.now(),
  yieldControl = yieldToMain,
  isCancelled = () => false,
} = {}) {
  const needle = String(value || '').trim().toLocaleLowerCase();
  if (!needle) return [];
  const hits = [];
  let sliceStarted = now();
  for (let index = 0; index < rows.length; index += 1) {
    if (isCancelled()) return null;
    if ((rows[index] || []).some((cell) => String(cell).toLocaleLowerCase().includes(needle))) hits.push(index);
    if ((index + 1) % 32 === 0 && now() - sliceStarted >= budgetMs) {
      await yieldControl();
      if (isCancelled()) return null;
      sliceStarted = now();
    }
  }
  return hits;
}

function parse(text, delimiter) {
  const result = window.Papa.parse(text, {
    delimiter: delimiter || '',       // '' lets papaparse detect
    skipEmptyLines: 'greedy',
    newline: '',
  });
  return { rows: result.data || [], delimiter: (result.meta && result.meta.delimiter) || delimiter || ',' };
}

export async function extractText(blob, doc) {
  const decoded = await decodeBlob(blob, doc && doc.encoding);
  const parsed = parse(decoded.text, doc && doc.delimiter);
  return {
    text: decoded.text,
    patch: {
      encoding: decoded.encoding,
      delimiter: parsed.delimiter,
      rowCount: Math.max(0, parsed.rows.length - 1),
    },
  };
}

export async function render(ctx) {
  const { body, doc, blob } = ctx;
  let encoding = doc.encoding || '';
  let delimiter = doc.delimiter || '';

  const wrap = el('div', { class: 'csvwrap' });
  const table = el('table', { class: 'csv' });
  const thead = el('thead');
  const tbody = el('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);
  wrap.appendChild(table);

  let rows = [];
  let painted = 0;
  let renderedStart = 0;
  let saveTimer = null;
  let searchMatches = [];
  let searchAt = -1;
  let searchGeneration = 0;

  function rowNode(row, index) {
    const line = el('tr', { dataset: { row: String(index + 1) } });
    line.appendChild(el('th', { scope: 'row', text: formatCount(index + 1) }));
    (row || []).forEach((cell) => line.appendChild(el('td', { text: cell })));
    return line;
  }

  function appendRows(count) {
    const limit = Math.min(rows.length, painted + count);
    for (let i = painted; i < limit; i += 1) {
      tbody.appendChild(rowNode(rows[i], i));
    }
    painted = limit;
    ctx.setBottomText(`Row ${formatCount(Math.min(painted, rows.length))} / ${formatCount(rows.length)}`);
  }

  function showWindow(start) {
    renderedStart = Math.max(0, Math.min(rows.length - 1, start));
    painted = renderedStart;
    clear(tbody);
    appendRows(VIRTUAL_ROWS);
  }

  function currentRowInfo() {
    const visible = Array.from(tbody.querySelectorAll('tr')).find((row) => row.offsetTop + row.offsetHeight >= wrap.scrollTop);
    return {
      row: Number(visible && visible.dataset.row) || Math.min(rows.length, renderedStart + 1),
      offset: visible ? wrap.scrollTop - visible.offsetTop : 0,
    };
  }

  async function savePosition() {
    const { row, offset } = currentRowInfo();
    await ctx.saveReading({
      row,
      rowOffset: offset,
      rowRatio: rows.length ? row / rows.length : 0,
      scrollTop: wrap.scrollTop,
      scrollLeft: wrap.scrollLeft,
      progress: rows.length ? row / rows.length : 0,
    });
  }

  function paintShadows() {
    wrap.classList.toggle('scroll-left', wrap.scrollLeft > 1);
    wrap.classList.toggle('scroll-right', wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1);
  }

  async function paint() {
    const decoded = await decodeBlob(blob, encoding);
    encoding = decoded.encoding;
    const parsed = parse(decoded.text, delimiter);
    delimiter = parsed.delimiter;

    const all = parsed.rows;
    const header = all.length ? all[0] : [];
    rows = all.slice(1);
    painted = 0;
    renderedStart = 0;

    clear(thead);
    clear(tbody);
    const head = el('tr');
    head.appendChild(el('th', { scope: 'col', text: '#' }));
    header.forEach((cell) => head.appendChild(el('th', { scope: 'col', text: cell })));
    thead.appendChild(head);
    appendRows(VIRTUAL_ROWS);
  }

  wrap.addEventListener('scroll', () => {
    paintShadows();
    if (painted < rows.length && wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 400) appendRows(VIRTUAL_ROWS);
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { savePosition().catch(() => {}); }, 250);
  }, { passive: true });

  body.classList.remove('pad');
  clear(body);
  body.appendChild(wrap);
  await paint();
  const state = await ctx.readingState();
  const restoreRow = Math.max(1, Math.min(rows.length || 1, Number(state.row) || Math.round(Number(state.rowRatio || 0) * rows.length) || 1));
  if (restoreRow > painted) showWindow(Math.max(0, restoreRow - 1));
  requestAnimationFrame(() => {
    const target = tbody.querySelector(`[data-row="${restoreRow}"]`);
    wrap.scrollTop = restoreRow > VIRTUAL_ROWS && target
      ? target.offsetTop + Number(state.rowOffset || 0)
      : Number(state.scrollTop || 0);
    wrap.scrollLeft = Number(state.scrollLeft || 0);
    paintShadows();
  });

  const finder = {
    async search(value) {
      const generation = ++searchGeneration;
      const matches = await findRowsChunked(rows, value, {
        isCancelled: () => generation !== searchGeneration,
      });
      if (matches === null || generation !== searchGeneration) return null;
      searchMatches = matches;
      searchAt = searchMatches.length ? 0 : -1;
      if (searchAt >= 0) this.show();
      return searchMatches.length;
    },
    show() {
      const index = searchMatches[searchAt];
      if (index === undefined) return;
      showWindow(Math.max(0, index - Math.floor(VIRTUAL_ROWS / 3)));
      requestAnimationFrame(() => {
        const target = tbody.querySelector(`[data-row="${index + 1}"]`);
        if (target) target.scrollIntoView({ block: 'center' });
      });
    },
    next() { if (searchMatches.length) { searchAt = (searchAt + 1) % searchMatches.length; this.show(); } },
    previous() { if (searchMatches.length) { searchAt = (searchAt - 1 + searchMatches.length) % searchMatches.length; this.show(); } },
    clear() { searchGeneration += 1; searchMatches = []; searchAt = -1; },
  };

  return {
    finder,
    tools: [
      el('button', {
        type: 'button', text: 'Find',
        onclick: () => ctx.openFind(finder),
      }),
      el('button', {
        type: 'button', text: 'Columns',
        onclick: async () => {
          const picked = await choose('Columns', [
            { value: 'auto', label: 'Auto' },
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
          ], wrap.dataset.columns || 'auto');
          if (!picked) return;
          wrap.dataset.columns = picked;
          const header = thead.querySelectorAll('th');
          toast(`${formatCount(Math.max(0, header.length - 1))} columns · ${formatCount(rows.length)} rows`);
        },
      }),
      el('button', {
        type: 'button', text: 'Delimiter',
        onclick: async () => {
          const picked = await choose('Delimiter', DELIMITERS, delimiter);
          if (!picked || picked === delimiter) return;
          delimiter = picked;
          await paint();
          await ctx.patchDoc({ delimiter, rowCount: rows.length });
        },
      }),
      el('button', {
        type: 'button', text: 'Encoding',
        onclick: async () => {
          const picked = await choose('Encoding', ENCODINGS.map((value) => ({ value, label: labelFor(value) })), encoding);
          if (!picked || picked === encoding) return;
          encoding = picked;
          await paint();
          await ctx.patchDoc({ encoding });
          toast(`Reading as ${labelFor(encoding)}.`);
        },
      }),
    ],
    async flush() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      await savePosition();
    },
    destroy() { if (saveTimer) clearTimeout(saveTimer); finder.clear(); },
  };
}

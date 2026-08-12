/* handlers/csv.js — read-only CSV and TSV (plan 6-5, decision 0-D).

   No cell editing, no sorting, no filtering. The delimiter is detected and can
   be changed; the encoding path is the same one the text viewer uses, because
   a Korean CSV out of Excel is usually CP949. */

import { el, clear, choose, toast, formatCount } from '../ui.js';
import { decodeBlob, ENCODINGS, labelFor } from './encoding.js';
import { Finder } from '../find.js';

export const kinds = ['csv'];

const DELIMITERS = [
  { value: ',', label: 'Comma  ,' },
  { value: '\t', label: 'Tab' },
  { value: ';', label: 'Semicolon  ;' },
  { value: '|', label: 'Pipe  |' },
];

const VIRTUAL_ROWS = 400;   // rendered at once; more are appended on scroll

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

  const finder = new Finder(tbody);
  let rows = [];
  let painted = 0;

  function appendRows(count) {
    const limit = Math.min(rows.length, painted + count);
    for (let i = painted; i < limit; i += 1) {
      const line = el('tr');
      line.appendChild(el('th', { scope: 'row', text: formatCount(i) }));
      (rows[i] || []).forEach((cell) => line.appendChild(el('td', { text: cell })));
      tbody.appendChild(line);
    }
    painted = limit;
    ctx.setBottomText(`Row ${formatCount(Math.min(painted, rows.length))} / ${formatCount(rows.length)}`);
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

    clear(thead);
    clear(tbody);
    const head = el('tr');
    head.appendChild(el('th', { scope: 'col', text: '#' }));
    header.forEach((cell) => head.appendChild(el('th', { scope: 'col', text: cell })));
    thead.appendChild(head);
    appendRows(VIRTUAL_ROWS);
  }

  wrap.addEventListener('scroll', () => {
    if (painted >= rows.length) return;
    if (wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 400) appendRows(VIRTUAL_ROWS);
  }, { passive: true });

  body.classList.remove('pad');
  clear(body);
  body.appendChild(wrap);
  await paint();

  return {
    finder,
    tools: [
      el('button', {
        type: 'button', text: 'Find',
        onclick: () => { appendRows(rows.length); ctx.openFind(finder); },
      }),
      el('button', {
        type: 'button', text: 'Columns',
        onclick: () => {
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
    destroy() { finder.clear(); },
  };
}

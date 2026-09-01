/* diagram.js — a small, CSP-safe renderer for the flowchart subset BSB (and
   similar prompts) actually emit: node shapes, labelled/dashed edges,
   subgraphs, and classDef/class colouring. Not a Mermaid clone — anything
   outside this subset is reported via {error} so the caller can fall back to
   showing the original code block (markdown.js does exactly that).

   Design constraints (see Plan/folio_bsb-reading-plan):
     - No inline <style>, no <script> — every colour is a presentation
       attribute (fill=, stroke=) so the shell CSP (style-src 'self') is
       never touched and nothing here can violate it.
     - Pure functions: parse() and layout() take/return plain data, so both
       are unit-testable under Node without a DOM. render() is the only
       function that touches `document`.
*/

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const DIRECTIONS = new Set(['TB', 'TD', 'BT', 'RL', 'LR']);

const SHAPE_OPENERS = [
  { open: '[[', close: ']]', shape: 'subroutine' },
  { open: '(([', close: '])', shape: 'circle' }, // never matches; placeholder removed below
  { open: '([', close: '])', shape: 'stadium' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'round' },
  { open: '{', close: '}', shape: 'diamond' },
];

const ARROW_TOKENS = [
  // Longest / most specific first.
  { re: /^-\.-\>/, style: 'dotted', arrow: true },
  { re: /^==\>/, style: 'thick', arrow: true },
  { re: /^--x/i, style: 'solid', arrow: 'x' },
  { re: /^--o/i, style: 'solid', arrow: 'o' },
  { re: /^-\.-/, style: 'dotted', arrow: false },
  { re: /^===/, style: 'thick', arrow: false },
  { re: /^--\>/, style: 'solid', arrow: true },
  { re: /^---/, style: 'solid', arrow: false },
];

// A hyphen is part of the id only when it is NOT the start of an arrow token
// (`-->`, `--x`, `---`, …) butted up against the id with no space — the
// common case in generator output like BSB's. Without the lookahead, "A-->B"
// greedily eats "A--" as the id and leaves a bare ">" the arrow scanner
// cannot recognise.
const ID_RE = /^[A-Za-z][A-Za-z0-9_]*(?:-(?![-.=>])[A-Za-z0-9_]+)*/;

class ParseError extends Error {}

function stripComments(source) {
  return source
    .split('\n')
    .map((line) => (/^\s*%%/.test(line) ? '' : line))
    .join('\n');
}

/** Split "flowchart TD" style header off the first non-empty line. */
function readHeader(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const match = /^(flowchart|graph)\s+([A-Za-z]{2})\b/i.exec(trimmed);
    if (!match) throw new ParseError('The first line is not a flowchart declaration.');
    const dir = match[2].toUpperCase();
    if (!DIRECTIONS.has(dir)) throw new ParseError(`Unsupported direction: ${dir}`);
    return { direction: dir === 'TD' ? 'TB' : dir, startLine: i + 1 };
  }
  throw new ParseError('There is no content.');
}

function unquote(text) {
  const trimmed = text.trim();
  const m = /^"([\s\S]*)"$/.exec(trimmed);
  return (m ? m[1] : trimmed).replace(/<br\s*\/?>/gi, '\n');
}

/** Read one shape token e.g. `["Label"]` starting at position i. Returns
    {shape, label, next} or null if there is no shape token here (bare id). */
function readShape(text, i) {
  for (const { open, close, shape } of SHAPE_OPENERS) {
    if (text.startsWith(open, i)) {
      const end = text.indexOf(close, i + open.length);
      if (end === -1) return null;
      return { shape, label: unquote(text.slice(i + open.length, end)), next: end + close.length };
    }
  }
  return null;
}

/** Read one node reference (id + optional shape) starting at position i.
    Returns {id, shape, label, next} or null. */
function readNode(text, i) {
  const rest = text.slice(i);
  const idMatch = ID_RE.exec(rest);
  if (!idMatch) return null;
  const id = idMatch[0];
  let next = i + id.length;
  const shapeToken = readShape(text, next);
  if (shapeToken) return { id, shape: shapeToken.shape, label: shapeToken.label, next: shapeToken.next };
  // `A:::className` inline class, no shape.
  return { id, shape: null, label: null, next };
}

/** Read an arrow token (and optional `|label|` or `-- label --`) starting at
    position i. Returns {style, arrow, label, next} or null. */
function readArrow(text, i) {
  const rest = text.slice(i);
  // `-- label -->` / `-. label .->` long forms: text between two dashes.
  const longForm = /^(-\.|--|==)\s*([^-.=|>][^\-.=]*?)\s*(\.->|-->|==>|--|\.-|==)/.exec(rest);
  if (longForm && !/^\s*$/.test(longForm[2])) {
    const closer = longForm[3];
    const style = longForm[1] === '-.' ? 'dotted' : longForm[1] === '==' ? 'thick' : 'solid';
    const arrow = /^>$|>$/.test(closer) || closer.endsWith('>');
    return { style, arrow: Boolean(arrow), label: longForm[2].trim(), next: i + longForm[0].length };
  }
  for (const token of ARROW_TOKENS) {
    if (token.re.test(rest)) {
      const matched = token.re.exec(rest)[0];
      let next = i + matched.length;
      let label = '';
      const pipeMatch = /^\|([^|]*)\|/.exec(text.slice(next));
      if (pipeMatch) { label = pipeMatch[1].trim(); next += pipeMatch[0].length; }
      return { style: token.style, arrow: token.arrow, label, next };
    }
  }
  return null;
}

function skipSpace(text, i) {
  let j = i;
  while (j < text.length && /\s/.test(text[j])) j += 1;
  return j;
}

/** Parse one statement line into a list of {type, ...} ops. A single line can
    hold a whole chain (`A --> B --> C`) or fan-out (`A & B --> C`). */
function parseChainLine(rawLine, graph) {
  let text = rawLine.trim();
  if (!text) return;

  // classDef nodeClass fill:#fff,stroke:#000,color:#000;
  let m = /^classDef\s+([A-Za-z0-9_\-]+)\s+(.+?);?$/.exec(text);
  if (m) {
    const style = {};
    m[2].split(',').forEach((pair) => {
      const [key, value] = pair.split(':').map((s) => s && s.trim());
      if (key && value) style[key] = value;
    });
    graph.classDefs.set(m[1], style);
    return;
  }

  // class A,B,C className;
  m = /^class\s+([A-Za-z0-9_\-,\s]+?)\s+([A-Za-z0-9_\-]+);?$/.exec(text);
  if (m) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((id) => graph.classAssign.set(id, m[2]));
    return;
  }

  if (/^direction\s+/i.test(text)) return; // per-subgraph direction: accepted, ignored (single-axis layout)

  // Fan-out `A & B --> C & D` — expand into a full cross product of simple edges.
  let i = 0;
  const leftIds = [];
  const rightGroups = []; // array of {ids, arrow}
  let cursor = 0;

  function readGroup(startAt) {
    const ids = [];
    let pos = startAt;
    for (;;) {
      pos = skipSpace(text, pos);
      const node = readNode(text, pos);
      if (!node) throw new ParseError(`Could not read a node here: "${text.slice(pos, pos + 20)}"`);
      registerNode(graph, node);
      ids.push(node.id);
      pos = skipSpace(text, node.next);
      if (text[pos] === ':' && text.slice(pos, pos + 3) === ':::') {
        const clsMatch = /^:::([A-Za-z0-9_\-]+)/.exec(text.slice(pos));
        if (clsMatch) { graph.classAssign.set(node.id, clsMatch[1]); pos += clsMatch[0].length; }
        pos = skipSpace(text, pos);
      }
      if (text[pos] === '&') { pos = skipSpace(text, pos + 1); continue; }
      break;
    }
    return { ids, next: pos };
  }

  const first = readGroup(0);
  leftIds.push(...first.ids);
  cursor = first.next;

  let hasEdge = false;
  for (;;) {
    cursor = skipSpace(text, cursor);
    if (cursor >= text.length) break;
    const arrow = readArrow(text, cursor);
    if (!arrow) throw new ParseError(`Could not read an arrow here: "${text.slice(cursor, cursor + 12)}"`);
    hasEdge = true;
    cursor = skipSpace(text, arrow.next);
    const group = readGroup(cursor);
    // Connect every id accumulated so far (leftIds) to every id in this group.
    leftIds.forEach((from) => {
      group.ids.forEach((to) => {
        graph.edges.push({ from, to, style: arrow.style, arrow: arrow.arrow, label: arrow.label || '' });
      });
    });
    leftIds.length = 0;
    leftIds.push(...group.ids);
    cursor = group.next;
  }

  if (!hasEdge && leftIds.length === 1) return; // bare node declaration, already registered
  if (!hasEdge && leftIds.length > 1) return; // `A & B` with no edge: both declared, nothing to connect
}

function registerNode(graph, node) {
  if (graph.nodes.has(node.id)) {
    // A later mention with a real label/shape upgrades an earlier bare id.
    const existing = graph.nodes.get(node.id);
    if (node.label != null) existing.label = node.label;
    if (node.shape) existing.shape = node.shape;
    return;
  }
  graph.nodes.set(node.id, {
    id: node.id,
    label: node.label != null ? node.label : node.id,
    shape: node.shape || 'rect',
  });
}

/**
 * Parse a Mermaid-flowchart-subset source string.
 * @returns {{ok:true, graph:object} | {ok:false, reason:string}}
 */
export function parse(source) {
  try {
    const cleaned = stripComments(String(source || ''));
    const lines = cleaned.split('\n');
    const { direction, startLine } = readHeader(lines);

    const graph = {
      direction,
      nodes: new Map(),
      edges: [],
      classDefs: new Map(),
      classAssign: new Map(),
      subgraphs: [], // {id, label, nodeIds:Set, parent|null}
    };

    const stack = [];
    for (let i = startLine; i < lines.length; i += 1) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed) continue;

      const subgraphMatch = /^subgraph\s+(.+)$/i.exec(trimmed);
      if (subgraphMatch) {
        const rest = subgraphMatch[1].trim();
        let id = rest;
        let label = rest;
        const withLabel = readShape(rest, ID_RE.test(rest) ? ID_RE.exec(rest)[0].length : 0);
        const idMatch = ID_RE.exec(rest);
        if (idMatch) {
          const shapeToken = readShape(rest, idMatch[0].length);
          id = idMatch[0];
          label = shapeToken ? shapeToken.label : rest.slice(idMatch[0].length).trim() || idMatch[0];
        } else {
          id = `sg${graph.subgraphs.length}`;
        }
        const node = { id, label, nodeIds: new Set(), children: [], parent: stack.length ? stack[stack.length - 1].id : null };
        graph.subgraphs.push(node);
        if (stack.length) stack[stack.length - 1].children.push(id);
        stack.push(node);
        continue;
      }
      if (/^end$/i.test(trimmed)) {
        if (!stack.length) throw new ParseError('An "end" has no matching subgraph.');
        stack.pop();
        continue;
      }

      const beforeCount = graph.nodes.size;
      parseChainLine(trimmed, graph);
      if (stack.length) {
        const scope = stack[stack.length - 1];
        // Any node newly touched (or already touched) on this line that
        // isn't inside a nested subgraph belongs to the innermost open one.
        graph.nodes.forEach((_, id) => {
          if (raw.includes(id)) scope.nodeIds.add(id);
        });
      }
      void beforeCount;
    }
    if (stack.length) throw new ParseError('A subgraph is missing its "end".');
    if (!graph.nodes.size) throw new ParseError('No nodes were found.');

    return { ok: true, graph };
  } catch (err) {
    if (err instanceof ParseError) return { ok: false, reason: err.message };
    return { ok: false, reason: '알 수 없는 형식입니다.' };
  }
}

// ---------------------------------------------------------------------------
// Layout — a small layered (Sugiyama-style) DAG layout.
// Cross-links (dotted edges) are excluded from layering so a conflict/limit
// relation between distant branches never distorts the tree shape; they are
// still drawn, routed after the layered nodes are placed.
// ---------------------------------------------------------------------------

const NODE_H_PAD = 18;
const NODE_V_PAD = 12;
const LINE_HEIGHT = 15;
const LAYER_GAP = 64;
const NODE_GAP = 20;
const SUBGRAPH_PAD = 16;
const SUBGRAPH_LABEL_H = 22;
const MAX_LABEL_CHARS_PER_LINE = 16;

function isKoreanChar(ch) {
  const code = ch.codePointAt(0);
  return (code >= 0xac00 && code <= 0xd7a3) || (code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f);
}

/** Word-wrap a label. Korean text wraps by syllable block when no spaces are
    present; Latin text wraps on spaces. Falls back to a fixed character
    budget when no measurement function is available (e.g. under Node). */
function wrapLabel(label, measure) {
  const paragraphs = String(label).split('\n');
  const lines = [];
  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/(\s+)/).filter((w) => w !== '');
    let current = '';
    const flush = () => { if (current) { lines.push(current); current = ''; } };
    const fits = (text) => (measure ? measure(text) <= 200 : text.length <= MAX_LABEL_CHARS_PER_LINE);
    words.forEach((word) => {
      if (/^\s+$/.test(word)) { current += ' '; return; }
      const candidate = (current + word).trim();
      if (current && !fits(candidate)) { flush(); current = word; return; }
      if (!fits(word) && [...word].some(isKoreanChar)) {
        // Long unspaced Korean run: break by character budget.
        flush();
        let chunk = '';
        for (const ch of word) {
          if (chunk && !fits(chunk + ch)) { lines.push(chunk); chunk = ch; } else chunk += ch;
        }
        current = chunk;
        return;
      }
      current = candidate || word;
    });
    flush();
  });
  return lines.length ? lines : [''];
}

/** Longest-path layering over the DAG formed by non-dotted edges. */
function computeLayers(graph) {
  const layerEdges = graph.edges.filter((e) => e.style !== 'dotted');
  const ids = [...graph.nodes.keys()];
  const indegree = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));
  layerEdges.forEach((e) => {
    if (!adj.has(e.from) || !indegree.has(e.to)) return;
    adj.get(e.from).push(e.to);
    indegree.set(e.to, (indegree.get(e.to) || 0) + 1);
  });
  const layer = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const visited = new Set();
  let guard = 0;
  while (queue.length && guard < ids.length * ids.length + 10) {
    guard += 1;
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    (adj.get(id) || []).forEach((next) => {
      layer.set(next, Math.max(layer.get(next) || 0, layer.get(id) + 1));
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) <= 0 && !visited.has(next)) queue.push(next);
    });
  }
  // Anything left unvisited (a cycle) gets appended after the deepest layer
  // it can reach, so the drawing still terminates.
  ids.forEach((id) => { if (!visited.has(id)) layer.set(id, layer.get(id) || 0); });
  return layer;
}

/** Reduce edge crossings between adjacent layers with a few barycenter passes. */
function orderLayers(graph, layer) {
  const byLayer = new Map();
  graph.nodes.forEach((_, id) => {
    const l = layer.get(id) || 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l).push(id);
  });
  const maxLayer = Math.max(0, ...byLayer.keys());
  for (let l = 0; l <= maxLayer; l += 1) if (!byLayer.has(l)) byLayer.set(l, []);

  const layerEdges = graph.edges.filter((e) => e.style !== 'dotted' && graph.nodes.has(e.from) && graph.nodes.has(e.to));
  const position = new Map();
  byLayer.forEach((ids) => ids.forEach((id, idx) => position.set(id, idx)));

  function barycenterPass(forward) {
    const order = forward ? [...byLayer.keys()].sort((a, b) => a - b) : [...byLayer.keys()].sort((a, b) => b - a);
    order.forEach((l) => {
      const ids = byLayer.get(l);
      const scores = new Map();
      ids.forEach((id) => {
        const neighborLayer = forward ? l - 1 : l + 1;
        const neighbors = layerEdges
          .filter((e) => (forward ? e.to === id && (layer.get(e.from) || 0) === neighborLayer : e.from === id && (layer.get(e.to) || 0) === neighborLayer))
          .map((e) => position.get(forward ? e.from : e.to))
          .filter((v) => v != null);
        scores.set(id, neighbors.length ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length : position.get(id));
      });
      ids.sort((a, b) => scores.get(a) - scores.get(b));
      ids.forEach((id, idx) => position.set(id, idx));
    });
  }
  for (let pass = 0; pass < 4; pass += 1) barycenterPass(pass % 2 === 0);

  return byLayer;
}

/**
 * Compute a full layout: node boxes, subgraph bounding boxes, edge points.
 * `measure(text)` optionally measures label width in px (canvas-backed);
 * without it a monospace-ish estimate is used, which is fine for tests.
 */
export function layout(graph, measure, measureEdgeLabel) {
  const measureLabel = measureEdgeLabel || measure;
  const layer = computeLayers(graph);
  const byLayer = orderLayers(graph, layer);

  const nodeBoxes = new Map();
  graph.nodes.forEach((node, id) => {
    const lines = wrapLabel(node.label, measure);
    const charWidth = measure ? null : 7.2;
    const widths = lines.map((line) => (measure ? measure(line) * 1.12 : line.length * charWidth));
    const w = Math.max(48, Math.ceil(Math.max(0, ...widths) + NODE_H_PAD * 2));
    const h = Math.max(36, lines.length * LINE_HEIGHT + NODE_V_PAD * 2);
    nodeBoxes.set(id, { id, lines, w, h, shape: node.shape });
  });

  const horizontal = graph.direction === 'LR' || graph.direction === 'RL';
  const maxLayer = Math.max(0, ...byLayer.keys());

  // Cross-axis size per layer (max node extent in that layer), primary-axis
  // extent is the max node depth in that layer.
  const layerPrimary = new Map();
  byLayer.forEach((ids, l) => {
    const extent = Math.max(0, ...ids.map((id) => (horizontal ? nodeBoxes.get(id).w : nodeBoxes.get(id).h)));
    layerPrimary.set(l, extent || 36);
  });

  const layerOffset = new Map();
  let running = 0;
  for (let l = 0; l <= maxLayer; l += 1) {
    layerOffset.set(l, running);
    running += layerPrimary.get(l) + LAYER_GAP;
  }
  const totalPrimary = Math.max(0, running - LAYER_GAP);

  // A labelled edge directly joining two same-layer siblings needs more than
  // NODE_GAP between them, or its label sits on top of one node's own text
  // (found by rendering an actual BSB brief — a short cross-link between two
  // adjacent nodes is common). The gap is widened only for that one pair.
  const siblingGapKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const siblingLabelGap = new Map();
  graph.edges.forEach((e) => {
    if (!e.label || !nodeBoxes.has(e.from) || !nodeBoxes.has(e.to)) return;
    if ((layer.get(e.from) || 0) !== (layer.get(e.to) || 0)) return; // only same-layer neighbours
    const raw = measureLabel ? measureLabel(e.label) : e.label.length * 7.5;
    const needed = raw * 1.12 + 24;
    const key = siblingGapKey(e.from, e.to);
    siblingLabelGap.set(key, Math.max(siblingLabelGap.get(key) || 0, needed));
  });
  function gapAfter(ids, idx) {
    if (idx >= ids.length - 1) return 0;
    const extra = siblingLabelGap.get(siblingGapKey(ids[idx], ids[idx + 1]));
    return extra ? Math.max(NODE_GAP, extra) : NODE_GAP;
  }
  function rowExtentOf(ids) {
    const sizes = ids.map((id) => (horizontal ? nodeBoxes.get(id).h : nodeBoxes.get(id).w));
    let total = sizes.reduce((a, b) => a + b, 0);
    ids.forEach((_, idx) => { total += gapAfter(ids, idx); });
    return total;
  }

  const positions = new Map();
  byLayer.forEach((ids, l) => {
    let cross = 0;
    ids.forEach((id, idx) => {
      const box = nodeBoxes.get(id);
      const size = horizontal ? box.h : box.w;
      const primary = layerOffset.get(l) + layerPrimary.get(l) / 2;
      const crossCenter = cross + size / 2;
      positions.set(id, horizontal
        ? { x: primary, y: crossCenter, cx: primary, cy: crossCenter }
        : { x: crossCenter, y: primary, cx: crossCenter, cy: primary });
      cross += size + gapAfter(ids, idx);
    });
  });

  // Direction flips.
  const nodePlacement = new Map();
  let crossExtentMax = 0;
  byLayer.forEach((ids) => {
    const extent = rowExtentOf(ids);
    crossExtentMax = Math.max(crossExtentMax, extent);
  });

  graph.nodes.forEach((node, id) => {
    const box = nodeBoxes.get(id);
    const pos = positions.get(id);
    let cx = pos.cx;
    let cy = pos.cy;
    if (graph.direction === 'BT') cy = totalPrimary - cy;
    if (graph.direction === 'RL') cx = totalPrimary - cx;
    nodePlacement.set(id, { id, cx, cy, w: box.w, h: box.h, lines: box.lines, shape: box.shape });
  });

  const width = horizontal ? totalPrimary + 8 : crossExtentMax + 8;
  const height = horizontal ? crossExtentMax + 8 : totalPrimary + 8;

  // Subgraph bounding boxes from member node extents.
  const subgraphBoxes = graph.subgraphs.map((sg) => {
    const members = [...sg.nodeIds].map((id) => nodePlacement.get(id)).filter(Boolean);
    if (!members.length) return null;
    const minX = Math.min(...members.map((m) => m.cx - m.w / 2)) - SUBGRAPH_PAD;
    const maxX = Math.max(...members.map((m) => m.cx + m.w / 2)) + SUBGRAPH_PAD;
    const minY = Math.min(...members.map((m) => m.cy - m.h / 2)) - SUBGRAPH_PAD - SUBGRAPH_LABEL_H;
    const maxY = Math.max(...members.map((m) => m.cy + m.h / 2)) + SUBGRAPH_PAD;
    return { id: sg.id, label: sg.label, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }).filter(Boolean);

  const outerWidth = Math.max(width, ...subgraphBoxes.map((b) => b.x + b.w + 8), 0);
  const outerHeight = Math.max(height, ...subgraphBoxes.map((b) => b.y + b.h + 8), 0);
  const minX = Math.min(0, ...subgraphBoxes.map((b) => b.x));
  const minY = Math.min(0, ...subgraphBoxes.map((b) => b.y));
  if (minX < 0 || minY < 0) {
    nodePlacement.forEach((p) => { p.cx -= minX; p.cy -= minY; });
    subgraphBoxes.forEach((b) => { b.x -= minX; b.y -= minY; });
  }

  const edgePoints = graph.edges
    .filter((e) => nodePlacement.has(e.from) && nodePlacement.has(e.to))
    .map((e) => {
      const from = nodePlacement.get(e.from);
      const to = nodePlacement.get(e.to);
      let labelWidth = 0;
      if (e.label) {
        // A 12% safety margin: the font actually available at render time
        // (Lexend, or its Verdana fallback) can measure slightly wider than
        // whatever font this measurement ran under, and an under-sized
        // background box clips the label text it exists to sit behind.
        const raw = measureLabel ? measureLabel(e.label) : [...e.label].reduce((sum, ch) => sum + (isKoreanChar(ch) ? 12.5 : 6.4), 0);
        labelWidth = raw * 1.12;
      }
      return { ...e, x1: from.cx, y1: from.cy, x2: to.cx, y2: to.cy, labelWidth };
    });

  return {
    direction: graph.direction,
    width: outerWidth - minX + 8,
    height: outerHeight - minY + 8,
    nodes: [...nodePlacement.values()],
    subgraphs: subgraphBoxes,
    edges: edgePoints,
  };
}

// ---------------------------------------------------------------------------
// Rendering — SVG built with presentation attributes only (no style/class),
// so nothing here can be blocked by `style-src 'self'`.
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULT_FILL = '#FFFFFF';
const DEFAULT_STROKE = '#8A7780';
const DEFAULT_TEXT = '#4A3A40';
const CROSSLINK_STROKE = '#8E1B5E';
const SUBGRAPH_STROKE = '#B0A0A7';
const SUBGRAPH_TEXT = '#8A7780';

function svgEl(tag, attrs, children) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs || {}).forEach(([key, value]) => { if (value != null) node.setAttribute(key, value); });
  (children || []).forEach((child) => node.appendChild(child));
  return node;
}

function textEl(x, y, lines, opts) {
  const { fill = DEFAULT_TEXT, size = 12, anchor = 'middle', weight } = opts || {};
  const g = svgEl('text', {
    x, y: y - ((lines.length - 1) * LINE_HEIGHT) / 2 + size * 0.35,
    fill, 'font-size': size, 'text-anchor': anchor, 'font-weight': weight,
    'font-family': 'Lexend, Verdana, "Trebuchet MS", "Segoe UI", Arial, sans-serif',
  });
  lines.forEach((line, idx) => {
    const tspan = document.createElementNS(SVG_NS, 'tspan');
    tspan.setAttribute('x', x);
    if (idx > 0) tspan.setAttribute('dy', LINE_HEIGHT);
    tspan.textContent = line;
    g.appendChild(tspan);
  });
  return g;
}

function shapePath(node, style) {
  const { cx, cy, w, h, shape } = node;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const common = { fill: style.fill || DEFAULT_FILL, stroke: style.stroke || DEFAULT_STROKE, 'stroke-width': 1.5 };
  switch (shape) {
    case 'round':
      return svgEl('rect', { x, y, width: w, height: h, rx: Math.min(14, h / 2), ry: Math.min(14, h / 2), ...common });
    case 'stadium':
      return svgEl('rect', { x, y, width: w, height: h, rx: h / 2, ry: h / 2, ...common });
    case 'circle':
      return svgEl('ellipse', { cx, cy, rx: Math.max(w, h) / 2, ry: Math.max(w, h) / 2, ...common });
    case 'diamond': {
      const points = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
      return svgEl('polygon', { points, ...common });
    }
    case 'hexagon': {
      const cut = Math.min(16, w / 4);
      const points = `${x + cut},${y} ${x + w - cut},${y} ${x + w},${cy} ${x + w - cut},${y + h} ${x + cut},${y + h} ${x},${cy}`;
      return svgEl('polygon', { points, ...common });
    }
    case 'subroutine': {
      const g = document.createElementNS(SVG_NS, 'g');
      g.appendChild(svgEl('rect', { x, y, width: w, height: h, ...common }));
      g.appendChild(svgEl('line', { x1: x + 6, y1: y, x2: x + 6, y2: y + h, stroke: common.stroke }));
      g.appendChild(svgEl('line', { x1: x + w - 6, y1: y, x2: x + w - 6, y2: y + h, stroke: common.stroke }));
      return g;
    }
    default:
      return svgEl('rect', { x, y, width: w, height: h, rx: 6, ry: 6, ...common });
  }
}

function styleFor(nodeId, graph) {
  const className = graph.classAssign.get(nodeId);
  if (!className) return {};
  return graph.classDefs.get(className) || {};
}

function arrowMarkerId(kind) { return `folio-diagram-arrow-${kind}`; }

function buildDefs(svg) {
  const defs = svgEl('defs');
  [{ id: 'solid', color: DEFAULT_STROKE }, { id: 'cross', color: CROSSLINK_STROKE }].forEach(({ id, color }) => {
    const marker = svgEl('marker', {
      id: arrowMarkerId(id), viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse',
    }, [svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: color })]);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);
}

function edgePath(edge, nodes) {
  // Straight line, trimmed to each node's border along the line direction so
  // the arrowhead lands on the shape, not its center.
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const trim = (box, sign) => {
    const halfW = box.w / 2 + 2;
    const halfH = box.h / 2 + 2;
    const cos = (dx * sign) || 1e-6;
    const sin = (dy * sign) || 1e-6;
    // Ray-vs-box: distance to the vertical edge (x = halfW) and to the
    // horizontal edge (y = halfH); whichever the ray reaches first is the
    // exit point. Using dx/dy directly (rather than a unit vector) keeps
    // this well-defined even when the edge is perfectly horizontal or
    // vertical, where the old atan2/tan approach divided by zero.
    const tX = Math.abs(halfW / cos);
    const tY = Math.abs(halfH / sin);
    const t = Math.min(tX, tY);
    return { x: box.cx + cos * t, y: box.cy + sin * t };
  };
  const p1 = trim(from, 1);
  const p2 = trim(to, -1);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, midX: (p1.x + p2.x) / 2, midY: (p1.y + p2.y) / 2 };
}

/**
 * Render a parsed+laid-out graph into a detached <svg> element.
 * @param {object} graph  from parse().graph
 * @param {object} layoutResult  from layout()
 * @returns {SVGSVGElement}
 */
export function render(graph, layoutResult) {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${Math.max(1, layoutResult.width)} ${Math.max(1, layoutResult.height)}`,
    width: Math.max(1, Math.round(layoutResult.width)),
    height: Math.max(1, Math.round(layoutResult.height)),
    role: 'img',
    'aria-label': 'Relation diagram',
  });
  buildDefs(svg);

  const nodesByGroup = svgEl('g');
  const edgesByGroup = svgEl('g');
  const edgeLabelsGroup = svgEl('g'); // drawn last: a label between two close
  // nodes (a short cross-link is common — see Plan/folio_bsb-reading-plan)
  // can be wider than the gap between them, and must never be the thing a
  // node's own opaque fill clips.
  const subgraphGroup = svgEl('g');
  svg.appendChild(subgraphGroup);
  svg.appendChild(edgesByGroup);
  svg.appendChild(nodesByGroup);
  svg.appendChild(edgeLabelsGroup);

  layoutResult.subgraphs.forEach((box) => {
    subgraphGroup.appendChild(svgEl('rect', {
      x: box.x, y: box.y, width: box.w, height: box.h, rx: 10, ry: 10,
      fill: 'none', stroke: SUBGRAPH_STROKE, 'stroke-width': 1, 'stroke-dasharray': '4 3',
    }));
    subgraphGroup.appendChild(textEl(box.x + 10, box.y + 14, [box.label], { fill: SUBGRAPH_TEXT, size: 11, anchor: 'start', weight: 700 }));
  });

  const nodeMap = new Map(layoutResult.nodes.map((n) => [n.id, n]));

  layoutResult.edges.forEach((edge) => {
    const dotted = edge.style === 'dotted';
    const path = edgePath(edge, nodeMap);
    const stroke = dotted ? CROSSLINK_STROKE : DEFAULT_STROKE;
    const width = edge.style === 'thick' ? 3 : 1.5;
    const line = svgEl('line', {
      x1: path.x1, y1: path.y1, x2: path.x2, y2: path.y2,
      stroke, 'stroke-width': width,
      'stroke-dasharray': dotted ? '5 4' : null,
      'marker-end': edge.arrow ? `url(#${arrowMarkerId(dotted ? 'cross' : 'solid')})` : null,
    });
    edgesByGroup.appendChild(line);
    if (edge.label) {
      const padX = 5;
      const boxW = (edge.labelWidth || edge.label.length * 8) + padX * 2;
      edgeLabelsGroup.appendChild(svgEl('rect', {
        x: path.midX - boxW / 2, y: path.midY - 8, width: boxW, height: 14,
        fill: '#FDF7F8', stroke: 'none',
      }));
      edgeLabelsGroup.appendChild(textEl(path.midX, path.midY, [edge.label], { fill: stroke, size: 10.5, weight: dotted ? 700 : 400 }));
    }
  });

  layoutResult.nodes.forEach((node) => {
    const style = styleFor(node.id, graph);
    const g = svgEl('g');
    g.appendChild(shapePath(node, style));
    g.appendChild(textEl(node.cx, node.cy, node.lines, { fill: style.color || DEFAULT_TEXT, size: 12 }));
    nodesByGroup.appendChild(g);
  });

  return svg;
}

/** Convenience: parse + layout + render in one call, using a canvas-backed
    text measurer when a DOM is available. Returns {ok:true, svg} or
    {ok:false, reason}. */
export function build(source) {
  const parsed = parse(source);
  if (!parsed.ok) return parsed;
  let measure = null;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = '12px Lexend, Verdana, "Trebuchet MS", "Segoe UI", Arial, sans-serif';
      measure = (text) => ctx.measureText(text).width;
    } catch { measure = null; }
  }
  let measureBold = measure;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 10.5px Lexend, Verdana, "Trebuchet MS", "Segoe UI", Arial, sans-serif';
      measureBold = (text) => ctx.measureText(text).width;
    } catch { measureBold = measure; }
  }
  const laidOut = layout(parsed.graph, measure, measureBold);
  if (typeof document === 'undefined') return { ok: false, reason: '렌더링 환경이 없습니다.' };
  const svg = render(parsed.graph, laidOut);
  return { ok: true, svg, graph: parsed.graph };
}

export const __internals = { wrapLabel, computeLayers };

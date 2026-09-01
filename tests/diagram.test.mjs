import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, layout, __internals } from '../src/diagram.js';

test('parses a basic labelled flowchart with a dashed cross-link', () => {
  const result = parse(`flowchart TD
  A["Externality (외부효과)"] --> B["Pigouvian tax"]
  A --> C["Coase theorem"]
  B -.->|limits| C
  classDef c1 fill:#DCE9F7,stroke:#1B4E7D,color:#1B4E7D;
  class A,B c1;`);
  assert.equal(result.ok, true);
  assert.equal(result.graph.nodes.size, 3);
  assert.equal(result.graph.edges.length, 3);
  assert.equal(result.graph.direction, 'TB');
  const crosslink = result.graph.edges.find((e) => e.style === 'dotted');
  assert.equal(crosslink.label, 'limits');
  assert.equal(result.graph.classDefs.get('c1').fill, '#DCE9F7');
  assert.equal(result.graph.classAssign.get('A'), 'c1');
});

test('handles every arrow form BSB or a hand-written diagram might use, with no space before the arrow', () => {
  const forms = ['-->', '---', '-.->', '-.-', '==>', '--x', '--o'];
  forms.forEach((arrow) => {
    const result = parse(`flowchart TD\nA${arrow}B`);
    assert.equal(result.ok, true, `${arrow} should parse`);
    assert.equal(result.graph.edges.length, 1, `${arrow} should produce one edge`);
  });
});

test('does not let an id ending in a hyphen swallow the arrow that follows it', () => {
  const result = parse('flowchart TD\nnode-one-->node-two');
  assert.equal(result.ok, true);
  assert.deepEqual([...result.graph.nodes.keys()].sort(), ['node-one', 'node-two']);
});

test('reads every basic node shape', () => {
  const result = parse(`flowchart TD
  A[Rect] --> B(Round)
  B --> C([Stadium])
  C --> D{Diamond}
  D --> E{{Hex}}
  E --> F[[Subroutine]]
  F --> G((Circle))`);
  assert.equal(result.ok, true);
  const shapes = [...result.graph.nodes.values()].map((n) => n.shape);
  assert.deepEqual(shapes, ['rect', 'round', 'stadium', 'diamond', 'hexagon', 'subroutine', 'circle']);
});

test('expands fan-out edges (A & B --> C) into the full pairing', () => {
  const result = parse('flowchart LR\nA & B --> C\nC --> D & E');
  assert.equal(result.ok, true);
  assert.equal(result.graph.nodes.size, 5);
  assert.equal(result.graph.edges.length, 4);
});

test('assigns nested subgraph membership correctly, not to the whole file', () => {
  const result = parse(`flowchart TD
  subgraph Outer["Outer 클러스터"]
    subgraph Inner["Inner"]
      A
      B
    end
    C
  end
  D
  A --> D`);
  assert.equal(result.ok, true);
  const outer = result.graph.subgraphs.find((s) => s.id === 'Outer');
  const inner = result.graph.subgraphs.find((s) => s.id === 'Inner');
  assert.deepEqual([...inner.nodeIds].sort(), ['A', 'B']);
  assert.ok(outer.nodeIds.has('C'));
  assert.ok(!outer.nodeIds.has('D'), 'D is declared outside every subgraph');
});

test('reports a reason instead of throwing on an unsupported diagram type', () => {
  const result = parse('sequenceDiagram\nAlice->>Bob: Hello');
  assert.equal(result.ok, false);
  assert.equal(typeof result.reason, 'string');
  assert.ok(result.reason.length > 0);
});

test('reports a reason on empty input rather than crashing', () => {
  assert.equal(parse('').ok, false);
  assert.equal(parse('   \n  ').ok, false);
});

test('reports a reason on an unbalanced subgraph/end', () => {
  const result = parse('flowchart TD\nsubgraph X\nA-->B');
  assert.equal(result.ok, false);
});

test('layout places every node and preserves every edge, without throwing under Node (no canvas)', () => {
  const parsed = parse(`flowchart TD
  A["Long-ish label one"] --> B["Two"]
  A --> C["Three"]
  B -.->|conflicts| C
  subgraph G["Group"]
    B
    C
  end`);
  assert.equal(parsed.ok, true);
  const laidOut = layout(parsed.graph, null);
  assert.equal(laidOut.nodes.length, 3);
  assert.equal(laidOut.edges.length, 3);
  assert.equal(laidOut.subgraphs.length, 1);
  laidOut.nodes.forEach((node) => {
    assert.ok(Number.isFinite(node.cx) && Number.isFinite(node.cy), `${node.id} has a finite position`);
    assert.ok(node.w > 0 && node.h > 0);
  });
  assert.ok(laidOut.width > 0 && laidOut.height > 0);
});

test('layout keeps cross-links out of the layering pass (a dashed conflict edge does not reorder layers)', () => {
  const parsed = parse(`flowchart TD
  A --> B
  A --> C
  C -.->|conflicts| A`);
  assert.equal(parsed.ok, true);
  const layer = __internals.computeLayers(parsed.graph);
  assert.equal(layer.get('A'), 0);
  assert.equal(layer.get('B'), 1);
  assert.equal(layer.get('C'), 1);
});

test('word-wraps a long Korean label without spaces by syllable, and leaves short labels alone', () => {
  const long = __internals.wrapLabel('시장이자원을효율적으로배분하지못하는상태를나타내는매우긴한글라벨입니다다시한번', null);
  assert.ok(long.length > 1, 'a long unspaced Korean run should wrap into multiple lines');
  long.forEach((line) => assert.ok(line.length <= 16));
  assert.deepEqual(__internals.wrapLabel('short', null), ['short']);
});

test('a self-loop and a duplicate edge do not crash layout', () => {
  const parsed = parse('flowchart TD\nA-->A\nA-->B\nA-->B');
  assert.equal(parsed.ok, true);
  const laidOut = layout(parsed.graph, null);
  assert.equal(laidOut.nodes.length, 2);
});

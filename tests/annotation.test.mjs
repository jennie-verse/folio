import assert from 'node:assert/strict';
import test from 'node:test';

import {
  annotationFileName,
  journalTextFits,
  serializeAnnotationMarkdown,
  serializeDocumentAnnotations,
} from '../src/annotation.js';
import { projectAnnotation } from '../src/journal-record.js';

const doc = { id: 'doc-1', title: 'Paper / Notes.pdf', fileName: 'paper.pdf', kind: 'pdf' };
const highlight = {
  id: 'ann-1', docId: 'doc-1', kind: 'highlight', quote: '선택한 글', note: '연결 메모',
  semanticColor: 'question', locator: { page: 12, locationLabel: 'p. 12' },
  createdAt: '2026-08-25T14:32:00.000-05:00', updatedAt: '2026-08-25T14:32:00.000-05:00',
};

test('single annotation Markdown contains document, location, quote and attached note', () => {
  const output = serializeAnnotationMarkdown(highlight, doc, { exportedAt: '2026-08-25T15:00:00.000-05:00' });
  assert.match(output, /document: "Paper \/ Notes\.pdf"/);
  assert.match(output, /location: "p\. 12"/);
  assert.match(output, /> 선택한 글/);
  assert.match(output, /# Note\n\n연결 메모/);
  assert.equal(annotationFileName(doc, 'excerpt', new Date('2026-08-25T12:00:00Z')), 'Paper - Notes.pdf--excerpt-2026-08-25.md');
});

test('document Markdown includes standalone notes and excludes export history', () => {
  const standalone = { ...highlight, id: 'ann-2', kind: 'note', quote: '', note: '기타 메모', locator: { locationLabel: '43%' } };
  const exported = { ...highlight, id: 'ann-3', kind: 'exported-excerpt' };
  const output = serializeDocumentAnnotations([highlight, standalone, exported], doc, { exportedAt: '2026-08-25T15:00:00.000-05:00' });
  assert.match(output, /annotation_count: 2/);
  assert.match(output, /## Highlight · p\. 12/);
  assert.match(output, /## Note · 43%/);
  assert.match(output, /기타 메모/);
});

test('journal projection contains display fields but no private locator geometry', () => {
  const record = projectAnnotation(highlight, doc, 'created', { at: new Date('2026-08-25T19:32:00Z') });
  assert.equal(record.kind, 'highlight-created');
  assert.equal(record.data.quote, '선택한 글');
  assert.equal(record.data.note, '연결 메모');
  assert.equal(record.data.locationLabel, 'p. 12');
  assert.equal(record.data.rects, undefined);
  assert.equal(JSON.stringify(record).includes('textQuote'), false);
  const metadataOnly = projectAnnotation(highlight, doc, 'updated', { at: new Date('2026-08-25T19:32:00Z'), includeContent: false });
  assert.equal(metadataOnly.kind, 'highlight-updated');
  assert.equal(metadataOnly.data.quote, undefined);
  assert.equal(metadataOnly.data.note, undefined);
});

test('Journal content limit is enforced before enqueue', () => {
  assert.equal(journalTextFits(highlight), true);
  assert.equal(journalTextFits({ quote: '한'.repeat(30_000), note: '' }), false);
});

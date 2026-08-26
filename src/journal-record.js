const ACTION_ORDER = ['created', 'added', 'opened', 'read', 'edited', 'export-requested'];

function pad(value) { return String(Math.abs(value)).padStart(2, '0'); }

export function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid journal date');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localIso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid journal timestamp');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `.${String(date.getMilliseconds()).padStart(3, '0')}`
    + `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

export function mergeFileActivity(previous, doc, action, at = new Date(), options = {}) {
  if (!doc?.id || !ACTION_ORDER.includes(action)) throw new Error('Invalid Folio journal activity');
  const timestamp = localIso(at);
  const date = localDate(at);
  const actions = new Set(Array.isArray(previous?.data?.actions) ? previous.data.actions : []);
  actions.add(action);
  const ordered = ACTION_ORDER.filter(item => actions.has(item));
  return {
    id: `${doc.id}:${date}`,
    kind: 'file-activity',
    at: previous?.at && previous.at < timestamp ? previous.at : timestamp,
    updatedAt: timestamp,
    deleted: false,
    title: String(doc.title || doc.fileName || 'Untitled'),
    data: {
      itemId: String(doc.id),
      itemType: String(doc.kind || 'document'),
      actions: ordered,
      firstAt: previous?.data?.firstAt && previous.data.firstAt < timestamp ? previous.data.firstAt : timestamp,
      lastAt: previous?.data?.lastAt && previous.data.lastAt > timestamp ? previous.data.lastAt : timestamp,
      openCount: Math.max(0, Number(previous?.data?.openCount) || 0) + (action === 'opened' ? 1 : 0),
      ...(options.importedHistory ? { importedHistory: true, historyAccuracy: options.historyAccuracy || 'inferred' } : {}),
    },
  };
}

function annotationKind(annotation, event) {
  if (annotation.kind === 'exported-excerpt') return 'excerpt-exported';
  if (annotation.kind === 'note') return event === 'updated' ? 'note-updated' : 'note-created';
  return event === 'updated' ? 'highlight-updated' : 'highlight-created';
}

export function projectAnnotation(annotation, doc, event = 'created', {
  at = new Date(), includeContent = true, deleted = false,
} = {}) {
  if (!annotation?.id || !doc?.id) throw new Error('Invalid Folio annotation activity');
  const timestamp = localIso(at);
  const quote = includeContent ? String(annotation.quote || '').normalize('NFC') : '';
  const note = includeContent ? String(annotation.note || '').normalize('NFC') : '';
  return {
    id: String(annotation.id),
    kind: annotationKind(annotation, event),
    at: timestamp,
    updatedAt: timestamp,
    deleted: deleted === true,
    title: String(doc.title || doc.fileName || 'Untitled').normalize('NFC'),
    data: {
      documentId: String(doc.id),
      documentTitle: String(doc.title || doc.fileName || 'Untitled').normalize('NFC'),
      documentType: String(doc.kind || 'document'),
      locationLabel: String(annotation.locator?.locationLabel || '').normalize('NFC'),
      ...(annotation.locator?.page ? { page: Number(annotation.locator.page) } : {}),
      ...(quote ? { quote } : {}),
      ...(note ? { note } : {}),
      ...(annotation.semanticColor ? { semanticColor: String(annotation.semanticColor) } : {}),
      contentIncluded: includeContent,
    },
  };
}

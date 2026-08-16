import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  pickLabelFaceNote,
  recentLabelNoteQueryKey,
} from './recent-label-note';

test('pickLabelFaceNote prefers label_note over notes', () => {
  assert.equal(
    pickLabelFaceNote({ labelNote: '  Face  ', notes: 'Item' }),
    'Face',
  );
  assert.equal(pickLabelFaceNote({ labelNote: '  ', notes: ' Item ' }), 'Item');
  assert.equal(pickLabelFaceNote({ labelNote: null, notes: null }), null);
  assert.equal(pickLabelFaceNote({}), null);
});

test('recentLabelNoteQueryKey nests under receiving feed root', () => {
  assert.deepEqual(recentLabelNoteQueryKey(42), [
    'receiving',
    'recent-label-note',
    42,
  ]);
  assert.deepEqual(recentLabelNoteQueryKey(null), [
    'receiving',
    'recent-label-note',
    null,
  ]);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  pickLabelFaceNote,
  pickRecentFaceRow,
  RECENT_LABEL_NOTE_QUERY_ROOT,
  recentLabelNoteQueryKey,
  shouldRefreshRecentFace,
  type RecentFaceCandidate,
} from './recent-label-note';

/** Row factory — every field explicit at the call site that cares about it. */
function candidate(over: Partial<RecentFaceCandidate> = {}): RecentFaceCandidate {
  return {
    lineId: 1,
    labelNote: null,
    notes: null,
    receivingId: 100,
    appliedAt: '2026-08-18T10:00:00.000Z',
    trackingNumber: '1Z-A',
    lineUpdatedAt: '2026-08-18T10:00:00.000Z',
    ...over,
  };
}

test('pickLabelFaceNote prefers the live/stamped face (notes) over a stale label_note', () => {
  // The reported P0: dock face re-noted to `untested.....` and received without
  // a carton print, so `label_note` still holds the pre-split backfill.
  assert.equal(
    pickLabelFaceNote({
      labelNote: 'the radio is not tested',
      notes: '  untested.....  ',
    }),
    'untested.....',
  );
});

test('pickLabelFaceNote falls back to label_note only when notes is blank', () => {
  assert.equal(pickLabelFaceNote({ labelNote: '  Face  ', notes: '   ' }), 'Face');
  assert.equal(pickLabelFaceNote({ labelNote: '  Face  ', notes: null }), 'Face');
  assert.equal(pickLabelFaceNote({ labelNote: null, notes: null }), null);
  assert.equal(pickLabelFaceNote({}), null);
});

test('pickRecentFaceRow takes the labeled line, not a sibling with a stale label_note', () => {
  // One carton, two lines. The sibling still carries the backfilled sentence;
  // the line the operator just labeled is the one touched last.
  const row = pickRecentFaceRow([
    candidate({
      lineId: 11,
      labelNote: 'the radio is not tested',
      notes: 'the radio is not tested',
      lineUpdatedAt: '2026-08-18T09:00:00.000Z',
    }),
    candidate({
      lineId: 12,
      labelNote: null,
      notes: 'untested.....',
      lineUpdatedAt: '2026-08-18T09:45:00.000Z',
    }),
  ]);

  assert.equal(row?.note, 'untested.....');
  assert.equal(row?.lineId, 12);
  // Scan identity stays the carton's, taken from its newest scan row.
  assert.equal(row?.receivingId, 100);
  assert.equal(row?.trackingNumber, '1Z-A');
});

test('pickRecentFaceRow never crosses into an older carton for a fresher line', () => {
  // Carton 200 was scanned most recently; carton 100 has a line edited later.
  // Recent follows the SCAN walk — the carton the operator just finished wins.
  const row = pickRecentFaceRow([
    candidate({
      lineId: 21,
      receivingId: 200,
      trackingNumber: '1Z-B',
      appliedAt: '2026-08-18T11:00:00.000Z',
      notes: 'untested.....',
      lineUpdatedAt: '2026-08-18T11:01:00.000Z',
    }),
    candidate({
      lineId: 11,
      receivingId: 100,
      notes: 'the radio is not tested',
      lineUpdatedAt: '2026-08-18T23:00:00.000Z',
    }),
  ]);

  assert.equal(row?.note, 'untested.....');
  assert.equal(row?.receivingId, 200);
});

test('pickRecentFaceRow skips a blank carton and yields the prior noted one', () => {
  // The open line's carton is excluded upstream; a blank carton is dropped by
  // the query filter. A row with only whitespace must not stop the walk.
  const row = pickRecentFaceRow([
    candidate({ lineId: 31, receivingId: 300, notes: '   ', labelNote: '  ' }),
    candidate({ lineId: 12, receivingId: 100, notes: 'untested.....' }),
  ]);

  assert.equal(row?.note, 'untested.....');
  assert.equal(row?.lineId, 12);
});

test('pickRecentFaceRow breaks an updated_at tie on the newer line id', () => {
  const row = pickRecentFaceRow([
    candidate({ lineId: 11, notes: 'older sibling', lineUpdatedAt: null }),
    candidate({ lineId: 12, notes: 'untested.....', lineUpdatedAt: null }),
  ]);

  assert.equal(row?.note, 'untested.....');
  assert.equal(row?.lineId, 12);
});

test('pickRecentFaceRow returns null when nothing has a face note', () => {
  assert.equal(pickRecentFaceRow([]), null);
  assert.equal(pickRecentFaceRow([candidate({ notes: ' ', labelNote: null })]), null);
});

test('shouldRefreshRecentFace drops a Recent answer the previous carton just beat', () => {
  // The race: carton B's fetch landed before carton A's note PATCH, so Recent
  // shows a week-old carton. A's persisted row arriving is the fix signal.
  assert.equal(
    shouldRefreshRecentFace({
      updatedLineId: 31539,
      updatedLabelNote: 'the radio is not tested',
      updatedNotes: 'untested.....',
      openLineId: 31601,
      shownPhrase: 'the radio is not tested',
    }),
    true,
  );
});

test('shouldRefreshRecentFace ignores the steady patch traffic', () => {
  const base = {
    updatedLineId: 31539,
    updatedLabelNote: null,
    updatedNotes: 'untested.....',
    openLineId: 31601,
    shownPhrase: 'untested.....',
  };
  // Already showing this face — a condition/verdict patch broadcasts the whole
  // row, so refetching on every one of them would be pure churn.
  assert.equal(shouldRefreshRecentFace(base), false);
  // The open line is excluded from Recent by construction; its own saves can
  // never become the answer.
  assert.equal(
    shouldRefreshRecentFace({ ...base, openLineId: 31539, shownPhrase: 'stale' }),
    false,
  );
  // Nothing to show.
  assert.equal(
    shouldRefreshRecentFace({
      ...base,
      updatedNotes: '   ',
      updatedLabelNote: null,
      shownPhrase: 'stale',
    }),
    false,
  );
});

test('shouldRefreshRecentFace fills an empty Recent once a face exists', () => {
  assert.equal(
    shouldRefreshRecentFace({
      updatedLineId: 31539,
      updatedNotes: 'untested.....',
      openLineId: 31601,
      shownPhrase: '',
    }),
    true,
  );
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
  // The invalidation root must stay a prefix of the per-line key, or dropping
  // the family on a save would miss the mounted query.
  assert.deepEqual(
    recentLabelNoteQueryKey(42).slice(0, 2),
    [...RECENT_LABEL_NOTE_QUERY_ROOT],
  );
});

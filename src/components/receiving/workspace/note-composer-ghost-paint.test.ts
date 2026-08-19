import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveNoteGhostPaint } from './note-composer-helpers';

const RECENT = 'untested.....';
/** A stale device-bank phrase that prefix-completes what the operator typed. */
const MRU = 'The radio is not tested';

test('empty field + Recent hovered previews the phrase Recent applies', () => {
  const paint = resolveNoteGhostPaint({
    recentHover: true,
    recentPhrase: RECENT,
    value: '',
    matchedPhrase: null,
    ghostSuffix: '',
  });

  assert.equal(paint.ghostSuffix, RECENT);
  assert.equal(paint.matchedPhrase, RECENT);
  // Accepting the ghost must run Recent's apply, so hover and click agree.
  assert.equal(paint.acceptAppliesRecent, true);
});

test('non-empty field + Recent hovered paints nothing, never the MRU phrase', () => {
  // The regression: hovering Recent previewed the device bank's completion of
  // the typed text — an older phrase Recent would never insert.
  const paint = resolveNoteGhostPaint({
    recentHover: true,
    recentPhrase: RECENT,
    value: 'The',
    matchedPhrase: MRU,
    ghostSuffix: ' radio is not tested',
  });

  assert.equal(paint.ghostSuffix, undefined);
  assert.equal(paint.matchedPhrase, null);
  assert.equal(paint.acceptAppliesRecent, false);
});

test('Recent not hovered leaves the MRU prefix ghost alone', () => {
  const paint = resolveNoteGhostPaint({
    recentHover: false,
    recentPhrase: RECENT,
    value: 'The',
    matchedPhrase: MRU,
    ghostSuffix: ' radio is not tested',
  });

  assert.equal(paint.ghostSuffix, ' radio is not tested');
  assert.equal(paint.matchedPhrase, MRU);
  assert.equal(paint.acceptAppliesRecent, false);
});

test('hovering Recent with no phrase to apply paints nothing', () => {
  const paint = resolveNoteGhostPaint({
    recentHover: true,
    recentPhrase: '   ',
    value: '',
    matchedPhrase: null,
    ghostSuffix: '',
  });

  assert.equal(paint.ghostSuffix, undefined);
  assert.equal(paint.acceptAppliesRecent, false);
});

test('a whitespace-only draft still counts as an empty field', () => {
  const paint = resolveNoteGhostPaint({
    recentHover: true,
    recentPhrase: RECENT,
    value: '   ',
    matchedPhrase: null,
    ghostSuffix: '',
  });

  assert.equal(paint.ghostSuffix, RECENT);
  assert.equal(paint.acceptAppliesRecent, true);
});

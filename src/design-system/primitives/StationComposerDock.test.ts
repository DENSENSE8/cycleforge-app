/**
 * Unit tests for StationComposerDock pure helpers.
 *
 *   node --import tsx --test src/design-system/primitives/StationComposerDock.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleStationComposerKeyDown,
  resizeStationComposerTextarea,
  stationComposerShowsCommit,
} from './StationComposerDock';

test('handleStationComposerKeyDown: Enter commits; Shift+Enter does not', () => {
  let commits = 0;
  const commit = () => {
    commits += 1;
  };

  let prevented = false;
  const enter = {
    key: 'Enter',
    shiftKey: false,
    preventDefault: () => {
      prevented = true;
    },
  };
  assert.equal(handleStationComposerKeyDown(enter, commit), true);
  assert.equal(prevented, true);
  assert.equal(commits, 1);

  prevented = false;
  const shiftEnter = {
    key: 'Enter',
    shiftKey: true,
    preventDefault: () => {
      prevented = true;
    },
  };
  assert.equal(handleStationComposerKeyDown(shiftEnter, commit), false);
  assert.equal(prevented, false);
  assert.equal(commits, 1);

  assert.equal(
    handleStationComposerKeyDown(
      { key: 'a', shiftKey: false, preventDefault: () => {} },
      commit,
    ),
    false,
  );
  assert.equal(commits, 1);
});

test('stationComposerShowsCommit: a trailingAction replaces the Send button', () => {
  // Default composer keeps Send.
  assert.equal(stationComposerShowsCommit({}), true);
  // A trailing terminal CTA (Unbox overview receive) owns the slot instead —
  // two primaries in one footer is the two-card look this replaced. Enter
  // still fires onCommit (mapped to print+receive by the Unbox host).
  assert.equal(stationComposerShowsCommit({ hasTrailingAction: true }), false);
  // Explicit opt-out still wins on its own.
  assert.equal(stationComposerShowsCommit({ hideCommitButton: true }), false);
  assert.equal(
    stationComposerShowsCommit({ hideCommitButton: true, hasTrailingAction: true }),
    false,
  );
});

test('resizeStationComposerTextarea: clamps between min and max', () => {
  const el = {
    style: { height: '' } as { height: string },
    scrollHeight: 200,
  };
  resizeStationComposerTextarea(el as unknown as HTMLTextAreaElement, {
    minPx: 40,
    maxPx: 128,
  });
  assert.equal(el.style.height, '128px');

  el.scrollHeight = 20;
  resizeStationComposerTextarea(el as unknown as HTMLTextAreaElement, {
    minPx: 40,
    maxPx: 128,
  });
  assert.equal(el.style.height, '40px');

  el.scrollHeight = 72;
  resizeStationComposerTextarea(el as unknown as HTMLTextAreaElement, {
    minPx: 40,
    maxPx: 128,
  });
  assert.equal(el.style.height, '72px');
});

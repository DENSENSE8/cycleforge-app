/**
 * Unit tests for OmnichannelComposerDock pure helpers.
 *
 *   node --import tsx --test src/design-system/primitives/OmnichannelComposerDock.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleComposerKeyDown,
  resizeComposerTextarea,
  composerShowsCommit,
} from './OmnichannelComposerDock';

test('handleComposerKeyDown: Enter commits; Shift+Enter does not', () => {
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
  assert.equal(handleComposerKeyDown(enter, commit), true);
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
  assert.equal(handleComposerKeyDown(shiftEnter, commit), false);
  assert.equal(prevented, false);
  assert.equal(commits, 1);

  assert.equal(
    handleComposerKeyDown(
      { key: 'a', shiftKey: false, preventDefault: () => {} },
      commit,
    ),
    false,
  );
  assert.equal(commits, 1);
});

test('composerShowsCommit: a trailingAction replaces the Send button', () => {
  // Default composer keeps Send.
  assert.equal(composerShowsCommit({}), true);
  // A trailing terminal CTA (Unbox overview receive) owns the slot instead —
  // two primaries in one footer is the two-card look this replaced. Enter
  // still fires onCommit (mapped to print+receive by the Unbox host).
  assert.equal(composerShowsCommit({ hasTrailingAction: true }), false);
  // Explicit opt-out still wins on its own.
  assert.equal(composerShowsCommit({ hideCommitButton: true }), false);
  assert.equal(
    composerShowsCommit({ hideCommitButton: true, hasTrailingAction: true }),
    false,
  );
});

test('resizeComposerTextarea: clamps between min and max', () => {
  const el = {
    style: { height: '' } as { height: string },
    scrollHeight: 200,
  };
  resizeComposerTextarea(el as unknown as HTMLTextAreaElement, {
    minPx: 40,
    maxPx: 128,
  });
  assert.equal(el.style.height, '128px');

  el.scrollHeight = 20;
  resizeComposerTextarea(el as unknown as HTMLTextAreaElement, {
    minPx: 40,
    maxPx: 128,
  });
  assert.equal(el.style.height, '40px');

  el.scrollHeight = 72;
  resizeComposerTextarea(el as unknown as HTMLTextAreaElement, {
    minPx: 40,
    maxPx: 128,
  });
  assert.equal(el.style.height, '72px');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTO_COLLAPSE_INITIAL,
  AUTO_COLLAPSE_SCROLL_PX,
  autoCollapseReducer,
  type AutoCollapseEvent,
  type AutoCollapseState,
} from './auto-collapse';

function run(events: AutoCollapseEvent[], from: AutoCollapseState = AUTO_COLLAPSE_INITIAL) {
  return events.reduce(autoCollapseReducer, from);
}

test('the centre opens expanded', () => {
  assert.equal(AUTO_COLLAPSE_INITIAL.collapsed, false);
});

test('trigger 1 — scrolling down collapses', () => {
  const s = run([{ kind: 'scroll', scrollTop: AUTO_COLLAPSE_SCROLL_PX + 1 }]);
  assert.equal(s.collapsed, true);
});

test('a scroll inside the threshold is not a scroll-down', () => {
  const s = run([{ kind: 'scroll', scrollTop: AUTO_COLLAPSE_SCROLL_PX }]);
  assert.equal(s.collapsed, false);
});

test('trigger 2 — focusing the composer collapses', () => {
  const s = run([{ kind: 'engage' }]);
  assert.equal(s.collapsed, true);
  assert.equal(s.engaged, true);
});

test('blur does NOT re-expand — that would shove the thread down mid-read', () => {
  const s = run([{ kind: 'engage' }, { kind: 'disengage' }]);
  assert.equal(s.collapsed, true);
  assert.equal(s.engaged, false);
});

test('returning to the top re-expands', () => {
  const s = run([
    { kind: 'scroll', scrollTop: 400 },
    { kind: 'scroll', scrollTop: 0 },
  ]);
  assert.equal(s.collapsed, false);
});

test('a focused composer blocks the top edge from flipping blocks open', () => {
  // A composer that grows tall can bounce the scrollport back to 0; that must
  // not re-expand two blocks under the operator's hands while they type.
  const s = run([{ kind: 'engage' }, { kind: 'scroll', scrollTop: 0 }]);
  assert.equal(s.collapsed, true);
});

test('a manual toggle outranks both automatic triggers', () => {
  // Operator re-opens Status deliberately, then keeps typing and scrolling.
  const s = run([
    { kind: 'engage' },              // collapsed by trigger 2
    { kind: 'toggle' },              // operator re-opens it
    { kind: 'scroll', scrollTop: 900 },
    { kind: 'engage' },
  ]);
  assert.equal(s.collapsed, false, 'the deliberate re-open must survive');
  assert.equal(s.pinned, true);
});

test('the top edge releases a manual pin', () => {
  const s = run([
    { kind: 'scroll', scrollTop: 500 },
    { kind: 'toggle' },                 // pinned expanded mid-page
    { kind: 'scroll', scrollTop: 0 },   // back to the top → release
    { kind: 'scroll', scrollTop: 500 }, // now the auto trigger works again
  ]);
  assert.equal(s.pinned, false);
  assert.equal(s.collapsed, true);
});

test('a manual collapse also sticks against a scroll back to top', () => {
  const s = run([{ kind: 'toggle' }]);
  assert.equal(s.collapsed, true);
  assert.equal(s.pinned, true);
  // ...until the top edge releases it, which is the documented escape.
  assert.equal(run([{ kind: 'scroll', scrollTop: 0 }], s).collapsed, false);
});

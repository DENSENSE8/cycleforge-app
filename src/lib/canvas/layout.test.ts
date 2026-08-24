/**
 * The tiling tree's edits, pinned.
 *
 * Every operation is pure and takes its new ids as arguments, so a whole window
 * manager's behaviour is assertable without React, a DOM, or the store.
 *
 * Run: `npx tsx --test src/lib/canvas/layout.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canvasGroup,
  canvasGroups,
  canvasSplit,
  canvasTabIds,
  closeGroup,
  evenOutSplits,
  findGroup,
  findGroupForTab,
  isSplit,
  moveTabToGroup,
  neighbourGroupId,
  parseCanvasLayout,
  reconcileCanvasLayout,
  setActiveTab,
  setSplitRatio,
  splitGroup,
  type CanvasSplit,
} from './layout';

/** `[A | [B / C]]` — the bento in `02-target-architecture.md`. */
function triptych() {
  return canvasSplit(
    's1',
    'row',
    canvasGroup('g1', ['a']),
    canvasSplit('s2', 'column', canvasGroup('g2', ['b']), canvasGroup('g3', ['c'])),
    0.6,
  );
}

describe('canvasGroup', () => {
  it('de-duplicates tabs and normalizes the active tab into its own list', () => {
    const group = canvasGroup('g1', ['a', 'b', 'a'], 'zzz');
    assert.deepEqual(group.tabIds, ['a', 'b']);
    assert.equal(group.activeTabId, 'a', 'an unknown active tab falls back to the first');
    assert.equal(canvasGroup('g1', []).activeTabId, null);
  });
});

describe('splitGroup', () => {
  it('moves the active tab into the new pane when there is more than one', () => {
    const root = splitGroup(canvasGroup('g1', ['a', 'b'], 'b'), {
      groupId: 'g1',
      orientation: 'row',
      newGroupId: 'g2',
      newSplitId: 's1',
    });
    assert.ok(isSplit(root));
    assert.deepEqual(findGroup(root, 'g1')?.tabIds, ['a']);
    assert.deepEqual(findGroup(root, 'g2')?.tabIds, ['b']);
    assert.equal(findGroup(root, 'g1')?.activeTabId, 'a', 'the source re-picks a tab');
  });

  it('opens an EMPTY pane when the source holds a single tab', () => {
    // Moving the only tab would relocate the pane, not split it — and an empty
    // pane is the launcher surface, so this is the useful answer.
    const root = splitGroup(canvasGroup('g1', ['a']), {
      groupId: 'g1',
      orientation: 'column',
      newGroupId: 'g2',
      newSplitId: 's1',
    });
    assert.deepEqual(findGroup(root, 'g1')?.tabIds, ['a']);
    assert.deepEqual(findGroup(root, 'g2')?.tabIds, []);
    assert.equal(findGroup(root, 'g2')?.activeTabId, null);
  });

  it('places the new pane before the source when asked', () => {
    const root = splitGroup(canvasGroup('g1', ['a', 'b'], 'b'), {
      groupId: 'g1',
      orientation: 'row',
      newGroupId: 'g2',
      newSplitId: 's1',
      before: true,
    });
    assert.deepEqual(canvasGroups(root).map((g) => g.id), ['g2', 'g1']);
  });
});

describe('closeGroup', () => {
  it('collapses the parent split into the surviving sibling, subtree intact', () => {
    const { root, orphanedTabIds } = closeGroup(triptych(), 'g1');
    assert.deepEqual(orphanedTabIds, ['a']);
    assert.ok(root && isSplit(root) && root.id === 's2', 'the inner split survives whole');
    assert.deepEqual(canvasGroups(root!).map((g) => g.id), ['g2', 'g3']);
  });

  it('hands the tabs back rather than closing them — a pane is a window', () => {
    const { orphanedTabIds } = closeGroup(canvasGroup('g1', ['a', 'b']), 'g1');
    assert.deepEqual(orphanedTabIds, ['a', 'b']);
  });

  it('returns null when the last pane closes, so the caller mints a fresh one', () => {
    assert.equal(closeGroup(canvasGroup('g1', ['a']), 'g1').root, null);
  });
});

describe('neighbourGroupId', () => {
  it('walks up to the first ancestor on the direction’s axis and takes its facing edge', () => {
    const root = triptych();
    assert.equal(neighbourGroupId(root, 'g1', 'right'), 'g2', 'enters the column at its top');
    assert.equal(neighbourGroupId(root, 'g2', 'left'), 'g1');
    assert.equal(neighbourGroupId(root, 'g3', 'left'), 'g1', 'crosses the outer row from below');
    assert.equal(neighbourGroupId(root, 'g2', 'down'), 'g3');
    assert.equal(neighbourGroupId(root, 'g3', 'up'), 'g2');
  });

  it('returns null at the edge of the canvas', () => {
    const root = triptych();
    assert.equal(neighbourGroupId(root, 'g1', 'left'), null);
    assert.equal(neighbourGroupId(root, 'g1', 'up'), null);
    assert.equal(neighbourGroupId(root, 'g3', 'down'), null);
    assert.equal(neighbourGroupId(canvasGroup('g1'), 'g1', 'right'), null);
  });
});

describe('moveTabToGroup', () => {
  it('appends into the target, makes it active, and re-picks in the source', () => {
    const root = moveTabToGroup(
      canvasSplit('s1', 'row', canvasGroup('g1', ['a', 'b'], 'b'), canvasGroup('g2', ['c'])),
      { tabId: 'b', toGroupId: 'g2' },
    );
    assert.deepEqual(findGroup(root, 'g1')?.tabIds, ['a']);
    assert.equal(findGroup(root, 'g1')?.activeTabId, 'a');
    assert.deepEqual(findGroup(root, 'g2')?.tabIds, ['c', 'b']);
    assert.equal(findGroup(root, 'g2')?.activeTabId, 'b');
  });

  it('leaves an emptied source in place as a launcher pane', () => {
    const root = moveTabToGroup(
      canvasSplit('s1', 'row', canvasGroup('g1', ['a']), canvasGroup('g2', ['c'])),
      { tabId: 'a', toGroupId: 'g2' },
    );
    assert.ok(findGroup(root, 'g1'), 'the pane survives its last tab leaving');
    assert.deepEqual(findGroup(root, 'g1')?.tabIds, []);
  });
});

describe('reconcileCanvasLayout', () => {
  it('drops closed tabs and re-picks the group’s active tab', () => {
    const root = reconcileCanvasLayout({
      root: canvasGroup('g1', ['a', 'b', 'c'], 'b'),
      openTabIds: ['a', 'c'],
      fallbackGroupId: 'g1',
    });
    assert.deepEqual(canvasTabIds(root), ['a', 'c']);
    assert.equal(findGroup(root, 'g1')?.activeTabId, 'a');
  });

  it('homes a newly-opened tab into the pane holding the focused tab', () => {
    const root = reconcileCanvasLayout({
      root: canvasSplit('s1', 'row', canvasGroup('g1', ['a']), canvasGroup('g2', ['b'])),
      openTabIds: ['a', 'b', 'new'],
      focusedTabId: 'b',
      fallbackGroupId: 'g1',
    });
    assert.deepEqual(findGroup(root, 'g2')?.tabIds, ['b', 'new']);
    assert.deepEqual(findGroup(root, 'g1')?.tabIds, ['a']);
  });

  it('focuses a newly-opened tab that arrives as the focused one', () => {
    const root = reconcileCanvasLayout({
      root: canvasGroup('g1', ['a'], 'a'),
      openTabIds: ['a', 'new'],
      focusedTabId: 'new',
      fallbackGroupId: 'g1',
    });
    assert.equal(findGroup(root, 'g1')?.activeTabId, 'new');
  });

  it('never lets one tab sit in two panes', () => {
    const root = reconcileCanvasLayout({
      root: canvasSplit('s1', 'row', canvasGroup('g1', ['a']), canvasGroup('g2', ['a', 'b'])),
      openTabIds: ['a', 'b'],
      fallbackGroupId: 'g1',
    });
    assert.deepEqual(canvasTabIds(root), ['a', 'b']);
    assert.deepEqual(findGroup(root, 'g2')?.tabIds, ['b']);
  });

  it('keeps empty panes and builds one from nothing', () => {
    const kept = reconcileCanvasLayout({
      root: canvasSplit('s1', 'row', canvasGroup('g1', ['a']), canvasGroup('g2', ['b'])),
      openTabIds: ['a'],
      fallbackGroupId: 'g1',
    });
    assert.equal(canvasGroups(kept).length, 2, 'the emptied pane stays as a launcher');

    const fresh = reconcileCanvasLayout({ root: null, openTabIds: ['a'], fallbackGroupId: 'g9' });
    assert.deepEqual(findGroup(fresh, 'g9')?.tabIds, ['a']);
  });

  it('is total against a workspace that changed under a restored layout', () => {
    const root = reconcileCanvasLayout({
      root: triptych(),
      openTabIds: ['c', 'd'],
      focusedTabId: 'd',
      fallbackGroupId: 'g1',
    });
    // `canvasTabIds` reads in VISUAL order, so `d` (homed into the leading pane
    // g1) comes before `c` (still in g3) even though it opened later.
    assert.deepEqual(canvasTabIds(root), ['d', 'c']);
    assert.equal(findGroupForTab(root, 'd')?.id, 'g1', 'unplaced tabs land in the leading pane');
    assert.deepEqual(findGroup(root, 'g2')?.tabIds, [], 'the emptied middle pane survives');
  });
});

describe('ratios', () => {
  it('setSplitRatio clamps and leaves the tree identical when nothing moves', () => {
    const root = triptych();
    assert.equal(setSplitRatio(root, 's1', 0.6), root, 'no-op keeps identity for the snapshot');
    const moved = setSplitRatio(root, 's1', 5);
    assert.equal(isSplit(moved) && moved.ratio, 0.9);
    assert.equal(setSplitRatio(root, 'nope', 0.3), root);
  });

  it('evenOutSplits centres every seam', () => {
    const evened = evenOutSplits(triptych()) as CanvasSplit;
    assert.equal(evened.ratio, 0.5);
    assert.equal((evened.children[1] as CanvasSplit).ratio, 0.5);
  });
});

describe('setActiveTab', () => {
  it('only accepts a tab the group actually holds', () => {
    const root = canvasSplit('s1', 'row', canvasGroup('g1', ['a', 'b']), canvasGroup('g2', ['c']));
    assert.equal(findGroup(setActiveTab(root, 'g1', 'b'), 'g1')?.activeTabId, 'b');
    assert.equal(setActiveTab(root, 'g1', 'c'), root, 'a foreign tab is a no-op');
  });
});

describe('parseCanvasLayout', () => {
  it('round-trips a real tree', () => {
    const root = triptych();
    const parsed = parseCanvasLayout(JSON.parse(JSON.stringify(root)));
    assert.deepEqual(parsed, root);
  });

  it('rejects a bag that is not a layout rather than half-building one', () => {
    assert.equal(parseCanvasLayout(null), null);
    assert.equal(parseCanvasLayout({ type: 'group' }), null, 'no id');
    assert.equal(parseCanvasLayout({ type: 'split', id: 's1' }), null, 'no children');
    assert.equal(
      parseCanvasLayout({ type: 'split', id: 's1', orientation: 'diagonal', children: [] }),
      null,
    );
    assert.equal(parseCanvasLayout({ type: 'leaf', id: 'x' }), null, 'unknown node type');
  });

  it('bounds recursion so a hostile or corrupt bag cannot blow the stack', () => {
    let deep: unknown = { type: 'group', id: 'g1', tabIds: [] };
    for (let i = 0; i < 40; i += 1) {
      deep = { type: 'split', id: `s${i}`, orientation: 'row', ratio: 0.5, children: [deep, deep] };
    }
    assert.equal(parseCanvasLayout(deep), null);
  });
});

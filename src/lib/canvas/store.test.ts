/**
 * The canvas store, driven through the real workspace store.
 *
 * Both are module singletons with no React in them, so the whole
 * open-a-tab → split → move → close cycle is assertable here — including the two
 * properties that are easy to get wrong and expensive to notice late: closing a
 * PANE must not close its tabs, and exactly one tab stays live throughout.
 *
 * Run: `npx tsx --test src/lib/canvas/store.test.ts`
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  canvasGroups,
  findGroup,
  findGroupForTab,
  isSplit,
  canvasTabIds,
} from './layout';
import {
  applyCanvasPreset,
  closePane,
  cycleTabInFocusedPane,
  evenOutPanes,
  focusPaneDirection,
  getCanvasSnapshot,
  moveFocusedTabDirection,
  resetCanvas,
  setPaneRatio,
  splitFocusedPane,
  subscribeCanvas,
  syncCanvasLayout,
  toggleMaximizePane,
  activateTab,
} from './store';
import {
  getWorkspaceSnapshot,
  isTabLive,
  openTab,
  resetWorkspace,
} from '@/lib/workspace/store';

/** Push the workspace's current truth into the canvas — what the host does. */
function sync(): void {
  const workspace = getWorkspaceSnapshot();
  syncCanvasLayout({
    openTabIds: workspace.openTabs.map((tab) => tab.id),
    focusedTabId: workspace.focusedTabId,
  });
}

function openAndSync(kind: 'session' | 'table' | 'tool', ref: string): string {
  const id = openTab({ kind, ref });
  assert.ok(id, 'the workspace had room');
  sync();
  return id;
}

beforeEach(() => {
  resetWorkspace();
  resetCanvas();
});

describe('canvas store — arrangement follows the workspace', () => {
  it('homes every open tab into one pane until the operator splits', () => {
    openAndSync('session', 'unbox');
    const second = openAndSync('table', 'orders');
    const { root, focusedGroupId } = getCanvasSnapshot();
    assert.equal(canvasGroups(root).length, 1);
    assert.equal(canvasTabIds(root).length, 2);
    assert.equal(findGroup(root, focusedGroupId!)?.activeTabId, second);
  });

  it('splitting moves the active tab into the new pane', () => {
    const first = openAndSync('session', 'unbox');
    const second = openAndSync('table', 'orders');
    splitFocusedPane('row');

    const { root } = getCanvasSnapshot();
    assert.ok(isSplit(root));
    assert.notEqual(findGroupForTab(root, first)?.id, findGroupForTab(root, second)?.id);
    assert.equal(canvasGroups(root).length, 2);
  });

  it('splitting a single-tab pane opens an empty launcher pane instead', () => {
    openAndSync('session', 'unbox');
    splitFocusedPane('column');
    const groups = canvasGroups(getCanvasSnapshot().root);
    assert.equal(groups.length, 2);
    assert.equal(groups.filter((g) => g.tabIds.length === 0).length, 1);
  });

  it('closing a PANE re-homes its tabs — it does not close them', () => {
    const first = openAndSync('session', 'unbox');
    const second = openAndSync('table', 'orders');
    splitFocusedPane('row');
    const target = findGroupForTab(getCanvasSnapshot().root, second)!.id;

    closePane(target);

    assert.equal(getWorkspaceSnapshot().openTabs.length, 2, 'both tabs are still open');
    const { root } = getCanvasSnapshot();
    assert.equal(canvasGroups(root).length, 1);
    assert.deepEqual(new Set(canvasTabIds(root)), new Set([first, second]));
  });

  it('closing the last pane leaves one empty pane, never a node-less canvas', () => {
    openAndSync('session', 'unbox');
    const only = getCanvasSnapshot().focusedGroupId!;
    closePane(only);
    assert.equal(canvasGroups(getCanvasSnapshot().root).length, 1);
  });
});

describe('canvas store — focus is the workspace’s focus, not a second one', () => {
  it('focusing a pane focuses the tab that pane is showing', () => {
    const first = openAndSync('session', 'unbox');
    const second = openAndSync('table', 'orders');
    splitFocusedPane('row');
    sync();

    focusPaneDirection('left');
    assert.equal(getWorkspaceSnapshot().focusedTabId, first);
    assert.equal(isTabLive(first), true);
    assert.equal(isTabLive(second), false, 'exactly one tab is live');

    focusPaneDirection('right');
    assert.equal(getWorkspaceSnapshot().focusedTabId, second);
  });

  it('a directional focus at the canvas edge is a no-op, not a wrap', () => {
    const first = openAndSync('session', 'unbox');
    focusPaneDirection('left');
    assert.equal(getWorkspaceSnapshot().focusedTabId, first);
  });

  it('moving focus into a hidden pane releases the zoom', () => {
    openAndSync('session', 'unbox');
    openAndSync('table', 'orders');
    splitFocusedPane('row');
    toggleMaximizePane();
    assert.ok(getCanvasSnapshot().maximizedGroupId);
    focusPaneDirection('left');
    assert.equal(getCanvasSnapshot().maximizedGroupId, null);
  });

  it('cycles tabs within the focused pane and wraps', () => {
    const first = openAndSync('session', 'unbox');
    const second = openAndSync('table', 'orders');
    cycleTabInFocusedPane(1);
    assert.equal(getWorkspaceSnapshot().focusedTabId, first, 'wrapped past the end');
    cycleTabInFocusedPane(-1);
    assert.equal(getWorkspaceSnapshot().focusedTabId, second);
  });
});

describe('canvas store — moving a tab', () => {
  it('sends the focused tab to the neighbouring pane', () => {
    const first = openAndSync('session', 'unbox');
    const second = openAndSync('table', 'orders');
    splitFocusedPane('row');
    sync();

    activateTab(first);
    moveFocusedTabDirection('right');

    const { root } = getCanvasSnapshot();
    assert.equal(findGroupForTab(root, first)?.id, findGroupForTab(root, second)?.id);
    assert.equal(getWorkspaceSnapshot().openTabs.length, 2);
  });

  it('splits to make room when the direction is empty', () => {
    openAndSync('session', 'unbox');
    openAndSync('table', 'orders');
    assert.equal(canvasGroups(getCanvasSnapshot().root).length, 1);
    moveFocusedTabDirection('down');
    const { root } = getCanvasSnapshot();
    assert.ok(isSplit(root) && root.orientation === 'column');
    assert.equal(canvasGroups(root).length, 2);
  });
});

describe('canvas store — presets and sashes', () => {
  it('applies a preset to whatever is open and clears any zoom', () => {
    openAndSync('session', 'unbox');
    openAndSync('table', 'orders');
    toggleMaximizePane();

    applyCanvasPreset('compare');

    const { root, maximizedGroupId } = getCanvasSnapshot();
    assert.ok(isSplit(root) && root.orientation === 'row');
    assert.equal(canvasGroups(root).length, 2);
    assert.deepEqual(canvasGroups(root).map((g) => g.tabIds.length), [1, 1]);
    assert.equal(maximizedGroupId, null);
  });

  it('a sash move and an even-out both publish exactly one snapshot each', () => {
    openAndSync('session', 'unbox');
    openAndSync('table', 'orders');
    splitFocusedPane('row');

    let emitted = 0;
    const unsubscribe = subscribeCanvas(() => {
      emitted += 1;
    });
    const splitId = (getCanvasSnapshot().root as { id: string }).id;

    setPaneRatio(splitId, 0.7);
    assert.equal(emitted, 1);
    setPaneRatio(splitId, 0.7);
    assert.equal(emitted, 1, 'a no-op ratio must not churn the snapshot');
    evenOutPanes();
    assert.equal(emitted, 2);
    unsubscribe();
  });

  it('re-publishing the same workspace does not rebuild the snapshot', () => {
    openAndSync('session', 'unbox');
    const before = getCanvasSnapshot();
    sync();
    assert.equal(getCanvasSnapshot(), before, 'identity holds — no render loop');
  });
});

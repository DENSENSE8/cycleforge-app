/**
 * The canvas's geometry budget, pinned — including the D4 gates.
 *
 * These are the numbers the operator has to rule on, worked at the two viewports
 * that actually exist (Playwright's 1440×900 and the Electron window's
 * 1600×1000), plus the 1920 the recommendation gates on. If D4 comes back
 * differently, this file is the diff.
 *
 * Run: `npx tsx --test src/lib/canvas/measure.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canvasGroup, canvasGroups, canvasSplit, canvasTabIds, type CanvasGroup } from './layout';
import { CANVAS_PRESETS } from './presets';
import {
  CANVAS_SASH_PX,
  presetMinFrameWidthPx,
  resolveCanvasLayout,
  subtreeMinHeightPx,
  subtreeMinWidthPx,
  treeTilesSessionBesideSession,
} from './measure';
import { CANVAS_TILE_FLOORS } from './tile-floors';
import { SIDEBAR_SPINE_RESIZE } from '@/lib/sidebar/sidebar-spine';
import type { TabKind } from '@/lib/workspace/types';

/** Group id → what that pane is showing. */
function kinds(map: Record<string, TabKind | null>) {
  return (group: CanvasGroup): TabKind | null => map[group.id] ?? null;
}

const sessionBesideTable = () =>
  canvasSplit('s1', 'row', canvasGroup('g1', ['a']), canvasGroup('g2', ['b']));
const SESSION_TABLE = kinds({ g1: 'session', g2: 'table' });
const SESSION_SESSION = kinds({ g1: 'session', g2: 'session' });

describe('the floors are the ones on file (D4 recommendation)', () => {
  it('session keeps 784; table degrades to 520; tool is the inspector min', () => {
    assert.equal(CANVAS_TILE_FLOORS.sessionMinWidthPx, 784);
    assert.equal(CANVAS_TILE_FLOORS.tableMinWidthPx, 520);
    assert.equal(CANVAS_TILE_FLOORS.toolMinWidthPx, 360);
    assert.equal(CANVAS_TILE_FLOORS.sessionSplitMinFramePx, 1920);
    assert.equal(CANVAS_TILE_FLOORS.tileMinHeightPx, 320);
  });

  it('two sessions need more than either shipped viewport can give', () => {
    // The measurement that forced D4, worked against the CANVAS FRAME rather
    // than the raw window: the canvas is a sibling of the MasterNav spine, so
    // the spine's width is gone before the canvas sees a pixel.
    const needed = subtreeMinWidthPx(sessionBesideTable(), SESSION_SESSION);
    assert.equal(needed, 784 + 784 + CANVAS_SASH_PX); // 1574
    assert.ok(needed > 1440, 'the whole Playwright viewport cannot seat two sessions');
    assert.ok(
      needed > 1600 - SIDEBAR_SPINE_RESIZE.defaultWidthPx,
      'nor can the Electron window beside an open spine',
    );
    assert.ok(needed < CANVAS_TILE_FLOORS.sessionSplitMinFramePx, 'but 1920 can');
  });

  it('a session beside a TABLE fits the Electron window', () => {
    // Which is the whole reason the table floor is lower: this is the pairing
    // an operator can actually have on the machine in front of them.
    assert.equal(subtreeMinWidthPx(sessionBesideTable(), SESSION_TABLE), 784 + 520 + 6);
    assert.ok(subtreeMinWidthPx(sessionBesideTable(), SESSION_TABLE) < 1600);
  });
});

describe('subtree minimums', () => {
  it('a row adds its children and a sash; a column takes the wider of them', () => {
    const nested = canvasSplit(
      's1',
      'row',
      canvasGroup('g1'),
      canvasSplit('s2', 'column', canvasGroup('g2'), canvasGroup('g3')),
    );
    const kindOf = kinds({ g1: 'session', g2: 'table', g3: 'tool' });
    assert.equal(subtreeMinWidthPx(nested, kindOf), 784 + CANVAS_SASH_PX + 520);
    assert.equal(subtreeMinHeightPx(nested), 320 + CANVAS_SASH_PX + 320);
  });

  it('an empty pane costs a tool tile — it is a chooser, not free', () => {
    assert.equal(subtreeMinWidthPx(canvasGroup('g1'), () => null), 360);
  });
});

describe('resolveCanvasLayout — rectangles', () => {
  const frame = { widthPx: 1920, heightPx: 1000 };

  it('a single pane takes the whole frame with no sash', () => {
    const solved = resolveCanvasLayout({
      root: canvasGroup('g1', ['a']),
      frame,
      kindOf: SESSION_TABLE,
      focusedGroupId: 'g1',
    });
    assert.equal(solved.mode, 'tiled');
    assert.deepEqual(solved.tiles[0].rect, { xPx: 0, yPx: 0, widthPx: 1920, heightPx: 1000 });
    assert.equal(solved.sashes.length, 0);
  });

  it('two tiles plus the sash account for every pixel of the frame', () => {
    const solved = resolveCanvasLayout({
      root: sessionBesideTable(),
      frame,
      kindOf: SESSION_TABLE,
      focusedGroupId: 'g1',
    });
    assert.equal(solved.mode, 'tiled');
    const [left, right] = solved.tiles;
    assert.equal(left.rect.widthPx + CANVAS_SASH_PX + right.rect.widthPx, 1920);
    assert.equal(left.rect.xPx, 0);
    assert.equal(solved.sashes[0].rect.xPx, left.rect.widthPx);
    assert.equal(right.rect.xPx, left.rect.widthPx + CANVAS_SASH_PX);
    assert.equal(left.rect.heightPx, 1000, 'a row split does not touch height');
  });

  it('a ratio lands where the operator dropped it, floors permitting', () => {
    const solved = resolveCanvasLayout({
      root: canvasSplit('s1', 'row', canvasGroup('g1', ['a']), canvasGroup('g2', ['b']), 0.7),
      frame,
      kindOf: SESSION_TABLE,
      focusedGroupId: 'g1',
    });
    // content = 1920 − 6 = 1914; 0.7 × 1914 = 1339.8 → 1340 after the remainder.
    assert.equal(solved.tiles[0].rect.widthPx, 1340);
    assert.equal(solved.tiles[1].rect.widthPx, 574);
  });

  it('a column split divides height and leaves width alone', () => {
    const solved = resolveCanvasLayout({
      root: canvasSplit('s1', 'column', canvasGroup('g1', ['a']), canvasGroup('g2', ['b'])),
      frame,
      kindOf: SESSION_TABLE,
      focusedGroupId: 'g1',
    });
    const [top, bottom] = solved.tiles;
    assert.equal(top.rect.widthPx, 1920);
    assert.equal(top.rect.heightPx + CANVAS_SASH_PX + bottom.rect.heightPx, 1000);
    assert.equal(bottom.rect.yPx, top.rect.heightPx + CANVAS_SASH_PX);
    assert.equal(solved.sashes[0].orientation, 'column');
  });
});

describe('resolveCanvasLayout — when the tree does not fit, the LAYOUT changes', () => {
  it('gates session-beside-session below 1920 and shows the FOCUSED session', () => {
    const solved = resolveCanvasLayout({
      root: sessionBesideTable(),
      frame: { widthPx: 1600, heightPx: 1000 }, // the Electron window
      kindOf: SESSION_SESSION,
      focusedGroupId: 'g2',
    });
    assert.equal(solved.mode, 'single');
    assert.equal(solved.reason, 'session-split-gate');
    assert.equal(solved.tiles.length, 1);
    assert.equal(solved.tiles[0].groupId, 'g2', 'the operator’s attention is the tiebreak');
    assert.deepEqual(solved.hiddenGroupIds, ['g1']);
    assert.equal(solved.tiles[0].rect.widthPx, 1600);
  });

  it('allows session-beside-session at exactly 1920', () => {
    const solved = resolveCanvasLayout({
      root: sessionBesideTable(),
      frame: { widthPx: 1920, heightPx: 1000 },
      kindOf: SESSION_SESSION,
      focusedGroupId: 'g1',
    });
    assert.equal(solved.mode, 'tiled');
    assert.equal(solved.tiles.length, 2);
  });

  it('drops to one tile when the floors simply do not fit', () => {
    const solved = resolveCanvasLayout({
      root: sessionBesideTable(),
      frame: { widthPx: 1200, heightPx: 900 },
      kindOf: SESSION_TABLE, // needs 1310
      focusedGroupId: 'g1',
    });
    assert.equal(solved.mode, 'single');
    assert.equal(solved.reason, 'below-min-fit');
    assert.equal(solved.minFrameWidthPx, 1310);
  });

  it('drops to one tile when a stacked pair cannot hold its height floors', () => {
    const solved = resolveCanvasLayout({
      root: canvasSplit('s1', 'column', canvasGroup('g1', ['a']), canvasGroup('g2', ['b'])),
      frame: { widthPx: 1920, heightPx: 600 }, // needs 320 + 6 + 320
      kindOf: SESSION_TABLE,
      focusedGroupId: 'g1',
    });
    assert.equal(solved.mode, 'single');
    assert.equal(solved.reason, 'below-min-fit');
    assert.equal(solved.minFrameHeightPx, 646);
  });

  it('an unmeasured frame shows the focused tile rather than nothing', () => {
    const solved = resolveCanvasLayout({
      root: sessionBesideTable(),
      frame: { widthPx: 0, heightPx: 0 },
      kindOf: SESSION_TABLE,
      focusedGroupId: 'g2',
    });
    assert.equal(solved.mode, 'single');
    assert.equal(solved.reason, 'unmeasured');
    assert.equal(solved.tiles[0].groupId, 'g2');
  });

  it('a zoomed pane wins over a layout that would otherwise tile', () => {
    const solved = resolveCanvasLayout({
      root: sessionBesideTable(),
      frame: { widthPx: 1920, heightPx: 1000 },
      kindOf: SESSION_TABLE,
      focusedGroupId: 'g1',
      maximizedGroupId: 'g2',
    });
    assert.equal(solved.mode, 'single');
    assert.equal(solved.reason, 'maximized');
    assert.equal(solved.tiles[0].groupId, 'g2');
  });

  it('a stale zoom id cannot strand the canvas in single mode', () => {
    const solved = resolveCanvasLayout({
      root: sessionBesideTable(),
      frame: { widthPx: 1920, heightPx: 1000 },
      kindOf: SESSION_TABLE,
      focusedGroupId: 'g1',
      maximizedGroupId: 'closed-pane',
    });
    assert.equal(solved.mode, 'tiled');
  });
});

describe('treeTilesSessionBesideSession', () => {
  it('fires on a row and not on a stack — D4 measured width', () => {
    assert.equal(treeTilesSessionBesideSession(sessionBesideTable(), SESSION_SESSION), true);
    assert.equal(
      treeTilesSessionBesideSession(
        canvasSplit('s1', 'column', canvasGroup('g1', ['a']), canvasGroup('g2', ['b'])),
        SESSION_SESSION,
      ),
      false,
    );
    assert.equal(treeTilesSessionBesideSession(sessionBesideTable(), SESSION_TABLE), false);
  });

  it('sees a session nested anywhere inside either side', () => {
    const root = canvasSplit(
      's1',
      'row',
      canvasGroup('g1', ['a']),
      canvasSplit('s2', 'column', canvasGroup('g2', ['b']), canvasGroup('g3', ['c'])),
    );
    assert.equal(
      treeTilesSessionBesideSession(root, kinds({ g1: 'session', g2: 'table', g3: 'session' })),
      true,
    );
  });
});

describe('presetMinFrameWidthPx', () => {
  it('tells the picker what a preset needs before the operator clicks it', () => {
    assert.equal(presetMinFrameWidthPx(['session', 'table']), 784 + 520 + 6);
    assert.equal(presetMinFrameWidthPx(['session', 'table', 'tool']), 784 + 520 + 360 + 12);
    assert.equal(presetMinFrameWidthPx(['session']), 784);
  });
});

describe('the absorbed compare presets', () => {
  it('every preset builds the pane count it advertises', () => {
    // The forks' `clayout` vocabulary, now geometry-only: single → focus,
    // split → compare, quad → quad. `paneCount` drives the picker's fit check,
    // so a preset whose builder disagreed with it would grey out the wrong ones.
    const ids = {
      groupId: (i: number) => `g${i}`,
      splitId: (i: number) => `s${i}`,
    };
    for (const preset of Object.values(CANVAS_PRESETS)) {
      const root = preset.build(['a', 'b', 'c', 'd'], ids);
      assert.equal(
        canvasGroups(root).length,
        preset.paneCount,
        `${preset.id} built the wrong number of panes`,
      );
      assert.deepEqual(
        canvasTabIds(root).slice().sort(),
        ['a', 'b', 'c', 'd'],
        `${preset.id} dropped or duplicated a tab`,
      );
    }
  });

  it('quad is 2 × 2 and needs a wider bench than any other preset', () => {
    const root = CANVAS_PRESETS.quad.build(['a', 'b', 'c', 'd'], {
      groupId: (i) => `g${i}`,
      splitId: (i) => `s${i}`,
    });
    assert.equal(subtreeMinWidthPx(root, () => 'table'), 520 + 6 + 520);
    assert.equal(subtreeMinHeightPx(root), 320 + 6 + 320);
  });
});

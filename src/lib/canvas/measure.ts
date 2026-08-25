/**
 * Canvas measurement — tree + frame → the rectangles the host paints.
 *
 * Pure and DOM-free. The host measures its own box with one `ResizeObserver`,
 * hands the numbers here, and renders what comes back; it never derives a
 * position itself. That split is what makes the degrade decision (D4) testable
 * and makes the native-overlay bounds (Electron's `WebContentsView`) computable
 * from the same numbers the DOM used, rather than from a second measurement that
 * can disagree by a pixel.
 *
 * ## Why absolute rectangles and not nested flex
 *
 * Nested `flex` would render the same tree with less code, and would put the
 * constraint solver out of a job — CSS would resolve the widths and nothing in
 * TypeScript would know what it decided. Three things need to know:
 *
 * 1. **The degrade decision.** "Two session tiles do not fit this viewport" has
 *    to change the LAYOUT (drop to one tile), not merely crush two panes. CSS
 *    cannot express "if the minimums do not fit, render something else".
 * 2. **The sash's ceiling.** A drag needs `[min, max]` in px before it starts,
 *    and the max depends on every sibling's floor.
 * 3. **The native overlay.** Electron's `WebContentsView` sits ABOVE the page at
 *    absolute window pixels — it cannot be clipped by `overflow:hidden` and
 *    cannot be z-indexed under a tile. Its bounds must be computed, not
 *    inherited, and they must be recomputed on every layout change.
 */

import {
  paneRowMinFramePx,
  resolvePaneRow,
  type PaneConstraint,
} from '@/lib/canvas/geometry';
import {
  canvasGroups,
  isGroup,
  type CanvasGroup,
  type CanvasNode,
  type CanvasOrientation,
} from '@/lib/canvas/layout';
import {
  CANVAS_TILE_FLOORS,
  canvasSessionSplitAllowed,
  tileMinWidthPx,
} from '@/lib/canvas/tile-floors';
import type { TabKind } from '@/lib/workspace/types';

/** Sash thickness — the draggable seam between two tiles. */
export const CANVAS_SASH_PX = 6;

export interface CanvasRect {
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface CanvasTilePlacement {
  readonly groupId: string;
  readonly rect: CanvasRect;
  /** The tile is pinned at a floor — its sash cannot take any more from it. */
  readonly constrained: boolean;
}

export interface CanvasSashPlacement {
  readonly splitId: string;
  readonly orientation: CanvasOrientation;
  readonly rect: CanvasRect;
  /** Px the two children divide, sash excluded — the drag's denominator. */
  readonly availablePx: number;
  readonly firstMinPx: number;
  readonly secondMinPx: number;
  readonly ratio: number;
}

/**
 * Why the canvas is showing one tile instead of the operator's tree.
 * `null` means it is showing the tree.
 */
export type CanvasDegradeReason =
  /** The frame has not been measured yet (first paint). */
  | 'unmeasured'
  /** The tree's floors exceed the frame — D4's "ship single-tile below it". */
  | 'below-min-fit'
  /** Two session tiles, frame below `sessionSplitMinFramePx`. */
  | 'session-split-gate'
  /** The operator zoomed one tile. Not a degrade — a choice. */
  | 'maximized';

export interface CanvasLayoutSolution {
  readonly mode: 'tiled' | 'single';
  readonly reason: CanvasDegradeReason | null;
  readonly tiles: readonly CanvasTilePlacement[];
  readonly sashes: readonly CanvasSashPlacement[];
  /** Groups the operator's tree contains that this solution is not painting. */
  readonly hiddenGroupIds: readonly string[];
  /** The narrowest frame that would have seated the whole tree. */
  readonly minFrameWidthPx: number;
  readonly minFrameHeightPx: number;
}

/** What a group is showing, as a kind. `null` = an empty (launcher) pane. */
export type CanvasGroupKind = (group: CanvasGroup) => TabKind | null;

function groupMinWidthPx(group: CanvasGroup, kindOf: CanvasGroupKind): number {
  return tileMinWidthPx(kindOf(group));
}

/** The narrowest this subtree can be with every tile at its floor. */
export function subtreeMinWidthPx(node: CanvasNode, kindOf: CanvasGroupKind): number {
  if (isGroup(node)) return groupMinWidthPx(node, kindOf);
  const first = subtreeMinWidthPx(node.children[0], kindOf);
  const second = subtreeMinWidthPx(node.children[1], kindOf);
  return node.orientation === 'row'
    ? first + second + CANVAS_SASH_PX
    : Math.max(first, second);
}

/** The shortest this subtree can be with every tile at its floor. */
export function subtreeMinHeightPx(node: CanvasNode): number {
  if (isGroup(node)) return CANVAS_TILE_FLOORS.tileMinHeightPx;
  const first = subtreeMinHeightPx(node.children[0]);
  const second = subtreeMinHeightPx(node.children[1]);
  return node.orientation === 'column'
    ? first + second + CANVAS_SASH_PX
    : Math.max(first, second);
}

function subtreeHasSession(node: CanvasNode, kindOf: CanvasGroupKind): boolean {
  return canvasGroups(node).some((group) => kindOf(group) === 'session');
}

/**
 * Does the tree tile a session beside a session anywhere? The ≥1920 gate's
 * trigger — checked structurally, so it fires on `row` splits only (two sessions
 * STACKED are a height question, and height is not what D4 measured).
 */
export function treeTilesSessionBesideSession(
  node: CanvasNode,
  kindOf: CanvasGroupKind,
): boolean {
  if (isGroup(node)) return false;
  if (
    node.orientation === 'row' &&
    subtreeHasSession(node.children[0], kindOf) &&
    subtreeHasSession(node.children[1], kindOf)
  ) {
    return true;
  }
  return (
    treeTilesSessionBesideSession(node.children[0], kindOf) ||
    treeTilesSessionBesideSession(node.children[1], kindOf)
  );
}

function placeSubtree(
  node: CanvasNode,
  rect: CanvasRect,
  kindOf: CanvasGroupKind,
  tiles: CanvasTilePlacement[],
  sashes: CanvasSashPlacement[],
  constrained: boolean,
): void {
  if (isGroup(node)) {
    tiles.push({ groupId: node.id, rect, constrained });
    return;
  }

  const horizontal = node.orientation === 'row';
  const axisPx = horizontal ? rect.widthPx : rect.heightPx;
  const minOf = (child: CanvasNode): number =>
    horizontal ? subtreeMinWidthPx(child, kindOf) : subtreeMinHeightPx(child);

  const panes: PaneConstraint[] = [
    { key: `${node.id}#0`, minPx: minOf(node.children[0]), weight: node.ratio },
    { key: `${node.id}#1`, minPx: minOf(node.children[1]), weight: 1 - node.ratio },
  ];
  const solution = resolvePaneRow({
    framePx: axisPx,
    gutterPx: CANVAS_SASH_PX,
    panes,
  });

  const [first, second] = solution.panes;
  const firstRect: CanvasRect = horizontal
    ? { xPx: rect.xPx + first.offsetPx, yPx: rect.yPx, widthPx: first.px, heightPx: rect.heightPx }
    : { xPx: rect.xPx, yPx: rect.yPx + first.offsetPx, widthPx: rect.widthPx, heightPx: first.px };
  const secondRect: CanvasRect = horizontal
    ? { xPx: rect.xPx + second.offsetPx, yPx: rect.yPx, widthPx: second.px, heightPx: rect.heightPx }
    : { xPx: rect.xPx, yPx: rect.yPx + second.offsetPx, widthPx: rect.widthPx, heightPx: second.px };

  sashes.push({
    splitId: node.id,
    orientation: node.orientation,
    rect: horizontal
      ? {
          xPx: rect.xPx + first.offsetPx + first.px,
          yPx: rect.yPx,
          widthPx: CANVAS_SASH_PX,
          heightPx: rect.heightPx,
        }
      : {
          xPx: rect.xPx,
          yPx: rect.yPx + first.offsetPx + first.px,
          widthPx: rect.widthPx,
          heightPx: CANVAS_SASH_PX,
        },
    availablePx: solution.contentPx,
    firstMinPx: panes[0].minPx,
    secondMinPx: panes[1].minPx,
    ratio: node.ratio,
  });

  placeSubtree(node.children[0], firstRect, kindOf, tiles, sashes, first.constrained || constrained);
  placeSubtree(node.children[1], secondRect, kindOf, tiles, sashes, second.constrained || constrained);
}

/**
 * Solve the whole canvas.
 *
 * Order matters: the single-tile fallbacks are checked BEFORE any rectangle is
 * computed, because each of them means the tree the operator built is not what
 * gets painted, and computing rects for a layout that will not be shown would
 * publish sash geometry for sashes that do not exist.
 *
 * The fallback tile is the FOCUSED group — not the first, not the largest. The
 * operator's attention is the only defensible tiebreak, and it is also the only
 * one that keeps the live subtree (the single tab `isTabLive()` answers true
 * for) on screen.
 */
export function resolveCanvasLayout(input: {
  root: CanvasNode;
  frame: { widthPx: number; heightPx: number };
  kindOf: CanvasGroupKind;
  /** The group holding the workspace's focused tab. */
  focusedGroupId: string | null;
  /** Non-null while the operator has zoomed one tile. */
  maximizedGroupId?: string | null;
}): CanvasLayoutSolution {
  const { root, frame, kindOf } = input;
  const groups = canvasGroups(root);
  const minFrameWidthPx = subtreeMinWidthPx(root, kindOf);
  const minFrameHeightPx = subtreeMinHeightPx(root);

  const widthPx = Number.isFinite(frame.widthPx) ? Math.max(0, frame.widthPx) : 0;
  const heightPx = Number.isFinite(frame.heightPx) ? Math.max(0, frame.heightPx) : 0;
  const full: CanvasRect = { xPx: 0, yPx: 0, widthPx, heightPx };

  const focusedId =
    (input.focusedGroupId && groups.some((g) => g.id === input.focusedGroupId)
      ? input.focusedGroupId
      : null) ?? groups[0]?.id ?? null;

  const single = (reason: CanvasDegradeReason): CanvasLayoutSolution => ({
    mode: 'single',
    reason,
    tiles: focusedId ? [{ groupId: focusedId, rect: full, constrained: false }] : [],
    sashes: [],
    hiddenGroupIds: groups.filter((g) => g.id !== focusedId).map((g) => g.id),
    minFrameWidthPx,
    minFrameHeightPx,
  });

  if (input.maximizedGroupId) {
    const maximized = groups.find((g) => g.id === input.maximizedGroupId);
    if (maximized) {
      return {
        mode: 'single',
        reason: 'maximized',
        tiles: [{ groupId: maximized.id, rect: full, constrained: false }],
        sashes: [],
        hiddenGroupIds: groups.filter((g) => g.id !== maximized.id).map((g) => g.id),
        minFrameWidthPx,
        minFrameHeightPx,
      };
    }
  }

  if (isGroup(root)) {
    return {
      mode: 'tiled',
      reason: null,
      tiles: [{ groupId: root.id, rect: full, constrained: false }],
      sashes: [],
      hiddenGroupIds: [],
      minFrameWidthPx,
      minFrameHeightPx,
    };
  }

  if (widthPx <= 0 || heightPx <= 0) return single('unmeasured');
  if (treeTilesSessionBesideSession(root, kindOf) && !canvasSessionSplitAllowed(widthPx)) {
    return single('session-split-gate');
  }
  if (widthPx < minFrameWidthPx || heightPx < minFrameHeightPx) return single('below-min-fit');

  const tiles: CanvasTilePlacement[] = [];
  const sashes: CanvasSashPlacement[] = [];
  placeSubtree(root, full, kindOf, tiles, sashes, false);
  return {
    mode: 'tiled',
    reason: null,
    tiles,
    sashes,
    hiddenGroupIds: [],
    minFrameWidthPx,
    minFrameHeightPx,
  };
}

/**
 * The narrowest frame a flat row of these tile kinds would need. Exposed for the
 * launcher / preset picker, which has to grey out a preset the current viewport
 * cannot seat — telling an operator *before* the click is the whole difference
 * between a gate and a bug.
 */
export function presetMinFrameWidthPx(kinds: readonly (TabKind | null)[]): number {
  return paneRowMinFramePx(
    kinds.map((kind, index) => ({ key: String(index), minPx: tileMinWidthPx(kind) })),
    CANVAS_SASH_PX,
  );
}

/**
 * Canvas presets — named arrangements, and the home for every "compare" layout
 * this repo would otherwise fork again.
 *
 * ## What this replaces
 *
 * `unbox-compare-layout.ts` (162 LOC) and `orders-compare-layout.ts` (151 LOC)
 * were the same tiling model written twice, and the second one said so in its
 * own header: *"fork of Unbox pattern; do not import receiving compare
 * modules."* Both declared the identical vocabulary —
 * `clayout = single | split | quad` plus per-pane recipes `c0`…`c3` — and
 * differed only in what a pane recipe named (a receiving tab vs a lifecycle
 * view). They are staged for deletion in this worktree by the lane that owns
 * their surfaces; this file is where their model lands, and where a third fork
 * does not get written.
 *
 * The mapping is direct: their `single` is {@link CANVAS_PRESETS}.focus, their
 * `split` is `compare`, their `quad` is `quad`. What does NOT come across is the
 * URL vocabulary: a pane's contents are tabs in the workspace store now, so
 * `c0`…`c3` have nothing to encode. That is the actual saving — the forks were
 * ~313 LOC of layout because each one had to serialize its own panes into query
 * params, and the tab model does that once for everything.
 *
 * (The four surviving `*compare*` modules are unrelated and stay:
 * `order-compare-model.ts`, `queue-row-compare.ts`, `receiving-grid-compare.ts`
 * and `incoming-grid-compare.ts` are DIFF models — which fields disagree — not
 * geometry.)
 *
 * ## Why presets are data and not components
 *
 * A preset is a tree constructor, not a surface. "Compare" got forked twice
 * because each fork carried its own geometry AND its own contents; a preset that
 * carries only geometry can be applied to whatever is open, which is what a
 * window manager is for. If a preset ever needs to know what is IN a pane, it
 * has stopped being a preset and become a session type.
 */

import {
  canvasGroup,
  canvasSplit,
  type CanvasNode,
} from '@/lib/canvas/layout';

export type CanvasPresetId = 'focus' | 'compare' | 'stack' | 'triptych' | 'quad';

/** Ids for the nodes a preset mints. The store supplies them; see `layout.ts`. */
export interface CanvasPresetIds {
  /** Group id for pane `index` (0-based, left/top first). */
  groupId: (index: number) => string;
  /** Split id for split `index` (0-based, outermost first). */
  splitId: (index: number) => string;
}

export interface CanvasPreset {
  readonly id: CanvasPresetId;
  readonly label: string;
  /** One line an operator can read in a menu — what it is FOR, not what it looks like. */
  readonly hint: string;
  /** How many panes the arrangement has. Drives the min-frame check in the picker. */
  readonly paneCount: number;
  build(tabIds: readonly string[], ids: CanvasPresetIds): CanvasNode;
}

/**
 * Deal the open tabs across `paneCount` panes: one each, round-robin, remainder
 * to the first. Round-robin rather than "everything past the first goes in pane
 * 2" because an operator applying `compare` to three open tabs means "put them
 * beside each other", and the pane that gets two of them should be the one they
 * are looking at.
 */
function dealTabs(tabIds: readonly string[], paneCount: number): string[][] {
  const panes: string[][] = Array.from({ length: paneCount }, () => []);
  tabIds.forEach((tabId, index) => {
    panes[index % paneCount].push(tabId);
  });
  return panes;
}

export const CANVAS_PRESETS: Record<CanvasPresetId, CanvasPreset> = {
  focus: {
    id: 'focus',
    label: 'Focus',
    hint: 'One pane. Everything open stays open, in tabs.',
    paneCount: 1,
    build: (tabIds, ids) => canvasGroup(ids.groupId(0), tabIds),
  },

  /**
   * The absorbed compare layout: two panes side by side, evenly split. This is
   * the arrangement both deleted-by-plan forks were: a record on the left, the
   * thing it is being checked against on the right.
   */
  compare: {
    id: 'compare',
    label: 'Compare',
    hint: 'Two panes side by side — a record and what it is being checked against.',
    paneCount: 2,
    build: (tabIds, ids) => {
      const [left, right] = dealTabs(tabIds, 2);
      return canvasSplit(
        ids.splitId(0),
        'row',
        canvasGroup(ids.groupId(0), left),
        canvasGroup(ids.groupId(1), right),
        0.5,
      );
    },
  },

  stack: {
    id: 'stack',
    label: 'Stack',
    hint: 'Two panes, one above the other — a bench over its queue.',
    paneCount: 2,
    build: (tabIds, ids) => {
      const [top, bottom] = dealTabs(tabIds, 2);
      return canvasSplit(
        ids.splitId(0),
        'column',
        canvasGroup(ids.groupId(0), top),
        canvasGroup(ids.groupId(1), bottom),
        0.5,
      );
    },
  },

  /**
   * The bento in `02-target-architecture.md`: a work surface on the left, a
   * table over a tool on the right. The left pane is the wide one (0.58) because
   * it is the one holding a session floor.
   */
  triptych: {
    id: 'triptych',
    label: 'Triptych',
    hint: 'Work surface left; a table over a tool on the right.',
    paneCount: 3,
    build: (tabIds, ids) => {
      const [main, upper, lower] = dealTabs(tabIds, 3);
      return canvasSplit(
        ids.splitId(0),
        'row',
        canvasGroup(ids.groupId(0), main),
        canvasSplit(
          ids.splitId(1),
          'column',
          canvasGroup(ids.groupId(1), upper),
          canvasGroup(ids.groupId(2), lower),
          0.5,
        ),
        0.58,
      );
    },
  },

  /**
   * Four panes, 2 × 2 — the deleted forks' `clayout=quad`, which is why it is
   * here at all: it was a real arrangement two surfaces shipped, not a shape
   * invented for symmetry. It needs a wide bench (four tile floors plus three
   * sashes), and `presetMinFrameWidthPx` is what tells the picker so.
   */
  quad: {
    id: 'quad',
    label: 'Quad',
    hint: 'Four panes, 2 × 2 — a wide bench watching four things at once.',
    paneCount: 4,
    build: (tabIds, ids) => {
      const [a, b, c, d] = dealTabs(tabIds, 4);
      return canvasSplit(
        ids.splitId(0),
        'row',
        canvasSplit(
          ids.splitId(1),
          'column',
          canvasGroup(ids.groupId(0), a),
          canvasGroup(ids.groupId(1), b),
          0.5,
        ),
        canvasSplit(
          ids.splitId(2),
          'column',
          canvasGroup(ids.groupId(2), c),
          canvasGroup(ids.groupId(3), d),
          0.5,
        ),
        0.5,
      );
    },
  },
};

export const CANVAS_PRESET_IDS = Object.keys(CANVAS_PRESETS) as CanvasPresetId[];

export function isCanvasPresetId(value: string): value is CanvasPresetId {
  return Object.prototype.hasOwnProperty.call(CANVAS_PRESETS, value);
}

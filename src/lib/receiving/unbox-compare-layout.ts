/**
 * Unbox TradingView-like compare layout — URL + staff-prefs vocabulary.
 *
 * `clayout=single|split|quad` plus per-pane recipes `c0`…`c3` (tab id, optional
 * stage/lane). Single layout omits the params (clean URL).
 */

import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';
import type { ReceivingPaneQuery } from '@/lib/receiving/receiving-pane-query';

export const UNBOX_COMPARE_LAYOUT_PARAM = 'clayout';
const UNBOX_COMPARE_PANE_PARAMS = ['c0', 'c1', 'c2', 'c3'] as const;

export type UnboxCompareLayout = 'single' | 'split' | 'quad';

export type UnboxComparePaneId = 'a' | 'b' | 'c' | 'd';

export const UNBOX_COMPARE_PANE_IDS: readonly UnboxComparePaneId[] = [
  'a',
  'b',
  'c',
  'd',
];

/** Minimum usable width per compare pane before auto-downgrade. */
export const UNBOX_COMPARE_PANE_MIN_PX = 360;

/** Quad needs four mins; below this center floor, force split. */
export const UNBOX_COMPARE_QUAD_FLOOR_PX = UNBOX_COMPARE_PANE_MIN_PX * 2 + 24;

const LAYOUT_SET = new Set<UnboxCompareLayout>(['single', 'split', 'quad']);

const TAB_SET = new Set<UnboxWorkspaceTab>(['recent', 'queue', 'history']);

const STAGE_SET = new Set(['staged', 'unstaged']);
const LANE_SET = new Set(['PO_STOCKOUT', 'PO_STANDARD', 'RETURN', 'HOLD']);

export function parseUnboxCompareLayout(
  raw: string | null | undefined,
): UnboxCompareLayout {
  const v = String(raw || '').trim().toLowerCase();
  return LAYOUT_SET.has(v as UnboxCompareLayout)
    ? (v as UnboxCompareLayout)
    : 'single';
}

/** Pane count for a layout. */
export function unboxComparePaneCount(layout: UnboxCompareLayout): number {
  if (layout === 'quad') return 4;
  if (layout === 'split') return 2;
  return 1;
}

/**
 * Encode one pane recipe: `queue`, `queue:staged`, `queue:unstaged:PO_STOCKOUT`,
 * `history`, `recent`.
 */
export function encodeUnboxComparePane(query: ReceivingPaneQuery): string {
  const parts: string[] = [query.tab];
  if (query.queueStage) parts.push(query.queueStage);
  if (query.queueLane) parts.push(query.queueLane);
  return parts.join(':');
}

export function parseUnboxComparePane(
  raw: string | null | undefined,
  fallbackTab: UnboxWorkspaceTab = 'queue',
): ReceivingPaneQuery {
  const bits = String(raw || '')
    .trim()
    .split(':')
    .filter(Boolean);
  const tab = (TAB_SET.has(bits[0] as UnboxWorkspaceTab)
    ? bits[0]
    : fallbackTab) as UnboxWorkspaceTab;
  let queueStage: ReceivingPaneQuery['queueStage'] = null;
  let queueLane: ReceivingPaneQuery['queueLane'] = null;
  for (const bit of bits.slice(1)) {
    if (STAGE_SET.has(bit)) queueStage = bit as 'staged' | 'unstaged';
    else if (LANE_SET.has(bit)) {
      queueLane = bit as NonNullable<ReceivingPaneQuery['queueLane']>;
    }
  }
  return { tab, queueStage, queueLane };
}

/** Default recipes when opening split/quad with empty pane params. */
export function defaultUnboxComparePanes(
  layout: UnboxCompareLayout,
): ReceivingPaneQuery[] {
  if (layout === 'quad') {
    return [
      { tab: 'queue' },
      { tab: 'recent' },
      { tab: 'history' },
      { tab: 'queue', queueStage: 'unstaged' },
    ];
  }
  if (layout === 'split') {
    return [{ tab: 'queue' }, { tab: 'history' }];
  }
  return [{ tab: 'history' }];
}

/**
 * Read layout + pane recipes from search params. Missing `cN` fills defaults.
 */
export function readUnboxCompareFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): { layout: UnboxCompareLayout; panes: ReceivingPaneQuery[] } {
  const layout = parseUnboxCompareLayout(
    searchParams.get(UNBOX_COMPARE_LAYOUT_PARAM),
  );
  const count = unboxComparePaneCount(layout);
  const defaults = defaultUnboxComparePanes(layout);
  const panes: ReceivingPaneQuery[] = [];
  for (let i = 0; i < count; i++) {
    const raw = searchParams.get(UNBOX_COMPARE_PANE_PARAMS[i]!);
    panes.push(
      raw
        ? parseUnboxComparePane(raw, defaults[i]?.tab ?? 'queue')
        : (defaults[i] ?? { tab: 'queue' }),
    );
  }
  return { layout, panes };
}

/** Write layout + panes into a URLSearchParams (mutates). */
export function writeUnboxCompareParams(
  params: URLSearchParams,
  layout: UnboxCompareLayout,
  panes: readonly ReceivingPaneQuery[],
): void {
  for (const key of UNBOX_COMPARE_PANE_PARAMS) params.delete(key);
  if (layout === 'single') {
    params.delete(UNBOX_COMPARE_LAYOUT_PARAM);
    return;
  }
  params.set(UNBOX_COMPARE_LAYOUT_PARAM, layout);
  const count = unboxComparePaneCount(layout);
  for (let i = 0; i < count; i++) {
    const pane = panes[i] ?? defaultUnboxComparePanes(layout)[i]!;
    params.set(UNBOX_COMPARE_PANE_PARAMS[i]!, encodeUnboxComparePane(pane));
  }
}

/** Downgrade quad → split when the center floor cannot seat four panes. */
export function resolveUnboxCompareLayoutForWidth(
  layout: UnboxCompareLayout,
  centerWidthPx: number,
): UnboxCompareLayout {
  if (layout === 'quad' && centerWidthPx < UNBOX_COMPARE_QUAD_FLOOR_PX) {
    return 'split';
  }
  if (
    layout === 'split'
    && centerWidthPx < UNBOX_COMPARE_PANE_MIN_PX * 2 + 16
  ) {
    return 'single';
  }
  return layout;
}

/**
 * To-ship Orders compare layout — URL vocabulary (fork of Unbox pattern;
 * do not import receiving compare modules).
 *
 * `clayout=single|split|quad` plus per-pane recipes `c0`…`c3` (lifecycle view id).
 * Single layout omits the params (clean URL).
 */

import type { DashboardOrderView } from '@/utils/dashboard-search-state';

export const ORDERS_COMPARE_LAYOUT_PARAM = 'clayout';
const ORDERS_COMPARE_PANE_PARAMS = ['c0', 'c1', 'c2', 'c3'] as const;

export type OrdersCompareLayout = 'single' | 'split' | 'quad';

export type OrdersComparePaneId = 'a' | 'b' | 'c' | 'd';

export const ORDERS_COMPARE_PANE_IDS: readonly OrdersComparePaneId[] = [
  'a',
  'b',
  'c',
  'd',
];

/** Minimum usable width per compare pane before auto-downgrade. */
const ORDERS_COMPARE_PANE_MIN_PX = 360;

/** Quad needs four mins; below this center floor, force split. */
const ORDERS_COMPARE_QUAD_FLOOR_PX = ORDERS_COMPARE_PANE_MIN_PX * 2 + 24;

const LAYOUT_SET = new Set<OrdersCompareLayout>(['single', 'split', 'quad']);

const VIEW_SET = new Set<DashboardOrderView>([
  'unshipped',
  'tested',
  'packed',
  'shipped',
]);

export type OrdersPaneQuery = {
  view: DashboardOrderView;
};

export function parseOrdersCompareLayout(
  raw: string | null | undefined,
): OrdersCompareLayout {
  const v = String(raw || '').trim().toLowerCase();
  return LAYOUT_SET.has(v as OrdersCompareLayout)
    ? (v as OrdersCompareLayout)
    : 'single';
}

export function ordersComparePaneCount(layout: OrdersCompareLayout): number {
  if (layout === 'quad') return 4;
  if (layout === 'split') return 2;
  return 1;
}

function encodeOrdersComparePane(query: OrdersPaneQuery): string {
  return query.view;
}

function parseOrdersComparePane(
  raw: string | null | undefined,
  fallback: DashboardOrderView = 'unshipped',
): OrdersPaneQuery {
  const id = String(raw || '').trim().toLowerCase();
  return {
    view: VIEW_SET.has(id as DashboardOrderView)
      ? (id as DashboardOrderView)
      : fallback,
  };
}

export function defaultOrdersComparePanes(
  layout: OrdersCompareLayout,
): OrdersPaneQuery[] {
  if (layout === 'quad') {
    return [
      { view: 'unshipped' },
      { view: 'tested' },
      { view: 'packed' },
      { view: 'shipped' },
    ];
  }
  if (layout === 'split') {
    return [{ view: 'unshipped' }, { view: 'tested' }];
  }
  return [{ view: 'unshipped' }];
}

export function readOrdersCompareFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): { layout: OrdersCompareLayout; panes: OrdersPaneQuery[] } {
  const layout = parseOrdersCompareLayout(
    searchParams.get(ORDERS_COMPARE_LAYOUT_PARAM),
  );
  const count = ordersComparePaneCount(layout);
  const defaults = defaultOrdersComparePanes(layout);
  const panes: OrdersPaneQuery[] = [];
  for (let i = 0; i < count; i++) {
    const raw = searchParams.get(ORDERS_COMPARE_PANE_PARAMS[i]!);
    panes.push(
      raw
        ? parseOrdersComparePane(raw, defaults[i]?.view ?? 'unshipped')
        : (defaults[i] ?? { view: 'unshipped' }),
    );
  }
  return { layout, panes };
}

export function writeOrdersCompareParams(
  params: URLSearchParams,
  layout: OrdersCompareLayout,
  panes: readonly OrdersPaneQuery[],
): void {
  for (const key of ORDERS_COMPARE_PANE_PARAMS) params.delete(key);
  if (layout === 'single') {
    params.delete(ORDERS_COMPARE_LAYOUT_PARAM);
    return;
  }
  params.set(ORDERS_COMPARE_LAYOUT_PARAM, layout);
  const count = ordersComparePaneCount(layout);
  for (let i = 0; i < count; i++) {
    const pane = panes[i] ?? defaultOrdersComparePanes(layout)[i]!;
    params.set(ORDERS_COMPARE_PANE_PARAMS[i]!, encodeOrdersComparePane(pane));
  }
}

/** Downgrade quad → split (or split → single) when the center floor is tight. */
export function resolveOrdersCompareLayoutForWidth(
  layout: OrdersCompareLayout,
  centerWidthPx: number,
): OrdersCompareLayout {
  if (layout === 'quad' && centerWidthPx < ORDERS_COMPARE_QUAD_FLOOR_PX) {
    return 'split';
  }
  if (
    layout === 'split'
    && centerWidthPx < ORDERS_COMPARE_PANE_MIN_PX * 2 + 16
  ) {
    return 'single';
  }
  return layout;
}

/** Clear compare params (used when entering drill — mutually exclusive). */
export function clearOrdersCompareParams(params: URLSearchParams): void {
  params.delete(ORDERS_COMPARE_LAYOUT_PARAM);
  for (const key of ORDERS_COMPARE_PANE_PARAMS) params.delete(key);
}

/**
 * The tile-opening policy for order displays — the pure half of the hard
 * rule (operator, 2026-08-24): opening a display never overrides another
 * tile's surface. It always lands as its own tile; if a tile already shows
 * that display, THAT tile is the most relevant one and receives it.
 *
 * For order details that means exactly one detail tile:
 *   focus     the order's own tile is already open — go to it
 *   retarget  a DIFFERENT order's detail tile is open — it is the most
 *             relevant tile for an order display, so it closes and the new
 *             order opens in its place (the queue tile is never touched)
 *   open      no order display on the canvas — open a fresh tile
 *
 * DB-free, React-free — `useShell.openOrderDetailTile` maps the verdict
 * onto the workspace store, and the unit test pins the policy (X1: pin
 * where observable, never a regex over source).
 */

export const ORDER_DETAIL_REF_PREFIX = 'order:';

export function orderDetailRef(orderKey: string): string {
  return `${ORDER_DETAIL_REF_PREFIX}${orderKey}`;
}

export type OrderTileVerdict =
  | { readonly kind: 'focus'; readonly tileId: string }
  | { readonly kind: 'retarget'; readonly closeTileId: string; readonly ref: string }
  | { readonly kind: 'open'; readonly ref: string };

export function orderDetailTileVerdict(
  tiles: readonly { readonly id: string; readonly ref: string }[],
  orderKey: string,
): OrderTileVerdict {
  const ref = orderDetailRef(orderKey);
  const exact = tiles.find((t) => t.ref === ref);
  if (exact) return { kind: 'focus', tileId: exact.id };
  const incumbent = tiles.find((t) => t.ref.startsWith(ORDER_DETAIL_REF_PREFIX));
  if (incumbent) return { kind: 'retarget', closeTileId: incumbent.id, ref };
  return { kind: 'open', ref };
}

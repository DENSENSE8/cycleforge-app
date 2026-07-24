/**
 * Order out-of-stock flag — prefers `orders.is_out_of_stock`, falls back to
 * legacy non-empty `out_of_stock` text for older payloads.
 */
export function isOutOfStock(order: {
  is_out_of_stock?: boolean;
  out_of_stock?: unknown;
}): boolean {
  if ('is_out_of_stock' in order) {
    return Boolean(order.is_out_of_stock);
  }
  return Boolean(String(order.out_of_stock || '').trim());
}

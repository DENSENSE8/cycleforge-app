/**
 * The one face of an on-hand stock count, every surface (owner 2026-10-08):
 * red when there is none, yellow at {@link LOW_STOCK_AT} or fewer, and the
 * surface's own ink otherwise — white on a dark ground, black on a light one —
 * so a healthy count never shouts. The colour alone says the health.
 */

export type StockQtyLevel = 'out' | 'low' | 'in';

/** At or under this many on hand the count reads yellow (owner 2026-10-08). */
export const LOW_STOCK_AT = 10;

export function stockQtyLevel(qty: number): StockQtyLevel {
  if (!(qty > 0)) return 'out';
  return qty <= LOW_STOCK_AT ? 'low' : 'in';
}

/** On a black count tab or any dark fill. */
const ON_DARK: Record<StockQtyLevel, string> = {
  out: 'text-red-500',
  low: 'text-yellow-300',
  in: 'text-white',
};

/** On the page / sheet plane, light or dark theme: the semantic tones. */
const ON_PLANE: Record<Exclude<StockQtyLevel, 'in'>, string> = {
  out: 'text-text-danger',
  low: 'text-text-warning',
};

/**
 * Text colour for a stock count. `on: 'dark'` for a count painted on a black
 * tab; otherwise the plane's tones, with `inkClass` (`text-mode-ink` on `/m`,
 * `text-text-default` on the desk) for a healthy count.
 */
export function stockQtyToneClass(
  qty: number,
  { on = 'plane', inkClass = 'text-text-default' }: { on?: 'plane' | 'dark'; inkClass?: string } = {},
): string {
  const level = stockQtyLevel(qty);
  if (on === 'dark') return ON_DARK[level];
  return level === 'in' ? inkClass : ON_PLANE[level];
}

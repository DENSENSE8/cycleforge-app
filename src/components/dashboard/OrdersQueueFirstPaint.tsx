/** SSR first-paint stand-in for the To-ship / Picking order card lists (triage card anatomy). */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { formatOrderIdDisplay } from '@/lib/copy-chip-format';
import { linePrice } from '@/lib/orders/order-card-model';
import { cn } from '@/utils/_cn';

/** Byte-identical to `'relative flex min-h-0 min-w-0 flex-1 flex-col'` in workbench-shell.tsx. */
const SHEET_HOST = 'relative flex min-h-0 min-w-0 flex-1 flex-col';

const FIRST_PAINT_ROW_CAP = 24;

/**
 * The seeded queue as order cards, in the card list's own anatomy (check + icon
 * column, line 1 id · price, photo + title · tracking) so the live
 * `OrderCardList` swaps in without a shift. No seed → the list's skeleton shape.
 */
export function OrdersQueueFirstPaint({
  rows,
  className,
}: {
  rows: readonly ShippedOrder[];
  className?: string;
}) {
  const visible = rows.slice(0, FIRST_PAINT_ROW_CAP);
  return (
    <div
      className={cn(SHEET_HOST, 'overflow-hidden bg-surface-card', className)}
      aria-busy={visible.length === 0}
      aria-label="Orders queue"
      data-paint-surface="orders:primary"
    >
      <ul className="flex flex-col">
        {visible.length === 0
          ? Array.from({ length: 8 }, (_, i) => (
              <li key={i} aria-hidden className="flex gap-3 rounded-2xl px-4 py-2">
                <span className="w-7 shrink-0 space-y-3 pt-0.5">
                  <span className="block size-[18px] animate-pulse rounded-[5px] bg-surface-sunken" />
                  <span className="block size-4 animate-pulse rounded-md bg-surface-sunken" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex justify-between">
                    <span className="h-3.5 w-56 animate-pulse rounded-md bg-surface-sunken" />
                    <span className="h-3.5 w-20 animate-pulse rounded-md bg-surface-sunken" />
                  </span>
                  <span className="flex gap-2">
                    <span className="size-12 shrink-0 animate-pulse rounded-xl bg-surface-sunken" />
                    <span className="flex flex-1 flex-col gap-2 pt-1">
                      <span className="h-4 w-3/4 animate-pulse rounded-md bg-surface-sunken" />
                      <span className="h-3 w-1/2 animate-pulse rounded-md bg-surface-sunken" />
                    </span>
                  </span>
                </span>
              </li>
            ))
          : visible.map((row) => {
              const orderId = String(row.order_id || row.id || '').trim();
              const title = String(row.product_title || row.sku || 'Order').trim();
              const tracking = String(row.shipping_tracking_number || '').trim();
              const price = linePrice(row).text;
              return (
                <li key={`${row.id}-${orderId}`} className="flex gap-3 rounded-2xl px-4 py-2">
                  <span className="w-7 shrink-0 space-y-3 pt-0.5" aria-hidden>
                    <span className="block size-[18px] rounded-[5px] border border-border-soft" />
                    <span className="block size-4 rounded-md bg-surface-sunken" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex min-w-0 items-baseline justify-between gap-3 text-role-caption">
                      <span className="min-w-0 truncate font-mono tabular-nums text-text-muted" title={orderId || undefined}>
                        {formatOrderIdDisplay(orderId) || '—'}
                      </span>
                      {price ? <span className="shrink-0 tabular-nums text-text-default">{price}</span> : null}
                    </span>
                    <span className="flex min-w-0 gap-2">
                      <span className="size-12 shrink-0 rounded-xl bg-surface-sunken" aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
                        <span className="truncate font-medium text-text-default">{title}</span>
                        {tracking ? (
                          <span className="truncate font-mono text-role-caption text-text-faint">{tracking}</span>
                        ) : null}
                      </span>
                    </span>
                  </span>
                </li>
              );
            })}
      </ul>
    </div>
  );
}

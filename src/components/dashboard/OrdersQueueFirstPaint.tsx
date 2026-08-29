/**
 * SSR first-paint stand-in for the To-ship Unshipped queue.
 *
 * Owns LCP when the interactive LedgerGrid has not hydrated yet. Geometry
 * mirrors `'relative flex min-h-0 min-w-0 flex-1 flex-col'` + dense queue rows so the swap to
 * `UnshippedTable` does not register as a layout shift.
 *
 * Server-safe — no `'use client'`, no motion, no TanStack. Class string is
 * inlined (same as `'relative flex min-h-0 min-w-0 flex-1 flex-col'`) so this module stays RSC-importable
 * without pulling the client workbench-shell graph.
 */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { cn } from '@/utils/_cn';

/** Byte-identical to `'relative flex min-h-0 min-w-0 flex-1 flex-col'` in workbench-shell.tsx. */
const SHEET_HOST = 'relative flex min-h-0 min-w-0 flex-1 flex-col';

const FIRST_PAINT_ROW_CAP = 24;

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
      <ul className="divide-y divide-border-soft">
        {visible.length === 0
          ? Array.from({ length: 12 }).map((_, i) => (
              <li key={i} className="flex h-11 items-center gap-3 px-3">
                <span className="h-3 w-24 animate-pulse rounded bg-surface-sunken" />
                <span className="h-3 min-w-0 flex-1 animate-pulse rounded bg-surface-sunken" />
                <span className="h-3 w-20 animate-pulse rounded bg-surface-sunken" />
              </li>
            ))
          : visible.map((row) => {
              const orderId = String(row.order_id || row.id || '').trim();
              const title = String(row.product_title || row.sku || 'Order').trim();
              const tracking = String(row.shipping_tracking_number || '').trim();
              const face = orderId.length > 8 ? orderId.slice(-8) : orderId;
              return (
                <li
                  key={`${row.id}-${orderId}`}
                  className="flex h-11 items-center gap-3 px-3 text-role-caption"
                >
                  <span className="w-24 shrink-0 font-mono text-text-muted tabular-nums">
                    {face || '—'}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-text-default">
                    {title}
                  </span>
                  {tracking ? (
                    <span className="max-w-[9rem] shrink-0 truncate font-mono text-text-faint">
                      {tracking}
                    </span>
                  ) : null}
                </li>
              );
            })}
      </ul>
    </div>
  );
}

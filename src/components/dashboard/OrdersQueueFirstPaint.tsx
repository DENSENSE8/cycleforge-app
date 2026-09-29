/** SSR first-paint stand-in for the To-ship / Picking order card lists (triage card anatomy). */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { linePrice } from '@/lib/orders/order-card-model';
import { recordState } from '@/components/outbound/orders/outbound-orders-ledger-state';
import {
  LEDGER_BAND_CLASS,
  LEDGER_LEAD_CLASS,
  LEDGER_PHOTO_CLASS,
  LEDGER_ROW_CLASS,
  LEDGER_SPINE_CLASS,
  type LedgerRowZoom,
} from '@/components/outbound/orders/outbound-orders-ledger-geometry';
import { cn } from '@/utils/_cn';
import { RecordNoteSlot } from '@/design-system/components/RecordNoteSlot';
import {
  RECORD_ID_CLASS,
  RECORD_TITLE_CLASS,
} from '@/design-system/tokens/industrial-record';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';

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
              <li key={i} aria-hidden className="flex gap-3 rounded-2xl px-4 py-3">
                <span className="w-7 shrink-0 space-y-3 pt-0.5">
                  <span className="block size-[18px] animate-pulse rounded-[5px] bg-surface-sunken" />
                  <span className="block size-4 animate-pulse rounded-md bg-surface-sunken" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <span className="flex justify-between">
                    <span className="h-3.5 w-56 animate-pulse rounded-md bg-surface-sunken" />
                    <span className="h-3.5 w-20 animate-pulse rounded-md bg-surface-sunken" />
                  </span>
                  <span className="flex gap-3">
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
                <li key={`${row.id}-${orderId}`} className="flex gap-3 rounded-2xl px-4 py-3">
                  <span className="w-7 shrink-0 space-y-3 pt-0.5" aria-hidden>
                    <span className="block size-[18px] rounded-[5px] border border-border-soft" />
                    <span className="block size-4 rounded-md bg-surface-sunken" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-2.5">
                    <span className="flex min-w-0 items-baseline justify-between gap-3 text-role-caption">
                      <span className="min-w-0 truncate font-mono tabular-nums text-text-muted">{orderId || '—'}</span>
                      {price ? <span className="shrink-0 tabular-nums text-text-default">{price}</span> : null}
                    </span>
                    <span className="flex min-w-0 gap-3">
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

/**
 * Static ledger records at a zoom step — the orphaned `OutboundOrdersLedger`'s
 * loading face (no desk mounts it; delete with it). Empty `rows` paints blank
 * records (no pulse: the industrial floor has no motion).
 */
export function OrdersLedgerStandIn({
  rows,
  zoom,
  blankRows = 12,
}: {
  rows: readonly ShippedOrder[];
  zoom: LedgerRowZoom;
  blankRows?: number;
}) {
  const bands = zoom === 'S' ? [0] : [0, 1, 2];
  if (rows.length === 0) {
    return (
      <div aria-hidden>
        {Array.from({ length: blankRows }, (_, i) => (
          <div key={i} className={cn('flex border-b border-mode-ink bg-mode-panel', LEDGER_ROW_CLASS[zoom])}>
            <span className={cn(LEDGER_SPINE_CLASS, 'bg-mode-rule')} />
            <span className={cn('shrink-0 border-r border-mode-rule bg-mode-well', LEDGER_PHOTO_CLASS[zoom])} />
            <span className="flex min-w-0 flex-1 flex-col">
              {bands.map((band) => (
                <span
                  key={band}
                  className={cn(
                    'flex items-center px-2',
                    LEDGER_BAND_CLASS[zoom],
                    band < bands.length - 1 && 'border-b border-mode-rule',
                  )}
                >
                  <span className="h-2 w-24 bg-mode-well" />
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul>
      {rows.map((row) => {
        const state = recordState(row);
        const price = linePrice(row).text ?? '—';
        const orderId = String(row.order_id || row.id || '').trim();
        const title = String(row.product_title || row.sku || 'Order').trim();
        return (
          <li
            key={`${row.id}-${orderId}`}
            className={cn('flex border-b border-mode-ink bg-mode-panel', LEDGER_ROW_CLASS[zoom])}
          >
            <span className={cn(LEDGER_SPINE_CLASS, LIFECYCLE_CLASSES[state].dot)} aria-hidden />
            <span
              className={cn('shrink-0 border-r border-mode-rule bg-mode-well', LEDGER_PHOTO_CLASS[zoom])}
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  'flex min-w-0 items-center gap-3 pl-2',
                  LEDGER_BAND_CLASS[zoom],
                  bands.length > 1 && 'border-b border-mode-rule',
                )}
              >
                <LifecycleCode state={state} className="w-11 shrink-0" />
                {/* Same rigid slot as the live record, so the swap never shifts. */}
                <RecordNoteSlot note={String(row.buyer_note ?? '').trim() || null} empty="add" />
                {bands.length > 1 ? null : (
                  <span className={cn(RECORD_ID_CLASS, 'w-24 shrink-0 tabular-nums text-mode-ink')}>{price}</span>
                )}
                <span className={cn(RECORD_ID_CLASS, 'truncate')}>{orderId || '—'}</span>
              </span>
              {bands.length > 1 ? (
                <>
                  <span className={cn('flex min-w-0 items-center border-b border-mode-rule pl-2', LEDGER_BAND_CLASS[zoom])}>
                    <span className={RECORD_TITLE_CLASS}>{title}</span>
                  </span>
                  {/* Band 3 — execution: condition · price, as on the live record (same lead
                      column, so nothing shifts when the live row swaps in). */}
                  <span className={cn('flex min-w-0 items-center gap-3', LEDGER_BAND_CLASS[zoom])}>
                    <span className={cn(LEDGER_LEAD_CLASS, 'pl-2')}>
                      <span className="w-20 shrink-0" aria-hidden />
                    </span>
                    <span className={cn(RECORD_ID_CLASS, 'w-24 shrink-0 tabular-nums text-mode-ink')}>{price}</span>
                  </span>
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

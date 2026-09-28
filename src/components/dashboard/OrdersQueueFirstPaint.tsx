/** SSR first-paint stand-in for the To-ship Unshipped queue. */

import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { formatOutboundStoragePath } from '@/lib/shipping/outbound-storage-path';
import { recordState } from '@/components/outbound/orders/outbound-orders-ledger-state';
import {
  LEDGER_BAND_CLASS,
  LEDGER_LEAD_CLASS,
  LEDGER_LOCATION_CLASS,
  LEDGER_PHOTO_CLASS,
  LEDGER_ROW_CLASS,
  LEDGER_SPINE_CLASS,
  LEDGER_TOOLBAR_CLASS,
  type LedgerRowZoom,
} from '@/components/outbound/orders/outbound-orders-ledger-geometry';
import { cn } from '@/utils/_cn';
import { RecordNoteSlot } from '@/design-system/components/RecordNoteSlot';
import {
  RECORD_FACT_KEY_CLASS,
  RECORD_ID_CLASS,
  RECORD_TITLE_CLASS,
} from '@/design-system/tokens/industrial-record';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';

/** Byte-identical to `'relative flex min-h-0 min-w-0 flex-1 flex-col'` in workbench-shell.tsx. */
const SHEET_HOST = 'relative flex min-h-0 min-w-0 flex-1 flex-col';

const FIRST_PAINT_ROW_CAP = 24;

export function OrdersQueueFirstPaint({
  rows,
  className,
  variant = 'table',
}: {
  rows: readonly ShippedOrder[];
  className?: string;
  variant?: 'table' | 'ledger';
}) {
  const visible = rows.slice(0, FIRST_PAINT_ROW_CAP);

  if (variant === 'ledger') {
    return (
      <div
        className={cn(SHEET_HOST, 'overflow-hidden bg-mode-canvas text-mode-ink', className)}
        aria-busy={visible.length === 0}
        aria-label="Orders queue"
        data-paint-surface="orders:primary"
      >
        {/* Same box as the live toolbar: a 32px hit row + its 1px ink rule. */}
        <div className={LEDGER_TOOLBAR_CLASS} aria-hidden>
          <span className="min-h-mode-hit" />
        </div>
        <OrdersLedgerStandIn rows={visible} zoom="M" />
      </div>
    );
  }

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

/**
 * Static ledger records at a zoom step — the SSR stand-in's body and the live
 * ledger's loading face. Empty `rows` paints blank records (no pulse: the
 * industrial floor has no motion).
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
        const location = formatOutboundStoragePath(row.storage_locations);
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
                  <span
                    className={cn(
                      RECORD_ID_CLASS,
                      LEDGER_LOCATION_CLASS[zoom],
                      'truncate',
                      location ? 'text-mode-ink' : 'text-mode-warn',
                    )}
                  >
                    <span className={RECORD_FACT_KEY_CLASS}>Bin </span>
                    {location ?? 'Unassigned'}
                  </span>
                )}
                <span className={cn(RECORD_ID_CLASS, 'truncate')}>{orderId || '—'}</span>
              </span>
              {bands.length > 1 ? (
                <>
                  <span className={cn('flex min-w-0 items-center border-b border-mode-rule pl-2', LEDGER_BAND_CLASS[zoom])}>
                    <span className={RECORD_TITLE_CLASS}>{title}</span>
                  </span>
                  {/* Band 3 — execution: BIN · SKU, the physical lookup pair, as on the live record
                      (same lead column, so the SKU lands on the live row's x). */}
                  <span className={cn('flex min-w-0 items-center gap-3', LEDGER_BAND_CLASS[zoom])}>
                    <span className={cn(LEDGER_LEAD_CLASS, 'pl-2')}>
                      <span className="w-20 shrink-0" aria-hidden />
                      <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 truncate', location ? 'text-mode-ink' : 'text-mode-warn')}>
                        <span className={RECORD_FACT_KEY_CLASS}>Bin </span>
                        {location ?? 'Unassigned'}
                      </span>
                    </span>
                    <span className={cn(RECORD_ID_CLASS, 'w-44 min-w-0 shrink truncate text-mode-ink')}>
                      <span className={RECORD_FACT_KEY_CLASS}>SKU </span>
                      {String(row.sku || '—')}
                    </span>
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

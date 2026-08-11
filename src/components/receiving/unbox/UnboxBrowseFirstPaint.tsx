/**
 * SSR first-paint stand-in for the Unbox Queue browse sheet.
 *
 * Owns LCP when the interactive LedgerGrid has not hydrated yet. Geometry
 * mirrors `WORKBENCH_SHEET_HOST` + dense `h-11` rows so the swap to
 * `ReceivingLinesTable` does not register as a layout shift.
 *
 * Empty seed paints a hard settled empty face (never pulse bars) so
 * Web Vitals cannot treat skeleton soup as LCP.
 *
 * Server-safe — no `'use client'`, no motion, no TanStack. Class string is
 * inlined (same as `WORKBENCH_SHEET_HOST`) so this module stays RSC-importable
 * without pulling the client workbench-shell graph.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { cn } from '@/utils/_cn';

/** Byte-identical to `WORKBENCH_SHEET_HOST` in workbench-shell.tsx. */
const SHEET_HOST = 'relative flex min-h-0 min-w-0 flex-1 flex-col';

const FIRST_PAINT_ROW_CAP = 24;

/** Settled empty copy — LCP-safe text, not geometry placeholders. */
const UNBOX_BROWSE_FIRST_PAINT_EMPTY = 'Queue empty — scan Ticket · Tracking · PO';

function last8(raw: string): string {
  const s = raw.trim();
  return s.length > 8 ? s.slice(-8) : s;
}

function rowTitle(row: ReceivingLineRow): string {
  const title =
    row.catalog_product_title ||
    row.zoho_item_title ||
    row.item_name ||
    row.sku ||
    'Carton';
  return String(title).trim() || 'Carton';
}

export function UnboxBrowseFirstPaint({
  rows,
  className,
}: {
  rows: readonly ReceivingLineRow[];
  className?: string;
}) {
  const visible = rows.slice(0, FIRST_PAINT_ROW_CAP);
  const isEmpty = visible.length === 0;

  return (
    <div
      className={cn(SHEET_HOST, 'overflow-hidden bg-surface-card', className)}
      aria-busy={false}
      aria-label="Unbox queue"
      data-paint-surface="unbox:primary"
    >
      {isEmpty ? (
        <div className="flex h-11 items-center px-3 text-role-caption text-text-muted">
          {UNBOX_BROWSE_FIRST_PAINT_EMPTY}
        </div>
      ) : (
        <ul className="divide-y divide-border-soft">
          {visible.map((row) => {
            const po = String(
              row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '',
            ).trim();
            const tracking = String(row.tracking_number || '').trim();
            const poFace = po ? last8(po) : '—';
            const trackFace = tracking ? last8(tracking) : '';
            return (
              <li
                key={`${row.id}-${po || tracking || 'row'}`}
                className="flex h-11 items-center gap-3 px-3 text-role-caption"
              >
                <span className="w-24 shrink-0 font-mono text-text-muted tabular-nums">
                  {poFace}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-text-default">
                  {rowTitle(row)}
                </span>
                {trackFace ? (
                  <span className="max-w-[9rem] shrink-0 truncate font-mono text-text-faint">
                    {trackFace}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

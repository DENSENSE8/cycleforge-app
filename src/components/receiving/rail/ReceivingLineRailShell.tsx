'use client';

/**
 * The rail body for a receiving-line multi-select — occupant
 * `detail:receiving-line-batch`.
 *
 * Cardinality (see `receiving-selection-occupancy.ts`):
 * - Unbox / History: any non-empty check-set
 * - Incoming: 2+ only — 1-check opens `IncomingDetailsPanel` / `detail:incoming`
 *   (never this batch shell)
 *
 * Close clears the selection (order-rail D4 / receiving R6).
 */

import { useCallback, useMemo } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  RailActionRegion,
  RailSelectionBand,
  useRailActionSnapshot,
} from '@/components/right-rail/RailSelectionActions';
import { emitToggleAll } from '@/lib/selection/table-selection';
import {
  isReceivingRailBatchActive,
  resolveReceivingRailOccupancy,
  type ReceivingRailSurface,
} from '@/lib/right-rail/receiving-selection-occupancy';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

function rosterTitle(row: ReceivingLineRow): string {
  const title = String(
    row.zoho_item_title || row.catalog_product_title || row.item_name || '',
  ).trim();
  if (title) return title;
  const sku = String(row.sku || '').trim();
  if (sku) return sku;
  return '—';
}

function rosterMeta(row: ReceivingLineRow): string {
  const po = String(row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  if (po) return po;
  const tracking = String(row.tracking_number || '').trim();
  if (tracking) return tracking;
  const sku = String(row.sku || '').trim();
  return sku || '—';
}

export function ReceivingLineRailShell({
  surface,
  /** When false the shell stays mounted but does not claim the slot (Unbox line workspace open). */
  enabled = true,
  /**
   * When the 1-row inspect panel is already open (`detail:incoming` or
   * `detail:history`), the batch shell stays off so the two registrars never
   * fight over the slot. Incoming 1-check always opens inspect (never falls
   * through to this shell).
   */
  inspectOpen = false,
}: {
  surface: ReceivingRailSurface;
  enabled?: boolean;
  inspectOpen?: boolean;
}) {
  const { scope, rows } = useRailActionSnapshot();
  const lineRows = rows as ReceivingLineRow[];

  const occupancy = useMemo(
    () => resolveReceivingRailOccupancy(lineRows.map((r) => r.id), surface),
    [lineRows, surface],
  );

  const handleClose = useCallback(() => {
    if (scope) emitToggleAll(scope, 'none');
  }, [scope]);

  // Batch only when occupancy is attention (Incoming 2+, History any check-set).
  // Suppress whenever a 1-row inspect panel already owns the slot.
  const active =
    enabled && !inspectOpen && isReceivingRailBatchActive(occupancy);

  return (
    <DetailStackRailRegistrar
      id="detail:receiving-line-batch"
      enabled={active}
      onClose={handleClose}
      modal={false}
      ariaLabel={`${lineRows.length} line${lineRows.length === 1 ? '' : 's'} selected`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <RailSelectionBand onClose={handleClose} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="divide-y divide-border-soft">
            {lineRows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 px-4 py-1.5">
                <span className="truncate text-role-caption font-semibold text-text-default">
                  {rosterTitle(row)}
                </span>
                <span className="ml-auto shrink-0 truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                  {rosterMeta(row)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <RailActionRegion />
      </div>
    </DetailStackRailRegistrar>
  );
}

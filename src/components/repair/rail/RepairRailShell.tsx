'use client';

/**
 * The rail body for a MULTI-row repair selection — occupant `detail:repair-batch`.
 *
 * One row is the existing `RepairDetailsPanel` (`detail:repair`). Close clears
 * the check-set (History / order-rail D4).
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
  isRepairRailBatchActive,
  resolveRepairRailOccupancy,
} from '@/lib/right-rail/repair-selection-occupancy';
import { repairTicketValue } from '@/lib/repair/repair-grid-layout';
import type { RSRecord } from '@/lib/neon/repair-service-queries';

function rosterTitle(row: RSRecord): string {
  const ticket = repairTicketValue(row);
  if (ticket) return ticket;
  const name = String(row.customer_name || '').trim();
  if (name) return name;
  return '—';
}

function rosterMeta(row: RSRecord): string {
  const status = String(row.status || '').trim();
  if (status) return status;
  const sku = String(row.source_sku || '').trim();
  return sku || '—';
}

export function RepairRailShell() {
  const { scope, rows } = useRailActionSnapshot();
  const repairRows = rows as RSRecord[];

  const occupancy = useMemo(
    () => resolveRepairRailOccupancy(repairRows.map((r) => r.id)),
    [repairRows],
  );

  const handleClose = useCallback(() => {
    if (scope) emitToggleAll(scope, 'none');
  }, [scope]);

  const active = isRepairRailBatchActive(occupancy);

  return (
    <DetailStackRailRegistrar
      id="detail:repair-batch"
      enabled={active}
      onClose={handleClose}
      modal={false}
      ariaLabel={`${repairRows.length} repairs selected`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <RailSelectionBand onClose={handleClose} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="divide-y divide-border-soft">
            {repairRows.map((row) => (
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

'use client';

/**
 * The rail body for a MULTI-row repair selection — occupant `detail:repair-batch`.
 *
 * One row is the existing `RepairDetailsPanel` (`detail:repair`). Close clears
 * the check-set (History / order-rail D4).
 *
 * Roster rows compose {@link RailSelectionRosterRow} / {@link StackedRowIdentity}
 * (product title → TicketChip · SKU) — never a single-line ticket | status twin.
 */

import { useCallback, useMemo } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  RailActionRegion,
  RailSelectionBand,
  useRailActionSnapshot,
} from '@/components/right-rail/RailSelectionActions';
import {
  RailSelectionRoster,
  RailSelectionRosterRow,
} from '@/components/right-rail/RailSelectionRoster';
import { SkuScanRefChip, TicketChip, getLast8 } from '@/components/ui/CopyChip';
import { joinStackedIdentityKeys } from '@/components/ui/StackedRowIdentity';
import { emitToggleAll } from '@/lib/selection/table-selection';
import {
  isRepairRailBatchActive,
  resolveRepairRailOccupancy,
} from '@/lib/right-rail/repair-selection-occupancy';
import { repairTicketValue } from '@/lib/repair/repair-grid-layout';
import { supportTicketIdFace } from '@/lib/support/ticket-refs';
import type { RSRecord } from '@/lib/neon/repair-service-queries';

function rosterTitle(row: RSRecord): string {
  const product = String(row.product_title || '').trim();
  if (product) return product;
  const name = String(row.customer_name || '').trim();
  if (name) return name;
  return '—';
}

function rosterKeys(row: RSRecord) {
  const ticket = repairTicketValue(row);
  const face = ticket ? supportTicketIdFace(ticket) : null;
  const sku = String(row.source_sku || '').trim();
  const status = String(row.status || '').trim();
  return joinStackedIdentityKeys([
    face ? (
      <TicketChip key="ticket" value={face.value} display={face.display} dense />
    ) : null,
    sku ? (
      <SkuScanRefChip key="sku" value={sku} display={getLast8(sku)} dense />
    ) : null,
    status ? (
      <span
        key="status"
        className="text-role-eyebrow uppercase tracking-widest text-text-soft"
      >
        {status}
      </span>
    ) : null,
  ]);
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

        <RailSelectionRoster>
          {repairRows.map((row) => (
            <RailSelectionRosterRow
              key={row.id}
              title={rosterTitle(row)}
              keys={
                rosterKeys(row) ?? (
                  <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                    —
                  </span>
                )
              }
            />
          ))}
        </RailSelectionRoster>

        <RailActionRegion />
      </div>
    </DetailStackRailRegistrar>
  );
}

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
 *
 * Roster rows compose {@link RailSelectionRosterRow} / {@link StackedRowIdentity}
 * (title → PO · tracking · SKU chips) — never a single-line title | mono id twin.
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
import {
  OrderIdChip,
  SkuScanRefChip,
  TrackingChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { joinStackedIdentityKeys } from '@/components/ui/StackedRowIdentity';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { getReceivingPoIdentityParts, receivingProductTitle } from '@/lib/receiving/po-group-title';
import { platformMetaIconTone } from '@/lib/source-platform';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { closeReceivingAssignPanel } from '@/lib/tables/receiving-assign-panel-store';
import { ReceivingAssignPanel } from '@/components/receiving/rail/ReceivingAssignPanel';
import {
  isReceivingRailBatchActive,
  resolveReceivingRailOccupancy,
  type ReceivingRailSurface,
} from '@/lib/right-rail/receiving-selection-occupancy';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

function rosterTitle(row: ReceivingLineRow): string {
  return receivingProductTitle(row);
}

/** Platform-aware PO / order key for the receiving batch roster. */
function ReceivingRosterPoKey({ row }: { row: ReceivingLineRow }) {
  const resolvePlatformMeta = usePlatformMeta();
  const { poValue, platformLabel } = getReceivingPoIdentityParts(row, (raw) =>
    resolvePlatformMeta(raw).label,
  );
  if (!poValue) return null;
  const platformRaw = String(
    row.source_platform || row.source_platform_pill || '',
  ).trim();
  const platformMeta = platformRaw ? resolvePlatformMeta(platformRaw) : null;
  const iconTone = platformMeta ? platformMetaIconTone(platformMeta) : null;
  return (
    <OrderIdChip
      value={poValue}
      display={getLast8(poValue)}
      dense
      fitDisplayWidth
      displayWidth="last8"
      platformLabel={platformLabel || platformMeta?.label || null}
      iconClass={iconTone?.className}
      iconStyle={iconTone?.style}
    />
  );
}

function ReceivingRosterKeys({ row }: { row: ReceivingLineRow }) {
  const tracking = String(row.tracking_number || '').trim();
  const sku = String(row.sku || '').trim();
  const po = String(row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  const keys = joinStackedIdentityKeys([
    po ? <ReceivingRosterPoKey key="po" row={row} /> : null,
    tracking ? <TrackingChip key="tracking" value={tracking} dense /> : null,
    sku && !po ? (
      <SkuScanRefChip key="sku" value={sku} display={getLast8(sku)} dense />
    ) : null,
  ]);
  return (
    keys ?? (
      <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">—</span>
    )
  );
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
    closeReceivingAssignPanel();
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
        <RailSelectionBand />

        <RailSelectionRoster>
          {lineRows.map((row) => (
            <RailSelectionRosterRow
              key={row.id}
              title={rosterTitle(row)}
              keys={<ReceivingRosterKeys row={row} />}
            />
          ))}
        </RailSelectionRoster>

        <ReceivingAssignPanel />
        <RailActionRegion />
      </div>
    </DetailStackRailRegistrar>
  );
}

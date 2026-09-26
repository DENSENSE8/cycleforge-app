'use client';

/**
 * Testing bench — a repair ticket scanned at the station opens on the station
 * edge (`RightRailHost`, non-modal), so the bench stays live under it. The
 * record body is the one the Repair Service desk shows on its record plane
 * ({@link RepairDetailsPanel}); only the placement differs, because a scan
 * station keeps its right-edge tools (desk surface law, `station-edge`).
 *
 * STABLE occupant id (`detail:repair`): `useRepairDetailsPanel` re-seeds its
 * editors on `repair.id` change, so a second scan swaps the body in place.
 */

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { RepairDetailsPanel } from '@/components/repair/RepairDetailsPanel';
import type { RepairDetailsPanelProps } from '@/components/repair/details-panel/repair-details-shared';

export function TechRepairRail(props: RepairDetailsPanelProps) {
  const identity = String(props.repair.ticket_number || '').trim() || `RS-${props.repair.id}`;
  return (
    <DetailStackRailRegistrar
      id="detail:repair"
      onClose={props.onClose}
      modal={false}
      ariaLabel={`Repair ${identity} details`}
    >
      <RepairDetailsPanel {...props} />
    </DetailStackRailRegistrar>
  );
}

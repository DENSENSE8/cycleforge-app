'use client';

/** Testing bench — a repair ticket scanned at the station opens on the station edge (`RightRailHost`, non-modal), so the bench stays live… */

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

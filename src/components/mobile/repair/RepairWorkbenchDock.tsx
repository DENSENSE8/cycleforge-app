'use client';

import { DetailDock } from '@/design-system/components/DetailDock';
import { Activity, PackageCheck, Wrench } from '@/components/Icons';

export type RepairDockVerb = 'status' | 'log' | 'pickup';

/**
 * The repair hub's verbs — Status · Log work · Pickup — on the shared
 * {@link DetailDock}. No other control on the page changes the repair.
 */
export function RepairWorkbenchDock({
  pickupEnabled,
  onOpen,
}: {
  /** Pickup is live only for eligible statuses (`canStartRepairPickup`). */
  pickupEnabled: boolean;
  onOpen: (verb: RepairDockVerb) => void;
}) {
  return (
    <DetailDock<RepairDockVerb>
      label="Repair actions"
      onVerb={onOpen}
      verbs={[
        { id: 'status', label: 'Status', icon: <Activity /> },
        { id: 'log', label: 'Log work', icon: <Wrench />, primary: true },
        { id: 'pickup', label: 'Pickup', icon: <PackageCheck />, disabled: !pickupEnabled },
      ]}
    />
  );
}

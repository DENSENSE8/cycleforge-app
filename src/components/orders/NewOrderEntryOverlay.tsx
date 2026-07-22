'use client';

/**
 * New-order intake in the shared right detail-stack rail (RightRailHost).
 * Backdrop / Esc close via the host; header X still works through the form shell.
 */

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { ShippedIntakeForm } from '@/components/shipped/ShippedIntakeForm';
import { useShippedFormSubmit } from '@/components/sidebar/dashboard-sidebar-hooks';

export function NewOrderEntryOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const submitNewOrder = useShippedFormSubmit(onClose);

  if (!open) return null;

  return (
    <DetailStackRailRegistrar id="detail:new-order" onClose={onClose}>
      <ShippedIntakeForm onClose={onClose} onSubmit={submitNewOrder} />
    </DetailStackRailRegistrar>
  );
}

/** Status → chip tone, for the History rail AND its detail. */

import type { KioskChipTone } from '@/components/kiosk/KioskChip';

export function kioskHistoryStatusTone(status: string): KioskChipTone {
  const s = status.trim().toLowerCase();
  if (s === 'picked up' || s === 'shipped' || s === 'done' || s === 'paid') return 'success';
  if (s === 'cancelled' || s === 'voided' || s === 'refunded') return 'danger';
  if (s.startsWith('awaiting') || s === 'incoming shipment' || s === 'repaired, contact customer') {
    return 'warning';
  }
  return 'idle';
}

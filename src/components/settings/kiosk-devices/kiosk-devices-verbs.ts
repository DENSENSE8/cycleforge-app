/**
 * Kiosk-devices family verb catalog — declare once, resolve per row.
 *
 * Revoke is a credential verb (`face: 'trailing'`), not a catalog field and not
 * a remounted compound `actions` track. Pair stays on the title-hover menu.
 *
 * Callers: KioskDevicesSection → useKioskDevicesSpreadsheet.rowActions.
 */

import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';

export interface KioskDeviceVerbHandlers {
  onPairTerminal: (row: KioskDeviceTableRow) => void;
  onRevoke: (row: KioskDeviceTableRow) => void;
}

/** Resolve the family's row verbs for one tablet. Empty when already revoked. */
export function resolveKioskDeviceRowActions(
  row: KioskDeviceTableRow,
  handlers: KioskDeviceVerbHandlers,
): readonly CompoundRowAction[] {
  if (row.status === 'revoked') return [];
  return [
    {
      key: 'pair-terminal',
      label: row.squareTerminalDeviceId ? 'Change card reader' : 'Pair a card reader',
      onSelect: () => handlers.onPairTerminal(row),
    },
    {
      key: 'revoke',
      label: 'Revoke',
      tone: 'danger',
      face: 'trailing',
      onSelect: () => handlers.onRevoke(row),
    },
  ];
}

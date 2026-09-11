'use client';

/**
 * Revoke confirm plane for /settings/devices — stage-overlay over the table
 * (recordPlane: stage-overlay). Table stays mounted underneath.
 *
 * Callers: KioskDevicesSection. Replaces window.confirm for credential revoke.
 */

import { Button } from '@/design-system/primitives/Button';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';

export interface KioskDeviceRevokePlaneProps {
  row: KioskDeviceTableRow | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (row: KioskDeviceTableRow) => void;
}

export function KioskDeviceRevokePlane({
  row,
  busy = false,
  onClose,
  onConfirm,
}: KioskDeviceRevokePlaneProps) {
  const open = row != null;
  return (
    <DeskStageOverlay
      open={open}
      onClose={onClose}
      title={row ? `Revoke · ${row.label}` : 'Revoke device'}
      subtitle={row ? `Device ${row.id}` : undefined}
      testId="kiosk-device-revoke-plane"
      fill="inset"
      footer={
        row ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => onConfirm(row)}
            >
              {busy ? 'Revoking…' : 'Confirm revoke'}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-3 px-4 py-4 text-sm text-text-default">
        <p>
          This tablet’s device cookie dies immediately. Intake and reader wake stop until a
          manager enrolls and pairs again.
        </p>
        <p className="text-text-soft">
          The fleet row stays for audit (status → Revoked). Hashes are cleared; the label is
          kept.
        </p>
      </div>
    </DeskStageOverlay>
  );
}

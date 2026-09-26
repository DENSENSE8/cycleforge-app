'use client';

/** Deactivate confirm plane for /settings/staff — stage-overlay over the table (law Q5). */

import { Button } from '@/design-system/primitives/Button';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';

interface StaffDeactivatePlaneProps {
  row: StaffDirectoryRow | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (row: StaffDirectoryRow) => void;
}

export function StaffDeactivatePlane({
  row,
  busy = false,
  onClose,
  onConfirm,
}: StaffDeactivatePlaneProps) {
  const name = row ? (row.name?.trim() || `Staff #${row.id}`) : null;
  const role = row?.role?.trim() || null;
  return (
    <DeskStageOverlay
      open={row != null}
      onClose={onClose}
      title={name ? `Deactivate · ${name}` : 'Deactivate teammate'}
      subtitle={role ? `${role} · ${row?.status ?? ''}`.trim() : undefined}
      testId="staff-deactivate-plane"
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
              {busy ? 'Deactivating…' : 'Confirm deactivate'}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-3 px-4 py-4 text-sm text-text-default">
        <p>
          Their active sessions are revoked immediately — whoever is holding a signed-in device is
          out on their next request, and they cannot sign in again.
        </p>
        <p className="text-text-soft">
          Nothing is deleted. Their history, their roles and their PIN all stay; the row keeps
          listing them, reading <span className="font-medium text-text-default">deactivated</span>.
        </p>
      </div>
    </DeskStageOverlay>
  );
}

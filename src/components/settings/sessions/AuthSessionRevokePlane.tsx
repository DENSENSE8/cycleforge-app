'use client';

/**
 * Revoke confirm plane for /settings/sessions — stage-overlay over the table
 * (recordPlane: stage-overlay). The table stays mounted underneath, so an
 * admin can still read the row they are about to kill.
 *
 * Callers: SessionsSection. Replaces the desk's bare `window.confirm`, which
 * named neither the staffer nor the device and could not say what revoking
 * actually does.
 */

import { Button } from '@/design-system/primitives/Button';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import type { AuthSessionTableRow } from '@/lib/auth/auth-session-row';

export interface AuthSessionRevokePlaneProps {
  row: AuthSessionTableRow | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (row: AuthSessionTableRow) => void;
}

export function AuthSessionRevokePlane({
  row,
  busy = false,
  onClose,
  onConfirm,
}: AuthSessionRevokePlaneProps) {
  const device = row ? (row.device_label?.trim() || row.device_kind) : null;
  return (
    <DeskStageOverlay
      open={row != null}
      onClose={onClose}
      title={row ? `Revoke · ${row.staff_name}` : 'Revoke session'}
      subtitle={device ? `${device} · ${row?.ip ?? 'no IP'}` : undefined}
      testId="auth-session-revoke-plane"
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
          This session’s cookie dies immediately. Whoever is holding that device is signed out on
          their next request and has to sign in again.
        </p>
        <p className="text-text-soft">
          Their other sessions are untouched — revoke each device you mean to kick.
        </p>
      </div>
    </DeskStageOverlay>
  );
}

'use client';

/**
 * Sign-in policy plane for /settings/staff — the Center-Lock L2 record form
 * (law Q5) that replaced the retired `AuthPolicyCell`, a live two-control
 * editor living inside a table cell.
 *
 * ## Why this is a plane and not an in-cell editor
 *
 * `CompoundRowAction` carries a FIXED payload and no family in this repo sets
 * `capabilities.inCellEdit` — there is no in-cell editor on a compound row, and
 * minting one would be an engine change. A write whose payload needs a
 * parameter is therefore a verb that opens a plane. The table stays mounted
 * underneath, so an admin can still read the roster they are changing.
 *
 * It also fixes something the cell had wrong: the `<select>` and the checkbox
 * were two independent POSTs, each followed by a refetch, so flipping both in
 * quick succession raced. This submits ONE payload with both fields.
 *
 * Callers: StaffTable. The submit handler (and the `STEP_UP_REQUIRED` toast —
 * see `staff-auth-policy-outcome.ts`) belongs to the mount; this plane only
 * collects the two values.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { Switch } from '@/design-system/primitives/Switch';
import { DeskStageOverlay } from '@/design-system/components/DeskStageOverlay';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  staffAuthMethod,
  STAFF_AUTH_METHODS,
  STAFF_AUTH_METHOD_LABEL,
  type StaffAuthMethod,
  type StaffDirectoryRow,
} from '@/lib/staff/staff-directory-row';
import { cn } from '@/utils/_cn';

/** The retired `<option>` hints, promoted to the line under each choice. */
const METHOD_HINT: Readonly<Record<StaffAuthMethod, string>> = {
  pin: 'Signs in at a kiosk or bench with their PIN.',
  password: 'Signs in with a password instead of a PIN.',
};

export interface StaffAuthPolicySubmit {
  authMethod: StaffAuthMethod;
  requiresSensitiveStepUp: boolean;
}

export interface StaffAuthPolicyPlaneProps {
  row: StaffDirectoryRow | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (row: StaffDirectoryRow, next: StaffAuthPolicySubmit) => void;
}

export function StaffAuthPolicyPlane({
  row,
  busy = false,
  onClose,
  onSubmit,
}: StaffAuthPolicyPlaneProps) {
  const [method, setMethod] = useState<StaffAuthMethod>('pin');
  const [wall, setWall] = useState(false);

  // Seed from the picked row — and re-seed when the admin closes this one and
  // opens another, so the plane never shows the previous teammate's policy.
  useEffect(() => {
    if (!row) return;
    setMethod(staffAuthMethod(row.auth_method));
    setWall(Boolean(row.requires_sensitive_stepup));
  }, [row]);

  const name = row ? (row.name?.trim() || `Staff #${row.id}`) : null;
  const dirty =
    row != null &&
    (method !== staffAuthMethod(row.auth_method) ||
      wall !== Boolean(row.requires_sensitive_stepup));

  return (
    <DeskStageOverlay
      open={row != null}
      onClose={onClose}
      title={name ? `Sign-in policy · ${name}` : 'Sign-in policy'}
      subtitle={row?.role?.trim() || undefined}
      testId="staff-auth-policy-plane"
      fill="inset"
      footer={
        row ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="brand"
              size="sm"
              disabled={busy || !dirty}
              onClick={() => onSubmit(row, { authMethod: method, requiresSensitiveStepUp: wall })}
            >
              {busy ? 'Saving…' : 'Save policy'}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-5 px-4 py-4 text-sm text-text-default">
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="text-role-caption font-semibold text-text-default">
            Sign-in method
          </legend>
          <div className="flex flex-col stack-tight" role="radiogroup" aria-label="Sign-in method">
            {STAFF_AUTH_METHODS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={method === option}
                disabled={busy}
                onClick={() => setMethod(option)}
                data-testid={`staff-auth-method-${option}`}
                className={cn(
                  'ds-raw-button flex w-full flex-col items-start gap-0.5 rounded-lg inset-field text-left transition-colors disabled:opacity-50',
                  focusRing('control', 'accent'),
                  method === option
                    ? 'bg-surface-accent ring-1 ring-inset ring-border-accent'
                    : 'hover:bg-surface-hover',
                )}
              >
                <span className="text-role-caption font-semibold text-text-default">
                  {STAFF_AUTH_METHOD_LABEL[option]}
                </span>
                <span className="text-role-micro text-text-soft">{METHOD_HINT[option]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-start justify-between gap-4">
          <label htmlFor="staff-auth-stepup" className="min-w-0 cursor-pointer">
            <span className="block text-role-caption font-semibold text-text-default">
              Sensitive-information wall
            </span>
            <span className="block text-role-micro text-text-soft">
              Require a password step-up before this teammate reaches sensitive screens.
            </span>
          </label>
          <Switch
            id="staff-auth-stepup"
            checked={wall}
            disabled={busy}
            onCheckedChange={(next) => setWall(next === true)}
          />
        </div>
      </div>
    </DeskStageOverlay>
  );
}

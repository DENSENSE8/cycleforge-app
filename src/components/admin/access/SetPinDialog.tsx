'use client';

/**
 * Modal to admin-set a specific PIN for a staff member.
 *
 * Two inputs — PIN and confirm — both numeric 4-6 digits. Submits via the
 * caller's `onSubmit(pin)` which calls /api/admin/staff/[id]/set-pin.
 * Server may respond `STEPUP_REQUIRED` if the admin's session hasn't done
 * a fresh step-up — in that case the dialog stays open and surfaces the
 * error so the admin can satisfy step-up via the global helper.
 */

import { useCallback, useState } from 'react';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



interface SetPinDialogProps {
  open: boolean;
  staffName: string;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function SetPinDialog({ open, staffName, onClose, onSubmit }: SetPinDialogProps) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPin('');
    setConfirm('');
    setErr(null);
  }, []);

  const submit = useCallback(async () => {
    setErr(null);
    if (!/^\d{4,6}$/.test(pin)) { setErr('PIN must be 4–6 digits.'); return; }
    if (pin !== confirm) { setErr('Confirmation does not match.'); return; }
    setBusy(true);
    try {
      const r = await onSubmit(pin);
      if (r.ok) {
        reset();
        onClose();
      } else {
        setErr(r.error);
      }
    } finally {
      setBusy(false);
    }
  }, [pin, confirm, onSubmit, reset, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent hideClose className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set PIN for {staffName}</DialogTitle>
          <DialogDescription>
            Push a specific PIN to this staff member. They&apos;ll be able to sign in immediately with the new code.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-role-caption font-semibold uppercase tracking-wider text-text-soft">New PIN</span>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className={cn("mt-1 w-full rounded-md border border-border-default inset-cozy text-sm tracking-widest", focusRing('field', 'accent'))}
              placeholder="••••"
            />
          </label>
          <label className="block">
            <span className="block text-role-caption font-semibold uppercase tracking-wider text-text-soft">Confirm PIN</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              className={cn("mt-1 w-full rounded-md border border-border-default inset-cozy text-sm tracking-widest", focusRing('field', 'accent'))}
              placeholder="••••"
            />
          </label>
        </div>

        {err && <div className="rounded-lg bg-red-50 inset-field text-xs text-red-700">{err}</div>}

        <DialogFooter>
          <Button variant="secondary" onClick={() => { reset(); onClose(); }} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={pin.length < 4}>
            Set PIN
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

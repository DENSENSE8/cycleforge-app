'use client';

/**
 * Compact modal to create a new staff row. Triggered by "+ Add staff" in the
 * AccessSidebarPanel. New rows land with `status='invited'` so the admin can
 * generate an enrollment QR for them right after.
 */

import { useCallback, useState } from 'react';
import { ALL_ROLES } from '@/lib/auth/permissions-shared';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { FILTER_DROPDOWN_SELECT_CLASS } from '@/design-system/components/FilterDropdownSelect';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



interface AddStaffDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (newStaffId: number) => void;
}

export function AddStaffDialog({ open, onClose, onCreated }: AddStaffDialogProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<typeof ALL_ROLES[number]>('packer');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) { setErr('Name is required.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/admin/staff', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, role, employeeCode: code.trim() || null }),
      });
      // Parse the body once, tolerantly — a 403 from the admin.manage_staff
      // gate (or any non-JSON error page) must surface in the banner, not throw
      // an unhandled rejection that leaves the button silently doing nothing.
      const data = await r.json().catch(() => ({} as Record<string, unknown>));
      if (!r.ok) {
        const fallback = r.status === 401 || r.status === 403
          ? "You don't have permission to add staff."
          : 'Could not add staff.';
        setErr(String((data as { error?: string }).error || fallback));
        return;
      }
      const newId = (data as { staff?: { id?: number } }).staff?.id;
      if (typeof newId !== 'number') {
        setErr('Staff created but the response was malformed — refresh to see them.');
        return;
      }
      onCreated(newId);
      setName(''); setCode(''); setRole('packer');
      onClose();
    } catch {
      setErr('Network error — could not add staff. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, [name, role, code, onCreated, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent hideClose className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
          <DialogDescription>
            Creates an invited account. Generate an enrollment QR to let them set a PIN.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-role-caption font-semibold uppercase tracking-wider text-text-soft">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              className={cn("mt-1 w-full rounded-md border border-border-default inset-cozy text-sm", focusRing('field', 'accent'))}
              placeholder="Jane Doe"
            />
          </label>
          <label className="block">
            <span className="block text-role-caption font-semibold uppercase tracking-wider text-text-soft">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof ALL_ROLES[number])}
              className={`mt-1 ${FILTER_DROPDOWN_SELECT_CLASS}`}
            >
              {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-role-caption font-semibold uppercase tracking-wider text-text-soft">Employee code (optional)</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={cn("mt-1 w-full rounded-md border border-border-default inset-cozy text-sm", focusRing('field', 'accent'))}
              placeholder="EMP-001"
            />
          </label>
        </div>

        {err && <div className="rounded-lg bg-red-50 inset-field text-xs text-red-700">{err}</div>}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

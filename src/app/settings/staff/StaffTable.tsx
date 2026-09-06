'use client';

/**
 * Client island for /settings/staff.
 *
 * Renders the staff table, an invite modal, and inline role/active edits.
 * Optimistically mutates the local list and refetches from
 * /api/admin/staff/list after each mutation so we don't drift on errors.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { DataTable } from '@/components/tables/DataTable';
import { useStaffDirectorySpreadsheet } from '@/components/settings/staff-table/useStaffDirectorySpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

/*
  The local `StaffDirectoryRow` interface is gone — the shape is `StaffDirectoryRow`, the
  family's, shared with the catalog, the resolver and the adapter. A row type
  declared next to a display is how two surfaces of the same entity drift.
*/

interface StaffTableProps {
  initialStaff: StaffDirectoryRow[];
}

// Initial role for the invite modal. Editing existing staff happens in
// Settings → Access (staff_roles); this list seeds the first role on invite.
const ROLE_OPTIONS: ReadonlyArray<string> = [
  'admin', 'receiver', 'packer', 'technician', 'shipper',
  'inventory_manager', 'sales', 'viewer',
];


export function StaffTable({ initialStaff }: StaffTableProps) {
  const [staff, setStaff] = useState<StaffDirectoryRow[]>(initialStaff);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busy, setBusy] = useState<number | 'invite' | null>(null);
  const [filter, setFilter] = useState('');

  const refresh = useCallback(async () => {
    const r = await fetch('/api/admin/staff/list', { credentials: 'include' });
    if (r.ok) {
      const data = await r.json();
      setStaff(data.staff);
    }
  }, []);

  const deactivate = useCallback(async (id: number, name: string) => {
    if (!confirm(`Deactivate ${name}? Their active sessions will be revoked immediately.`)) return;
    setBusy(id);
    try {
      const r = await fetch('/api/admin/staff/deactivate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        toast.error(`Couldn't deactivate: ${data.error || r.status}`);
        return;
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  // WS6.1: persist a per-staff auth-policy change, then refetch. The update
  // route is itself behind the sensitive-info wall, so surface STEP_UP_REQUIRED.
  const updateAuthPolicy = useCallback(async (
    id: number,
    patch: { authMethod?: 'pin' | 'password'; requiresSensitiveStepUp?: boolean },
  ) => {
    setBusy(id);
    try {
      const r = await fetch('/api/admin/staff/update', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        if (data.error === 'STEP_UP_REQUIRED') {
          toast.warning('This change needs step-up verification. Re-authenticate (PIN/passkey) and try again.');
        } else {
          toast.error(`Couldn't update auth policy: ${data.error || r.status}`);
        }
        return;
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      s.status.toLowerCase().includes(q),
    );
  }, [staff, filter]);


  /*
    Staff VERBS, resolved per row.

    Deactivate was a trailing ACTIONS column of buttons — a per-family cell, and
    the reason this page owned a second table engine. Direction comes from row
    STATE (an already-inactive teammate is not offered deactivation), never from
    the route, which is the same rule that forbids a per-lane key list.
  */
  /*
    Staff VERBS, resolved per row.

    All three were CELLS before — Deactivate in a trailing actions column, and
    the WS6.1 auth policy as a `<select>` plus a checkbox living inside a data
    cell (`AuthPolicyCell`). A control inside a data cell is a per-family cell by
    another name, and it is the reason this page owned a second table engine.

    The two policy toggles are REVERSIBLE VERBS, which law §4 says are one verb
    with two directions, not two verbs: the label reads off row STATE, so the
    same declaration serves both directions and there is no route branch. Same
    for deactivation — an already-inactive teammate is simply not offered it.

    `/api/admin/staff/update` still answers `STEP_UP_REQUIRED`; that path is
    untouched, and `updateAuthPolicy` already surfaces it as a toast.
  */
  const rowActions = useCallback(
    (row: StaffDirectoryRow): readonly CompoundRowAction[] => {
      const usesPassword = row.auth_method === 'password';
      const verbs: CompoundRowAction[] = [
        {
          key: 'auth-method',
          label: usesPassword ? 'Switch to PIN sign-in' : 'Switch to password sign-in',
          onSelect: () =>
            void updateAuthPolicy(row.id, { authMethod: usesPassword ? 'pin' : 'password' }),
          disabled: busy === row.id,
        },
        {
          key: 'sensitive-stepup',
          label: row.requires_sensitive_stepup
            ? 'Drop the sensitive step-up wall'
            : 'Require step-up for sensitive screens',
          onSelect: () =>
            void updateAuthPolicy(row.id, {
              requiresSensitiveStepUp: !row.requires_sensitive_stepup,
            }),
          disabled: busy === row.id,
        },
      ];
      if (row.active) {
        verbs.push({
          key: 'deactivate',
          label: 'Deactivate',
          tone: 'danger',
          onSelect: () => void deactivate(row.id, row.name),
          disabled: busy === row.id,
        });
      }
      return verbs;
    },
    [deactivate, updateAuthPolicy, busy],
  );

  const sheet = useStaffDirectorySpreadsheet({ rows: filtered, rowActions });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-none border border-border-soft bg-surface-card p-3 shadow-sm">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, role, or status…"
          className={cn("w-full max-w-xs rounded-xl border border-border-soft bg-surface-card px-3 py-1.5 text-role-data", focusRing("field", "neutral"))}
        />
        <Button variant="brand" onClick={() => setInviteOpen(true)}>
          Invite teammate
        </Button>
      </div>

      <DataTable {...sheet} totalCount={filtered.length} />

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={async () => {
          setInviteOpen(false);
          await refresh();
        }}
      />
    </>
  );
}


// WS6.1 per-staff auth policy control: sign-in method (PIN vs password) plus the
// sensitive-information step-up wall. Both persist via /api/admin/staff/update.

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

function InviteModal({ open, onClose, onInvited }: InviteModalProps) {
  const [form, setForm] = useState({ name: '', role: 'packer', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollmentUrl, setEnrollmentUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', role: 'packer', email: '' });
    setBusy(false);
    setError(null);
    setEnrollmentUrl(null);
  }, [open]);

  const submit = useCallback(async () => {
    if (!form.email.trim()) {
      setError('An email is required — new teammates sign in with email + password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Identity invitation flow (account + membership, password path) — replaces
      // the deprecated PIN-enrollment invite (org-login-gate wave 6.3).
      const r = await fetch('/api/org/invitations', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          role: form.role,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(
          (data as { error?: string }).error === 'INVALID_INPUT'
            ? 'Enter a valid email address.'
            : (data as { error?: string }).error || `HTTP ${r.status}`,
        );
        return;
      }
      setEnrollmentUrl((data as { inviteUrl?: string }).inviteUrl ?? null);
    } finally {
      setBusy(false);
    }
  }, [form]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent hideClose className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They&apos;ll get an email link to join and set a password. They can add a station PIN later from Settings → Security.
          </DialogDescription>
        </DialogHeader>

        {enrollmentUrl ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-surface-success px-3 py-2 text-role-caption text-text-success">Invite created.</div>
            <label className="block">
              <span className="mb-1 block text-role-caption font-medium uppercase tracking-[0.08em] text-text-soft">Enrollment link</span>
              <input
                readOnly
                value={enrollmentUrl}
                className="block w-full rounded-xl border border-border-soft bg-surface-canvas px-3 py-2 font-mono text-role-caption text-text-muted"
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <DialogFooter>
              <Button variant="brand" size="sm" onClick={onInvited}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-role-caption font-medium uppercase tracking-[0.08em] text-text-soft">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Sam Rivera"
                className={cn("block w-full rounded-xl border border-border-soft bg-surface-card px-3 py-2 text-role-data", focusRing("field", "neutral"))}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-role-caption font-medium uppercase tracking-[0.08em] text-text-soft">Role</span>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className={cn("block w-full rounded-xl border border-border-soft bg-surface-card px-3 py-2 text-role-data", focusRing("field", "neutral"))}
              >
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-role-caption font-medium uppercase tracking-[0.08em] text-text-soft">Email (optional)</span>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="sam@acme.com"
                type="email"
                className={cn("block w-full rounded-xl border border-border-soft bg-surface-card px-3 py-2 text-role-data", focusRing("field", "neutral"))}
              />
            </label>
            {error && (
              <div className="rounded-lg bg-surface-danger px-2 py-1.5 text-role-caption font-medium text-text-danger">{error}</div>
            )}
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={submit}
                disabled={busy || !form.name.trim()}
              >
                {busy ? 'Inviting…' : 'Send invite'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

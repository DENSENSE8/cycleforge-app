'use client';

/**
 * Client island for /settings/staff — the team directory.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The list is the slot `DataTable`
 * (`staff-directory` PRODUCT_TABLES peer): header sort, the Fields picker and
 * org-bindable columns arrive from the engine, none of which the seven
 * hand-written column objects it replaced could ever grow. That history lives
 * in `settings/staff-directory/staff-directory-grid-layout.ts` and in the
 * family catalog.
 *
 * Three affordances changed shape, and each is worth naming at the mount:
 *
 * - **Sign-in policy** was an EDITOR inside the `auth` cell — a `<select>` and
 *   a checkbox, each POSTing on change. It is a row VERB opening a
 *   `DeskStageOverlay`, and the two controls now submit as ONE payload rather
 *   than as two writes racing each other's refetch. The `STEP_UP_REQUIRED`
 *   answer still raises its own toast (`staff-auth-policy-outcome.ts`).
 * - **Deactivate** was a `<Button>` in a trailing actions cell behind
 *   `window.confirm`. It is a `tone: 'danger'` row verb confirmed on a second
 *   plane that can name the teammate and say what revoking does.
 * - **The Role cell was a link** to `/settings/access?staffId=<id>`. A link
 *   inside a cell is gone: the destination is the binding's `navigate` record
 *   plane, wired here with the router, and `role` stays a sortable fact.
 *
 * The invite modal and the page's permission guard are untouched.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  apiErrorCode,
  staffAuthPolicyFailure,
} from '@/components/settings/staff-directory/staff-auth-policy-outcome';
import { resolveStaffDirectoryRowActions } from '@/components/settings/staff-directory/staff-directory-verbs';
import { useStaffDirectorySpreadsheet } from '@/components/settings/staff-directory/useStaffDirectorySpreadsheet';
import {
  StaffAuthPolicyPlane,
  type StaffAuthPolicySubmit,
} from '@/components/settings/staff-directory/StaffAuthPolicyPlane';
import { StaffDeactivatePlane } from '@/components/settings/staff-directory/StaffDeactivatePlane';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

// The row shape is the FAMILY's (`@/lib/staff/staff-directory-row`), shared
// with the catalog, the resolver and the adapter. A row interface declared
// beside a display is how two surfaces of one entity drift apart.
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
  const router = useRouter();
  const [staff, setStaff] = useState<StaffDirectoryRow[]>(initialStaff);
  const [inviteOpen, setInviteOpen] = useState(false);
  // One plane is open at a time, so one busy flag covers both writes.
  const [busy, setBusy] = useState(false);
  const [policyTarget, setPolicyTarget] = useState<StaffDirectoryRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffDirectoryRow | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/admin/staff/list', { credentials: 'include' });
    if (!r.ok) return;
    const data = (await r.json()) as { staff?: StaffDirectoryRow[] };
    setStaff(data.staff ?? []);
  }, []);

  const confirmDeactivate = useCallback(async (row: StaffDirectoryRow) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/staff/deactivate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      });
      if (!r.ok) {
        const payload: unknown = await r.json().catch(() => null);
        toast.error(`Couldn't deactivate: ${apiErrorCode(payload) ?? r.status}`);
        return;
      }
      setDeactivateTarget(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  // WS6.1: persist BOTH policy fields in one write, then refetch. The update
  // route is itself behind the sensitive-info wall, so a STEP_UP_REQUIRED
  // answer is an instruction to re-authenticate, not a failure to report —
  // `staffAuthPolicyFailure` owns that distinction.
  const submitAuthPolicy = useCallback(async (
    row: StaffDirectoryRow,
    next: StaffAuthPolicySubmit,
  ) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/staff/update', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...next }),
      });
      if (!r.ok) {
        const payload: unknown = await r.json().catch(() => null);
        const failure = staffAuthPolicyFailure(apiErrorCode(payload), r.status);
        if (failure.tone === 'warning') toast.warning(failure.message);
        else toast.error(failure.message);
        return;
      }
      setPolicyTarget(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const rowActions = useCallback(
    (row: StaffDirectoryRow): readonly CompoundRowAction[] =>
      resolveStaffDirectoryRowActions(row, {
        onEditAuthPolicy: setPolicyTarget,
        onDeactivate: setDeactivateTarget,
      }),
    [],
  );

  // The binding's `navigate` record plane. Settings → Access is where the
  // Roles card is the authoritative editor — the destination the retired Role
  // cell linked to, kept byte-for-byte.
  const openAccess = useCallback(
    (row: StaffDirectoryRow) => router.push(`/settings/access?staffId=${row.id}`),
    [router],
  );

  const sheet = useStaffDirectorySpreadsheet({ rows: staff, rowActions, onOpenRow: openAccess });

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-none border border-border-soft bg-surface-card p-3 shadow-sm">
        <Button variant="brand" onClick={() => setInviteOpen(true)}>
          Invite teammate
        </Button>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-col">
        <DataTable {...sheet} totalCount={staff.length} />

        <StaffAuthPolicyPlane
          row={policyTarget}
          busy={busy}
          onClose={() => {
            if (!busy) setPolicyTarget(null);
          }}
          onSubmit={(row, next) => void submitAuthPolicy(row, next)}
        />

        <StaffDeactivatePlane
          row={deactivateTarget}
          busy={busy}
          onClose={() => {
            if (!busy) setDeactivateTarget(null);
          }}
          onConfirm={(row) => void confirmDeactivate(row)}
        />
      </div>

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
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-role-caption text-emerald-700">Invite created.</div>
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
              <div className="rounded-lg bg-red-50 px-2 py-1.5 text-role-caption font-medium text-red-700">{error}</div>
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

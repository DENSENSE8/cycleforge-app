'use client';

/**
 * /settings?section=devices — enroll, list, and revoke customer-facing kiosk
 * tablets (FOH/BOH surface split, doc 06). Manager-only (`walk_in.enroll_kiosk`).
 *
 * Enrolling mints a ONE-TIME pairing code shown once here; the manager carries
 * it to the tablet's kiosk host (`{slug}.kiosk.app.cycleforge.ai`) "Set up this
 * tablet" screen. Only hashes live server-side — this surface never sees a token.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAuth } from '@/contexts/AuthContext';
import { kioskOriginForSlug } from '@/lib/tenancy/kiosk-host';
import { cn } from '@/utils/_cn';

interface KioskDeviceRow {
  id: number;
  label: string;
  status: 'enrolled' | 'active' | 'revoked';
  lastSeenAt: string | null;
  createdAt: string;
  enrolledByStaffId: number | null;
}

interface FreshCode {
  deviceId: number;
  code: string;
  expiresAt: string;
}

const STATUS_TONE: Record<KioskDeviceRow['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  enrolled: 'bg-amber-50 text-amber-700 ring-amber-200',
  revoked: 'bg-gray-100 text-gray-500 ring-gray-200',
};

const STATUS_LABEL: Record<KioskDeviceRow['status'], string> = {
  active: 'Paired',
  enrolled: 'Awaiting pairing',
  revoked: 'Revoked',
};

function fmtRelative(when: string | null): string {
  if (!when) return '—';
  const ms = Date.now() - new Date(when).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function KioskDevicesSection() {
  const { user } = useAuth();
  const [rows, setRows] = useState<KioskDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [freshCode, setFreshCode] = useState<FreshCode | null>(null);

  const kioskUrl = useMemo(() => {
    const slug = user?.organizationSlug?.trim();
    if (!slug) return null;
    try {
      return `${kioskOriginForSlug(slug)}/`;
    } catch {
      return null;
    }
  }, [user?.organizationSlug]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/kiosk/devices', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) {
        setErr(r.status === 401 || r.status === 403 ? "You don't have access to this." : 'Could not load devices.');
        return;
      }
      const data = (await r.json()) as { devices: KioskDeviceRow[] };
      setRows(data.devices || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const enroll = useCallback(async () => {
    const trimmed = label.trim();
    if (!trimmed) { setErr('Give the tablet a name first.'); return; }
    setEnrolling(true);
    setErr(null);
    try {
      const r = await fetch('/api/kiosk/enroll', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: trimmed }),
      });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          setErr("You don't have permission to enroll tablets. Ask an admin to grant Enroll / revoke kiosk device.");
          return;
        }
        if (r.status >= 500) {
          setErr('Server error while enrolling. Try again in a moment.');
          return;
        }
        setErr('Could not enroll the tablet.');
        return;
      }
      const data = (await r.json()) as FreshCode;
      setFreshCode(data);
      setLabel('');
      await refresh();
    } finally {
      setEnrolling(false);
    }
  }, [label, refresh]);

  const revoke = useCallback(async (id: number) => {
    if (!confirm('Revoke this tablet? Its access dies immediately.')) return;
    await fetch('/api/kiosk/revoke', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: id }),
    });
    await refresh();
  }, [refresh]);

  const deviceColumns: DataTableColumn<KioskDeviceRow>[] = [
    {
      key: 'tablet',
      header: 'Tablet',
      type: 'text',
      cell: (row) => <span className="font-medium text-text-default">{row.label}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      type: 'tag',
      cell: (row) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-widest ring-1 ring-inset ${STATUS_TONE[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>
      ),
    },
    {
      key: 'last_seen',
      header: 'Last seen',
      type: 'date',
      cell: (row) => <span className="text-xs text-text-soft">{fmtRelative(row.lastSeenAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (row) =>
        row.status !== 'revoked' ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => void revoke(row.id)}
            className="border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <section className="space-y-5">
      <header>
        <h1 className="sr-only">Kiosk devices</h1>
        <p className="text-sm text-text-soft">
          Customer-facing intake tablets
          {kioskUrl ? (
            <>
              {' '}
              (
              <code className="rounded bg-surface-sunken px-1 break-all">{kioskUrl}</code>
              )
            </>
          ) : (
            <> (<code className="rounded bg-surface-sunken px-1">{'{slug}.kiosk.app.cycleforge.ai'}</code>)</>
          )}
          . Each authenticates as a device, never a staff account. Enroll one to get a one-time pairing code.
        </p>
      </header>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {/* Enroll */}
      <div className="rounded-xl border border-border-soft bg-surface-card p-4">
        <p className="text-role-caption font-semibold uppercase tracking-widest text-text-soft">Enroll a tablet</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Tablet name (e.g. Front counter iPad)"
            maxLength={120}
            className={cn(
              'flex-1 rounded-lg border border-border-soft bg-surface-canvas px-3 py-2 text-sm',
              focusRing('field', 'accent'),
            )}
          />
          <Button type="button" onClick={() => void enroll()} disabled={enrolling}>
            {enrolling ? 'Enrolling…' : 'Generate code'}
          </Button>
        </div>

        {freshCode && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-role-caption font-semibold uppercase tracking-widest text-emerald-700">
              Pairing code — shown once
            </p>
            <p className="mt-1 select-all font-mono text-xl font-semibold tracking-widest text-emerald-800">
              {freshCode.code}
            </p>
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              On the tablet, open{' '}
              {kioskUrl ? (
                <code className="rounded bg-emerald-100/80 px-1 break-all">{kioskUrl}</code>
              ) : (
                <>the workspace kiosk URL</>
              )}{' '}
              → “Set up this tablet” and enter this code before{' '}
              {new Date(freshCode.expiresAt).toLocaleString()} (single-use; becomes a year-long device cookie once paired).
            </p>
          </div>
        )}
      </div>

      {/* List */}
      <DataTable
        columns={deviceColumns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        emptyMessage="No kiosk tablets enrolled yet."
      />
    </section>
  );
}

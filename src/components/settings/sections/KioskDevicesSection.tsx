'use client';

/**
 * /settings?section=devices — enroll, list, and revoke customer-facing kiosk
 * tablets (FOH/BOH surface split, doc 06). Manager-only (`walk_in.enroll_kiosk`).
 *
 * Enrolling mints a ONE-TIME pairing code shown once here; the manager carries
 * it to the tablet dogfood URL (`/kiosk/v2` on the staff app host until
 * subdomain DNS J7b). Only hashes live server-side — this surface never sees a token.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { DataTable } from '@/components/tables/DataTable';
import { useKioskDevicesSpreadsheet } from '@/components/settings/kiosk-devices/useKioskDevicesSpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAuth } from '@/contexts/AuthContext';
import { resolveKioskDogfoodUrl } from '@/lib/tenancy/kiosk-host';
import { cn } from '@/utils/_cn';

interface KioskDeviceRow {
  id: number;
  label: string;
  status: 'enrolled' | 'active' | 'revoked';
  lastSeenAt: string | null;
  createdAt: string;
  enrolledByStaffId: number | null;
  /** Square Terminal paired to this lane; null = cash / payment-link only. */
  squareTerminalDeviceId: string | null;
}

interface FreshCode {
  deviceId: number;
  code: string;
  expiresAt: string;
}

const STATUS_TONE: Record<KioskDeviceRow['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  enrolled: 'bg-amber-50 text-amber-700 ring-amber-200',
  revoked: 'bg-surface-sunken text-text-muted ring-border-soft',
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

  const kioskUrl = useMemo(() => resolveKioskDogfoodUrl(), [user?.organizationId]);

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

  /**
   * Pair (or clear) the card reader that sits at this lane (SQ3).
   *
   * Clearing is a real configuration — a cash-only counter — not an unset: a
   * lane with no stand refuses a card prompt rather than reaching for the
   * deployment fallback and waking a reader at another counter.
   */
  const pairTerminal = useCallback(
    async (deviceId: number, current: string | null) => {
      const next = window.prompt(
        'Square Terminal device ID for this lane (blank = no reader at this counter)',
        current ?? '',
      );
      if (next === null) return; // dismissed, not cleared
      await fetch('/api/kiosk/devices/terminal', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, squareTerminalDeviceId: next.trim() || null }),
      });
      await refresh();
    },
    [refresh],
  );

  /*
    The two VERBS, resolved per row.

    Both were cells before — a card-reader BUTTON inside the terminal column and
    a Revoke button in a trailing actions column. A control living in a data cell
    is why this section owned its own table: the shared row paints facts, and
    verbs come off the row menu (law §4, the catalog at n=1).

    Direction comes from row STATE, not from the route: a revoked tablet offers
    neither verb, which is the same rule that stops a per-lane key list.
  */
  const rowActions = useCallback(
    (row: KioskDeviceTableRow): readonly CompoundRowAction[] => {
      if (row.status === 'revoked') return [];
      return [
        {
          key: 'pair-terminal',
          label: row.squareTerminalDeviceId ? 'Change card reader' : 'Pair a card reader',
          onSelect: () => void pairTerminal(row.id, row.squareTerminalDeviceId),
        },
        {
          key: 'revoke',
          label: 'Revoke device',
          tone: 'danger',
          onSelect: () => void revoke(row.id),
        },
      ];
    },
    [pairTerminal, revoke],
  );

  const sheet = useKioskDevicesSpreadsheet({ rows, loading, rowActions });

  return (
    <section className="space-y-5">
      <header>
        <h1 className="sr-only">Kiosk devices</h1>
        <p className="text-sm text-text-soft">
          Customer-facing intake tablets (
          <code className="rounded bg-surface-sunken px-1 break-all">{kioskUrl}</code>
          ). Each authenticates as a device, never a staff account. Enroll one to get a one-time pairing code.
        </p>
      </header>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {/* Enroll */}
      <div className="rounded-none border border-border-soft bg-surface-card p-4">
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
      <DataTable {...sheet} totalCount={rows.length} />
    </section>
  );
}

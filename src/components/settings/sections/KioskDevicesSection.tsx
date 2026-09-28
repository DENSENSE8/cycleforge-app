'use client';

/** /settings/devices — enroll, list, and revoke customer-facing kiosk tablets (FOH/BOH surface split, doc 06). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { DataTable } from '@/components/tables/DataTable';
import { StaffAvatar } from '@/components/identity';
import { useKioskDevicesSpreadsheet } from '@/components/settings/kiosk-devices/useKioskDevicesSpreadsheet';
import { resolveKioskDeviceRowActions } from '@/components/settings/kiosk-devices/kiosk-devices-verbs';
import { KioskDeviceRevokePlane } from '@/components/settings/kiosk-devices/KioskDeviceRevokePlane';
import { useKioskSlotEventsSpreadsheet } from '@/components/settings/kiosk-slot-events/useKioskSlotEventsSpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import {
  formatDwellFace,
  hardwareStatusLabel,
} from '@/lib/kiosk/kiosk-device-derived';
import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';
import type { KioskSlotEventTableRow } from '@/lib/kiosk/kiosk-slot-event-row';
import type { KioskDevicesPageView } from '@/lib/kiosk/kiosk-devices-page-law';
import { cornerClass } from '@/design-system/tokens/radius';
import { useAuth } from '@/contexts/AuthContext';
import { resolveKioskDogfoodUrl } from '@/lib/tenancy/kiosk-host';
import { cn } from '@/utils/_cn';

interface FreshCode {
  deviceId: number;
  code: string;
  expiresAt: string;
}

const STATUS_LABEL: Record<KioskDeviceTableRow['status'], string> = {
  active: 'Paired',
  enrolled: 'Awaiting pairing',
  revoked: 'Revoked',
};

export function KioskDevicesSection({ view = 'devices' }: { view?: KioskDevicesPageView }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<KioskDeviceTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [freshCode, setFreshCode] = useState<FreshCode | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<KioskDeviceTableRow | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [events, setEvents] = useState<KioskSlotEventTableRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const isFleet = view === 'devices';
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
      const data = (await r.json()) as { devices: KioskDeviceTableRow[] };
      setRows(data.devices || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const r = await fetch('/api/kiosk/slot-events', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) {
        setEvents([]);
        return;
      }
      const data = (await r.json()) as { events: KioskSlotEventTableRow[] };
      setEvents(data.events || []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void refreshEvents(); }, [refreshEvents]);

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

  const confirmRevoke = useCallback(async (row: KioskDeviceTableRow) => {
    setRevoking(true);
    setErr(null);
    try {
      const r = await fetch('/api/kiosk/revoke', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: row.id }),
      });
      if (!r.ok) {
        setErr('Could not revoke this tablet.');
        return;
      }
      setRevokeTarget(null);
      await refresh();
    } finally {
      setRevoking(false);
    }
  }, [refresh]);

  /** Pair (or clear) the card reader that sits at this lane (SQ3). */
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

  const rowActions = useCallback(
    (row: KioskDeviceTableRow): readonly CompoundRowAction[] =>
      resolveKioskDeviceRowActions(row, {
        onPairTerminal: (r) => void pairTerminal(r.id, r.squareTerminalDeviceId),
        onRevoke: (r) => setRevokeTarget(r),
      }),
    [pairTerminal],
  );

  const sheet = useKioskDevicesSpreadsheet({ rows, loading, rowActions });
  const historySheet = useKioskSlotEventsSpreadsheet({
    events,
    loading: eventsLoading,
  });

  return (
    <section className="relative flex min-h-0 flex-1 flex-col gap-5">
      <header className="shrink-0">
        <p className="text-sm text-text-soft">
          {isFleet ? (
            <>
              Customer-facing intake tablets
              {kioskUrl ? (
                <>
                  {' '}
                  (
                  <code className="rounded bg-surface-sunken px-1 break-all">{kioskUrl}</code>
                  )
                </>
              ) : null}
              . Each authenticates as a device, never a staff account.
            </>
          ) : (
            <>
              Lane state transitions on enrolled tablets. Filter and export only — revoke stays on
              Devices.
            </>
          )}
        </p>
      </header>

      {err && isFleet ? (
        <div className="shrink-0 rounded-lg bg-surface-danger px-3 py-2 text-sm text-text-danger">{err}</div>
      ) : null}

      {isFleet ? (
        <div className="shrink-0 rounded-none border border-border-soft bg-surface-card p-4">
          <p className="text-role-caption font-semibold text-text-soft">
            Enroll a tablet
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <TextField
              label="Tablet name"
              value={label}
              onChange={setLabel}
              maxLength={120}
              className="h-11 flex-1"
            />
            <Button
              type="button"
              size="lg"
              radius="surface"
              className="h-11 shrink-0"
              onClick={() => void enroll()}
              disabled={enrolling}
            >
              {enrolling ? 'Enrolling…' : 'Generate code'}
            </Button>
          </div>

          {freshCode && (
            <div className="mt-3 rounded-lg border border-border-success bg-surface-success px-3 py-3">
              <p className="text-role-caption font-semibold text-text-success">
                Pairing code — shown once
              </p>
              <p className="mt-1 select-all font-mono text-xl font-semibold tracking-widest text-text-success">
                {freshCode.code}
              </p>
              <p className="mt-1 text-xs font-semibold text-text-success">
                On the tablet, open{' '}
                {kioskUrl ? (
                  <code className="rounded bg-surface-success px-1 break-all">{kioskUrl}</code>
                ) : (
                  <>the workspace kiosk URL</>
                )}{' '}
                → “Set up this tablet” and enter this code before{' '}
                {new Date(freshCode.expiresAt).toLocaleString()} (single-use; becomes a year-long
                device cookie once paired).
              </p>
            </div>
          )}
        </div>
      ) : null}

      {isFleet ? (
        <>
          {/* Mobile — same binding feed as a card stack; sticky Revoke on each card. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:hidden">
            {loading && rows.length === 0 ? (
              <p className="text-sm text-text-soft">Loading devices…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-text-soft">No kiosk devices enrolled.</p>
            ) : (
              rows.map((row) => {
                const dwell = formatDwellFace(row.dwellSeconds);
                const terminal = String(row.squareTerminalDeviceId ?? '').trim();
                return (
                  <article
                    key={row.id}
                    className={cn(
                      'border border-border-soft bg-surface-card p-4',
                      cornerClass('surface'),
                    )}
                  >
                    <header className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-text-default">{row.label}</p>
                        <p className="text-role-caption text-text-soft">Device {row.id}</p>
                      </div>
                      <span className="shrink-0 text-role-caption font-semibold text-text-soft">
                        {STATUS_LABEL[row.status]}
                      </span>
                    </header>
                    <dl className="mt-3 space-y-1 text-role-data text-text-soft">
                      <div>
                        Last seen{' '}
                        {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleDateString() : '—'}
                        {' · '}
                        Enrolled {new Date(row.createdAt).toLocaleDateString()}
                      </div>
                      <div>
                        {dwell ? `Dwell ${dwell}` : 'Dwell —'}
                        {' · '}
                        {hardwareStatusLabel(row.hardwareStatus)}
                      </div>
                      <div>{terminal ? `Reader ${terminal}` : 'No reader'}</div>
                      {row.enrolledByStaffId != null || row.enrolledByName ? (
                        <div className="flex items-center gap-1.5 pt-1">
                          <StaffAvatar
                            staffId={row.enrolledByStaffId}
                            name={row.enrolledByName}
                            size="xs"
                            alt=""
                          />
                          <span>{row.enrolledByName ?? '—'}</span>
                        </div>
                      ) : null}
                    </dl>
                    {row.status !== 'revoked' ? (
                      <footer className="mt-3 flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void pairTerminal(row.id, row.squareTerminalDeviceId)}
                        >
                          {terminal ? 'Change reader' : 'Pair reader'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => setRevokeTarget(row)}
                        >
                          Revoke
                        </Button>
                      </footer>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>

          <div className="hidden min-h-0 min-w-0 flex-1 flex-col md:flex">
            <DataTable {...sheet} totalCount={rows.length} />
          </div>
        </>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DataTable {...historySheet} totalCount={events.length} />
        </div>
      )}

      {isFleet ? (
        <KioskDeviceRevokePlane
          row={revokeTarget}
          busy={revoking}
          onClose={() => {
            if (!revoking) setRevokeTarget(null);
          }}
          onConfirm={(row) => void confirmRevoke(row)}
        />
      ) : null}
    </section>
  );
}

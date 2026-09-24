'use client';

/**
 * RepairScanCompanion — the phone's half of the counter tablet's repair visit.
 *
 * The staffer scans the QR on the tablet's Device & quote step and lands here:
 * the visit's units, grouped by product, each with its serial or a gap, and the
 * house capture window underneath. Every read goes to the unit in focus — the
 * first one still missing a serial, or the one the staffer tapped — and focus
 * moves on to the next gap by itself, so three radios are three scans and no
 * taps. The tablet shows each serial about a second later.
 *
 * The tablet owns the visit: this page never adds, removes or prices a unit.
 * It reads the tablet's snapshot (polled) and queues serials; the tablet
 * applies them through the same line write its serial field makes.
 *
 * Callers: `/m/repair-scan`.
 * Affected API: GET/POST `/api/counter/companion`.
 * Schemas: `CompanionDevice`.
 * User: "scan something like a serial number to input and update the form on
 *   your phone as well" (2026-09-24).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { repairDeviceKey } from '@/lib/kiosk/repair-devices';
import type { CompanionDevice } from '@/lib/kiosk/companion-shape';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** The tablet syncs once a second; reading a touch slower keeps the phone quiet. */
const POLL_MS = 1500;

type LinkState = 'loading' | 'live' | 'expired';

interface ProductGroup {
  key: string;
  title: string;
  sku: string | null;
  units: CompanionDevice[];
}

function groupUnits(devices: readonly CompanionDevice[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const unit of devices) {
    const key = repairDeviceKey(unit.sku, unit.title);
    const group = groups.get(key);
    if (group) group.units.push(unit);
    else groups.set(key, { key, title: unit.title, sku: unit.sku, units: [unit] });
  }
  return [...groups.values()];
}

export function RepairScanCompanion({ token }: { token: string }) {
  const [devices, setDevices] = useState<CompanionDevice[]>([]);
  const [linkState, setLinkState] = useState<LinkState>('loading');
  /** The unit the staffer tapped; null → the first one still missing a serial. */
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);

  const read = useCallback(async () => {
    const res = await fetch(`/api/counter/companion?t=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    }).catch(() => null);
    if (!res) return;
    if (res.status === 404) {
      setLinkState('expired');
      return;
    }
    if (!res.ok) return;
    const json = (await res.json()) as { devices: CompanionDevice[] };
    setDevices(json.devices);
    setLinkState('live');
  }, [token]);

  useEffect(() => {
    if (linkState === 'expired') return;
    void read();
    const timer = window.setInterval(() => void read(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [read, linkState]);

  const focusId = useMemo(() => {
    if (picked && devices.some((d) => d.lineId === picked)) return picked;
    return devices.find((d) => !d.serialNumber.trim())?.lineId ?? null;
  }, [picked, devices]);

  const onDecode = useCallback(
    async (value: string) => {
      const serialNumber = value.trim();
      if (!focusId || !serialNumber) return;
      setPending((n) => n + 1);
      setFailed(false);
      try {
        const res = await fetch('/api/counter/companion', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, lineId: focusId, serialNumber }),
        });
        if (res.status === 404) {
          setLinkState('expired');
          return;
        }
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const json = (await res.json()) as { devices: CompanionDevice[] };
        setDevices(json.devices);
        // Focus moves on to the next gap by itself.
        setPicked(null);
      } catch {
        setFailed(true);
      } finally {
        setPending((n) => n - 1);
      }
    },
    [focusId, token],
  );

  const groups = useMemo(() => groupUnits(devices), [devices]);
  const scanned = devices.filter((d) => d.serialNumber.trim()).length;
  const focusIndex = devices.findIndex((d) => d.lineId === focusId);

  const status =
    linkState === 'expired'
      ? 'Link ended'
      : failed
        ? 'Not saved · scan again'
        : focusId
          ? `Serial ${focusIndex + 1} of ${devices.length}`
          : devices.length > 0
            ? 'All serials in'
            : 'Waiting for the tablet';

  if (linkState === 'expired') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-card px-8 text-center">
        <p className="text-base font-semibold text-text-default">This phone link has ended</p>
        <p className="text-sm text-text-soft">
          Tap “Scan serials with phone” on the tablet and scan the new QR.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card" data-testid="repair-scan-companion">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h1 className="text-role-title font-bold text-text-default">Repair serials</h1>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-text-default" data-testid="repair-scan-count">
            {scanned} of {devices.length}
          </p>
        </div>
        {linkState === 'loading' ? (
          <p className="text-sm text-text-soft">Joining the tablet…</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-text-soft">No devices on the tablet yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <section
                key={group.key}
                className={cn('border border-border-hairline px-3 py-3', MOBILE_SCAN_ROW_CORNER)}
              >
                <p className="text-sm font-semibold text-text-default">{group.title}</p>
                {group.sku ? <p className="text-role-micro text-text-soft">{group.sku}</p> : null}
                <div className="mt-2 flex flex-col gap-1.5">
                  {group.units.map((unit, i) => {
                    const focused = unit.lineId === focusId;
                    return (
                      <button
                        key={unit.lineId}
                        type="button"
                        onClick={() => setPicked(unit.lineId)}
                        aria-pressed={focused}
                        data-testid="repair-scan-unit"
                        data-line-id={unit.lineId}
                        className={cn(
                          'ds-raw-button flex min-h-mode-hit items-center justify-between gap-3 border px-3 text-left',
                          MOBILE_SCAN_ROW_CORNER,
                          focused ? 'border-border-accent bg-surface-accent' : 'border-border-hairline',
                        )}
                      >
                        <span className="text-sm text-text-soft">
                          {group.units.length > 1 ? `Serial ${i + 1}` : 'Serial'}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 truncate font-mono text-sm',
                            unit.serialNumber ? 'text-text-default' : 'text-text-soft',
                          )}
                        >
                          {unit.serialNumber || (focused ? 'Scan now' : 'Needs serial')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <MobileCaptureWindow
        label="Serial number camera"
        collapsedLabel="Scan a serial"
        status={status}
        statusAlert={failed}
        pending={pending}
        onDecode={(value) => void onDecode(value)}
      />
    </div>
  );
}

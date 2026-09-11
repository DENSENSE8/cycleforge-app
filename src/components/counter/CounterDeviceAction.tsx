'use client';

/**
 * @domain-job Put the visit in front of the customer: pick which paired tablet
 * this counter session drives, from the desk header.
 *
 * The bridge underneath this button was finished months before the button was:
 * a tablet enrols to the ORG (Settings → Kiosk devices), mirrors whatever open
 * session is bound to its device id, and repaints within one poll. What was
 * missing was the act of BINDING — `/counter` opened every visit with
 * `kioskDeviceId: null`, so the fan-out had no channel, the tablet's
 * `GET /api/kiosk/session` answered "nothing", and the iPad sat on its own
 * local cart while the desk drove a session no one could see.
 *
 * **One CTA, both states.** With no visit open it starts one *on that tablet*
 * (create carries the device, so the customer's screen is live before the
 * first line exists). With a visit open it binds or hands the tablet back.
 * A separate "start visit" and "choose tablet" pair would have made the common
 * case two decisions, and the first one is never the interesting one.
 *
 * Chrome law: {@link DeskActionSlotRegistrar} `role="primary"` +
 * {@link DeskHeaderAction} — page-level, top-right of the desk header. Never a
 * corner of its own inside the workspace body.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P5) ·
 * `docs/todo/kiosk-counter-consult-PLAN.md` (Phase 0).
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { createCounterSession } from '@/components/counter/useCounterSession';
import {
  deviceAvailabilityCopy,
  type CounterDevice,
} from '@/lib/counter/counter-devices-model';

type BindResult = { ok: boolean; json?: { error?: string } };

function asBindResult(value: unknown): BindResult | null {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return null;
  return value as BindResult;
}

export function CounterDeviceAction({
  sessionId,
  boundDeviceId,
  disabled,
  onBind,
}: {
  sessionId: number | null;
  boundDeviceId: number | null;
  disabled?: boolean;
  /** Bind (or unbind with `null`) the OPEN visit. Absent before one exists. */
  onBind?: (kioskDeviceId: number | null) => Promise<unknown>;
}) {
  const router = useRouter();
  const [devices, setDevices] = useState<CounterDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fetched when the menu opens, not on mount: presence is only true for as
  // long as it takes to read it, and a desk that never touches the picker
  // should not poll the fleet all shift.
  const load = useCallback(async () => {
    setError(null);
    const query = sessionId === null ? '' : `?session=${sessionId}`;
    const res = await fetch(`/api/counter/devices${query}`, { cache: 'no-store' });
    if (!res.ok) {
      setDevices([]);
      setError(res.status === 403 ? 'You do not have access to the tablets.' : 'Could not load tablets.');
      return;
    }
    const json = (await res.json().catch(() => ({}))) as { devices?: CounterDevice[] };
    setDevices(json.devices ?? []);
  }, [sessionId]);

  const pick = useCallback(
    async (device: CounterDevice) => {
      setBusy(true);
      setError(null);
      try {
        if (sessionId === null) {
          // No visit yet: open one already bound, so the customer's screen is
          // live before the first line is typed.
          const result = await createCounterSession(device.id);
          if ('sessionId' in result) router.push(`/counter?session=${result.sessionId}`);
          else setError(result.error);
          return;
        }
        const bound = asBindResult(await onBind?.(device.id));
        if (bound && !bound.ok) {
          // Spoken the same way as a busy row — a race (two desks, stale list)
          // must not look like a silent steal.
          setError(
            bound.json?.error === 'DEVICE_BUSY'
              ? deviceAvailabilityCopy({ ...device, heldByOtherVisit: true }, Date.now())
              : 'Could not put the visit on that tablet.',
          );
          void load();
        }
      } finally {
        setBusy(false);
      }
    },
    [load, onBind, router, sessionId],
  );

  const unbind = useCallback(async () => {
    setBusy(true);
    try {
      const bound = asBindResult(await onBind?.(null));
      if (bound && !bound.ok) setError('Could not hand the tablet back.');
    } finally {
      setBusy(false);
    }
  }, [onBind]);

  const bound = useMemo(
    () => devices?.find((device) => device.id === boundDeviceId) ?? null,
    [devices, boundDeviceId],
  );

  // The label names the TABLET, never its row id — a staffer reads "Front
  // counter iPad", and a customer glancing at the desk screen reads nothing
  // that looks like a database.
  const label = boundDeviceId === null ? 'Kiosk' : `Kiosk · ${bound?.label ?? 'linked'}`;
  const nowMs = Date.now();

  const control = useMemo(
    () => (
      <DropdownMenu onOpenChange={(open) => { if (open) void load(); }}>
        <DropdownMenuTrigger asChild>
          <DeskHeaderAction
            variant={boundDeviceId === null ? 'primary' : 'secondary'}
            size="md"
            disabled={disabled || busy}
            data-testid="counter-kiosk-cta"
          >
            {label}
          </DeskHeaderAction>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-[16rem]">
          <DropdownMenuLabel>Customer tablet</DropdownMenuLabel>

          {devices === null ? (
            <p className="px-2 py-1.5 text-role-caption text-text-muted">Looking for tablets…</p>
          ) : devices.length === 0 ? (
            <p className="px-2 py-1.5 text-role-caption text-text-muted">
              {error ?? 'No paired tablets. A manager pairs one in Settings → Kiosk devices.'}
            </p>
          ) : (
            devices.map((device) => (
              <DropdownMenuItem
                key={device.id}
                disabled={device.heldByOtherVisit || device.id === boundDeviceId}
                onSelect={() => void pick(device)}
              >
                <span className="flex-1 truncate">{device.label}</span>
                <span className="text-role-caption text-text-muted">
                  {device.id === boundDeviceId
                    ? 'On this visit'
                    : deviceAvailabilityCopy(device, nowMs)}
                </span>
              </DropdownMenuItem>
            ))
          )}

          {boundDeviceId !== null && onBind ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem tone="danger" onSelect={() => void unbind()}>
                Hand the tablet back
              </DropdownMenuItem>
            </>
          ) : null}

          {error && devices !== null && devices.length > 0 ? (
            <p className="px-2 py-1.5 text-role-caption text-text-danger">{error}</p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [boundDeviceId, busy, devices, disabled, error, label, load, nowMs, onBind, pick, unbind],
  );

  return <DeskActionSlotRegistrar role="primary">{control}</DeskActionSlotRegistrar>;
}

'use client';

/**
 * /kiosk — front-desk intake tablet (FOH/BOH surface split, doc 06).
 *
 * DEVICE PRINCIPAL, never a staff member: public + chromeless (registered in
 * proxy.ts PUBLIC_PATHS + AuthContext CLIENT_PUBLIC_PATHS), every write goes
 * through the httpOnly `cf_kiosk` device token via withKioskAuth.
 *
 * A team member is always at the counter filling this out WITH the customer —
 * so it is HEADLESS (no self-service "checked in" step, no staff PIN). Tapping a
 * live service opens the real intake form (currently Repair → the shared
 * `RepairIntakeForm` in `kioskMode`), which submits device-authed to
 * `/api/kiosk/repair/submit` and shows its own confirmation. Sales + Pickup are
 * WIP tiles kept in the same SoT so re-enabling one is a status flip.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, Panel } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import type { RepairFormData, RepairSubmitResult } from '@/components/repair/RepairIntakeForm';

// Lazy-load the intake form so the welcome screen stays light; it only loads
// when a team member opens a service.
const RepairIntakeForm = dynamic(
  () => import('@/components/repair/RepairIntakeForm').then((m) => m.RepairIntakeForm),
  { ssr: false },
);

type Service = 'sales' | 'pickup' | 'repair';
type Mode = 'ready' | 'pair';

interface ServiceTile {
  id: Service;
  label: string;
  blurb: string;
  /** Only `live` services render today; `wip` ones stay here to reuse this tile. */
  status: 'live' | 'wip';
}

// Single SoT for every front-desk service tile. Sales + Pickup are WIP: they
// stay in this array so bringing one online is a one-line `status: 'live'` flip
// that reuses this exact tile grammar — never a second tile design.
const SERVICES: ReadonlyArray<ServiceTile> = [
  { id: 'repair', label: 'Repair Drop-off', blurb: 'Check in a device for service', status: 'live' },
  { id: 'sales', label: 'Buy / Sell', blurb: 'Start a counter sale or trade-in', status: 'wip' },
  { id: 'pickup', label: 'Order Pickup', blurb: 'Collect a ready order', status: 'wip' },
];

const REPAIR_SUBMIT_TIMEOUT_MS = 60_000;

export default function KioskPage() {
  const [mode, setMode] = useState<Mode>('ready');
  const [activeService, setActiveService] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  // Idempotency key for the in-flight repair submission — persists across failed
  // retries (dedupes the Zendesk ticket) and clears on success/close.
  const repairIdemKey = useRef<string | null>(null);

  const liveServices = SERVICES.filter((s) => s.status === 'live');

  // Dev-only convenience: silently exchange a fixed dogfood-org pairing for
  // this browser on mount, so a local kiosk.localhost tab never needs the
  // manual "Set up this tablet" code. The route itself is hard-gated (404s
  // in production or when the two env vars aren't set), so this is a no-op
  // everywhere except an opted-in local dev box.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    void fetch('/api/kiosk/dev-autopair', { method: 'POST' }).catch(() => {});
  }, []);

  const openService = useCallback((service: Service) => {
    setErr(null);
    setActiveService(service);
  }, []);

  const closeService = useCallback(() => {
    setActiveService(null);
    repairIdemKey.current = null;
  }, []);

  const submitRepair = useCallback(async (data: RepairFormData): Promise<RepairSubmitResult> => {
    if (!repairIdemKey.current) repairIdemKey.current = safeRandomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REPAIR_SUBMIT_TIMEOUT_MS);
    try {
      const res = await fetch('/api/kiosk/repair/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': repairIdemKey.current },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 401) {
        // Device isn't paired — route staff to setup and abort the submit.
        setActiveService(null);
        setErr('This tablet needs to be paired before intake. A manager can set it up in Settings → Devices.');
        setMode('pair');
        throw new Error('This tablet is not paired yet.');
      }

      let result: Record<string, unknown>;
      try {
        result = await res.json();
      } catch {
        throw new Error(res.ok ? 'Invalid response from server. Please try again.' : `Failed to submit repair (${res.status}). Please try again.`);
      }

      if (res.ok && result.success) {
        repairIdemKey.current = null;
        return {
          id: Number(result.id),
          rsNumber: (result.rsNumber as string | number | null | undefined) ?? null,
          zendeskTicketNumber: (result.zendeskTicketNumber as string | null | undefined) ?? null,
          zendeskTicketUrl: (result.zendeskTicketUrl as string | null | undefined) ?? null,
        };
      }

      const message =
        typeof result.error === 'string' && result.error.trim()
          ? result.error
          : `Failed to submit repair (${res.status}). Please try again.`;
      throw new Error(message);
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Submission timed out. A team member can check the repair list before retrying.');
      }
      if (error instanceof Error) throw error;
      throw new Error('Error submitting repair. Please try again.');
    }
  }, []);

  const pair = useCallback(async () => {
    if (code.trim().length < 8) {
      setErr('Enter the full setup code.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/kiosk/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!r.ok) {
        setErr('That setup code is invalid or expired. Generate a new one in Settings.');
        return;
      }
      setCode('');
      setMode('ready');
    } catch {
      setErr('Network issue while pairing. Try again.');
    } finally {
      setBusy(false);
    }
  }, [code]);

  // A live service replaces the whole surface with its full-screen intake form.
  // The form owns its own submit + confirmation; onClose returns to Welcome.
  if (activeService === 'repair') {
    return (
      <div className="fixed inset-0 z-panelOverlay bg-surface-card">
        <RepairIntakeForm kioskMode onClose={closeService} onSubmit={submitRepair} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-canvas px-6 py-10 text-text-default">
      <div className="w-full max-w-2xl">
        <header className="mb-8 text-center">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Welcome</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">How can we help you today?</h1>
        </header>

        {err && (
          <div className="mb-6 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700">
            {err}
          </div>
        )}

        {mode === 'ready' && (
          <div
            className={cn(
              'grid grid-cols-1 gap-4',
              liveServices.length > 1 && 'sm:grid-cols-3',
              liveServices.length === 1 && 'mx-auto max-w-sm',
            )}
          >
            {liveServices.map((s) => (
              // ds-raw-button — bespoke full-height service tile, not a Button variant
              <button
                key={s.id}
                type="button"
                onClick={() => openService(s.id)}
                className={cn(
                  'flex min-h-[9rem] flex-col items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface-card px-4 py-6 text-center shadow-sm transition hover:bg-surface-hover', // ds-allow-box — bespoke interactive service tile (not a static Panel)
                  focusRing('control', 'accent'),
                )}
              >
                <span className="text-lg font-semibold">{s.label}</span>
                <span className="text-xs font-semibold text-text-soft">{s.blurb}</span>
              </button>
            ))}
          </div>
        )}

        {mode === 'pair' && (
          <Panel padding="lg" className="mx-auto max-w-md">
            <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Tablet setup</p>
            <h2 className="mt-1 text-xl font-semibold">Pair this tablet</h2>
            <p className="mt-2 text-sm font-semibold text-text-soft">
              A manager generates a setup code in Settings → Devices. Enter it below to pair this tablet.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Setup code"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className={cn(
                'mt-4 w-full rounded-xl border border-border-soft bg-surface-canvas px-4 py-3 text-center text-lg font-semibold tracking-widest',
                focusRing('field', 'accent'),
              )}
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={() => { setMode('ready'); setErr(null); }}>
                Cancel
              </Button>
              <Button onClick={() => void pair()} disabled={busy}>
                {busy ? 'Pairing…' : 'Pair tablet'}
              </Button>
            </div>
          </Panel>
        )}

        {mode === 'ready' && (
          <div className="mt-10 text-center">
            <Button variant="ghost" size="sm" onClick={() => { setMode('pair'); setErr(null); }}>
              Set up this tablet
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

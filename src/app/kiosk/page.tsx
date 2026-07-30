'use client';

/**
 * /kiosk — front-desk intake tablet (FOH/BOH surface split, doc 06).
 *
 * DEVICE PRINCIPAL, never a staff member: public + chromeless (registered in
 * proxy.ts PUBLIC_PATHS + AuthContext CLIENT_PUBLIC_PATHS), every write goes
 * through the httpOnly `cf_kiosk` device token via withKioskAuth.
 *
 * A team member is always at the counter filling this out WITH the customer —
 * so base intake is HEADLESS (no self-service "checked in" step, no staff PIN).
 * Tapping a live service opens its real intake form; each owns its own submit and
 * confirmation, and `onClose` returns here.
 *
 *   Repair → `RepairIntakeForm` (kioskMode) → `/api/kiosk/repair/submit`
 *   Sales  → `CounterIntakeForm`            → `/api/kiosk/intake`
 *
 * The two are SIBLINGS on purpose: a repair-only drop-off keeps its leaner flow,
 * while a counter visit that mixes goods and service needs a cart, a receipt
 * preview and a payment hand-off. Both share `submitRepairIntake` underneath —
 * the sales path composes it via `submitCounterTransaction` — so the repair
 * record they create can never drift.
 *
 * Taking payment is the one PRIVILEGED action here: it requires a staff PIN
 * step-up by someone holding `walk_in.take_payment`, and even then the tablet only
 * STAGES an order. No card details are ever entered on this device.
 *
 * Pickup remains a WIP tile in the same SoT so enabling it is a status flip.
 *
 * Layout: square stage sized to the shorter viewport edge — iPad portrait /
 * landscape / near-square all get one composed floor surface, not a landscape
 * card floating in empty canvas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, Panel } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import type { RepairFormData, RepairSubmitResult } from '@/components/repair/RepairIntakeForm';
import type {
  CounterTransactionInput,
  CounterTransactionResult,
} from '@/lib/counter/counter-transaction-types';

// Lazy-load the intake form so the welcome screen stays light; it only loads
// when a team member opens a service.
const RepairIntakeForm = dynamic(
  () => import('@/components/repair/RepairIntakeForm').then((m) => m.RepairIntakeForm),
  { ssr: false },
);

// The counter transaction (retail + service in one visit). A SIBLING of the
// repair form, not a replacement: repair-only drop-off keeps its own leaner flow.
const CounterIntakeForm = dynamic(
  () => import('@/components/counter/CounterIntakeForm').then((m) => m.CounterIntakeForm),
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
  // Live as of the counter-transaction work: taps into CounterIntakeForm, which
  // submits through /api/kiosk/intake. The square_transactions tenancy contract
  // (migration 2026-07-29a) is a HARD prerequisite for this being 'live' — it is
  // applied, so a kiosk sale can no longer write across orgs.
  { id: 'sales', label: 'Buy / Sell', blurb: 'Start a counter sale or trade-in', status: 'live' },
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
  /** Same contract as `repairIdemKey`, for the counter transaction path. */
  const counterIdemKey = useRef<string | null>(null);

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
    counterIdemKey.current = null;
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

  /**
   * Submit a counter transaction through the unified device-authed path.
   *
   * The idempotency key is minted ONCE per attempt-chain and re-sent on retry, so
   * a flaky tablet connection cannot double-charge or double-ticket: the server's
   * `ux_counter_transactions_client_event` collapses the replay. It is cleared
   * only on success or on closing the form.
   */
  const submitCounter = useCallback(
    async (
      input: Omit<CounterTransactionInput, 'clientEventId'>,
      opts: { takePayment: boolean },
    ): Promise<CounterTransactionResult> => {
      if (!counterIdemKey.current) counterIdemKey.current = safeRandomUUID();
      const res = await fetch('/api/kiosk/intake', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': counterIdemKey.current,
        },
        body: JSON.stringify({
          service: 'sales',
          customer: input.customer,
          retailLines: input.retailLines,
          serviceLine: input.service,
          priorOrder: input.priorOrder,
          ticketWork: input.ticketWork,
          takePayment: opts.takePayment,
        }),
      });

      if (res.status === 401) {
        setActiveService(null);
        setErr('This tablet needs to be paired before intake. A manager can set it up in Settings → Devices.');
        setMode('pair');
        throw new Error('This tablet is not paired yet.');
      }

      const body = (await res.json().catch(() => ({}))) as {
        transaction?: CounterTransactionResult;
        error?: string;
      };

      if (res.status === 403 && body.error?.includes('STEPUP')) {
        // Taking payment needs a manager's PIN; the device cannot authorize it.
        throw new Error('A manager needs to authorize payment on this tablet.');
      }
      if (!res.ok || !body.transaction) {
        throw new Error(body.error?.trim() || `Could not complete this transaction (${res.status}).`);
      }

      counterIdemKey.current = null;
      return body.transaction;
    },
    [],
  );

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

  if (activeService === 'sales') {
    return (
      <div className="fixed inset-0 z-panelOverlay bg-surface-card">
        {/* `/api/kiosk/repair` = the device-authed catalog twins (same response
            shapes as the staff pair). */}
        <CounterIntakeForm
          apiBasePath="/api/kiosk/repair"
          onClose={closeService}
          onSubmit={submitCounter}
        />
      </div>
    );
  }

  const tileCount = liveServices.length;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-canvas px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text-default sm:px-6 sm:py-6 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {/*
        Square stage: sized to the shorter viewport edge so portrait iPad,
        landscape iPad, and near-square desk mounts all get one composed floor —
        not a thin landscape card in a sea of canvas. Setup lives INSIDE the
        stage as a quiet footer — an absolute control below the stage was
        reading as an accidental full-width dock bar in the leftover canvas.
      */}
      <div
        className={cn(
          'flex w-full flex-col',
          'aspect-square max-h-[min(100dvh-1.5rem,100dvw-2rem)] max-w-[min(100dvh-1.5rem,100dvw-2rem)]',
        )}
        // Size container so clamp(...cqi...) type scales with the stage, not the viewport.
        style={{ containerType: 'size' }}
      >
        <header className="shrink-0 text-center">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Welcome</p>
          <h1 className="mt-2 text-balance text-[clamp(1.5rem,4.2cqi+0.75rem,2.5rem)] font-semibold leading-tight tracking-tight">
            How can we help you today?
          </h1>
        </header>

        {err && (
          <div
            className={cn(
              'mt-4 shrink-0 border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700',
              cornerClass('card'),
            )}
          >
            {err}
          </div>
        )}

        {mode === 'ready' && (
          <div
            className={cn(
              'mt-6 grid min-h-0 flex-1 gap-3 sm:mt-8 sm:gap-4',
              // Square stage: 1 tile fills; 2+ tiles share a 2-col floor (never a 3-col strip).
              tileCount === 1 ? 'grid-cols-1' : 'grid-cols-2',
              // Odd count: last tile spans full width so the floor stays balanced.
              tileCount > 1 && tileCount % 2 === 1 && '[&>*:last-child]:col-span-2',
            )}
          >
            {liveServices.map((s) => (
              // ds-raw-button — bespoke floor-density service tile, not a Button variant
              <button
                key={s.id}
                type="button"
                onClick={() => openService(s.id)}
                className={cn(
                  'group flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 border border-border-soft bg-surface-card px-5 py-6 text-center shadow-sm transition-[background-color,transform] duration-150 ease-out', // ds-allow-box — bespoke interactive service tile (not a static Panel)
                  'hover:bg-surface-hover active:scale-[0.985]',
                  tileCount === 1 ? cornerClass('canvas') : cornerClass('card'),
                  tileCount === 1 && 'gap-3 px-8 py-10 sm:gap-4 sm:px-10 sm:py-12',
                  focusRing('control', 'accent'),
                )}
              >
                <span
                  className={cn(
                    'font-semibold tracking-tight text-text-default',
                    tileCount === 1
                      ? 'text-[clamp(1.75rem,5cqi+0.5rem,2.75rem)] leading-tight'
                      : 'text-[clamp(1.125rem,3.5cqi+0.35rem,1.5rem)] leading-snug',
                  )}
                >
                  {s.label}
                </span>
                <span
                  className={cn(
                    'max-w-[22ch] font-semibold text-text-soft',
                    tileCount === 1
                      ? 'text-[clamp(0.9375rem,2.2cqi+0.35rem,1.25rem)]'
                      : 'text-[clamp(0.75rem,1.8cqi+0.25rem,0.9375rem)]',
                  )}
                >
                  {s.blurb}
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === 'pair' && (
          <div className="mt-6 flex min-h-0 flex-1 items-center justify-center sm:mt-8">
            <Panel padding="lg" elevation="raised" className="w-full max-w-md">
              <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Tablet setup</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Pair this tablet</h2>
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
                  'mt-5 w-full border border-border-soft bg-surface-canvas px-4 py-4 text-center text-xl font-semibold tracking-widest',
                  cornerClass('field'),
                  focusRing('field', 'accent'),
                )}
              />
              <div className="mt-5 flex items-center justify-between gap-3">
                <Button variant="ghost" size="lg" onClick={() => { setMode('ready'); setErr(null); }}>
                  Cancel
                </Button>
                <Button size="lg" onClick={() => void pair()} disabled={busy}>
                  {busy ? 'Pairing…' : 'Pair tablet'}
                </Button>
              </div>
            </Panel>
          </div>
        )}

        {mode === 'ready' && (
          <div className="mt-4 flex shrink-0 justify-center pb-1 pt-1 sm:mt-5">
            {/*
              Quiet caption control — not Button chrome. A ghost Button pinned
              under the square stage was reading as a full-width dock tab in the
              leftover canvas. Keep this secondary and text-only so the service
              tile stays the only floor CTA.
            */}
            {/* ds-raw-button — muted text link, not a Button variant */}
            <button
              type="button"
              onClick={() => { setMode('pair'); setErr(null); }}
              className={cn(
                'min-h-11 px-4 py-2.5 text-role-caption font-semibold text-text-soft transition-colors hover:text-text-default',
                focusRing('control', 'accent'),
              )}
            >
              Set up this tablet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

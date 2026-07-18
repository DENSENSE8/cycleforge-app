'use client';

/**
 * /kiosk — customer-facing intake tablet (FOH/BOH surface split, doc 06).
 *
 * This surface authenticates as a DEVICE PRINCIPAL, never a staff member: the
 * page is public + chromeless (registered in proxy.ts PUBLIC_PATHS +
 * AuthContext CLIENT_PUBLIC_PATHS, so ResponsiveLayout renders no staff nav),
 * and every write goes through the httpOnly `cf_kiosk` device token via
 * withKioskAuth. Staff identity only appears transiently via PIN step-up on a
 * privileged action.
 *
 * SEAM (doc 03): the real service forms (Sales · Local Pickup · Repair) +
 * Square/Zoho/Ecwid capability wiring replace the demonstrator tiles below. The
 * device-principal AUTH model — pairing, unpaired-gate, device-authed writes —
 * is what this page owns.
 */

import { useCallback, useState } from 'react';
import { Button, Panel } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

type Service = 'sales' | 'pickup' | 'repair';
type Mode = 'ready' | 'pair' | 'done';

const SERVICES: ReadonlyArray<{ id: Service; label: string; blurb: string }> = [
  { id: 'sales', label: 'Buy / Sell', blurb: 'Start a counter sale or trade-in' },
  { id: 'pickup', label: 'Order Pickup', blurb: 'Collect a ready order' },
  { id: 'repair', label: 'Repair Drop-off', blurb: 'Check in a device for service' },
];

export default function KioskPage() {
  const [mode, setMode] = useState<Mode>('ready');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [lastService, setLastService] = useState<Service | null>(null);

  const startIntake = useCallback(async (service: Service) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/kiosk/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      if (r.status === 401) {
        // Device isn't paired — route staff to the setup screen.
        setMode('pair');
        return;
      }
      if (!r.ok) {
        setErr('Something went wrong. Please ask a team member for help.');
        return;
      }
      setLastService(service);
      setMode('done');
    } catch {
      setErr('Network issue. Please ask a team member for help.');
    } finally {
      setBusy(false);
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-canvas px-6 py-10 text-text-default">
      <div className="w-full max-w-2xl">
        <header className="mb-8 text-center">
          <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">Welcome</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">How can we help you today?</h1>
        </header>

        {err && (
          <div className="mb-6 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700">
            {err}
          </div>
        )}

        {mode === 'ready' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {SERVICES.map((s) => (
              // ds-raw-button — bespoke full-height service tile, not a Button variant
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => void startIntake(s.id)}
                className={cn(
                  'flex min-h-[9rem] flex-col items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface-card px-4 py-6 text-center shadow-sm transition hover:bg-surface-hover disabled:opacity-60', // ds-allow-box — bespoke interactive service tile (not a static Panel)
                  focusRing('control', 'accent'),
                )}
              >
                <span className="text-lg font-black">{s.label}</span>
                <span className="text-xs font-semibold text-text-soft">{s.blurb}</span>
              </button>
            ))}
          </div>
        )}

        {mode === 'done' && (
          <Panel padding="lg" className="text-center">
            <p className="text-xl font-black">You're checked in.</p>
            <p className="mt-2 text-sm font-semibold text-text-soft">
              A team member will be with you shortly{lastService === 'repair' ? ' about your repair.' : '.'}
            </p>
            <div className="mt-6">
              <Button variant="secondary" onClick={() => setMode('ready')}>
                Start over
              </Button>
            </div>
          </Panel>
        )}

        {mode === 'pair' && (
          <Panel padding="lg" className="mx-auto max-w-md">
            <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">Tablet setup</p>
            <h2 className="mt-1 text-xl font-black">Pair this tablet</h2>
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
                'mt-4 w-full rounded-xl border border-border-soft bg-surface-canvas px-4 py-3 text-center text-lg font-bold tracking-widest',
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

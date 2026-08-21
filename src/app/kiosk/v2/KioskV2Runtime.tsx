'use client';

/**
 * /kiosk/v2 client runtime — pair chrome + idle + attract + landscape shell.
 *
 * AttractLoop and KioskShell are dynamic so the pair screen and first idle
 * tick do not pull the catalog or attract media into the welcome chunk.
 */

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, Panel } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { resolveKioskIdleTiming } from '@/lib/kiosk/idle';
import { pairKioskTablet } from '@/lib/kiosk/pair-tablet';
import { kioskSessionStore } from '@/lib/kiosk/kiosk-session-store';
import { cartIsEmpty } from '@/lib/kiosk/cart-line';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { KioskCatalogFirstPaint } from '../KioskCatalogFirstPaint';

const AttractLoop = dynamic(
  () => import('../AttractLoop').then((m) => m.AttractLoop),
  { ssr: false },
);

const KioskShell = dynamic(
  () => import('../KioskShell').then((m) => m.KioskShell),
  { loading: () => <KioskCatalogFirstPaint /> },
);

type Mode = 'ready' | 'pair' | 'attract' | 'prompt';

export function KioskV2Runtime() {
  const [mode, setMode] = useState<Mode>('ready');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [attractMediaUrl, setAttractMediaUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  // Dogfood org #1 gets the wordmark screensaver (white field, black brand
  // text, no tap prompt); every other tenant keeps the attract media loop.
  const [plainAttract, setPlainAttract] = useState(false);
  // Wordmark copy + ink for the plain screensaver, tenant-editable in
  // Settings → Organization ▸ Branding. Unset falls back to the dogfood pair.
  const [headline, setHeadline] = useState<string | null>(null);
  const [subline, setSubline] = useState<string | null>(null);
  const [inkColor, setInkColor] = useState<string | null>(null);
  const [idleTime, setIdleTime] = useState(0);
  // Resolved from org settings; defaults to 60 → 70 until settings land, so a
  // slow/failed fetch never leaves the tablet without an idle path.
  const [idleTiming, setIdleTiming] = useState(() => resolveKioskIdleTiming(undefined));

  useEffect(() => {
    fetch('/api/kiosk/settings')
      .then((res) => {
        if (res.status === 401) {
          setMode('pair');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setIdleTiming(resolveKioskIdleTiming(data.kiosk?.idleTimeoutSeconds));
        setPlainAttract(data.orgId === DOGFOOD_ORG_ID);
        if (!data.brand) return;
        if (typeof data.brand.attractMediaUrl === 'string') {
          setAttractMediaUrl(data.brand.attractMediaUrl);
        }
        if (typeof data.brand.name === 'string') setBrandName(data.brand.name);
        if (typeof data.brand.logoUrl === 'string') setLogoUrl(data.brand.logoUrl);
        if (typeof data.brand.attractHeadline === 'string') setHeadline(data.brand.attractHeadline);
        if (typeof data.brand.attractSubline === 'string') setSubline(data.brand.attractSubline);
        if (typeof data.brand.primaryColor === 'string') setInkColor(data.brand.primaryColor);
      })
      .catch(() => {});
  }, []);

  const resetIdle = useCallback(() => {
    setIdleTime(0);
    setMode((currentMode) => {
      if (currentMode === 'attract' || currentMode === 'prompt') return 'ready';
      return currentMode;
    });
  }, []);

  useEffect(() => {
    // pointerdown + keydown only — mousemove on a kiosk is TBT poison.
    const events = ['pointerdown', 'keydown'] as const;
    let last = 0;
    const listener = () => {
      const now = Date.now();
      if (now - last < 250) return;
      last = now;
      resetIdle();
    };
    for (const e of events) document.addEventListener(e, listener, { passive: true });
    const interval = setInterval(() => setIdleTime((prev) => prev + 1), 1000);
    return () => {
      for (const e of events) document.removeEventListener(e, listener);
      clearInterval(interval);
    };
  }, [resetIdle]);

  useEffect(() => {
    if (mode === 'pair' || mode === 'attract') return;
    // Attract only when the cart is empty — never interrupt an active visit.
    if (!cartIsEmpty(kioskSessionStore.getSnapshot().lines)) return;
    if (idleTime === idleTiming.promptAtS) setMode('prompt');
    else if (idleTime >= idleTiming.attractAtS) setMode('attract');
  }, [idleTime, mode, idleTiming]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    void fetch('/api/kiosk/dev-autopair', { method: 'POST' }).catch(() => {});
  }, []);

  const pair = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const result = await pairKioskTablet(code);
    setBusy(false);
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    setCode('');
    setMode('ready');
  }, [code]);

  if (mode === 'ready' || mode === 'prompt') {
    return (
      <div className="relative h-full w-full overflow-hidden">
        {mode === 'prompt' && (
          <div className="fixed inset-0 z-panelOverlay flex items-center justify-center bg-scrim/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-surface-card p-8 text-center shadow-xl">
              <h2 className="text-2xl font-semibold text-text-default">Are you still there?</h2>
              <p className="mt-2 text-text-soft">
                This screen will reset in {Math.max(0, idleTiming.attractAtS - idleTime)} seconds.
              </p>
              <Button size="lg" className="mt-6 w-full" onClick={resetIdle}>
                I&apos;m still here
              </Button>
            </div>
          </div>
        )}
        <KioskShell />
        {/* ds-raw-button — zero-opacity hit target, not a styled action */}
        <button
          type="button"
          className="absolute bottom-4 right-4 h-12 w-12 opacity-0"
          onDoubleClick={() => {
            setMode('pair');
            setErr(null);
          }}
        >
          Setup
        </button>
      </div>
    );
  }

  if (mode === 'attract') {
    return (
      <AttractLoop
        mediaUrl={attractMediaUrl}
        brandName={brandName}
        logoUrl={logoUrl}
        onWake={resetIdle}
        active
        plain={plainAttract}
        headline={headline}
        subline={subline}
        inkColor={inkColor}
      />
    );
  }

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-surface-canvas px-4 py-5 text-text-default"
      data-testid="kiosk-pair-screen"
    >
      {err && (
        <div className="mb-4 w-full max-w-md shrink-0 rounded-xl border border-dashed border-border-danger bg-surface-danger px-4 py-3 text-center text-sm font-semibold text-text-danger">
          {err}
        </div>
      )}
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
  );
}

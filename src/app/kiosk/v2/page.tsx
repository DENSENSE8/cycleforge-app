'use client';

/**
 * /kiosk/v2 — landscape shell QA path (gated off main `/kiosk`).
 *
 * Main `/kiosk` keeps the proven welcome-tile + full-screen form flow until
 * this shell's E2E is green. This route owns attract / idle / pair chrome and
 * mounts `KioskShell` for the split-pane intake.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, Panel } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { resolveKioskIdleTiming } from '@/lib/kiosk/idle';
import { AttractLoop } from '../AttractLoop';
import { KioskShell } from '../KioskShell';

type Mode = 'ready' | 'pair' | 'attract' | 'prompt';

export default function KioskV2Page() {
  const [mode, setMode] = useState<Mode>('ready');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [attractMediaUrl, setAttractMediaUrl] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
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
        if (!data.brand) return;
        if (typeof data.brand.attractMediaUrl === 'string') {
          setAttractMediaUrl(data.brand.attractMediaUrl);
        }
        if (typeof data.brand.name === 'string') setBrandName(data.brand.name);
        if (typeof data.brand.logoUrl === 'string') setLogoUrl(data.brand.logoUrl);
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
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'] as const;
    const listener = () => resetIdle();
    for (const e of events) document.addEventListener(e, listener, { passive: true });
    const interval = setInterval(() => setIdleTime((prev) => prev + 1), 1000);
    return () => {
      for (const e of events) document.removeEventListener(e, listener);
      clearInterval(interval);
    };
  }, [resetIdle]);

  useEffect(() => {
    if (mode === 'pair' || mode === 'attract') return;
    if (idleTime === idleTiming.promptAtS) setMode('prompt');
    else if (idleTime >= idleTiming.attractAtS) setMode('attract');
  }, [idleTime, mode, idleTiming]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    void fetch('/api/kiosk/dev-autopair', { method: 'POST' }).catch(() => {});
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
        let apiError: string | undefined;
        try {
          const body = (await r.json()) as { error?: string };
          apiError = body.error;
        } catch {
          /* non-JSON */
        }
        if (apiError === 'KIOSK_HOST_REQUIRED' || r.status === 403) {
          setErr('Open this tablet on your workspace kiosk URL, not the staff app.');
          return;
        }
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
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-canvas px-4 py-5 text-text-default">
      {err && (
        <div className="mb-4 w-full max-w-md shrink-0 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700">
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

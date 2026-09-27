'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { BootSplash } from '@/components/boot/BootSplash';

// useLayoutEffect warns during SSR; fall back to useEffect there. On the client
// the layout variant is what we want — it runs before the browser paints, so we
// can decide "hold vs reveal" without a flash of the wrong state.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface BootGateProps {
  children: React.ReactNode;
  /** Warms the page's above-the-fold data before revealing. */
  prefetch: (queryClient: QueryClient) => Promise<unknown> | void;
  /** Returns true to HOLD the splash and warm the cache before revealing. */
  shouldHold?: () => boolean;
  /** Splash element. Defaults to the standard BootSplash. */
  splash?: React.ReactNode;
  /** Minimum ms to keep the splash up so a fast cache hit doesn't flash it. */
  minDurationMs?: number;
  /** Hard cap — reveal even if a query is still pending (slow/dead endpoint). */
  timeoutMs?: number;
  /** Fade-out duration for the splash, in ms. */
  fadeMs?: number;
}

/** Holds a single loading splash over a route until its above-the-fold data is warmed into the React Query cache, then reveals the page… */
export function BootGate({
  children,
  prefetch,
  shouldHold,
  splash = <BootSplash />,
  minDurationMs = 550,
  timeoutMs = 8000,
  fadeMs = 320,
}: BootGateProps) {
  const queryClient = useQueryClient();
  // `revealed` = children are mounted (behind the splash).
  const [revealed, setRevealed] = useState(false);
  const [splashUp, setSplashUp] = useState(true);
  const [splashMounted, setSplashMounted] = useState(true);
  // Portal target.
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  // Decide "hold vs reveal" exactly once. Stored in a ref (not recomputed) so
  // React StrictMode's dev mount→unmount→mount doesn't consume the one-shot
  // sign-in flag twice — the second consume would read false and skip the hold.
  const holdDecisionRef = useRef<boolean | null>(null);

  useIsoLayoutEffect(() => {
    setPortalEl(document.body);

    if (holdDecisionRef.current === null) {
      holdDecisionRef.current = shouldHold ? shouldHold() : true;
    }
    const hold = holdDecisionRef.current;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const reveal = () => {
      if (cancelled) return;
      setRevealed(true); // mount children behind the (still-visible) splash
      setSplashUp(false); // begin the CSS opacity fade-out Unmount only AFTER the fade has fully finished — primarily via the element's own `transitionend`…
      timers.push(
        setTimeout(() => {
          if (!cancelled) setSplashMounted(false);
        }, fadeMs + 1500),
      );
    };

    if (!hold) {
      reveal();
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    const startedAt = Date.now();
    const revealAfterMin = () => {
      const elapsed = Date.now() - startedAt;
      timers.push(setTimeout(reveal, Math.max(0, minDurationMs - elapsed)));
    };

    // Warm everything in parallel; reveal when all settle (success OR error —
    // a failed endpoint shouldn't trap the user) or when the hard cap fires.
    let settled = false;
    const onSettled = () => {
      if (settled || cancelled) return;
      settled = true;
      revealAfterMin();
    };

    // Settle on resolve OR reject — a failed endpoint shouldn't trap the user.
    Promise.resolve(prefetch(queryClient)).then(onSettled, onSettled);
    timers.push(setTimeout(onSettled, timeoutMs));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // Mount-only: props are read via closures and the hold decision is cached in
    // a ref, so re-running (StrictMode) is safe and idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remove the pre-paint bridge splash (injected by BOOT_SPLASH_SCRIPT in app/layout.tsx) once our own React splash is mounted on top.
  useEffect(() => {
    if (!portalEl) return;
    document.getElementById('__boot_splash_pre')?.remove();
  }, [portalEl]);

  return (
    <>
      {revealed && children}
      {portalEl &&
        splashMounted &&
        createPortal(
          // Plain CSS opacity fade — deliberately NOT Motion.
          <div
            className={`fixed inset-0 z-splash transition-opacity ease-out ${
              splashUp ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ transitionDuration: `${fadeMs}ms` }}
            onTransitionEnd={(e) => {
              // Fires exactly when the fade-out completes (opacity at 0). Guard on
              // the opacity property + the faded state so neither a held splash nor
              // an unrelated transition unmounts it early.
              if (e.propertyName === 'opacity' && !splashUp) setSplashMounted(false);
            }}
          >
            {splash}
          </div>,
          portalEl,
        )}
    </>
  );
}

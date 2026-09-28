'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { WELCOME_REPLAY_EVENT } from '@/components/boot/welcome/welcome-events';
import {
  loadWelcomeAssembly,
  loadWelcomeSimple,
} from '@/components/boot/welcome/welcome-loader';
import { holdWelcome, releaseWelcome } from '@/components/boot/welcome/welcome-stage';
import {
  DEFAULT_WELCOME_VARIANT,
  WELCOME_VARIANT_STORAGE_KEY,
  resolveWelcomeVariant,
  type WelcomeVariant,
} from '@/components/boot/welcome/welcome-variant';
import { WELCOME_PLAY_EVENT, consumeBootSplash } from '@/lib/boot-flag';

type WelcomeLoadFallbackProps = {
  onMounted: () => void;
  onExited: () => void;
};

function WelcomeLoadFallback({ onMounted, onExited }: WelcomeLoadFallbackProps) {
  useLayoutEffect(() => {
    onMounted();
    releaseWelcome({ skipped: true });
    onExited();
  }, [onExited, onMounted]);
  return null;
}

const WelcomeAssembly = dynamic(
  async () => {
    try {
      return (await loadWelcomeAssembly()).WelcomeAssembly;
    } catch {
      return WelcomeLoadFallback;
    }
  },
  { ssr: false },
);
const WelcomeSimple = dynamic(
  async () => {
    try {
      return (await loadWelcomeSimple()).WelcomeSimple;
    } catch {
      return WelcomeLoadFallback;
    }
  },
  { ssr: false },
);

// useLayoutEffect warns during SSR; fall back to useEffect there. On the client
// the layout variant is what we want — it runs before the browser paints, so the
// overlay replaces the pre-hydration bridge without a flash of the page.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Server-redirect sign-ins (SSO / OAuth / email link / signup) cannot arm sessionStorage, so they land on `?welcome=1` instead. */
const WELCOME_PARAM = 'welcome';

/**
 * True when the URL carries `?welcome=1`; strips it in place (`replaceState`,
 * not a router navigation, other params kept) so a refresh never replays it.
 */
function takeWelcomeParam(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get(WELCOME_PARAM) !== '1') return false;
  url.searchParams.delete(WELCOME_PARAM);
  // WelcomeHost decides in a hydration layout effect — before the app router's
  // own effect patches `history.replaceState` to sync `useSearchParams`. Strip
  // after that commit, with null state so the patch carries Next's internals
  // over; otherwise the router keeps `welcome=1` and re-writes it on the
  // page's next param change.
  window.setTimeout(() => {
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, 0);
  return true;
}

function resolveVariantForPlay(): WelcomeVariant {
  const resolution = resolveWelcomeVariant(
    window.location.search,
    window.localStorage.getItem(WELCOME_VARIANT_STORAGE_KEY),
    process.env.NODE_ENV !== 'production',
  );
  if (resolution.persist) window.localStorage.setItem(WELCOME_VARIANT_STORAGE_KEY, resolution.persist);
  return resolution.variant;
}

/**
 * Plays the WelcomeAssembly over whatever desktop page is live. Mounted once by
 * the desktop shell. Plays on mount for a fresh sign-in (the one-shot
 * sessionStorage flag, or `?welcome=1` on any path), and in place on
 * WELCOME_PLAY_EVENT (an in-place staff switch; the fresh flag is consumed)
 * or the dev replay's WELCOME_REPLAY_EVENT. Every play remounts the assembly
 * under a new key, so it reads the signed-in staffer afresh.
 */
export function WelcomeHost() {
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  // Decide "play on arrival" exactly once. Stored in a ref (not recomputed) so
  // React StrictMode's dev mount→unmount→mount doesn't consume the one-shot
  // sign-in flag twice — the second consume would read false and skip the play.
  const arrivalDecisionRef = useRef<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const [variant, setVariant] = useState<WelcomeVariant>(DEFAULT_WELCOME_VARIANT);
  const [overlayMounted, setOverlayMounted] = useState(false);
  const holdOnMountRef = useRef<WelcomeVariant | null>(null);
  const markOverlayMounted = useCallback(() => {
    const pendingVariant = holdOnMountRef.current;
    holdOnMountRef.current = null;
    if (pendingVariant) holdWelcome(pendingVariant);
    setOverlayMounted(true);
  }, []);
  const finishPlay = useCallback(() => setPlaying(false), []);

  useIsoLayoutEffect(() => {
    setPortalEl(document.body);
    if (arrivalDecisionRef.current === null) {
      // Both run: the flag is consumed and the param stripped whichever triggered.
      const armed = consumeBootSplash();
      const param = takeWelcomeParam();
      arrivalDecisionRef.current = armed || param;
    }
    if (arrivalDecisionRef.current) {
      const nextVariant = resolveVariantForPlay();
      setVariant(nextVariant);
      setOverlayMounted(false);
      holdOnMountRef.current = null;
      holdWelcome(nextVariant);
      setPlaying(true);
    }
  }, []);

  // Keep the pre-hydration bridge until the selected dynamic variant has
  // mounted. Saved-session arrivals must never expose a blank frame while the
  // variant chunk is fetched and parsed.
  useEffect(() => {
    if (!portalEl || (playing && !overlayMounted)) return;
    document.getElementById('__boot_splash_pre')?.remove();
  }, [overlayMounted, playing, portalEl]);

  useEffect(() => {
    const play = () => {
      const nextVariant = resolveVariantForPlay();
      setVariant(nextVariant);
      setOverlayMounted(false);
      holdOnMountRef.current = nextVariant;
      setPlayNonce((n) => n + 1);
      setPlaying(true);
    };
    const onPlay = () => {
      consumeBootSplash();
      play();
    };
    // Claim the shell button's cancelable event so it does not fall back to navigating.
    const onReplay = (event: Event) => {
      event.preventDefault();
      play();
    };
    window.addEventListener(WELCOME_PLAY_EVENT, onPlay);
    window.addEventListener(WELCOME_REPLAY_EVENT, onReplay);
    return () => {
      window.removeEventListener(WELCOME_PLAY_EVENT, onPlay);
      window.removeEventListener(WELCOME_REPLAY_EVENT, onReplay);
    };
  }, []);

  if (!portalEl || !playing) return null;
  const welcome =
    variant === 'complex' ? (
      <WelcomeAssembly
        key={playNonce}
        onMounted={markOverlayMounted}
        onExited={finishPlay}
      />
    ) : (
      <WelcomeSimple
        key={playNonce}
        mode={variant === 'elevation' ? 'minimal' : 'full'}
        onMounted={markOverlayMounted}
        onExited={finishPlay}
      />
    );
  return createPortal(welcome, portalEl);
}

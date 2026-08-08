import { useState, useEffect, useCallback } from 'react';

/** Mobile breakpoint – matches Tailwind's `md` (768px). */
const MOBILE_BREAKPOINT = '(max-width: 767px)';

/** True on phones / narrow viewports (< 768px). SSR-safe. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_BREAKPOINT);
}

// ─── Device detection ────────────────────────────────────────────────────────

interface DeviceInfo {
  /** True if the hardware is a phone/tablet (UA Client Hints → UA string fallback). */
  isMobileDevice: boolean;
  /** True if the viewport is currently narrow (< 768px). */
  isNarrowViewport: boolean;
  /** True if the primary input is touch (no hover). */
  isTouchPrimary: boolean;
  /** True if the device has a camera (async — false until checked). */
  hasCamera: boolean;
  /**
   * The resolved mode. Uses the manual override from localStorage when set,
   * otherwise falls back to auto-detection (device + viewport + touch).
   *
   * `'mobile'` → render mobile UX (bottom bars, camera flows, larger targets)
   * `'desktop'` → render desktop UX (sidebars, tables, keyboard-first)
   */
  mode: 'mobile' | 'desktop';
  /** Set a manual override that persists across sessions, or `null` to return to auto. */
  setModeOverride: (override: 'mobile' | 'desktop' | null) => void;
  /** The current manual override value (`null` = auto). */
  modeOverride: 'mobile' | 'desktop' | null;
}

const OVERRIDE_KEY = 'cf-device-mode';

/**
 * Phones only — same intent as `MOBILE_UA_RE` in `src/proxy.ts`.
 * Exclude iPad / Android tablets so they keep the desktop shell (no
 * mobile-shell `safe-area-padding` bottom band). Android phones include
 * "Mobile"; tablets omit it. Bare `iPad` must not force mobile mode.
 */
const MOBILE_UA_RE = /iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i;

/** Detect actual mobile (phone) hardware via Client Hints → UA fallback. */
function detectMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  // Modern: User-Agent Client Hints (Chrome, Edge, Opera — 2026 standard)
  const uaData = (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === 'boolean') return uaData.mobile;
  // Fallback: classic UA string sniff for Safari / Firefox (phones only)
  return MOBILE_UA_RE.test(navigator.userAgent);
}

/** Check whether a camera exists on this device. */
async function detectCamera(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === 'videoinput');
  } catch {
    return false;
  }
}

/**
 * Layered device detection hook.
 *
 * Priority: manual override (localStorage) → device detection → viewport + touch.
 *
 * Use `mode` to branch between mobile/desktop UX.
 * Use `hasCamera` to gate camera-dependent flows (packer photos).
 * Use `setModeOverride('desktop')` to let users force desktop mode on a tablet, etc.
 */
export function useDeviceMode(): DeviceInfo {
  const isNarrowViewport = useMediaQuery(MOBILE_BREAKPOINT);
  const isTouchPrimary = useMediaQuery('(hover: none) and (pointer: coarse)');

  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [hasCamera, setHasCamera] = useState(false);

  // Manual override persisted in localStorage
  const [modeOverride, setModeOverride] = useState<'mobile' | 'desktop' | null>(null);

  // Detect device type + camera on mount (client-only)
  useEffect(() => {
    setIsMobileDevice(detectMobileDevice());
    detectCamera().then(setHasCamera);

    const stored = localStorage.getItem(OVERRIDE_KEY);
    if (stored === 'mobile' || stored === 'desktop') {
      setModeOverride(stored);
    }
  }, []);

  const setOverride = useCallback((next: 'mobile' | 'desktop' | null) => {
    setModeOverride(next);
    if (typeof window !== 'undefined') {
      if (next) localStorage.setItem(OVERRIDE_KEY, next);
      else localStorage.removeItem(OVERRIDE_KEY);
    }
  }, []);

  // Auto mode: mobile if device reports mobile OR viewport is narrow + touch
  const autoMode: 'mobile' | 'desktop' =
    isMobileDevice || (isNarrowViewport && isTouchPrimary) ? 'mobile' : 'desktop';

  const mode = modeOverride ?? autoMode;

  return {
    isMobileDevice,
    isNarrowViewport,
    isTouchPrimary,
    hasCamera,
    mode,
    setModeOverride: setOverride,
    modeOverride,
  };
}

/**
 * Returns true when the media query matches.
 * @example const isMobile = useMediaQuery('(max-width: 768px)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    sync();
    // MediaQueryList.addEventListener landed in Safari 14 / iOS 14. On older
    // engines (iOS ≤13.3, old Edge) it's undefined and calling it throws,
    // aborting the effect and freezing the value at its SSR default. Fall
    // back to the legacy MediaQueryList.addListener API for those clients.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);

  return matches;
}


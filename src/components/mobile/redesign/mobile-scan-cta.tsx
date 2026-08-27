'use client';

/**
 * The mobile SCAN control — one host-owned CTA, pinned top-right on every
 * mobile page that shows {@link MobileTopBar}.
 *
 * Why it is host-owned: starting a scan is THE recurring act on a warehouse
 * phone, and until now it was three taps deep behind the hamburger drawer
 * (`MobileSidebarDrawer` → Scan). A handheld WMS gives that act a fixed, muscle-
 * memory position that never moves between screens. Pages must not mount a
 * second scan CTA — same "ONE control, ONE closer" discipline the right rail's
 * dismiss follows on desktop.
 *
 * Two behaviours, one control:
 *   • anywhere else → route to `/m/scan`;
 *   • already on `/m/scan` → clear the last result and re-arm the input for the
 *     NEXT item, which is what "new scan" means once you are standing at the
 *     scanner.
 *
 * The re-arm travels through {@link MobileScanProvider} rather than a window
 * event: the top bar and the page are parent and `children` in the same React
 * tree ({@link RedesignedMobileShell}), so context is the honest edge and a
 * late-mounting listener cannot miss a signal.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Barcode, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';

/**
 * The scan surface's own route — the CTA's destination and its "here" test.
 * Module-local: nothing outside needs it, and a pass-through export nothing
 * imports is dead weight the knip gate counts.
 */
const MOBILE_SCAN_PATH = '/m/scan';

type NewScanHandler = () => void;

interface MobileScanContextValue {
  /** Registered by the scan page; null when no scan surface is mounted. */
  handlerRef: React.MutableRefObject<NewScanHandler | null>;
}

const MobileScanContext = createContext<MobileScanContextValue | null>(null);

/**
 * Mounted once by the mobile shell so the top bar's CTA can reach whichever
 * scan surface is currently on screen.
 */
export function MobileScanProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<NewScanHandler | null>(null);
  const value = useMemo<MobileScanContextValue>(() => ({ handlerRef }), []);
  return <MobileScanContext.Provider value={value}>{children}</MobileScanContext.Provider>;
}

/**
 * Register the "start a new scan" reset for the mounted scan surface. Held in a
 * ref, not state, so re-registering on every render costs nothing and never
 * re-renders the top bar.
 */
export function useRegisterNewScan(handler: NewScanHandler): void {
  const ctx = useContext(MobileScanContext);
  const handlerRef = ctx?.handlerRef;

  useEffect(() => {
    if (!handlerRef) return;
    handlerRef.current = handler;
    return () => {
      // Only clear our own registration — a fast route swap can mount the next
      // surface before this cleanup runs.
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, [handlerRef, handler]);
}

/**
 * The CTA itself. Renders last in {@link MobileTopBar}'s right cluster, so it
 * owns the top-right corner the thumb reaches for.
 *
 * It is the corner, not the colour. The face is `secondary` — card ground, hairline
 * ring, house ink — because the bar it sits in is already dense with meaning
 * (menu + unread dot, goal chip, page controls) and a saturated block there
 * competes with the record underneath rather than helping anyone find it.
 * Position and repetition do the work; volume was redundant.
 */
export function MobileScanCta() {
  const router = useRouter();
  const pathname = usePathname();
  const ctx = useContext(MobileScanContext);
  const onScanSurface = pathname === MOBILE_SCAN_PATH;

  const onClick = useCallback(() => {
    if (!onScanSurface) {
      router.push(MOBILE_SCAN_PATH);
      return;
    }
    // On the scan surface the CTA re-arms in place. If no surface registered
    // (an unexpected mount order), fall back to a route refresh rather than
    // leaving the tap dead.
    const reset = ctx?.handlerRef.current;
    if (reset) reset();
    else router.refresh();
  }, [onScanSurface, router, ctx]);

  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={onClick}
      icon={onScanSurface ? <Plus className="h-4 w-4" /> : <Barcode className="h-4 w-4" />}
      aria-label={onScanSurface ? 'Start a new scan' : 'Go to scan'}
      // ds-allow-control-size — 44px exactly, the touch floor, because this one
      // is aimed at with a gloved thumb while walking.
      //
      // QUIET on purpose (2026-08-21). It shipped as a saturated `primary` slab
      // with a coloured shadow and 0.16em bold caps, which made a squared,
      // monochrome header bar carry one loud blue block. The affordance was
      // never the fill — it is the FIXED CORNER, the label, and the 44px box.
      // Volume was doing nothing the position wasn't already doing, and it
      // fought the spine treatment it sits above ("No hue, anywhere").
      className="h-11 shrink-0 px-3 text-role-body font-semibold tracking-tight"
    >
      {/* The label states which of the two behaviours the tap will take, so the
          dual role is legible instead of hidden behind an identical face. */}
      {onScanSurface ? 'New' : 'Scan'}
    </Button>
  );
}

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
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Barcode, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { MobilePreviewSheet } from './MobilePreviewSheet';

/** How long the thumb holds before the CTA means PREVIEW instead of SCAN.
 *  450ms: past a tap's accidental stretch, short enough to feel like a
 *  gesture rather than a wait. Same idiom as the Stack's long-press jump. */
const LONG_PRESS_MS = 450;
/** Pointer travel that cancels the hold — a thumb settling on the glass is
 *  not a decision to preview. */
const LONG_PRESS_SLOP_PX = 10;

/**
 * The CTA's destination and its "here" test — the WORKSTATION since the
 * 2026-09-06 pivot: scanning happens at the station whose whole bottom is a
 * capture surface. `/m/scan` is a redirect kept for old links, so a pathname
 * can still read as the old surface mid-navigation.
 */
const MOBILE_SCAN_PATH = '/m/triage';
const LEGACY_SCAN_PATH = '/m/scan';

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdOriginRef = useRef<{ x: number; y: number } | null>(null);
  // Set when the long-press fires, so the click that follows the pointerup is
  // swallowed: one gesture, one meaning.
  const previewFiredRef = useRef(false);
  const onScanSurface = pathname === MOBILE_SCAN_PATH || pathname === LEGACY_SCAN_PATH;

  const clearHold = useCallback(() => {
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdOriginRef.current = null;
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    holdOriginRef.current = { x: e.clientX, y: e.clientY };
    holdTimerRef.current = window.setTimeout(() => {
      previewFiredRef.current = true;
      setPreviewOpen(true);
    }, LONG_PRESS_MS);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const origin = holdOriginRef.current;
    if (!origin) return;
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > LONG_PRESS_SLOP_PX) clearHold();
  }, [clearHold]);

  const onClick = useCallback(() => {
    clearHold();
    if (previewFiredRef.current) {
      previewFiredRef.current = false;
      return;
    }
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
  }, [onScanSurface, router, ctx, clearHold]);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        // A held touch can raise the browser's own context menu over the
        // sheet; the preview IS the long-press's meaning here.
        onContextMenu={(e) => {
          if (previewFiredRef.current || previewOpen) e.preventDefault();
        }}
        icon={onScanSurface ? <Plus className="h-3.5 w-3.5" /> : <Barcode className="h-3.5 w-3.5" />}
        aria-label={onScanSurface ? 'Start a new scan' : 'Go to scan'}
        radius="surface"
        // ds-allow-control-size — 32px PAINTED with a 44px hit region carried by
        // the pseudo-element (32 + 6 + 6), which is `MOBILE_CONTROL_LADDER`'s
        // paint-small-hit-big rule. It used to paint the full 44 and set the bar's
        // height with it; the thumb target is unchanged, the chrome is 12px
        // shorter, and the label dropped from 14px to 12px with it.
        //
        // QUIET on purpose (2026-08-21). It shipped as a saturated `primary` slab
        // with a coloured shadow and 0.16em bold caps, which made a squared,
        // monochrome header bar carry one loud blue block. The affordance was
        // never the fill — it is the FIXED CORNER, the label, and the target.
        // Volume was doing nothing the position wasn't already doing, and it
        // fought the spine treatment it sits above ("No hue, anywhere").
        className="relative h-8 shrink-0 px-2.5 text-role-caption font-semibold tracking-tight before:absolute before:-inset-1.5 before:content-['']"
      >
        {/* The label states which of the two behaviours the tap will take, so the
            dual role is legible instead of hidden behind an identical face. */}
        {onScanSurface ? 'New' : 'Scan'}
      </Button>
      <MobilePreviewSheet
        open={previewOpen}
        onClose={() => {
          // The gesture is over when the sheet is gone; a tap after this is a
          // fresh decision, not the tail of the hold that opened it.
          previewFiredRef.current = false;
          setPreviewOpen(false);
        }}
      />
    </>
  );
}

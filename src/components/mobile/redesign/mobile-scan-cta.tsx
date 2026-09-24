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
 *
 * ## The second, quiet door: press-and-hold → Find
 *
 * `/m/search` (titled **Find**) has shipped for months with no way in from the
 * phone UI, and that is deliberate: `src/lib/mobile/nav-registry.ts` records the
 * operator ruling of 2026-09-14 — *"the mobile app's live surface is the unbox
 * photo feed, picks, location scanning, and the identification kernel. Find was
 * deleted with that pass."* So Find gets **no drawer row, no tab, no nav name**;
 * re-adding one would overturn a ruling, and a nav row named Find under a lane
 * would also collide with the parent/child name law.
 *
 * What it gets instead is a SECONDARY gesture on the control that is already on
 * every screen. A long press is the platform idiom for "the other thing this
 * control can do" precisely because it costs zero pixels and cannot be hit by
 * accident — the tap is still the tap, byte for byte. Scan still has exactly ONE
 * door; Find has a back one.
 *
 * A long press is not operable by every input, so the gesture is one of three
 * routes to the same `router.push`: hold the control, `Alt+Enter` while it has
 * focus (announced through `aria-keyshortcuts`), or the platform context-menu
 * request — which is the ContextMenu key / `Shift+F10` on a keyboard, not just a
 * right-click. The accessible name states both acts, so a screen-reader user is
 * told the second one exists rather than having to discover it by holding.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus, ScanBarcode } from '@/components/Icons';
import { Button } from '@/design-system/primitives';

/**
 * The scan surface's own route — the CTA's destination and its "here" test.
 * Module-local: nothing outside needs it, and a pass-through export nothing
 * imports is dead weight the knip gate counts.
 */
const MOBILE_SCAN_PATH = '/m/scan';

/**
 * Find — `/m/search`, reached ONLY by the secondary gesture on this control.
 * Module-local for the same reason as {@link MOBILE_SCAN_PATH}, and doubly so
 * here: an exported constant is the first step towards someone mounting a nav
 * row against the ruling quoted above.
 */
const MOBILE_FIND_PATH = '/m/search';

/**
 * How long the control must be held before it means Find.
 *
 * 480ms is the repo's existing hold threshold — `PhotoPeekFan`'s `holdMs = 480`,
 * the dwell that turns a photo peek into an expanded fan. Reusing it keeps one
 * "how long is a hold" in the product instead of a per-surface guess. It also
 * lands just under the ~500ms at which mobile browsers raise their own callout,
 * so our gesture resolves first.
 */
const FIND_HOLD_MS = 480;

/**
 * Movement that ends the hold. A phone bar sits at the top of a scroll
 * container, so a finger that lands on this button and drags is a SCROLL, not a
 * press — without this the operator flicks the list and arrives on Find. The
 * pointer-cancel the browser fires when it claims the gesture for scrolling is
 * the other half; both are wired, because a short scroll inside a non-scrolling
 * region never produces one.
 */
const FIND_HOLD_SLOP_PX = 8;

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

  /**
   * The armed hold: its pending timer handle, and the origin the slop is
   * measured from. `window.setTimeout` (not the bare global) so the handle is a
   * plain `number` — this is a `'use client'` file and the Node overload's
   * `Timeout` object has no business in it.
   */
  const holdRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  /**
   * Set when the hold has already navigated. A touch long-press still emits the
   * `click` for the release that follows, and without this flag that click would
   * run the scan behaviour on top of the Find route — the tap "regressing" into
   * a double action. Cleared at the START of every gesture so a stale flag can
   * never eat a later, genuine tap.
   */
  const holdFiredRef = useRef(false);

  const cancelHold = useCallback(() => {
    const hold = holdRef.current;
    if (!hold) return;
    holdRef.current = null;
    window.clearTimeout(hold.timer);
  }, []);

  const openFind = useCallback(() => {
    cancelHold();
    router.push(MOBILE_FIND_PATH);
  }, [cancelHold, router]);

  /**
   * A scroll anywhere disarms the hold, and unmount clears the timer.
   *
   * Listening always (rather than arming/disarming with the gesture) is cheaper
   * than it looks — `cancelHold` returns on the first line when nothing is armed
   * — and it is the version that cannot leak a listener on a route swap.
   */
  useEffect(() => {
    window.addEventListener('scroll', cancelHold, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', cancelHold, { capture: true });
      cancelHold();
    };
  }, [cancelHold]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      // Secondary buttons are the context-menu path's business, not the hold's.
      if (event.button !== 0) return;
      holdFiredRef.current = false;
      cancelHold();
      const timer = window.setTimeout(() => {
        holdRef.current = null;
        holdFiredRef.current = true;
        router.push(MOBILE_FIND_PATH);
      }, FIND_HOLD_MS);
      holdRef.current = { timer, x: event.clientX, y: event.clientY };
    },
    [cancelHold, router],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const hold = holdRef.current;
      if (!hold) return;
      if (
        Math.abs(event.clientX - hold.x) > FIND_HOLD_SLOP_PX ||
        Math.abs(event.clientY - hold.y) > FIND_HOLD_SLOP_PX
      ) {
        cancelHold();
      }
    },
    [cancelHold],
  );

  /**
   * The platform's "secondary action" request. Reached without a pointer by the
   * ContextMenu key and by `Shift+F10`, which is why it is a real accessibility
   * path and not just right-click sugar. Also swallows the native callout a
   * touch hold would otherwise raise a few milliseconds after ours fired.
   */
  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      openFind();
    },
    [openFind],
  );

  /**
   * The keyboard equivalent of the hold. `preventDefault` matters: without it the
   * browser synthesises the plain activation click from this same Enter and the
   * control would take both actions at once.
   */
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!event.altKey || event.key !== 'Enter') return;
      event.preventDefault();
      openFind();
    },
    [openFind],
  );

  const onClick = useCallback(() => {
    cancelHold();
    if (holdFiredRef.current) {
      holdFiredRef.current = false;
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
  }, [cancelHold, onScanSurface, router, ctx]);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      // `ScanBarcode`, not `Barcode` (operator 2026-09-15). A bare barcode is
      // the SYMBOL — it says "this thing is a code". The framed version with
      // the reticle corners is the VERB: point a reader at something. This
      // button starts a scan, so it wears the verb.
      icon={onScanSurface ? <Plus className="h-3.5 w-3.5" /> : <ScanBarcode className="h-3.5 w-3.5" />}
      // The name carries BOTH acts. A secondary gesture that is never announced
      // is a secret, and a screen-reader user cannot discover it by holding.
      aria-label={
        onScanSurface
          ? 'Start a new scan. Press and hold, or Alt+Enter, to open Find.'
          : 'Go to scan. Press and hold, or Alt+Enter, to open Find.'
      }
      aria-keyshortcuts="Alt+Enter"
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
      //
      // `station-no-callout` kills the iOS text/image callout the hold would
      // otherwise raise over our own gesture.
      className="station-no-callout relative h-8 shrink-0 px-2.5 text-role-caption font-semibold tracking-tight before:absolute before:-inset-1.5 before:content-['']"
    >
      {/* The label states which of the two behaviours the tap will take, so the
          dual role is legible instead of hidden behind an identical face. */}
      {onScanSurface ? 'New' : 'Scan'}
    </Button>
  );
}

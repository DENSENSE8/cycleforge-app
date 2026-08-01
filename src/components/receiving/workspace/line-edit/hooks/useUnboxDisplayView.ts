'use client';

/**
 * URL ⇄ state for the Unbox Displays push column (`ReceivingDisplaysPushStack`).
 *
 * `?display=<tab>` opens the station-scoped right-edge column on that display;
 * **the param's absence IS closed** — there is no separate open flag, matching
 * `resolveUnboxSideTab`'s `null`-is-closed contract.
 *
 * WHY THIS EXISTS: the column shipped (lane E) holding its tab in local
 * `useState` while its two siblings — Ticket (`?ticketView=1`) and Claim
 * (`?claimView=1`) — were URL-durable from birth. So a reload, a deep link, or
 * a shared "look at this carton's Zoho note" URL all landed with the column
 * closed, which `display/workbench.md` § URL-as-state says a durable selection
 * must not do.
 *
 * Scoped so a stale display can't bleed across selections:
 * - sibling-line switch clears the param;
 * - mode switch strips it via route owns (`UNBOX_ROUTE_PARAMS`);
 * - mutually exclusive with Ticket, Claim and `detail:receiving` — opening the
 *   column drops both peers and suspends details.
 *
 * **Not `?unboxview=`** — that param is the queue / viewed / recent BROWSE tab
 * on the same route. Colliding on it would make the rail and the column
 * disagree about what "the tab" means, the same way `?sort=` collides with
 * server ordering on station routes.
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { dispatchReceivingDetailsOverlayClose } from '@/utils/events';
import { clearPeerRightEdgeParams } from '../unbox-right-edge';
import { UNBOX_SIDE_TAB_ORDER, type UnboxSideTab } from '../unbox-side-tabs';

const DISPLAY_PARAM = 'display';

/**
 * Parse `?display=` into a side tab. Anything that is not a known tab id is
 * closed — a bogus value must never paint an empty column, and the
 * param-isolation hygiene hook drops it on arrival.
 */
export function parseUnboxDisplayParam(raw: string | null): UnboxSideTab | null {
  if (!raw) return null;
  return UNBOX_SIDE_TAB_ORDER.find((tab) => tab === raw) ?? null;
}

/**
 * Pure decision for the clear-on-line-change effect. Clear only on a genuine
 * sibling-line switch — both ids known and different. A `null` previous id
 * (mount / deep-link resolve) must NOT self-clear, or the deep link the param
 * exists to serve would close itself on arrival.
 */
export function shouldClearDisplayOnLineChange(
  prevLineId: number | null,
  currentLineId: number | null,
  displayOpen: boolean,
): boolean {
  return (
    displayOpen &&
    prevLineId != null &&
    currentLineId != null &&
    prevLineId !== currentLineId
  );
}

interface UnboxDisplayViewState {
  /** Requested display from `?display=`, or `null` when the column is closed. */
  requestedDisplay: UnboxSideTab | null;
  /** Open a display (clears Ticket / Claim, suspends details) or close with `null`. */
  setDisplay: (tab: UnboxSideTab | null) => void;
}

export function useUnboxDisplayView(currentLineId: number | null): UnboxDisplayViewState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedDisplay = parseUnboxDisplayParam(searchParams.get(DISPLAY_PARAM));

  const setDisplay = useCallback(
    (tab: UnboxSideTab | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (tab) {
        next.set(DISPLAY_PARAM, tab);
        // One right-edge secondary surface: drop Ticket + Claim in this SAME
        // write (a sibling effect would race and lose) + suspend details.
        clearPeerRightEdgeParams(next, 'display');
        dispatchReceivingDetailsOverlayClose();
      } else {
        next.delete(DISPLAY_PARAM);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
    },
    [router, pathname, searchParams],
  );

  // Deep-link / reload with a display already open — suspend details once.
  useEffect(() => {
    if (requestedDisplay) dispatchReceivingDetailsOverlayClose();
  }, [requestedDisplay]);

  const prevLineIdRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevLineIdRef.current;
    prevLineIdRef.current = currentLineId;
    if (shouldClearDisplayOnLineChange(prev, currentLineId, requestedDisplay != null)) {
      setDisplay(null);
    }
  }, [currentLineId, requestedDisplay, setDisplay]);

  // More details opened → clear the display so detail:receiving owns the slot.
  useEffect(() => {
    const handler = () => {
      if (!requestedDisplay) return;
      const next = new URLSearchParams(searchParams.toString());
      if (!next.has(DISPLAY_PARAM)) return;
      next.delete(DISPLAY_PARAM);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
    };
    window.addEventListener('receiving-open-details-overlay', handler);
    return () => window.removeEventListener('receiving-open-details-overlay', handler);
  }, [requestedDisplay, router, pathname, searchParams]);

  return { requestedDisplay, setDisplay };
}

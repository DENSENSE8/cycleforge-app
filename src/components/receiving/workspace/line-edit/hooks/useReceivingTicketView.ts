'use client';

/**
 * URL ⇄ state for the Unbox Ticket push column (`ReceivingTicketStack`).
 *
 * `?ticketView=1` opens the station-scoped right-edge push work surface.
 * Deep-link: `?openReceivingId=<id>&ticketView=1`.
 *
 * Scoped so a stale editor can't bleed across selections:
 * - sibling-line switch clears the param;
 * - mode switch strips it via `MODE_SCOPED_PARAMS`;
 * - ticketless carton auto-clears in the panel guardrail;
 * - mutually exclusive with Claim (`?claimView=1`) and `detail:receiving`.
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  dispatchAssistantDockClose,
  dispatchReceivingDetailsOverlayClose,
} from '@/utils/events';
import { clearPeerRightEdgeParams } from '../unbox-right-edge';

const TICKET_VIEW_PARAM = 'ticketView';

/**
 * Pure decision for the clear-on-line-change effect. Clear the open ticket
 * editor only on a genuine sibling-line switch — both ids known and different.
 * A `null` previous id (mount, or the `?openReceivingId=` deep-link resolve)
 * must NOT self-clear, or the deep-linked editor would close on first paint.
 */
export function shouldClearTicketViewOnLineChange(
  prevLineId: number | null,
  currentLineId: number | null,
  ticketViewOpen: boolean,
): boolean {
  return (
    ticketViewOpen &&
    prevLineId != null &&
    currentLineId != null &&
    prevLineId !== currentLineId
  );
}

export interface ReceivingTicketViewState {
  /** True when `?ticketView=1` is present. */
  ticketView: boolean;
  /** Set/clear `?ticketView=1`, preserving all other params on the current route. */
  setTicketView: (on: boolean) => void;
}

export function useReceivingTicketView(currentLineId: number | null): ReceivingTicketViewState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ticketView = searchParams.get(TICKET_VIEW_PARAM) === '1';

  const setTicketView = useCallback(
    (on: boolean) => {
      const next = new URLSearchParams(searchParams.toString());
      if (on) {
        next.set(TICKET_VIEW_PARAM, '1');
        // One right-edge secondary surface: drop Claim + Displays in this SAME
        // write (a sibling effect would race and lose) + suspend details.
        clearPeerRightEdgeParams(next, 'ticket');
        dispatchReceivingDetailsOverlayClose();
        // Product law: AI and Ticket cannot both occupy a full right column.
        dispatchAssistantDockClose();
      } else {
        next.delete(TICKET_VIEW_PARAM);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
    },
    [router, pathname, searchParams],
  );

  // Deep-link / reload with `?ticketView=1` already set — suspend details + AI.
  // setTicketView(true) already dispatches both; this covers cold deep-links
  // while assistant:dock-open is still '1' in localStorage.
  useEffect(() => {
    if (!ticketView) return;
    dispatchReceivingDetailsOverlayClose();
    dispatchAssistantDockClose();
  }, [ticketView]);

  // Clear on a genuine sibling-line switch. Compare against the previous line id
  // so the first open (prev null — mount OR the `?openReceivingId=` deep-link
  // resolve) never self-clears the freshly deep-linked editor.
  const prevLineIdRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevLineIdRef.current;
    prevLineIdRef.current = currentLineId;
    if (shouldClearTicketViewOnLineChange(prev, currentLineId, ticketView)) {
      setTicketView(false);
    }
  }, [currentLineId, ticketView, setTicketView]);

  // More details opened → clear Ticket URL so detail:receiving owns the host.
  // Prefer replace (Info still works while Ticket was open).
  useEffect(() => {
    const handler = () => {
      if (!ticketView) return;
      const next = new URLSearchParams(searchParams.toString());
      if (!next.has(TICKET_VIEW_PARAM)) return;
      next.delete(TICKET_VIEW_PARAM);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
    };
    window.addEventListener('receiving-open-details-overlay', handler);
    return () => window.removeEventListener('receiving-open-details-overlay', handler);
  }, [ticketView, router, pathname, searchParams]);

  return { ticketView, setTicketView };
}

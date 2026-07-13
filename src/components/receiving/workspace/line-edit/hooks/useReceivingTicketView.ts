'use client';

/**
 * URL ⇄ state for the unbox line-edit pane's inline support-ticket editor.
 *
 * `?ticketView=1` swaps the right-pane body for the reused `SupportTicketDetail`
 * (see docs/todo/receiving-inline-ticket-editor-plan.md). It is URL-addressable
 * so the editor survives a reload and is shareable — the reload deep-link is
 * `?openReceivingId=<id>&ticketView=1` (the line resolves, then the editor opens).
 *
 * The param is line/mode-scoped so a stale editor can't bleed across selections:
 * - on a genuine sibling-line switch (`currentLineId` changes to a different
 *   non-null line) the param is cleared here;
 * - on a mode switch it is stripped by `useReceivingMode` (`MODE_SCOPED_PARAMS`);
 * - carton switches that land on a ticketless carton are auto-cleared by the
 *   panel guardrail (no `providerTicketId` ⇒ `setTicketView(false)`).
 *
 * The clear-on-line-change compares against the *previous* line id, so the
 * initial open (prev `null`, incl. the deep-link resolve) never self-clears.
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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
      if (on) next.set(TICKET_VIEW_PARAM, '1');
      else next.delete(TICKET_VIEW_PARAM);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
    },
    [router, pathname, searchParams],
  );

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

  return { ticketView, setTicketView };
}

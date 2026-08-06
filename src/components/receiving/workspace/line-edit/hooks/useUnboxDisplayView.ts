'use client';

/**
 * URL ⇄ state for the Unbox Displays push column (`ReceivingDisplaysPushStack`).
 *
 * `?display=<tab>` opens the column; **absence IS closed**. Nested modes:
 *   - Photos: `?photoAction=browse|move|send`
 *   - Linkage: `?linkageAction=link|note`
 *   - Ticket: `?ticketAction=chat|claim` + `?claimMode=create|link` for claim
 *   - Units: `?unitsAction=units|prebox`
 *
 * Compat (one release): `?ticketView=1` → `display=ticket`; `?claimView=1` /
 * `?display=claim` → `display=ticket&ticketAction=claim`. Retired ids
 * `pairing` / `po-note` map to `linkage`.
 *
 * Mutually exclusive with `detail:receiving` and AI.
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  dispatchAssistantDockClose,
  dispatchReceivingDetailsOverlayClose,
} from '@/utils/events';
import { clearAllUnboxRightEdgeParams } from '../unbox-right-edge';
import {
  canonicalizeUnboxSideTab,
  parseUnboxLinkageAction,
  parseUnboxPhotoAction,
  parseUnboxUnitsAction,
  resolveUnboxTicketAction,
  type UnboxLinkageAction,
  type UnboxPhotoAction,
  type UnboxSideTab,
  type UnboxSideTabGates,
  type UnboxTicketAction,
  type UnboxUnitsAction,
} from '../unbox-side-tabs';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';

const DISPLAY_PARAM = 'display';
const PHOTO_ACTION_PARAM = 'photoAction';
const LINKAGE_ACTION_PARAM = 'linkageAction';
const TICKET_ACTION_PARAM = 'ticketAction';
const UNITS_ACTION_PARAM = 'unitsAction';
const CLAIM_MODE_PARAM = 'claimMode';
const LEGACY_TICKET_VIEW = 'ticketView';
const LEGACY_CLAIM_VIEW = 'claimView';

/**
 * Parse `?display=` into a side tab. Legacy aliases canonicalize; bogus → closed.
 */
export function parseUnboxDisplayParam(raw: string | null): UnboxSideTab | null {
  if (!raw) return null;
  return canonicalizeUnboxSideTab(raw);
}

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

type SetUnboxDisplayOpts = {
  photoAction?: UnboxPhotoAction;
  linkageAction?: UnboxLinkageAction;
  ticketAction?: UnboxTicketAction;
  unitsAction?: UnboxUnitsAction;
  claimMode?: ClaimModalMode;
};

interface UnboxDisplayViewState {
  requestedDisplay: UnboxSideTab | null;
  photoAction: UnboxPhotoAction;
  linkageActionRaw: string | null;
  ticketActionRaw: string | null;
  unitsActionRaw: string | null;
  claimMode: ClaimModalMode;
  setDisplay: (tab: UnboxSideTab | null, opts?: SetUnboxDisplayOpts) => void;
  /** Resolve linkage nested action against current gates. */
  resolveLinkageAction: (gates: Pick<UnboxSideTabGates, 'hasPoNoteTab'>) => UnboxLinkageAction;
  /** Resolve ticket nested action given whether a linked ticket id exists. */
  resolveTicketAction: (hasTicketId: boolean) => UnboxTicketAction;
  /** Resolve units nested action (Prebox gated on serials). */
  resolveUnitsAction: (gates: { hasPrebox: boolean }) => UnboxUnitsAction;
}

export function useUnboxDisplayView(currentLineId: number | null): UnboxDisplayViewState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawDisplay = searchParams.get(DISPLAY_PARAM);
  const requestedDisplay = parseUnboxDisplayParam(rawDisplay);
  const photoAction = parseUnboxPhotoAction(searchParams.get(PHOTO_ACTION_PARAM));
  const linkageActionRaw = searchParams.get(LINKAGE_ACTION_PARAM);
  const ticketActionRaw = searchParams.get(TICKET_ACTION_PARAM);
  const unitsActionRaw = searchParams.get(UNITS_ACTION_PARAM);
  const claimModeRaw = searchParams.get(CLAIM_MODE_PARAM);
  const claimMode: ClaimModalMode = claimModeRaw === 'link' ? 'link' : 'create';

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
    },
    [router, pathname],
  );

  const setDisplay = useCallback(
    (tab: UnboxSideTab | null, opts?: SetUnboxDisplayOpts) => {
      const next = new URLSearchParams(searchParams.toString());
      // Drop nested + legacy peer flags whenever the display changes.
      next.delete(PHOTO_ACTION_PARAM);
      next.delete(LINKAGE_ACTION_PARAM);
      next.delete(TICKET_ACTION_PARAM);
      next.delete(UNITS_ACTION_PARAM);
      next.delete(CLAIM_MODE_PARAM);
      next.delete(LEGACY_TICKET_VIEW);
      next.delete(LEGACY_CLAIM_VIEW);

      if (tab) {
        next.set(DISPLAY_PARAM, tab);
        if (tab === 'photos' && opts?.photoAction && opts.photoAction !== 'browse') {
          next.set(PHOTO_ACTION_PARAM, opts.photoAction);
        }
        if (tab === 'linkage' && opts?.linkageAction === 'note') {
          next.set(LINKAGE_ACTION_PARAM, 'note');
        }
        if (tab === 'units' && opts?.unitsAction === 'prebox') {
          next.set(UNITS_ACTION_PARAM, 'prebox');
        }
        if (tab === 'ticket') {
          if (opts?.ticketAction === 'claim') {
            next.set(TICKET_ACTION_PARAM, 'claim');
            if (opts.claimMode === 'link') next.set(CLAIM_MODE_PARAM, 'link');
          } else if (opts?.ticketAction === 'chat') {
            next.set(TICKET_ACTION_PARAM, 'chat');
          }
        }
        // Legacy po-note deep-link intent when opening linkage for note.
        if (rawDisplay === 'po-note' && tab === 'linkage' && !opts?.linkageAction) {
          next.set(LINKAGE_ACTION_PARAM, 'note');
        }
        dispatchReceivingDetailsOverlayClose();
        dispatchAssistantDockClose();
      } else {
        next.delete(DISPLAY_PARAM);
      }
      replaceParams(next);
    },
    [searchParams, replaceParams, rawDisplay],
  );

  // Compat: rewrite legacy ticketView / claimView / pairing / po-note / claim once.
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    let dirty = false;

    const legacyTicket = next.get(LEGACY_TICKET_VIEW) === '1';
    const legacyClaim = next.get(LEGACY_CLAIM_VIEW) === '1';
    const displayRaw = next.get(DISPLAY_PARAM);

    if (legacyTicket && !next.get(DISPLAY_PARAM)) {
      next.set(DISPLAY_PARAM, 'ticket');
      dirty = true;
    }
    if (legacyClaim && !next.get(DISPLAY_PARAM)) {
      next.set(DISPLAY_PARAM, 'ticket');
      next.set(TICKET_ACTION_PARAM, 'claim');
      dirty = true;
    }
    if (legacyTicket) {
      next.delete(LEGACY_TICKET_VIEW);
      dirty = true;
    }
    if (legacyClaim) {
      next.delete(LEGACY_CLAIM_VIEW);
      dirty = true;
    }

    if (displayRaw === 'pairing') {
      next.set(DISPLAY_PARAM, 'linkage');
      dirty = true;
    } else if (displayRaw === 'po-note') {
      next.set(DISPLAY_PARAM, 'linkage');
      next.set(LINKAGE_ACTION_PARAM, 'note');
      dirty = true;
    } else if (displayRaw === 'claim') {
      next.set(DISPLAY_PARAM, 'ticket');
      next.set(TICKET_ACTION_PARAM, 'claim');
      dirty = true;
    }

    if (dirty) replaceParams(next);
  }, [searchParams, replaceParams]);

  // Deep-link / reload with a display already open — suspend details + AI.
  useEffect(() => {
    if (!requestedDisplay) return;
    dispatchReceivingDetailsOverlayClose();
    dispatchAssistantDockClose();
  }, [requestedDisplay]);

  const prevLineIdRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevLineIdRef.current;
    prevLineIdRef.current = currentLineId;
    if (shouldClearDisplayOnLineChange(prev, currentLineId, requestedDisplay != null)) {
      setDisplay(null);
    }
  }, [currentLineId, requestedDisplay, setDisplay]);

  // More details opened → clear Displays so detail:receiving owns the slot.
  useEffect(() => {
    const handler = () => {
      if (!requestedDisplay && !searchParams.has(DISPLAY_PARAM)) return;
      const seed =
        typeof window !== 'undefined' ? window.location.search : searchParams.toString();
      const next = new URLSearchParams(seed);
      clearAllUnboxRightEdgeParams(next);
      replaceParams(next);
    };
    window.addEventListener('receiving-open-details-overlay', handler);
    return () => window.removeEventListener('receiving-open-details-overlay', handler);
  }, [requestedDisplay, searchParams, replaceParams]);

  const resolveLinkageAction = useCallback(
    (gates: Pick<UnboxSideTabGates, 'hasPoNoteTab'>) =>
      parseUnboxLinkageAction(linkageActionRaw, gates),
    [linkageActionRaw],
  );

  const resolveTicketAction = useCallback(
    (hasTicketId: boolean) => resolveUnboxTicketAction(hasTicketId),
    [],
  );

  const resolveUnitsAction = useCallback(
    (gates: { hasPrebox: boolean }) => parseUnboxUnitsAction(unitsActionRaw, gates),
    [unitsActionRaw],
  );

  return {
    requestedDisplay,
    photoAction,
    linkageActionRaw,
    ticketActionRaw,
    unitsActionRaw,
    claimMode,
    setDisplay,
    resolveLinkageAction,
    resolveTicketAction,
    resolveUnitsAction,
  };
}

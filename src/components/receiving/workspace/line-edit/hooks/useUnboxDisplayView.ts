'use client';

/**
 * URL ⇄ state for the Unbox Displays push column (`ReceivingDisplaysPushStack`).
 *
 * Navigation (Root-to-Leaf):
 *   - absence of `?display=` → column CLOSED
 *   - `?display=index` → Root Index
 *   - `?display=<leaf>` → leaf body (Ticket · Photos · …)
 *
 * Nested modes on leaves:
 *   - Photos: `?photoAction=move|send` (absent / legacy `browse` = Actions list)
 *   - Linkage: `?linkageAction=link|note`
 *   - Ticket: `?ticketAction=chat|claim` + `?claimMode=create|link` for claim
 *   - Units: `?unitsAction=units|prebox`
 *   - Inventory: one stacked leaf (stale `?inventoryAction=` is cleared only)
 *
 * Compat (one release): `?ticketView=1` → `display=ticket`; `?claimView=1` /
 * `?display=claim` → `display=ticket&ticketAction=claim`. Retired ids
 * `pairing` / `po-note` map to `linkage`.
 *
 * Mutually exclusive with `detail:receiving` and AI.
 *
 * Paint: `setDisplay` writes a pending snapshot immediately so Open displays
 * mounts in the same click commit; URL remains the durable SoT via
 * `router.replace`. Pending clears when `useSearchParams` catches up.
 */

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  readLiveSearchParams,
  resolveOptimisticParam,
  shouldClearOptimisticParam,
} from '@/lib/routing/optimistic-url-param';
import {
  dispatchAssistantDockClose,
  dispatchIncomingAddInboundClose,
  dispatchReceivingDetailsOverlayClose,
} from '@/utils/events';
import { clearAllUnboxRightEdgeParams } from '../unbox-right-edge';
import {
  parseUnboxDisplayNav,
  parseUnboxLinkageAction,
  parseUnboxPhotoAction,
  parseUnboxUnitsAction,
  resolveUnboxTicketAction,
  type UnboxDisplayNav,
  type UnboxLinkageAction,
  type UnboxPhotoAction,
  type UnboxSideTabGates,
  type UnboxTicketAction,
  type UnboxUnitsAction,
} from '../unbox-side-tabs';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';

const DISPLAY_PARAM = 'display';
const PHOTO_ACTION_PARAM = 'photoAction';
const LINKAGE_ACTION_PARAM = 'linkageAction';
const INVENTORY_ACTION_PARAM = 'inventoryAction';
const TICKET_ACTION_PARAM = 'ticketAction';
const UNITS_ACTION_PARAM = 'unitsAction';
const CLAIM_MODE_PARAM = 'claimMode';
const LEGACY_TICKET_VIEW = 'ticketView';
const LEGACY_CLAIM_VIEW = 'claimView';

/**
 * Parse `?display=` into nav. `index` opens Root Index; leaf ids canonicalize;
 * bogus → closed.
 */
export function parseUnboxDisplayParam(raw: string | null): UnboxDisplayNav | null {
  return parseUnboxDisplayNav(raw);
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

/** Domain snapshot — nested leaf intents ride with the display write. */
type UnboxDisplayPending = {
  display: UnboxDisplayNav | null;
  photoAction: UnboxPhotoAction;
  linkageActionRaw: string | null;
  ticketActionRaw: string | null;
  unitsActionRaw: string | null;
  claimMode: ClaimModalMode;
};

/** Mirror of the URL fields `setDisplay` is about to write. */
export function buildDisplayPending(
  tab: UnboxDisplayNav | null,
  opts: SetUnboxDisplayOpts | undefined,
  rawDisplay: string | null,
): UnboxDisplayPending {
  if (!tab) {
    return {
      display: null,
      photoAction: parseUnboxPhotoAction(null),
      linkageActionRaw: null,
      ticketActionRaw: null,
      unitsActionRaw: null,
      claimMode: 'create',
    };
  }

  let linkageActionRaw: string | null = null;
  if (tab === 'linkage' && opts?.linkageAction === 'note') {
    linkageActionRaw = 'note';
  }
  // Legacy po-note deep-link intent when opening linkage for note.
  if (rawDisplay === 'po-note' && tab === 'linkage' && !opts?.linkageAction) {
    linkageActionRaw = 'note';
  }

  let ticketActionRaw: string | null = null;
  let claimMode: ClaimModalMode = 'create';
  if (tab === 'ticket') {
    if (opts?.ticketAction === 'claim') {
      ticketActionRaw = 'claim';
      if (opts.claimMode === 'link') claimMode = 'link';
    } else if (opts?.ticketAction === 'chat') {
      ticketActionRaw = 'chat';
    }
  }

  let unitsActionRaw: string | null = null;
  if (tab === 'units' && opts?.unitsAction === 'prebox') {
    unitsActionRaw = 'prebox';
  }

  const photoAction =
    tab === 'photos' && opts?.photoAction
      ? opts.photoAction
      : parseUnboxPhotoAction(null);

  return {
    display: tab,
    photoAction,
    linkageActionRaw,
    ticketActionRaw,
    unitsActionRaw,
    claimMode,
  };
}

interface UnboxDisplayViewState {
  requestedDisplay: UnboxDisplayNav | null;
  photoAction: UnboxPhotoAction;
  linkageActionRaw: string | null;
  ticketActionRaw: string | null;
  unitsActionRaw: string | null;
  claimMode: ClaimModalMode;
  setDisplay: (tab: UnboxDisplayNav | null, opts?: SetUnboxDisplayOpts) => void;
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
  const urlDisplay = parseUnboxDisplayParam(rawDisplay);
  const urlPhotoAction = parseUnboxPhotoAction(searchParams.get(PHOTO_ACTION_PARAM));
  const urlLinkageActionRaw = searchParams.get(LINKAGE_ACTION_PARAM);
  const urlTicketActionRaw = searchParams.get(TICKET_ACTION_PARAM);
  const urlUnitsActionRaw = searchParams.get(UNITS_ACTION_PARAM);
  const urlClaimModeRaw = searchParams.get(CLAIM_MODE_PARAM);
  const urlClaimMode: ClaimModalMode = urlClaimModeRaw === 'link' ? 'link' : 'create';

  const [pending, setPending] = useState<UnboxDisplayPending | undefined>(undefined);

  useEffect(() => {
    if (shouldClearOptimisticParam(urlDisplay, pending?.display)) {
      setPending(undefined);
    }
  }, [urlDisplay, pending]);

  const requestedDisplay = resolveOptimisticParam(urlDisplay, pending?.display);
  const photoAction = pending !== undefined ? pending.photoAction : urlPhotoAction;
  const linkageActionRaw =
    pending !== undefined ? pending.linkageActionRaw : urlLinkageActionRaw;
  const ticketActionRaw =
    pending !== undefined ? pending.ticketActionRaw : urlTicketActionRaw;
  const unitsActionRaw =
    pending !== undefined ? pending.unitsActionRaw : urlUnitsActionRaw;
  const claimMode = pending !== undefined ? pending.claimMode : urlClaimMode;

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
    },
    [router, pathname],
  );

  const setDisplay = useCallback(
    (tab: UnboxDisplayNav | null, opts?: SetUnboxDisplayOpts) => {
      // Live seed — React `searchParams` can lag a concurrent `openReceivingId`
      // write (SoT: `readLiveSearchParams`).
      const next = readLiveSearchParams(searchParams.toString());
      // Drop nested + legacy peer flags whenever the display changes.
      next.delete(PHOTO_ACTION_PARAM);
      next.delete(LINKAGE_ACTION_PARAM);
      next.delete(INVENTORY_ACTION_PARAM);
      next.delete(TICKET_ACTION_PARAM);
      next.delete(UNITS_ACTION_PARAM);
      next.delete(CLAIM_MODE_PARAM);
      next.delete(LEGACY_TICKET_VIEW);
      next.delete(LEGACY_CLAIM_VIEW);

      const snapshot = buildDisplayPending(tab, opts, rawDisplay);

      if (tab) {
        next.set(DISPLAY_PARAM, tab);
        if (tab === 'photos' && opts?.photoAction && opts.photoAction !== 'actions') {
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
        dispatchIncomingAddInboundClose();
      } else {
        next.delete(DISPLAY_PARAM);
      }

      // Urgent paint — do not wait for App Router soft-replace.
      setPending(snapshot);
      startTransition(() => {
        replaceParams(next);
      });
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

  // Deep-link / reload with a display already open — suspend details + AI + Add.
  useEffect(() => {
    if (!requestedDisplay) return;
    dispatchReceivingDetailsOverlayClose();
    dispatchAssistantDockClose();
    dispatchIncomingAddInboundClose();
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
      if (!requestedDisplay && !searchParams.has(DISPLAY_PARAM) && pending === undefined) {
        return;
      }
      // Close the column in this commit — do not wait for soft-replace.
      setPending(buildDisplayPending(null, undefined, null));
      const next = readLiveSearchParams(searchParams.toString());
      clearAllUnboxRightEdgeParams(next);
      startTransition(() => {
        replaceParams(next);
      });
    };
    window.addEventListener('receiving-open-details-overlay', handler);
    return () => window.removeEventListener('receiving-open-details-overlay', handler);
  }, [requestedDisplay, searchParams, replaceParams, pending]);

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

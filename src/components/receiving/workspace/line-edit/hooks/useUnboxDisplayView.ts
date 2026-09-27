'use client';

/** Local state for the Unbox Displays push column (`StationDisplaysPushStack`). */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dispatchStationDeskOccupantClose,
  STATION_DISPLAYS_CLOSE_EVENT,
} from '@/utils/events';
import { stripStaleUnboxRightEdgeParamsFromUrl } from '../unbox-right-edge';
import {
  parseUnboxDisplayNav,
  parseUnboxLinkageAction,
  parseUnboxPhotoAction,
  resolveUnboxTicketAction,
  type UnboxDisplayNav,
  type UnboxLinkageAction,
  type UnboxPhotoAction,
  type UnboxSideTabGates,
  type UnboxTicketAction,
} from '../unbox-side-tabs';
import type { ClaimModalMode } from '@/components/receiving/workspace/claim/claim-types';

/**
 * Parse a display id into nav. `index` opens Root Index; leaf ids canonicalize;
 * bogus → closed. Kept for callers / tests that still name wire ids.
 */
export function parseUnboxDisplayParam(raw: string | null): UnboxDisplayNav | null {
  return parseUnboxDisplayNav(raw);
}

/** Close the Displays column only when the open RECORD genuinely changes. */
export function shouldClearDisplayOnRecordChange(
  prevRecordId: number | null,
  currentRecordId: number | null,
  displayOpen: boolean,
): boolean {
  return (
    displayOpen &&
    prevRecordId != null &&
    currentRecordId != null &&
    prevRecordId !== currentRecordId
  );
}

type SetUnboxDisplayOpts = {
  photoAction?: UnboxPhotoAction;
  linkageAction?: UnboxLinkageAction;
  ticketAction?: UnboxTicketAction;
  claimMode?: ClaimModalMode;
};

/** Domain snapshot — nested leaf intents ride with the display write. */
type UnboxDisplaySnapshot = {
  display: UnboxDisplayNav | null;
  photoAction: UnboxPhotoAction;
  linkageActionRaw: string | null;
  ticketActionRaw: string | null;
  claimMode: ClaimModalMode;
};

const CLOSED_SNAPSHOT: UnboxDisplaySnapshot = {
  display: null,
  photoAction: parseUnboxPhotoAction(null),
  linkageActionRaw: null,
  ticketActionRaw: null,
  claimMode: 'link',
};

/**
 * Build the local Displays snapshot for a tab + nest opts.
 * `rawDisplay` remains for one-shot legacy id mapping (e.g. `po-note` → note).
 */
export function buildDisplayPending(
  tab: UnboxDisplayNav | null,
  opts: SetUnboxDisplayOpts | undefined,
  rawDisplay: string | null = null,
): UnboxDisplaySnapshot {
  if (!tab) {
    return { ...CLOSED_SNAPSHOT };
  }

  let linkageActionRaw: string | null = null;
  if (tab === 'linkage') {
    // Every drill this snapshot can carry must be listed.
    if (opts?.linkageAction === 'note') linkageActionRaw = 'note';
    else if (opts?.linkageAction === 'link') linkageActionRaw = 'link';
    else if (opts?.linkageAction === 'return') linkageActionRaw = 'return';
    else linkageActionRaw = null; // actions list (Back target for the drills)
  }
  if (rawDisplay === 'po-note' && tab === 'linkage' && !opts?.linkageAction) {
    linkageActionRaw = 'note';
  }

  let ticketActionRaw: string | null = null;
  let claimMode: ClaimModalMode = 'link';
  if (tab === 'ticket') {
    if (opts?.ticketAction === 'claim') {
      ticketActionRaw = 'claim';
      if (opts.claimMode === 'create') claimMode = 'create';
      else if (opts.claimMode === 'link') claimMode = 'link';
    } else if (opts?.ticketAction === 'chat') {
      ticketActionRaw = 'chat';
    }
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
    claimMode,
  };
}

interface UnboxDisplayViewState {
  requestedDisplay: UnboxDisplayNav | null;
  photoAction: UnboxPhotoAction;
  linkageActionRaw: string | null;
  ticketActionRaw: string | null;
  claimMode: ClaimModalMode;
  setDisplay: (tab: UnboxDisplayNav | null, opts?: SetUnboxDisplayOpts) => void;
  /** Resolve linkage nested action against current gates. */
  resolveLinkageAction: (gates: Pick<UnboxSideTabGates, 'hasPoNoteTab'>) => UnboxLinkageAction;
  /** Resolve ticket nested action given whether a linked ticket id exists. */
  resolveTicketAction: (hasTicketId: boolean) => UnboxTicketAction;
}

export function useUnboxDisplayView(currentRecordId: number | null): UnboxDisplayViewState {
  const [snapshot, setSnapshot] = useState<UnboxDisplaySnapshot>(CLOSED_SNAPSHOT);

  // Strip stale Displays URL keys once — old bookmarks must not reopen the
  // column or trigger an App Router soft-replace.
  useEffect(() => {
    stripStaleUnboxRightEdgeParamsFromUrl();
  }, []);

  const setDisplay = useCallback((tab: UnboxDisplayNav | null, opts?: SetUnboxDisplayOpts) => {
    const next = buildDisplayPending(tab, opts, null);
    if (tab) dispatchStationDeskOccupantClose();
    setSnapshot(next);
  }, []);

  const requestedDisplay = snapshot.display;
  const {
    photoAction,
    linkageActionRaw,
    ticketActionRaw,
    claimMode,
  } = snapshot;

  const prevRecordIdRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevRecordIdRef.current;
    prevRecordIdRef.current = currentRecordId;
    if (shouldClearDisplayOnRecordChange(prev, currentRecordId, requestedDisplay != null)) {
      setDisplay(null);
    }
  }, [currentRecordId, requestedDisplay, setDisplay]);

  // Desk tools → close Displays so one right-edge surface owns the slot.
  useEffect(() => {
    const close = () => {
      setSnapshot(CLOSED_SNAPSHOT);
    };
    window.addEventListener(STATION_DISPLAYS_CLOSE_EVENT, close);
    return () => window.removeEventListener(STATION_DISPLAYS_CLOSE_EVENT, close);
  }, []);

  const resolveLinkageAction = useCallback(
    (gates: Pick<UnboxSideTabGates, 'hasPoNoteTab'>) =>
      parseUnboxLinkageAction(linkageActionRaw, gates),
    [linkageActionRaw],
  );

  const resolveTicketAction = useCallback(
    (hasTicketId: boolean) => resolveUnboxTicketAction(hasTicketId),
    [],
  );

  return {
    requestedDisplay,
    photoAction,
    linkageActionRaw,
    ticketActionRaw,
    claimMode,
    setDisplay,
    resolveLinkageAction,
    resolveTicketAction,
  };
}

'use client';

/**
 * Unbox Displays → Linkage topic — the carton's PAIRING surface.
 *
 * Armed-row verbs + local nest drills (Photos twin):
 * `linkage` leaf → Actions list · `linkageAction` link|return|note → bodies.
 *
 * **The pairing verbs live HERE, on the actions list — never inside the Link
 * body.** Link is one avenue combobox plus that avenue's search field; Find
 * ticket · Return # · Store · Zoho · Amazon return are peers of it, not
 * controls buried under its search results. They are merged into this one list
 * rather than stacked as a second {@link StationArmedVerbList}: two lists both
 * register keyboard region `right` and would fight over the same letters.
 *
 * Find ticket is also this list's job, not Classify's — Classify grades what
 * the carton IS (urgency · platform · type); linking it to a ticket is a
 * pairing act.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { FileText, Link2, TicketHelp } from '@/components/Icons';
import { useDisplaysLeafChrome } from '@/components/station/displays/displays-leaf-chrome';
import {
  StationArmedVerbList,
  type StationArmedVerb,
} from '@/components/station/displays/StationArmedVerbList';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { cn } from '@/utils/_cn';
import { CartonMatchHub } from './CartonMatchHub';
import {
  UnfoundMatchNotice,
  UnfoundReturnSearch,
  useUnfoundMatchVerbs,
} from './UnfoundMatchStrip';
import { LinePoNoteCard } from './LinePoNoteCard';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { PoNoteTabState } from './terminal/usePoNoteTabState';
import type { UnboxLinkageAction } from './unbox-side-tabs';

function providerStripLabel(providerKey: string): string {
  const full = providerCatalogLabel(providerKey);
  const brand = full.split(/\s+/)[0]?.trim();
  return brand || full;
}

const LINKAGE_DRILL_LABEL: Record<'link' | 'return' | 'note', string> = {
  link: 'Link',
  return: 'Return #',
  note: 'Note',
};

function isLinkageDrill(
  action: UnboxLinkageAction,
): action is 'link' | 'return' | 'note' {
  return action === 'link' || action === 'return' || action === 'note';
}

export function LinkageDisplayHost({
  row,
  staffId,
  action,
  onActionChange,
  hasPoNote,
  poNote,
  pairingFocusTab,
  pairingFocusRequestId,
  autoMatch,
  onFindTicket,
  ticketLabel,
}: {
  row: ReceivingLineRow;
  staffId: string;
  action: UnboxLinkageAction;
  onActionChange: (action: UnboxLinkageAction) => void;
  hasPoNote: boolean;
  poNote: PoNoteTabState;
  pairingFocusTab?: 'zoho_po' | null;
  pairingFocusRequestId?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same shape as CartonMatchHub autoMatch
  autoMatch: any;
  /**
   * Open Ticket Displays (Link existing / Chat). Found **and** unfound — a
   * ticket is a pairing, so this row lives here rather than in Classify, which
   * grades what the carton IS (urgency · platform · type).
   */
  onFindTicket?: () => void;
  /** Linked ticket display label ("#9395"), when one is linked. */
  ticketLabel?: string | null;
}) {
  const { setTrail, setOnNestedPop, setOnNestedRestore } = useDisplaysLeafChrome();

  const openReturnSearch = useCallback(() => onActionChange('return'), [onActionChange]);

  const {
    verbs: matchVerbs,
    runVerb: runMatchVerb,
    notice: matchNotice,
  } = useUnfoundMatchVerbs({
    receivingId: autoMatch?.receivingId ?? null,
    trackingNumber: autoMatch?.trackingNumber ?? null,
    receivedSerial: autoMatch?.receivedSerial ?? null,
    // Find ticket is added below so it survives on FOUND cartons too.
    // **No Store verb here** — Store is one of Link's three avenues (Inventory
    // item · Purchase order · Store), so a peer row would be a second door onto
    // the same search one level up from it.
    onOpenReturnSearch: openReturnSearch,
  });

  const verbs = useMemo<StationArmedVerb[]>(() => {
    const rows: StationArmedVerb[] = [
      {
        id: 'link',
        label: 'Link',
        preferredKey: 'k',
        icon: (p) => <Link2 className={p.className} />,
        subtitle: 'Inventory item · Purchase order · Store',
      },
    ];
    // Pairing verbs are peers of Link — see the module docblock.
    if (typeof onFindTicket === 'function') {
      rows.push({
        id: 'find_ticket',
        label: 'Find ticket',
        preferredKey: 't',
        icon: (p) => <TicketHelp className={p.className} />,
        subtitle: ticketLabel ? `Linked ${ticketLabel} · open chat` : 'New ticket · Link existing',
      });
    }
    if (autoMatch) rows.push(...matchVerbs);
    if (hasPoNote) {
      rows.push({
        id: 'note',
        label: providerStripLabel('zoho'),
        preferredKey: 'n',
        icon: (p) => <FileText className={p.className} />,
      });
    }
    return rows;
  }, [autoMatch, hasPoNote, matchVerbs, onFindTicket, ticketLabel]);

  const commitVerb = useCallback(
    (id: string) => {
      if (id === 'link' || id === 'note') {
        onActionChange(id as UnboxLinkageAction);
        return;
      }
      if (id === 'find_ticket') {
        onFindTicket?.();
        return;
      }
      runMatchVerb(id);
    },
    [onActionChange, onFindTicket, runMatchVerb],
  );

  // A gated-away drill resolves to the actions list — never a silent swap to
  // an unrelated body (Displays reachability law).
  const verb: UnboxLinkageAction = isLinkageDrill(action)
    ? (action === 'note' && !hasPoNote) || (action === 'return' && !autoMatch)
      ? 'actions'
      : action
    : 'actions';

  useEffect(() => {
    if (verb === 'actions') {
      setTrail([{ id: 'linkage', label: 'Linkage' }]);
    } else {
      setTrail([
        { id: 'linkage', label: 'Linkage' },
        { id: verb, label: LINKAGE_DRILL_LABEL[verb] },
      ]);
    }
  }, [verb, setTrail]);

  useEffect(() => {
    setOnNestedPop(() => onActionChange('actions'));
    return () => setOnNestedPop(null);
  }, [setOnNestedPop, onActionChange]);

  useEffect(() => {
    setOnNestedRestore((segmentId) => {
      if (isLinkageDrill(segmentId as UnboxLinkageAction)) {
        onActionChange(segmentId as UnboxLinkageAction);
      }
    });
    return () => setOnNestedRestore(null);
  }, [setOnNestedRestore, onActionChange]);

  return (
    <div className="flex min-h-0 flex-col gap-0" data-testid="unbox-linkage-display">
      {verb === 'actions' ? (
        <StationArmedVerbList
          verbs={verbs}
          listLabel="Linkage actions"
          testId="unbox-linkage-actions"
          onCommit={commitVerb}
        />
      ) : null}
      {verb === 'actions' && matchNotice ? (
        <div className={cn('pt-2', DISPLAYS_BODY_INSET)}>
          <UnfoundMatchNotice state={matchNotice} />
        </div>
      ) : null}
      {verb === 'link' ? (
        // Flush — no `DISPLAYS_BODY_INSET` (`px-4`). Same contract as
        // TicketDisplayHost's Claim body: "Host stays flush; the search field
        // and result rows own their own internal inset, never the whole
        // detail." Wrapping the Store avenue combobox + its results in the
        // standard gutter here (2026-08-24 fix) is what made it read as
        // padded/not-edge-to-edge next to the Ticket panel's Create|Link
        // combobox, which never had this wrapper.
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CartonMatchHub
            row={row}
            staffId={staffId}
            tabSet="unbox"
            chrome="bare"
            showOpenInUnbox={false}
            autoFocusSearch={false}
            focusTab={pairingFocusTab}
            focusRequestId={pairingFocusRequestId}
            /* Verbs live on this leaf's actions list, not under the search. */
            autoMatch={null}
          />
        </div>
      ) : null}
      {verb === 'return' ? (
        <div className={cn('min-h-0 flex-1 pt-3', DISPLAYS_BODY_INSET)}>
          <UnfoundReturnSearch
            receivingId={autoMatch?.receivingId ?? null}
            lineId={autoMatch?.lineId ?? null}
            receivedSerial={autoMatch?.receivedSerial ?? null}
            providerTicketId={autoMatch?.providerTicketId ?? null}
            ticketNumber={autoMatch?.ticketNumber ?? null}
            ticketUrl={autoMatch?.ticketUrl ?? null}
            onTicketChanged={autoMatch?.onTicketChanged}
            onBack={() => onActionChange('actions')}
          />
        </div>
      ) : null}
      {verb === 'note' && hasPoNote ? (
        <div className={cn('min-h-0 flex-1 pt-3', DISPLAYS_BODY_INSET)}>
          <LinePoNoteCard
            draft={poNote.draft}
            onDraftChange={poNote.setDraft}
            loading={poNote.loading}
            dirty={poNote.dirty}
            saving={poNote.saving}
            onSave={() => void poNote.save()}
            onSyncFromInventory={() => void poNote.syncFromInventory()}
          />
        </div>
      ) : null}
    </div>
  );
}

'use client';

/**
 * Unbox Displays → Pairing leaf — the carton's pairing verbs. Link hands off to
 * the header Pair task (the one CartonMatchHub surface); Return # and the Zoho
 * PO note drill in place.
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
import {
  UnfoundMatchNotice,
  UnfoundReturnSearch,
  useUnfoundMatchVerbs,
} from './UnfoundMatchStrip';
import { LinePoNoteCard } from './LinePoNoteCard';
import { providerCatalogLabel } from '@/lib/integrations/capability-labels';
import type { PoNoteTabState } from './terminal/usePoNoteTabState';
import type { UnboxLinkageAction } from './unbox-side-tabs';

/** Unfound-carton auto-match inputs (Return # search + match verbs). */
export interface LinkageAutoMatch {
  receivingId: number | null;
  lineId: number | null;
  trackingNumber: string | null;
  receivedSerial: string | null;
  providerTicketId: number | null;
  ticketNumber: string | null;
  ticketUrl: string | null;
  onTicketChanged: () => void;
}

function providerStripLabel(providerKey: string): string {
  const full = providerCatalogLabel(providerKey);
  const brand = full.split(/\s+/)[0]?.trim();
  return brand || full;
}

const LINKAGE_DRILL_LABEL: Record<'return' | 'note', string> = {
  return: 'Return #',
  note: 'Note',
};

function isLinkageDrill(action: string): action is 'return' | 'note' {
  return action === 'return' || action === 'note';
}

export function LinkageDisplayHost({
  action,
  onActionChange,
  onLink,
  hasPoNote,
  poNote,
  autoMatch,
  onFindTicket,
  ticketLabel,
}: {
  action: UnboxLinkageAction;
  onActionChange: (action: UnboxLinkageAction) => void;
  /** Link verb → the header Pair task (Inventory item · Purchase order · Store). */
  onLink: () => void;
  hasPoNote: boolean;
  poNote: PoNoteTabState;
  autoMatch: LinkageAutoMatch | null;
  /**
   * Find ticket → the header Ticket task (claim · link · chat). Found **and**
   * unfound — a ticket is a pairing, so this row lives here.
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
      if (id === 'link') {
        onLink();
        return;
      }
      if (id === 'note') {
        onActionChange('note');
        return;
      }
      if (id === 'find_ticket') {
        onFindTicket?.();
        return;
      }
      runMatchVerb(id);
    },
    [onActionChange, onFindTicket, onLink, runMatchVerb],
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
      setTrail([{ id: 'linkage', label: 'Pairing' }]);
    } else {
      setTrail([
        { id: 'linkage', label: 'Pairing' },
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
      if (isLinkageDrill(segmentId)) {
        onActionChange(segmentId);
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

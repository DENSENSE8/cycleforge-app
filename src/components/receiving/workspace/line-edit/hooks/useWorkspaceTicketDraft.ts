'use client';

import { useEffect, useMemo, useState } from 'react';
import { readStoredClaimCcEmails, rememberClaimCcEmails } from '@/lib/receiving/claim-cc-memory';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  useComposerTicketClaim,
  type ComposerTicketClaim,
} from './useComposerTicketClaim';

export interface WorkspaceTicketDraftModel {
  claim: ComposerTicketClaim;
  isPublic: boolean;
  setIsPublic: (next: boolean) => void;
  ccs: string[];
  setCcs: (next: string[]) => void;
  ccDraft: string;
  setCcDraft: (next: string) => void;
}

/** One audience + claim draft shared by the Ticket preview and bottom composer. */
export function useWorkspaceTicketDraft({
  row,
  ticketId,
  onTicketCreated,
}: {
  row: ReceivingLineRow;
  ticketId: number | null | undefined;
  onTicketCreated?: (ticketNumber: string) => void;
}): WorkspaceTicketDraftModel {
  const [isPublic, setIsPublic] = useState(true);
  const [ccs, setCcs] = useState<string[]>([]);
  const [ccDraft, setCcDraft] = useState('');
  const hasTicket = ticketId != null && ticketId > 0;
  const claim = useComposerTicketClaim({
    row,
    hasTicket,
    notePublic: isPublic,
    ccEmails: ccs,
    onTicketCreated,
  });

  // Audience belongs to the open carton. CC comes from the claim form's
  // stored list — deleting that form must not drop the addresses.
  useEffect(() => {
    setIsPublic(true);
    setCcs(readStoredClaimCcEmails());
    setCcDraft('');
  }, [row.id, ticketId]);

  useEffect(() => {
    if (ccs.length === 0) return;
    rememberClaimCcEmails(ccs);
  }, [ccs]);

  return useMemo(
    () => ({
      claim,
      isPublic,
      setIsPublic,
      ccs,
      setCcs,
      ccDraft,
      setCcDraft,
    }),
    [claim, isPublic, ccs, ccDraft],
  );
}

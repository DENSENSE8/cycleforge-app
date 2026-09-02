'use client';

/**
 * The claim, headless, for the station composer's Ticket tab.
 *
 * The deterministic Zendesk template is FACT input for Hermes — it is not
 * dumped into the textarea. Ticket mode drafts via
 * POST /api/receiving/zendesk-claim/draft, then Enter files (create) or
 * links + posts (link). Claim type, return-issue prefill, Create|Link, and
 * the post-file seller copy all live here so the Displays form cannot drift.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { defaultReceivingClaimType, type ClaimType } from '@/lib/receiving-claim-type';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ClaimModalMode, LinkCandidate } from '../../claim/claim-types';
import { useClaimTicketSearch } from '../../claim/hooks/useClaimTicketSearch';
import {
  copySellerClaimMessageWithPersist,
  persistSellerClaimMessageDraft,
} from '@/lib/receiving-claim-seller-copy';

function claimErrorText(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const error = (data as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error.trim();
  }
  return fallback;
}

function ticketIdFromNumber(ticketNumber: string): number | null {
  const n = Number(String(ticketNumber).replace(/^#/, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface ComposerTicketClaim {
  isClaim: boolean;
  claimType: ClaimType;
  setClaimType: (next: ClaimType) => void;
  hasPo: boolean;
  mode: ClaimModalMode;
  setMode: (next: ClaimModalMode) => void;
  reason: string;
  search: ReturnType<typeof useClaimTicketSearch>;
  subject: string;
  body: string;
  setBody: (next: string) => void;
  loading: boolean;
  draftModel: string;
  draftDegraded: boolean;
  redraft: () => void;
  filing: boolean;
  canFile: boolean;
  file: () => void;
  canTest: boolean;
  testing: boolean;
  testCreate: () => void;
  sellerMessage: string;
  setSellerMessage: (next: string) => void;
  sellerLoading: boolean;
  sellerApplicable: boolean;
  copySellerMessage: () => void;
  redraftSeller: () => void;
  persistSeller: () => void;
  contextLine: string;
}

export function useComposerTicketClaim({
  row,
  hasTicket,
  notePublic = false,
  ccEmails,
  prefillReason,
  onTicketCreated,
}: {
  row?: ReceivingLineRow | null;
  hasTicket: boolean;
  notePublic?: boolean;
  ccEmails?: string[];
  /** RETURN match issue line — rides into the AI draft as `reason`. */
  prefillReason?: string | null;
  onTicketCreated?: (ticketNumber: string) => void;
}): ComposerTicketClaim {
  const receivingId = row?.receiving_id ?? null;
  const lineId = row?.id ?? null;
  const isClaim = !hasTicket && row != null && receivingId != null;
  const hasPo = Boolean(row?.zoho_purchaseorder_number || row?.zoho_purchaseorder_id);
  const defaultType = defaultReceivingClaimType({
    shipmentStatus: row?.shipment_status,
    receivingType: row?.receiving_type,
    cartonIntakeType: row?.carton_intake_type,
    intakeType: row?.intake_type,
    receivingSource: row?.receiving_source,
    hasPo,
  });

  const [claimType, setClaimTypeState] = useState<ClaimType>(defaultType);
  const [mode, setMode] = useState<ClaimModalMode>('create');
  const [reason, setReason] = useState((prefillReason ?? '').trim());
  const [subject, setSubject] = useState('');
  const [body, setBodyState] = useState('');
  const [edited, setEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draftModel, setDraftModel] = useState('');
  const [draftDegraded, setDraftDegraded] = useState(false);
  const [filing, setFiling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sellerMessage, setSellerMessage] = useState('');
  const [sellerMessageId, setSellerMessageId] = useState<number | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [filedTicket, setFiledTicket] = useState<{
    number: string;
    id: number | null;
  } | null>(null);

  const trackingSeed =
    typeof row?.tracking_number === 'string' ? row.tracking_number.trim() : '';
  const search = useClaimTicketSearch({
    open: isClaim,
    enabled: isClaim && mode === 'link',
    receivingId,
    lineId,
    initialQuery: trackingSeed || null,
  });

  const identityKey = `${receivingId ?? ''}:${lineId ?? ''}`;
  const idempotencyKey = useRef(`composer-claim-${identityKey}`);
  const lastIdentity = useRef(identityKey);
  if (lastIdentity.current !== identityKey) {
    lastIdentity.current = identityKey;
    idempotencyKey.current = `composer-claim-${identityKey}`;
  }
  const draftGen = useRef(0);
  const editedRef = useRef(edited);
  editedRef.current = edited;

  useEffect(() => {
    setClaimTypeState(defaultType);
    setMode('create');
    setReason((prefillReason ?? '').trim());
    setSubject('');
    setBodyState('');
    setEdited(false);
    setDraftModel('');
    setDraftDegraded(false);
    setSellerMessage('');
    setSellerMessageId(null);
    setFiledTicket(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carton/line swap only
  }, [identityKey]);

  useEffect(() => {
    setReason((prefillReason ?? '').trim());
  }, [prefillReason]);

  const setClaimType = useCallback((next: ClaimType) => {
    setClaimTypeState(next);
    setEdited(false);
  }, []);

  const setBody = useCallback((next: string) => {
    setBodyState(next);
    setEdited(true);
  }, []);

  const runDraft = useCallback(async () => {
    if (!isClaim || receivingId == null) return;
    const gen = ++draftGen.current;
    setLoading(true);
    try {
      const res = await fetch('/api/receiving/zendesk-claim/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivingId,
          lineId,
          claimType,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (gen !== draftGen.current) return;
      if (editedRef.current) return;
      if (!res.ok || !data?.success) {
        toast.error(claimErrorText(data, 'Could not draft the claim'));
        return;
      }
      setSubject(typeof data.subject === 'string' ? data.subject : '');
      setBodyState(typeof data.description === 'string' ? data.description : '');
      setDraftModel(typeof data.model === 'string' ? data.model : '');
      setDraftDegraded(data.degraded === true);
      setEdited(false);
      if (data.degraded === true) {
        toast.warning('AI draft kept the factual template — review before filing');
      }
    } catch {
      if (gen !== draftGen.current) return;
      toast.error('Could not draft the claim');
    } finally {
      if (gen === draftGen.current) setLoading(false);
    }
  }, [isClaim, receivingId, lineId, claimType, reason]);

  useEffect(() => {
    if (!isClaim) return;
    void runDraft();
  }, [isClaim, claimType, reason, identityKey, runDraft]);

  const sellerApplicable = claimType !== 'return';

  const draftSeller = useCallback(
    async (ticketNumber: string, ticketId: number | null) => {
      if (!sellerApplicable || !receivingId || !ticketNumber || ticketNumber === '#TEST') {
        return;
      }
      setSellerLoading(true);
      try {
        const res = await fetch('/api/receiving/zendesk-claim/assist-seller', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receivingId,
            lineId,
            claimType,
            reason: reason.trim(),
            subject: subject.trim(),
            description: body.trim(),
            zendeskTicketNumber: ticketNumber,
            zendeskTicketId: ticketId,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          toast.error(claimErrorText(data, 'Could not draft seller message'));
          return;
        }
        setSellerMessage(typeof data.sellerMessage === 'string' ? data.sellerMessage : '');
        if (typeof data.sellerMessageId === 'number' && data.sellerMessageId > 0) {
          setSellerMessageId(data.sellerMessageId);
        }
        if (data.linksStripped) {
          toast.warning('Links were removed from the seller message (marketplace TOS)', {
            duration: 6000,
          });
        }
      } catch {
        toast.error('Could not draft seller message');
      } finally {
        setSellerLoading(false);
      }
    },
    [sellerApplicable, receivingId, lineId, claimType, reason, subject, body],
  );

  const afterFiled = useCallback(
    (ticketNumber: string, ticketId: number | null) => {
      setFiledTicket({ number: ticketNumber, id: ticketId });
      onTicketCreated?.(ticketNumber);
      void draftSeller(ticketNumber, ticketId);
    },
    [onTicketCreated, draftSeller],
  );

  const fileCreate = useCallback(async () => {
    if (receivingId == null) return;
    const description = body.trim();
    if (!description) return;
    setFiling(true);
    try {
      const res = await fetch('/api/receiving/zendesk-claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({
          receivingId,
          lineId,
          claimType,
          reason: reason.trim() || undefined,
          subject: subject.trim(),
          description,
          notePublic,
          ccEmails: notePublic ? (ccEmails ?? []) : [],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(claimErrorText(data, 'Could not file the claim'));
        return;
      }
      const ticketNumber = data.ticketNumber ? String(data.ticketNumber) : '';
      const ticketUrl = typeof data.ticketUrl === 'string' ? data.ticketUrl : null;
      const ticketId =
        typeof data.ticketId === 'number' ? data.ticketId : ticketIdFromNumber(ticketNumber);
      if (ticketNumber) {
        toast.success(`Ticket ${ticketNumber} filed`, {
          action: ticketUrl
            ? { label: 'Open', onClick: () => window.open(ticketUrl, '_blank', 'noopener') }
            : undefined,
        });
        afterFiled(ticketNumber, ticketId);
      } else {
        toast.success('Claim filed');
      }
      const archiveWarning =
        typeof data.archiveWarning === 'string' && data.archiveWarning.trim()
          ? data.archiveWarning.trim()
          : null;
      if (archiveWarning) toast.warning(archiveWarning, { duration: 8000 });
    } catch {
      toast.error('Could not file the claim');
    } finally {
      setFiling(false);
    }
  }, [
    receivingId,
    lineId,
    claimType,
    reason,
    subject,
    body,
    notePublic,
    ccEmails,
    afterFiled,
  ]);

  const fileLink = useCallback(async () => {
    const selected = search.selectedTicket;
    if (receivingId == null || !selected) return;
    const description = body.trim();
    if (!description) return;
    setFiling(true);
    try {
      const linkRes = await fetch('/api/receiving/zendesk-claim/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivingId, lineId, ticketId: selected.id }),
      });
      const linkData = await linkRes.json().catch(() => null);
      if (!linkRes.ok || !linkData?.success) {
        toast.error(claimErrorText(linkData, 'Could not link the ticket'));
        return;
      }
      const ticketNumber = String(linkData.ticketNumber ?? `#${selected.id}`);
      const threadRes = await fetch('/api/receiving/zendesk-claim/thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: selected.id,
          receivingId,
          lineId,
          claimType,
          body: description,
          subject: subject.trim(),
          public: notePublic,
          emailCcs: notePublic && ccEmails?.length ? ccEmails : undefined,
        }),
      });
      const threadData = await threadRes.json().catch(() => null);
      if (!threadRes.ok || !threadData?.success) {
        toast.error(claimErrorText(threadData, 'Linked, but could not post the draft'));
        afterFiled(ticketNumber, selected.id);
        return;
      }
      toast.success(
        notePublic
          ? `Ticket ${ticketNumber} linked — customer emailed`
          : `Ticket ${ticketNumber} linked`,
      );
      afterFiled(ticketNumber, selected.id);
    } catch {
      toast.error('Could not link the ticket');
    } finally {
      setFiling(false);
    }
  }, [
    search.selectedTicket,
    receivingId,
    lineId,
    body,
    subject,
    claimType,
    notePublic,
    ccEmails,
    afterFiled,
  ]);

  const file = useCallback(() => {
    if (!isClaim || filing || receivingId == null) return;
    if (mode === 'link') {
      void fileLink();
      return;
    }
    void fileCreate();
  }, [isClaim, filing, receivingId, mode, fileLink, fileCreate]);

  const testCreate = useCallback(() => {
    if (!isClaim || testing || receivingId == null) return;
    setTesting(true);
    void (async () => {
      try {
        const res = await fetch('/api/receiving/zendesk-claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receivingId,
            lineId,
            claimType,
            reason: reason.trim() || undefined,
            subject: subject.trim(),
            description: body.trim(),
            notePublic,
            ccEmails: notePublic ? (ccEmails ?? []) : [],
            dryRun: true,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          toast.error(claimErrorText(data, 'Test create failed'));
          return;
        }
        if (typeof data.description === 'string') {
          setBodyState(data.description);
          setEdited(true);
        }
        const packUrl = typeof data.sharePackUrl === 'string' ? data.sharePackUrl : null;
        const packCount = Number(data.sharePackPhotoCount ?? 0);
        toast.success(
          packUrl
            ? `Test create — no ticket filed · share pack of ${packCount} photo${packCount === 1 ? '' : 's'}`
            : 'Test create — no ticket filed · no photos to share',
          {
            duration: 8000,
            action: packUrl
              ? { label: 'Open pack', onClick: () => window.open(packUrl, '_blank', 'noopener') }
              : undefined,
          },
        );
      } catch {
        toast.error('Test create failed');
      } finally {
        setTesting(false);
      }
    })();
  }, [isClaim, testing, receivingId, lineId, claimType, reason, subject, body, notePublic, ccEmails]);

  const contextLine = useMemo(() => {
    const title =
      (typeof row?.catalog_product_title === 'string' && row.catalog_product_title.trim()) ||
      (typeof row?.zoho_item_title === 'string' && row.zoho_item_title.trim()) ||
      (typeof row?.item_name === 'string' && row.item_name.trim()) ||
      (typeof row?.sku === 'string' && row.sku.trim()) ||
      '';
    const po =
      typeof row?.zoho_purchaseorder_number === 'string' && row.zoho_purchaseorder_number.trim()
        ? `PO ${row.zoho_purchaseorder_number.trim()}`
        : '';
    const trk =
      typeof row?.tracking_number === 'string' && row.tracking_number.trim()
        ? `TRK ${row.tracking_number.trim()}`
        : '';
    return [title, po, trk].filter(Boolean).join(' · ');
  }, [row]);

  const persistSeller = useCallback(() => {
    const text = sellerMessage.trim();
    if (!text || !receivingId) return;
    void (async () => {
      const id = await persistSellerClaimMessageDraft({
        receivingId,
        lineId: lineId ?? null,
        sellerMessage: text,
        subjectSnapshot: subject.trim(),
      });
      if (id != null) {
        setSellerMessageId(id);
        toast.success(`Seller draft saved · #${id}`);
      } else {
        toast.error('Could not save seller draft');
      }
    })();
  }, [sellerMessage, receivingId, lineId, subject]);

  const copySellerMessage = useCallback(() => {
    const text = sellerMessage.trim();
    if (!text || !receivingId) return;
    void (async () => {
      const { ok, messageId } = await copySellerClaimMessageWithPersist({
        text,
        messageId: sellerMessageId,
        receivingId,
        lineId: lineId ?? null,
        subjectSnapshot: subject.trim(),
      });
      if (messageId != null) setSellerMessageId(messageId);
      if (ok) toast.success('Copied seller message');
      else toast.error('Could not copy');
    })();
  }, [sellerMessage, sellerMessageId, receivingId, lineId, subject]);

  const redraftSeller = useCallback(() => {
    if (!filedTicket?.number) return;
    void draftSeller(filedTicket.number, filedTicket.id);
  }, [filedTicket, draftSeller]);

  const canFile = useMemo(() => {
    if (!isClaim || filing || loading) return false;
    if (!body.trim()) return false;
    if (mode === 'link') return Boolean(search.selectedTicket);
    return true;
  }, [isClaim, filing, loading, body, mode, search.selectedTicket]);

  return {
    isClaim,
    claimType,
    setClaimType,
    hasPo,
    mode,
    setMode,
    reason,
    search,
    subject,
    body,
    setBody,
    loading,
    draftModel,
    draftDegraded,
    redraft: () => {
      editedRef.current = false;
      setEdited(false);
      void runDraft();
    },
    filing,
    canFile,
    file,
    canTest: isClaim && process.env.NODE_ENV !== 'production',
    testing,
    testCreate,
    sellerMessage,
    setSellerMessage,
    sellerLoading,
    sellerApplicable,
    copySellerMessage,
    redraftSeller,
    persistSeller,
    contextLine,
  };
}

export type { LinkCandidate };

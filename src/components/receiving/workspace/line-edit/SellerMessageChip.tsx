'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MessageSquare } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { Panel, Button } from '@/design-system/primitives';
import type { ClaimType } from '@/lib/zendesk-claim-template';
// From the light refs module — importing via receiving-claim-seller-message
// drags the server-only tenancy/db (Neon driver) into this client bundle.
import { normalizeClaimSellerMessageRefs } from '@/lib/receiving-claim-seller-refs';
import { copySellerClaimMessageWithPersist } from '@/lib/receiving-claim-seller-copy';
import { sellerDraftMatchesTicket } from '@/lib/receiving-claim-seller-ticket-match';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';





const sellerMessageKey = (receivingId: number, lineId: number | null) => {
  const { receivingId: rid, lineId: lid } = normalizeClaimSellerMessageRefs({ receivingId, lineId });
  return ['receiving', 'claim-seller-message', rid, lid ?? 0] as const;
};

interface SellerMessagePayload {
  id: number;
  sellerMessage: string;
  subjectSnapshot: string | null;
  model: string | null;
  zendeskTicketId: number | null;
  updatedAt: string;
}

interface ZendeskTicketPayload {
  id?: number;
  subject?: string | null;
  description?: string | null;
  raw_subject?: string | null;
  tags?: string[];
}

function inferClaimType(text: string): ClaimType {
  const haystack = text.toLowerCase();
  if (haystack.includes('missing item') || /\bmissing\b/.test(haystack)) return 'missing';
  if (haystack.includes('wrong item') || haystack.includes('incorrect item')) return 'wrong_item';
  if (haystack.includes('vendor defect') || haystack.includes('defective')) return 'vendor_defect';
  if (haystack.includes('unfound') || haystack.includes('no po match')) return 'unfound';
  if (haystack.includes('repair service')) return 'repair_service';
  return 'damage';
}

function fallbackTicketSubject(ticketId: number | null): string {
  return ticketId ? `Receiving Claim — Ticket #${ticketId}` : 'Receiving Claim';
}

function fallbackTicketBody(ticketId: number | null): string {
  return [
    'Issue: Damage',
    'Purchase Order: n/a',
    'Tracking: n/a',
    '',
    ticketId ? `Ticket: #${ticketId}` : null,
  ].filter(Boolean).join('\n');
}

function useSellerMessage(
  receivingId: number | null,
  lineId: number | null,
  linkedTicketId: number | null,
  open: boolean,
) {
  const entity =
    receivingId != null
      ? normalizeClaimSellerMessageRefs({ receivingId, lineId })
      : null;

  return useQuery<SellerMessagePayload | null, Error>({
    queryKey: sellerMessageKey(receivingId ?? 0, lineId),
    queryFn: async () => {
      if (!entity) return null;
      const sp = new URLSearchParams({ receivingId: String(entity.receivingId) });
      if (entity.lineId != null) sp.set('lineId', String(entity.lineId));
      const res = await fetch(`/api/receiving/zendesk-claim/seller-message?${sp}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      const message = (data.message as SellerMessagePayload | null) ?? null;
      if (
        message &&
        linkedTicketId != null &&
        !sellerDraftMatchesTicket(message.zendeskTicketId, linkedTicketId, `#${linkedTicketId}`)
      ) {
        return null;
      }
      return message;
    },
    enabled: open && receivingId != null,
    staleTime: 15_000,
    retry: false,
  });
}

/**
 * Seller-facing claim message draft — opened from the ticket chip hover menu
 * (Open → Message → Seller → Unlink). Panel + Neon persistence live
 * here; the menu ROW is data on `ReceivingTicketChip`'s `menuRows`, not a
 * component of its own — a per-host menuitem component is a row renderer fork.
 */

/** Anchored seller-message draft panel — composed by {@link ReceivingTicketChip}. */
export function SellerMessageAnchoredPanel({
  open,
  onClose,
  anchorRef,
  receivingId,
  lineId,
  linkedTicketId,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  receivingId: number;
  lineId: number | null;
  linkedTicketId: number | null;
}) {
  return (
    <AnchoredLayer
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-end"
      level="panelPopover"
      gap={6}
    >
      <SellerMessagePanel
        receivingId={receivingId}
        lineId={lineId}
        linkedTicketId={linkedTicketId}
        open={open}
        onClose={onClose}
      />
    </AnchoredLayer>
  );
}

function SellerMessagePanel({
  receivingId,
  lineId,
  linkedTicketId,
  open,
  onClose,
}: {
  receivingId: number;
  lineId: number | null;
  linkedTicketId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const entity = normalizeClaimSellerMessageRefs({ receivingId, lineId });
  const { data, isLoading, isError, error } = useSellerMessage(receivingId, lineId, linkedTicketId, open);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!open) {
      setDraft('');
      return;
    }
    if (data?.sellerMessage) setDraft(data.sellerMessage);
  }, [open, data?.sellerMessage]);

  const save = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch('/api/receiving/zendesk-claim/seller-message', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivingId: entity.receivingId,
          lineId: entity.lineId,
          sellerMessage: text,
          subjectSnapshot: data?.subjectSnapshot ?? undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      return json.message as SellerMessagePayload;
    },
    onSuccess: (msg) => {
      qc.setQueryData(sellerMessageKey(receivingId, lineId), msg);
      setDraft(msg.sellerMessage);
      toast.success('Seller message saved');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save'),
  });

  const generate = useMutation({
    mutationFn: async () => {
      let subject = data?.subjectSnapshot?.trim() || fallbackTicketSubject(linkedTicketId);
      let description = fallbackTicketBody(linkedTicketId);
      let claimType: ClaimType = inferClaimType(subject);

      if (linkedTicketId != null) {
        const ticketRes = await fetch(`/api/zendesk/tickets/${linkedTicketId}`, { cache: 'no-store' });
        if (ticketRes.ok) {
          const ticketJson = await ticketRes.json().catch(() => null);
          const ticket = ticketJson?.ticket as ZendeskTicketPayload | undefined;
          const ticketSubject = String(ticket?.subject || ticket?.raw_subject || '').trim();
          const ticketDescription = String(ticket?.description || '').trim();
          if (ticketSubject) subject = ticketSubject;
          if (ticketDescription) description = ticketDescription;
          claimType = inferClaimType(
            [
              ticketSubject,
              ticketDescription,
              Array.isArray(ticket?.tags) ? ticket.tags.join(' ') : '',
            ].join('\n'),
          );
        }
      }

      const res = await fetch('/api/receiving/zendesk-claim/assist-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivingId: entity.receivingId,
          lineId: entity.lineId,
          claimType,
          subject,
          description,
          zendeskTicketNumber: linkedTicketId != null ? `#${linkedTicketId}` : '#pending',
          zendeskTicketId: linkedTicketId,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      return {
        id: Number(json.sellerMessageId ?? 0) || Date.now(),
        sellerMessage: String(json.sellerMessage || ''),
        subjectSnapshot: subject,
        model: typeof json.model === 'string' ? json.model : null,
        zendeskTicketId: linkedTicketId,
        updatedAt: new Date().toISOString(),
        linksStripped: Boolean(json.linksStripped),
        degraded: Boolean(json.degraded),
      } as SellerMessagePayload & { linksStripped?: boolean; degraded?: boolean };
    },
    onSuccess: (msg) => {
      qc.setQueryData(sellerMessageKey(receivingId, lineId), msg);
      setDraft(msg.sellerMessage);
      if (msg.linksStripped) {
        toast.warning('Links were removed from the seller message');
      } else if (msg.degraded) {
        toast.success('Seller message generated from template');
      } else {
        toast.success('Seller message generated');
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not generate message'),
  });

  const dirty = data ? draft.trim() !== data.sellerMessage.trim() : draft.trim().length > 0;

  const handleCopy = async () => {
    const text = draft.trim();
    if (!text) return;
    const { ok, messageId } = await copySellerClaimMessageWithPersist({
      text,
      messageId: data?.id ?? null,
      receivingId: entity.receivingId,
      lineId: entity.lineId,
      subjectSnapshot: data?.subjectSnapshot ?? undefined,
    });
    if (messageId != null && data) {
      qc.setQueryData(sellerMessageKey(receivingId, lineId), { ...data, id: messageId });
    }
    if (ok) {
      toast.success(
        messageId != null
          ? `Copied · Seller msg #${messageId} (header clipboard)`
          : 'Copied to clipboard',
      );
    } else {
      toast.error('Could not copy');
    }
  };

  return (
    <Panel radius="xl" padding="none" elevation="md" className="flex max-h-[420px] w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden" role="dialog"
      aria-label="Seller message">
      <header className="flex items-center justify-between gap-2 border-b border-border-hairline inset-field">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare className="h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0">
            <div className="truncate text-role-data font-semibold text-text-default">Seller message</div>
            <div className="truncate text-role-micro text-text-faint">Plain text — no links (marketplace TOS)</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <UniversalLoader isLoading label="Loading seller message" className="min-h-32" />
        ) : isError ? (
          <p className="rounded-md bg-rose-50 px-2 py-1.5 text-role-caption text-rose-600">
            {error instanceof Error ? error.message : 'Could not load message'}
          </p>
        ) : !data && !draft.trim() ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="max-w-[260px] text-sm text-text-faint">
              No seller message yet for this ticket.
            </p>
            <Button
              variant="primary"
              size="sm"
              loading={generate.isPending}
              onClick={() => generate.mutate()}
              icon={<MessageSquare className="h-3.5 w-3.5" />}
            >
              AI generate
            </Button>
          </div>
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className={cn("block w-full resize-y rounded-lg border border-blue-100 bg-surface-card inset-field text-role-data leading-snug text-text-default", focusRing('field', 'accent'))}
            placeholder="Seller-facing message…"
          />
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border-hairline bg-surface-canvas/60 px-3 py-2.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={!draft.trim()}
          onClick={() => void handleCopy()}
          icon={<Copy className="h-3.5 w-3.5" />}
        >
          Copy
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={save.isPending}
          disabled={save.isPending || generate.isPending || !dirty || !draft.trim()}
          onClick={() => save.mutate(draft.trim())}
        >
          Save
        </Button>
      </footer>
    </Panel>
  );
}

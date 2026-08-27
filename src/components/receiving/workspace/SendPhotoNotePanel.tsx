'use client';

/**
 * Send-photos-to-ticket — chrome-free panel body.
 *
 * Forwards photos already captured on THIS purchase order to a Zendesk ticket —
 * either as a private internal note or as a public reply.
 *
 * Hosted by Unbox Displays Photos→Send or {@link SendPhotoNoteRail}.
 */

import { useEffect, useState } from 'react';
import { Button, FlushTerminalFooter, IconButton } from '@/design-system/primitives';
import { X, Send } from '@/components/Icons';
import { toast } from '@/lib/toast';
import {
  DenseComposeBodyBand,
  DenseComposeBodyTextarea,
} from '@/design-system/components';
import { useClaimTicketSearch } from './claim/hooks/useClaimTicketSearch';
import { ClaimTicketPicker } from './claim/components/ClaimTicketPicker';
import { useClaimPhotos } from './claim/hooks/useClaimPhotos';
import { ClaimPhotoPicker } from './claim/components/ClaimPhotoPicker';
import { ClaimRecipientsField } from './claim/components/ClaimRecipientsField';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { LinkCandidate } from './claim/claim-types';

export function SendPhotoNotePanel({
  open,
  row,
  onClose,
  defaultTicket,
  lockTicket = false,
  /**
   * `display` — Unbox Displays Photos→Send: strip + tabs name the verb; omit
   * gray title / PO restatement / X.
   * `modal` — rail / overlay hosts keep the title + close.
   */
  chrome = 'modal',
}: {
  open: boolean;
  row: ReceivingLineRow;
  onClose: () => void;
  defaultTicket?: { id: number; subject?: string | null };
  lockTicket?: boolean;
  chrome?: 'modal' | 'display';
}) {
  const receivingId = row.receiving_id ?? null;
  const search = useClaimTicketSearch({
    open,
    enabled: open && !lockTicket,
    receivingId,
    lineId: null,
  });
  const photos = useClaimPhotos(open, receivingId);
  const [note, setNote] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [ccs, setCcs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setNote('');
      setIsPublic(false);
      setCcs([]);
      search.reset();
      if (defaultTicket) {
        const locked: LinkCandidate = {
          id: defaultTicket.id,
          subject: defaultTicket.subject ?? null,
          description: null,
          status: '',
          priority: null,
          createdAt: '',
          updatedAt: '',
          url: null,
          linkedToThis: true,
        };
        search.setSelectedTicket(locked);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTicket?.id]);

  const selectedTicket = search.selectedTicket;
  const photoCount = photos.selectedPhotoIds.size;
  const canSend = !!selectedTicket && note.trim().length > 0 && !sending;

  const poLabel =
    (row.zoho_purchaseorder_number || '').trim() ||
    (receivingId != null ? `Package #${receivingId}` : 'This package');

  const handleSend = async () => {
    if (!selectedTicket) {
      toast.error('Pick the ticket to send to first');
      return;
    }
    if (!note.trim()) {
      toast.error(isPublic ? 'Add a reply' : 'Add an internal note');
      return;
    }
    setSending(true);
    try {
      const emailCcs = isPublic && ccs.length ? ccs : undefined;
      const fd = new FormData();
      fd.append(
        'meta',
        JSON.stringify({
          mode: 'update',
          ticketId: selectedTicket.id,
          comment: note.trim(),
          isPublic,
          ...(emailCcs ? { emailCcs } : {}),
          photoIds: [...photos.selectedPhotoIds],
        }),
      );
      const res = await fetch('/api/zendesk/photo-ticket', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(data?.error || `Could not send (HTTP ${res.status})`);
        return;
      }
      const photoSuffix = photoCount ? ` · ${photoCount} photos` : '';
      toast.success(
        isPublic
          ? `Reply${photoSuffix} · #${selectedTicket.id}${emailCcs ? ` · ${emailCcs.length} cc` : ''}`
          : `Note${photoSuffix} · #${selectedTicket.id}`,
      );
      onClose();
    } catch {
      toast.error('Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-send-photos-chrome={chrome}>
      {chrome === 'modal' ? (
        <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <div className="min-w-0">
            <p className="text-role-micro uppercase tracking-[0.16em] text-text-soft">
              {lockTicket ? 'Add photos' : 'Send photos'}
            </p>
            <p className="truncate text-xs font-semibold text-text-default">
              {lockTicket && defaultTicket
                ? `#${defaultTicket.id}${defaultTicket.subject ? ` · ${defaultTicket.subject}` : ''}`
                : poLabel}
            </p>
          </div>
          <IconButton
            onClick={onClose}
            ariaLabel="Close"
            icon={<X className="h-4 w-4" />}
            className="rounded p-1 text-text-faint hover:bg-surface-sunken hover:text-text-muted"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-0 py-0 text-role-data">
        {lockTicket && defaultTicket ? (
          <div className="border-b border-border-hairline bg-surface-sunken px-3 py-2.5">
            <p className="text-role-micro uppercase tracking-widest text-text-faint">Ticket</p>
            <p className="text-role-caption font-semibold text-text-default">#{defaultTicket.id}</p>
          </div>
        ) : (
          <div className="border-b border-border-hairline">
            <ClaimTicketPicker search={search} onSelect={search.setSelectedTicket} />
          </div>
        )}

        {/* Photos → Recipients: ClaimRecipientsField owns the next hairline (border-t). */}
        <ClaimPhotoPicker photos={photos} receivingId={receivingId} />

        <div>
          {/* Same flush Recipients instrument as claim compose — do not fork. */}
          <ClaimRecipientsField
            notePublic={isPublic}
            onNotePublicChange={setIsPublic}
            ccEmails={ccs}
            onCcEmailsChange={setCcs}
            publicHint="Public reply — emails customer. Photos attach."
            internalHint="Internal · not emailed"
          />

          <DenseComposeBodyBand>
            <DenseComposeBodyTextarea
              id="photo-note-body"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder={
                isPublic
                  ? 'Reply the customer will receive by email…'
                  : 'Internal note…'
              }
            />
          </DenseComposeBodyBand>
        </div>
      </div>

      {/*
        Macro floor — consequence line sits above the FlushTerminalFooter so
        padding belongs to the text, never to the container holding the CTA.
      */}
      <div className="shrink-0">
        <p className="min-w-0 border-t border-border-hairline px-3 py-2 text-role-micro font-medium text-text-faint">
          {isPublic ? 'Emails customer' : 'Internal · not emailed'}
          {selectedTicket ? ` · #${selectedTicket.id}` : ' · pick a ticket'}
          {isPublic && ccs.length ? ` · ${ccs.length} cc` : ''}
          {photoCount ? ` · ${photoCount} photos` : ''}
        </p>
        <FlushTerminalFooter layout="bleed">
          <Button
            variant="primary"
            size="md"
            icon={<Send />}
            loading={sending}
            onClick={handleSend}
            disabled={!canSend}
            className="w-full justify-center"
          >
            {isPublic ? 'Send' : 'Add note'}
          </Button>
        </FlushTerminalFooter>
      </div>
    </div>
  );
}

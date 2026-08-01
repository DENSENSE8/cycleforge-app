'use client';

/**
 * Send-photos-to-ticket — chrome-free panel body.
 *
 * Forwards photos already captured on THIS purchase order to a Zendesk ticket —
 * either as a private internal note or as a public reply.
 *
 * Hosted by Unbox {@link ReceivingToolPushStack} or {@link SendPhotoNoteRail}.
 */

import { useEffect, useState } from 'react';
import { Button, IconButton } from '@/design-system/primitives';
import { X, Send } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { VisibilityToggle } from '@/components/ui/VisibilityToggle';
import { useClaimTicketSearch } from './claim/hooks/useClaimTicketSearch';
import { ClaimTicketPicker } from './claim/components/ClaimTicketPicker';
import { useClaimPhotos } from './claim/hooks/useClaimPhotos';
import { ClaimPhotoPicker } from './claim/components/ClaimPhotoPicker';
import { CcEmailField } from './claim/components/CcEmailField';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import type { LinkCandidate } from './claim/claim-types';

export function SendPhotoNotePanel({
  open,
  row,
  onClose,
  defaultTicket,
  lockTicket = false,
  hideHeaderClose = false,
}: {
  open: boolean;
  row: ReceivingLineRow;
  onClose: () => void;
  defaultTicket?: { id: number; subject?: string | null };
  lockTicket?: boolean;
  hideHeaderClose?: boolean;
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
      const photoSuffix = photoCount ? ` + ${photoCount} photo${photoCount === 1 ? '' : 's'}` : '';
      toast.success(
        isPublic
          ? `Public reply${photoSuffix} sent to #${selectedTicket.id}${emailCcs ? ` · ${emailCcs.length} cc'd` : ''}`
          : `Internal note${photoSuffix} sent to #${selectedTicket.id}`,
      );
      onClose();
    } catch {
      toast.error('Could not send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
        <div className="min-w-0">
          <p className="text-role-micro uppercase tracking-[0.16em] text-text-soft">
            {lockTicket ? 'Add photos to ticket' : 'Send photos to ticket'}
          </p>
          <p className="truncate text-xs font-semibold text-text-default">
            {lockTicket && defaultTicket
              ? `#${defaultTicket.id}${defaultTicket.subject ? ` · ${defaultTicket.subject}` : ''}`
              : poLabel}
          </p>
        </div>
        {!hideHeaderClose ? (
          <IconButton
            onClick={onClose}
            ariaLabel="Close"
            icon={<X className="h-4 w-4" />}
            className="rounded p-1 text-text-faint hover:bg-surface-sunken hover:text-text-muted"
          />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-role-data">
        {lockTicket && defaultTicket ? (
          <div className="rounded-lg border border-border-soft bg-surface-canvas/60 px-3 py-2">
            <p className="text-role-micro uppercase tracking-widest text-text-faint">Ticket</p>
            <p className="text-role-caption font-semibold text-text-default">#{defaultTicket.id}</p>
          </div>
        ) : (
          <ClaimTicketPicker search={search} onSelect={search.setSelectedTicket} />
        )}

        <ClaimPhotoPicker photos={photos} receivingId={receivingId} />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="photo-note-body"
              className="text-role-micro uppercase tracking-[0.14em] text-text-soft"
            >
              {isPublic ? 'Public reply' : 'Internal note'}
            </label>
            <VisibilityToggle
              value={isPublic}
              onChange={setIsPublic}
              internalLabel="Internal"
              publicLabel="Public + CC"
            />
          </div>

          {isPublic ? (
            <CcEmailField
              emails={ccs}
              onChange={setCcs}
              placeholder="Add vendor / teammate email to CC…"
            />
          ) : null}

          <textarea
            id="photo-note-body"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder={
              isPublic
                ? 'Reply the customer will receive by email…'
                : 'Add an internal note for the team (private — not emailed to the customer)…'
            }
            className={cn(
              'block w-full resize-y rounded-lg border bg-surface-card inset-field text-role-caption font-medium text-text-default outline-none focus:ring-2',
              isPublic
                ? 'border-blue-200 focus:border-blue-500 focus:ring-blue-500/20'
                : 'border-border-soft focus:border-border-emphasis focus:ring-text-soft/20',
            )}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border-soft px-4 py-3">
        <p className="min-w-0 text-role-micro font-medium text-text-faint">
          {isPublic ? 'Emails the customer' : 'Posts as an internal note (private)'}.
          {selectedTicket ? ` → #${selectedTicket.id}` : ' Pick a ticket.'}
          {isPublic && ccs.length ? ` · ${ccs.length} cc` : ''}
          {photoCount ? ` · ${photoCount} photo${photoCount === 1 ? '' : 's'}` : ''}
        </p>
        <Button
          variant="primary"
          size="md"
          icon={<Send />}
          loading={sending}
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0"
        >
          {isPublic ? 'Send reply' : 'Send internal note'}
        </Button>
      </div>
    </div>
  );
}

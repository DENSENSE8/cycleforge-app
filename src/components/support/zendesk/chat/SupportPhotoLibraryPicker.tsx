'use client';

import { useEffect, useState } from 'react';
import type { ClaimPhotoInput } from '@/components/support/zendesk/claim/claim-types';
import { MediaLibraryPickerModal } from '@/components/photos/MediaLibraryPickerModal';
import type { TicketPhotoTarget } from '@/hooks/useTicketPhotoStaging';

interface SupportPhotoLibraryPickerProps {
  /** A helpdesk ticket ("This ticket" tab) or a Support item's primary task ("This support item" tab). */
  target: TicketPhotoTarget;
  receivingId?: number;
  open: boolean;
  onClose: () => void;
  excludePhotoIds?: Set<number>;
  onSelect: (photos: { id: number; url: string; thumbUrl: string; caption?: string | null }[]) => void;
}

/**
 * Browse the internal media library from a ticket or Support-item composer —
 * pick photos to link to the open ticket / item and stage them in the composer.
 */
export function SupportPhotoLibraryPicker({
  target,
  receivingId,
  open,
  onClose,
  excludePhotoIds,
  onSelect,
}: SupportPhotoLibraryPickerProps) {
  const [selected, setSelected] = useState<ClaimPhotoInput[]>([]);
  const ticketId = target.kind === 'ticket' ? target.ticketId : undefined;
  const supportTaskId = target.kind === 'support' ? target.taskId : undefined;

  useEffect(() => {
    if (!open) return;
    setSelected([]);
  }, [open, ticketId, supportTaskId, receivingId]);

  return (
    <MediaLibraryPickerModal
      open={open}
      onClose={onClose}
      ticketId={ticketId}
      supportTaskId={supportTaskId}
      receivingId={receivingId}
      defaultTab={supportTaskId ? 'support' : 'ticket'}
      subtitle={ticketId ? `Link photos · #${ticketId}` : 'Link photos to this support item'}
      selected={selected}
      onSelectedChange={setSelected}
      excludePhotoIds={excludePhotoIds}
      confirmLabel={ticketId ? 'Add to reply' : 'Add to support item'}
      onConfirm={(photos) => {
        onSelect(
          photos.map((p) => ({
            id: p.id,
            url: p.displayUrl ?? p.src,
            thumbUrl: p.src,
            caption: p.caption,
          })),
        );
        onClose();
      }}
    />
  );
}

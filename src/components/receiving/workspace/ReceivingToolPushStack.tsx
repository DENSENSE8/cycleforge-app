'use client';

/**
 * Unbox tool push — station-scoped right-edge **push** column for Move photos,
 * Send photo note, and Audit log.
 *
 * Composes {@link UnboxPushColumn}, the same shell as {@link ReceivingClaimStack} /
 * {@link ReceivingTicketStack}: squeezes the Unbox workbench in-flow, reuses
 * detail-stack surface tokens, resizable, Escape / collapse close. Mutually
 * exclusive with Displays, Claim, Ticket, and `detail:receiving` (wired by
 * LineEditPanel).
 *
 * Trailing gutter is {@link TICKET_PUSH_HOST_PAD_CLASS} on the LineEditPanel
 * host; top/bottom is {@link UnboxPushColumn}'s `my-2`.
 */

import type { ReactNode } from 'react';
import { MovePhotosBetweenPoPanel } from './line-edit/MovePhotosBetweenPoPanel';
import { SendPhotoNotePanel } from './SendPhotoNotePanel';
import { ReceivingAuditPanel } from './ReceivingAuditPanel';
import { UnboxPushColumn } from './UnboxPushColumn';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

const TOOL_PUSH_STORAGE_KEY = 'unbox-tool-push-width';
/** Wider than Ticket so photo pickers stay usable. */
const TOOL_PUSH_MAX_WIDTH_PX = 640;

export type UnboxToolPushId = 'move-photos' | 'photo-note' | 'audit';

const TOOL_ARIA: Record<UnboxToolPushId, string> = {
  'move-photos': 'Move photos between purchase orders',
  'photo-note': 'Send photos to a ticket',
  audit: 'Carton audit log',
};

const TOOL_COLLAPSE: Record<UnboxToolPushId, string> = {
  'move-photos': 'Hide move photos',
  'photo-note': 'Hide photo note',
  audit: 'Hide audit log',
};

export function ReceivingToolPushStack({
  tool,
  row,
  onClose,
}: {
  tool: UnboxToolPushId;
  row: ReceivingLineRow;
  onClose: () => void;
}) {
  let body: ReactNode = null;
  if (tool === 'move-photos') {
    body = (
      <MovePhotosBetweenPoPanel
        key={`move-${row.receiving_id ?? row.id}`}
        open
        receivingId={row.receiving_id}
        onClose={onClose}
        hideHeaderClose
      />
    );
  } else if (tool === 'photo-note') {
    body = (
      <SendPhotoNotePanel
        key={`note-${row.id}`}
        open
        row={row}
        onClose={onClose}
        hideHeaderClose
      />
    );
  } else if (tool === 'audit' && row.receiving_id != null) {
    body = (
      <ReceivingAuditPanel
        key={`audit-${row.receiving_id}`}
        open
        receivingId={row.receiving_id}
        onClose={onClose}
        hideHeaderClose
      />
    );
  }

  return (
    <UnboxPushColumn
      ariaLabel={TOOL_ARIA[tool]}
      testId="receiving-tool-push"
      dataTool={tool}
      storageKey={TOOL_PUSH_STORAGE_KEY}
      maxWidthPx={TOOL_PUSH_MAX_WIDTH_PX}
      resizeLabel="Resize tool panel"
      resizeTestId="unbox-tool-push-resize"
      resizeTooltip="Drag to resize panel · double-click for default"
      collapseLabel={TOOL_COLLAPSE[tool]}
      onClose={onClose}
    >
      {body}
    </UnboxPushColumn>
  );
}

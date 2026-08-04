'use client';

/**
 * Unbox Ticket — station-scoped right-edge **push** column.
 *
 * Composes {@link UnboxPushColumn} (the shared push shell): squeezes the Unbox
 * workbench when open (in-flow), while reusing flush detail-stack push surface
 * tokens. Not a `RightRailHost` occupant — More details keeps the float host;
 * Ticket and details stay mutually exclusive via `?ticketView=1` /
 * close-details events.
 *
 * Opened via carton Reply / `?ticketView=1`. Dismiss via the column `→|`.
 * No parked expand strip — reopen from carton identity; Displays opens from the
 * dock-anchored progress ring.
 *
 * **Flush planes (ruled 2026-08-03):** no host trailing `pr-2` island — push is
 * a flush sibling of the sunken center.
 */

import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { UnboxPushColumn } from './UnboxPushColumn';

const TICKET_PUSH_STORAGE_KEY = 'unbox-ticket-push-width';
/**
 * Absolute ceiling for the Ticket chat column — same order as the detail-stack
 * inspector at laptop widths (~480). Viewport pad still wins on narrow screens.
 */
const TICKET_PUSH_MAX_WIDTH_PX = 480;

/**
 * Host trailing padding while a push column is mounted.
 *
 * Empty since flush planes (2026-08-03) — was `pr-2` island gutter. Kept as a
 * named export so LineEditPanel / Claim / Displays / Tool still compose one
 * host pad token (now a no-op). Never `py-*`.
 */
export const TICKET_PUSH_HOST_PAD_CLASS = '';

export function ReceivingTicketStack({
  ticketId,
  receivingId,
  onClose,
}: {
  ticketId: number;
  receivingId?: number;
  onClose: () => void;
}) {
  return (
    <UnboxPushColumn
      ariaLabel={`Support ticket ${ticketId}`}
      testId="receiving-ticket-push"
      storageKey={TICKET_PUSH_STORAGE_KEY}
      maxWidthPx={TICKET_PUSH_MAX_WIDTH_PX}
      resizeLabel="Resize ticket panel"
      resizeTestId="unbox-ticket-push-resize"
      resizeTooltip="Drag to resize ticket · double-click for default"
      onClose={onClose}
    >
      <SupportTicketDetail
        ticketId={ticketId}
        onBack={onClose}
        receivingId={receivingId}
        embedded
        hideRequesterBand={false}
      />
    </UnboxPushColumn>
  );
}

'use client';

/**
 * Unbox Ticket — station-scoped right-edge **push** column.
 *
 * Composes {@link UnboxPushColumn} (the shared push shell): squeezes the Unbox
 * workbench when open (in-flow), while reusing the same rounded detail-stack
 * surface tokens as receiving More details. Not a `RightRailHost` occupant —
 * More details keeps the float host; Ticket and details stay mutually exclusive
 * via `?ticketView=1` / close-details events.
 *
 * Opened via carton Reply / `?ticketView=1` / {@link ReceivingTicketExpandControl}.
 * Dismiss via the leading-edge collapse chevron (same grammar as the receiving
 * context rail). Closed + linked → in-flow expand strip restores it
 * ({@link CONTEXT_PANEL_COLLAPSE_STRIP_CLASS} twin).
 *
 * **Gutter:** the LineEditPanel host applies `py-2 pr-2` while Ticket chrome is
 * mounted — padding, not child margin. Parent `overflow-hidden` clips trailing
 * child margins (the card looked flush); padding sits inside the clip box.
 */

import { ChevronLeft } from '@/components/Icons';
import { CONTEXT_PANEL_COLLAPSE_STRIP_CLASS } from '@/components/sidebar/context-panel-column';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { cn } from '@/utils/_cn';
import { UnboxPushColumn } from './UnboxPushColumn';

const TICKET_PUSH_STORAGE_KEY = 'unbox-ticket-push-width';
/**
 * Absolute ceiling for the Ticket chat column — same order as the detail-stack
 * inspector at laptop widths (~480). Viewport pad still wins on narrow screens.
 */
const TICKET_PUSH_MAX_WIDTH_PX = 480;

/**
 * Host padding while a push column / expand strip is mounted.
 * Must be padding on the overflow-hidden flex host — not margin on the push
 * column (trailing margins are clipped). Same 8px as context-panel `m-2`.
 */
export const TICKET_PUSH_HOST_PAD_CLASS = 'py-2 pr-2';

/**
 * Right-edge strip the Unbox host parks when no push column is open — the same
 * in-flow recipe as the receiving recent-rail expand
 * ({@link CONTEXT_PANEL_COLLAPSE_STRIP_CLASS}). Host already applies
 * {@link TICKET_PUSH_HOST_PAD_CLASS}, so strip margin is zeroed to avoid
 * double-inset. Holds the Displays toggle and, when a linked ticket is parked,
 * the ticket restore beneath it.
 */
export function ReceivingPushExpandStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(CONTEXT_PANEL_COLLAPSE_STRIP_CLASS, 'm-0 gap-1.5')}
      data-testid="unbox-push-expand-strip"
    >
      {children}
    </div>
  );
}

/** Restore control for a linked ticket whose push column is closed. */
export function ReceivingTicketExpandControl({ onExpand }: { onExpand: () => void }) {
  return (
    <HoverTooltip label="Show ticket" asChild>
      <IconButton
        size="sm"
        tone="neutral"
        ariaLabel="Show ticket"
        icon={<ChevronLeft className="h-4 w-4" />}
        onClick={onExpand}
        data-testid="ticket-push-expand-button"
      />
    </HoverTooltip>
  );
}

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
      collapseLabel="Hide ticket"
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

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
 * **Gutter:** trailing edge is host padding (`pr-2` via
 * {@link TICKET_PUSH_HOST_PAD_CLASS}) — parent `overflow-hidden` clips trailing
 * child margins. Top/bottom is {@link CONTEXT_PANEL_OUTER_MARGIN_Y} on the push
 * column (see {@link UnboxPushColumn}) so the Unbox identity bookmark stays at
 * {@link STATION_BOOKMARK_CANVAS_INSET_TOP} and keeps sharing an edge with the
 * left context-panel card.
 */

import { ChevronLeft } from '@/components/Icons';
import {
  CONTEXT_PANEL_COLLAPSE_STRIP_CLASS,
  CONTEXT_PANEL_OUTER_MARGIN_Y,
} from '@/components/sidebar/context-panel-column';
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
 * Host trailing padding while a push column / expand strip is mounted.
 *
 * **Right only (`pr-2`).** Never `py-2`: vertical host padding would push the
 * in-flow Unbox column down, and {@link StationContextBar}'s absolute `top-2`
 * would stack on top of that inset — 16px vs the context panel's `m-2` (8px),
 * which is the sidebar / carton-context misalignment. Top/bottom gutter lives
 * on the push column / expand strip ({@link CONTEXT_PANEL_OUTER_MARGIN_Y}).
 * Trailing must stay host padding because `overflow-hidden` clips child `mr-*`.
 */
export const TICKET_PUSH_HOST_PAD_CLASS = 'pr-2';

/**
 * Right-edge strip the Unbox host parks when a linked ticket is closed and no
 * push column owns the edge — the same in-flow recipe as the receiving
 * recent-rail expand ({@link CONTEXT_PANEL_COLLAPSE_STRIP_CLASS}). Host owns
 * trailing padding only, so this strip keeps
 * {@link CONTEXT_PANEL_OUTER_MARGIN_Y} (top edge with the context panel) and
 * zeros horizontal margin to avoid double-inset with
 * {@link TICKET_PUSH_HOST_PAD_CLASS}. Displays toggles from the pane-anchored
 * progress ring; this strip only restores the ticket.
 */
export function ReceivingPushExpandStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        CONTEXT_PANEL_COLLAPSE_STRIP_CLASS,
        'mx-0',
        CONTEXT_PANEL_OUTER_MARGIN_Y,
        'gap-1.5',
      )}
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

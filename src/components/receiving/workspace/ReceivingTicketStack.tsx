'use client';

/**
 * Unbox Ticket — station-scoped right-edge **push** column.
 *
 * Squeezes the Unbox workbench when open (in-flow), while reusing the same
 * rounded detail-stack surface tokens as receiving More details. Not a
 * `RightRailHost` occupant — More details keeps the float host; Ticket and
 * details stay mutually exclusive via `?ticketView=1` / close-details events.
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

import { useEffect, useState } from 'react';
import { ChevronLeft } from '@/components/Icons';
import { CONTEXT_PANEL_COLLAPSE_STRIP_CLASS } from '@/components/sidebar/context-panel-column';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useEscapeClose, useHorizontalEdgeResize } from '@/design-system/hooks';
import {
  DETAIL_STACK_ASIDE_SURFACE,
  DETAIL_STACK_RESIZE,
} from '@/design-system/shells/detail-stack';
import { IconButton } from '@/design-system/primitives';
import { zIndex } from '@/design-system/tokens/z-index';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { cn } from '@/utils/_cn';

const TICKET_PUSH_STORAGE_KEY = 'unbox-ticket-push-width';
/** Below this viewport width, Ticket overlays instead of crushing Unbox. */
const NARROW_PUSH_MQ = '(max-width: 1023px)';
/** Leave at least this many px of Unbox canvas when resizing the push column. */
const UNBOX_PUSH_MAX_WIDTH_PAD = 420;
/**
 * Absolute ceiling for the Ticket chat column — same order as the detail-stack
 * inspector at laptop widths (~480). Viewport pad still wins on narrow screens.
 */
const TICKET_PUSH_MAX_WIDTH_PX = 480;

/**
 * Host padding while Ticket push / expand strip is mounted.
 * Must be padding on the overflow-hidden flex host — not margin on the push
 * column (trailing margins are clipped). Same 8px as context-panel `m-2`.
 */
export const TICKET_PUSH_HOST_PAD_CLASS = 'py-2 pr-2';

/**
 * Top-right restore control when a linked ticket’s push column is closed —
 * same in-flow strip recipe as the receiving recent-rail expand
 * ({@link CONTEXT_PANEL_COLLAPSE_STRIP_CLASS}). Host already applies
 * {@link TICKET_PUSH_HOST_PAD_CLASS}, so strip margin is zeroed to avoid
 * double-inset.
 */
export function ReceivingTicketExpandControl({ onExpand }: { onExpand: () => void }) {
  return (
    <div
      className={cn(CONTEXT_PANEL_COLLAPSE_STRIP_CLASS, 'm-0')}
      data-testid="ticket-push-expand"
    >
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
    </div>
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
  useEscapeClose(true, onClose);

  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: TICKET_PUSH_STORAGE_KEY,
    defaultWidth: DETAIL_STACK_RESIZE.defaultWidthPx,
    minWidth: DETAIL_STACK_RESIZE.minWidthPx,
    maxWidthPad: UNBOX_PUSH_MAX_WIDTH_PAD,
    maxWidth: TICKET_PUSH_MAX_WIDTH_PX,
    enabled: true,
    edge: 'leading',
    label: 'Resize ticket panel',
    testId: 'unbox-ticket-push-resize',
  });

  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_PUSH_MQ);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <aside
      role="region"
      aria-label={`Support ticket ${ticketId}`}
      data-testid="receiving-ticket-push"
      className={cn(
        'relative h-full min-h-0 shrink-0 overflow-visible',
        // Narrow: overlay the Unbox column but stay inside host padding
        // (host owns `pr-2` / `py-2` — never `right-0` flush).
        narrow && 'absolute inset-y-0 right-0',
      )}
      style={{
        width,
        ...(narrow ? { zIndex: zIndex.panel } : null),
      }}
    >
      <HorizontalEdgeResizeHandle
        edgeHandleProps={edgeHandleProps}
        isDragging={isDragging}
        edge="leading"
        placement="outset"
        tooltipLabel="Drag to resize ticket · double-click for default"
        onCollapse={onClose}
        collapseLabel="Hide ticket"
      />
      <div className={cn(DETAIL_STACK_ASIDE_SURFACE, 'h-full min-h-0')}>
        <SupportTicketDetail
          ticketId={ticketId}
          onBack={onClose}
          receivingId={receivingId}
          embedded
          hideRequesterBand={false}
        />
      </div>
    </aside>
  );
}

'use client';

/**
 * Unbox Ticket — station-scoped right-edge **push** column.
 *
 * Squeezes the Unbox workbench when open (in-flow), while reusing the same
 * rounded detail-stack surface tokens as receiving More details. Not a
 * `RightRailHost` occupant — More details keeps the float host; Ticket and
 * details stay mutually exclusive via `?ticketView=1` / close-details events.
 *
 * Opened via carton Reply / `?ticketView=1`.
 */

import { useEffect, useState } from 'react';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useEscapeClose, useHorizontalEdgeResize } from '@/design-system/hooks';
import {
  DETAIL_STACK_ASIDE_SURFACE,
  DETAIL_STACK_LAYOUT,
  DETAIL_STACK_RESIZE,
} from '@/design-system/shells/detail-stack';
import { zIndex } from '@/design-system/tokens/z-index';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { cn } from '@/utils/_cn';

const TICKET_PUSH_STORAGE_KEY = 'unbox-ticket-push-width';
/** Below this viewport width, Ticket overlays instead of crushing Unbox. */
const NARROW_PUSH_MQ = '(max-width: 1023px)';
/** Leave at least this many px of Unbox canvas when resizing the push column. */
const UNBOX_PUSH_MAX_WIDTH_PAD = 420;

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

  const inset = DETAIL_STACK_LAYOUT.insetPx;

  return (
    <aside
      role="region"
      aria-label={`Support ticket ${ticketId}`}
      data-testid="receiving-ticket-push"
      className={cn(
        'relative shrink-0 overflow-visible',
        narrow && 'absolute inset-y-0 right-0',
      )}
      style={{
        width,
        marginTop: inset,
        marginRight: inset,
        marginBottom: inset,
        ...(narrow ? { zIndex: zIndex.panel } : null),
      }}
    >
      <HorizontalEdgeResizeHandle
        edgeHandleProps={edgeHandleProps}
        isDragging={isDragging}
        edge="leading"
        placement="outset"
        tooltipLabel="Drag to resize ticket · double-click for default"
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

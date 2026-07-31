'use client';

/**
 * Unbox Claim — station-scoped right-edge **push** column.
 *
 * Same host grammar as {@link ReceivingTicketStack}: squeezes the Unbox
 * workbench in-flow, reuses detail-stack surface tokens, resizable, Escape /
 * collapse close. Mutually exclusive with Ticket (`?ticketView=1`) and
 * receiving More details (`detail:receiving`) via URL + close-details events.
 *
 * Gutter is {@link TICKET_PUSH_HOST_PAD_CLASS} on the LineEditPanel host —
 * not margin on this aside (overflow-hidden clips trailing margins).
 *
 * Opened via Make claim / Link ticket / `?claimView=1`.
 */

import { useEffect, useState } from 'react';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useEscapeClose, useHorizontalEdgeResize } from '@/design-system/hooks';
import {
  DETAIL_STACK_ASIDE_SURFACE,
  DETAIL_STACK_RESIZE,
} from '@/design-system/shells/detail-stack';
import { zIndex } from '@/design-system/tokens/z-index';
import type { ClaimModalProps } from './claim/hooks/useReceivingClaimController';
import { ReceivingClaimPanel } from './ReceivingClaimPanel';
import { cn } from '@/utils/_cn';

const CLAIM_PUSH_STORAGE_KEY = 'unbox-claim-push-width';
/** Below this viewport width, Claim overlays instead of crushing Unbox. */
const NARROW_PUSH_MQ = '(max-width: 1023px)';
/** Leave at least this many px of Unbox canvas when resizing the push column. */
const UNBOX_PUSH_MAX_WIDTH_PAD = 420;
/**
 * Absolute ceiling for the claim wizard column — slightly wider than Ticket
 * chat (480) so photos/compose stay usable.
 */
const CLAIM_PUSH_MAX_WIDTH_PX = 560;

type ReceivingClaimStackProps = Omit<ClaimModalProps, 'open'> & {
  onClose: () => void;
};

export function ReceivingClaimStack({ onClose, ...panelProps }: ReceivingClaimStackProps) {
  useEscapeClose(true, onClose);

  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: CLAIM_PUSH_STORAGE_KEY,
    defaultWidth: DETAIL_STACK_RESIZE.defaultWidthPx,
    minWidth: DETAIL_STACK_RESIZE.minWidthPx,
    maxWidthPad: UNBOX_PUSH_MAX_WIDTH_PAD,
    maxWidth: CLAIM_PUSH_MAX_WIDTH_PX,
    enabled: true,
    edge: 'leading',
    label: 'Resize claim panel',
    testId: 'unbox-claim-push-resize',
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
      aria-label="File a claim"
      data-testid="receiving-claim-push"
      className={cn(
        'relative h-full min-h-0 shrink-0 overflow-visible',
        // Host owns `pr-2` / `py-2` — never pin flush with `right-0` alone.
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
        tooltipLabel="Drag to resize claim · double-click for default"
        onCollapse={onClose}
        collapseLabel="Hide claim"
      />
      <div className={cn(DETAIL_STACK_ASIDE_SURFACE, 'h-full min-h-0')}>
        <ReceivingClaimPanel {...panelProps} open onClose={onClose} />
      </div>
    </aside>
  );
}

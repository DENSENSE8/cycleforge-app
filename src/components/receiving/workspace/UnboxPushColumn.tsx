'use client';

/**
 * Unbox right-edge **push** column — the shared shell for every station-scoped
 * secondary surface that squeezes the Unbox workbench in-flow.
 *
 * Consumers: {@link ReceivingDisplaysPushStack} (the section displays),
 * {@link ReceivingTicketStack}, {@link ReceivingClaimStack},
 * {@link ReceivingToolPushStack}. All four are mutually exclusive — LineEditPanel
 * wires the exclusion (see `unbox-right-edge.ts`).
 *
 * These are **not** `RightRailHost` occupants: receiving More details keeps the
 * float host (`detail:receiving`), and the store stays single-slot. This column
 * only reuses detail-stack SURFACE tokens.
 *
 * WHY A SHELL: the aside + leading resize grip + narrow-viewport overlay +
 * Escape close was copy-pasted three times before the displays column landed.
 * A fourth copy is the page-local fork `pattern-evolution.md` bans, so the
 * geometry lives here once and each surface supplies only its own knobs.
 *
 * **Gutter is host padding** ({@link TICKET_PUSH_HOST_PAD_CLASS} on the
 * LineEditPanel flex host) — never margin on this aside, because the host's
 * `overflow-hidden` clips trailing child margins.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useEscapeClose, useHorizontalEdgeResize } from '@/design-system/hooks';
import {
  DETAIL_STACK_ASIDE_SURFACE,
  DETAIL_STACK_RESIZE,
} from '@/design-system/shells/detail-stack';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';

/** Below this viewport width, the push column overlays instead of crushing Unbox. */
const NARROW_PUSH_MQ = '(max-width: 1023px)';
/** Leave at least this many px of Unbox canvas when resizing the push column. */
const UNBOX_PUSH_MAX_WIDTH_PAD = 420;

export function UnboxPushColumn({
  ariaLabel,
  testId,
  dataTool,
  storageKey,
  maxWidthPx,
  resizeLabel,
  resizeTestId,
  resizeTooltip,
  collapseLabel,
  onClose,
  children,
}: {
  ariaLabel: string;
  testId: string;
  /** Optional `data-tool` discriminator (tool push). */
  dataTool?: string;
  /** Per-surface width preference key. */
  storageKey: string;
  /** Absolute ceiling for this surface's column. Viewport pad still wins. */
  maxWidthPx: number;
  resizeLabel: string;
  resizeTestId: string;
  resizeTooltip: string;
  collapseLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscapeClose(true, onClose);

  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey,
    defaultWidth: DETAIL_STACK_RESIZE.defaultWidthPx,
    minWidth: DETAIL_STACK_RESIZE.minWidthPx,
    maxWidthPad: UNBOX_PUSH_MAX_WIDTH_PAD,
    maxWidth: maxWidthPx,
    enabled: true,
    edge: 'leading',
    label: resizeLabel,
    testId: resizeTestId,
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
      aria-label={ariaLabel}
      data-testid={testId}
      {...(dataTool ? { 'data-tool': dataTool } : null)}
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
        tooltipLabel={resizeTooltip}
        onCollapse={onClose}
        collapseLabel={collapseLabel}
      />
      <div className={cn(DETAIL_STACK_ASIDE_SURFACE, 'h-full min-h-0')}>{children}</div>
    </aside>
  );
}

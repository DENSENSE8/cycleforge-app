'use client';

/**
 * RecordPaneHeader — the ONE header for every order-record surface: the
 * non-modal right-rail inspector, the legacy tabbed slide-over, and the
 * full-page order view (`/o/[id]`).
 *
 * It replaces `ShippedDetailsHeader` (`shipped/details-panel/`) and
 * `OrderIdentityHeader` (this folder), which rendered the same identity band
 * and the same action bar and diverged only in whether a tab strip followed.
 * `ShippedDetailsPanel` picked between them on `isOrderRecord`, so every change
 * to the header grammar had to be made twice — and twice is how one of them
 * came to *swallow* `onClose` behind a stale comment while the other never had
 * one at all. Tabs are now a `tabs` slot, not a second component.
 *
 * ## Layout — the SoT panel-header grammar
 *
 * `source-of-truth.md` → Right-rail modality → **Panel header grammar**, and
 * `display/right-rail-inspector.md`:
 *
 * ```text
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Row 1 — icon action row                                     │
 * │ [ ⧉ ⚑ 🖨 … ]                        [ 3 / 47 ] [↑] [↓] [✕]  │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Row 2 — dense identity                                      │
 * │ [▣]  ORDER #                                                │
 * │      1071-4471   [Shipped] [eBay]                           │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Row 3 — optional tabs (legacy tabbed contexts only)         │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * Two things this fixes that the split rows could not:
 *
 * - **`up · down · close` is ONE right-aligned cluster**, owned by
 *   `PaneHeaderActionBar` (which now takes `onClose`). Before, prev/next sat in
 *   the action row and close sat in the `rightSlot` of the row *above* it —
 *   two halves of one cluster, on two rows, maintained separately.
 * - **Open-full-page is an ACTION, not a second control.** It used to be a lone
 *   `IconButton` beside close, which is the "labelled/loose button block that
 *   duplicates the icon row" the grammar bans. It is now just another entry in
 *   the contextual action set, appended by this component so no call site has
 *   to remember the icon.
 *
 * Identity stays DENSE — `PaneHeaderLabel` with a short durable key (the order
 * id). Product titles and listing sentences belong in the scroll body; a
 * wrapping hero title in a rail header is the regression
 * `right-rail-inspector.md` exists to prevent.
 */

import type { ReactNode } from 'react';
import { ExternalLink, Package } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  PaneHeader,
  PaneHeaderActionBar,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderStatusPill,
  CursorPositionReadout,
  type PaneHeaderActionBarAction,
} from '@/components/ui/pane-header';
import type { StatusTone as HeaderStatusTone } from '@/components/shipped/details-panel/shipped-details-logic';
import {
  getOrderPlatformBorderColor,
  getOrderPlatformColor,
} from '@/utils/order-platform';
import { cn } from '@/utils/_cn';

type PillTone = 'neutral' | 'blue' | 'emerald' | 'amber' | 'yellow' | 'rose' | 'red' | 'purple';

function toPillTone(tone: HeaderStatusTone): PillTone {
  if (tone === 'emerald') return 'emerald';
  if (tone === 'red') return 'red';
  return 'yellow';
}

interface RecordPaneHeaderProps {
  orderIdDisplay: string;
  showExceptionsFallback?: boolean;
  /** Identity pills — omitted by the legacy tabbed contexts, which show status in the body. */
  statusLabel?: string;
  statusTone?: HeaderStatusTone;
  platformLabel?: string;
  copiedOrderId: boolean;
  onCopyOrderId: () => void;
  /** Contextual action set for THIS occupant — never hardcoded in the shell. */
  actions: PaneHeaderActionBarAction[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /**
   * Ends-of-list state, from the record cursor. Left undefined by a host with no
   * published cursor, which keeps the always-enabled chevrons for the surfaces
   * still on the legacy event bridge (station / packer).
   */
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  /**
   * 1-based position + length of the published cursor. `null` / omitted → the
   * readout is not rendered at all (honest absence): a panel opened from search
   * has no queue behind it, and a bare "1 / 1" would claim one.
   */
  position?: number | null;
  total?: number;
  /** Appends the open-full-page action. Omitted → no such action (already on `/o/[id]`). */
  onOpenFullPage?: () => void;
  /** Dismiss — renders as the last item of the `up · down · close` cluster. */
  onClose?: () => void;
  /** Optional third row (the legacy section tab strip). Omitted → two rows. */
  tabs?: ReactNode;
  /** Tighter horizontal gutter for the compact slide-over. */
  compact?: boolean;
}

export function RecordPaneHeader({
  orderIdDisplay,
  showExceptionsFallback = false,
  statusLabel,
  statusTone = 'yellow',
  platformLabel,
  copiedOrderId,
  onCopyOrderId,
  actions,
  onMoveUp,
  onMoveDown,
  prevDisabled,
  nextDisabled,
  position,
  total,
  onOpenFullPage,
  onClose,
  tabs,
  compact = false,
}: RecordPaneHeaderProps) {
  const gutter = compact ? 'px-4' : 'px-5';
  const platform = String(platformLabel || '').trim();

  const rowActions: PaneHeaderActionBarAction[] = onOpenFullPage
    ? [
        ...actions,
        {
          key: 'open-full-page',
          label: 'Open full order page',
          icon: <ExternalLink className="h-4 w-4" />,
          onClick: onOpenFullPage,
        },
      ]
    : actions;

  return (
    <PaneHeader
      className="shrink-0 border-b-0 bg-surface-card/90 backdrop-blur-xl"
      rowClassName={gutter}
      // Row 1 spans the full width so the bar's own spacer can push the
      // trailing cluster to the far edge. `PaneHeader`'s `rightSlot` is
      // deliberately unused — putting half the cluster there is the split this
      // component exists to close.
      leftSlot={
        <PaneHeaderActionBar
          iconOnly
          variant="flat"
          className="w-full px-0 py-0"
          actions={rowActions}
          onPrev={onMoveUp}
          onNext={onMoveDown}
          prevDisabled={prevDisabled}
          nextDisabled={nextDisabled}
          rightSlot={<CursorPositionReadout position={position} total={total} />}
          prevTitle="Move up a row"
          nextTitle="Move down a row"
          onClose={onClose}
          closeTitle="Close order details"
        />
      }
      belowSlot={
        <>
          <div className={cn(gutter, 'flex items-center gap-2 pb-2')}>
            <PaneHeaderIconBadge Icon={Package} bg="bg-blue-600" tint="text-white" />
            <div className="flex min-w-0 flex-col gap-1">
              <PaneHeaderLabel
                eyebrow={showExceptionsFallback ? 'Exceptions' : 'Order #'}
                value={
                  <HoverTooltip label={copiedOrderId ? 'Copied' : 'Click to copy'} asChild>
                    {/* ds-raw-button: text-left inline value (click-to-copy order id), not a styled CTA */}
                    <button
                      type="button"
                      onClick={onCopyOrderId}
                      className="truncate text-left transition-colors hover:text-blue-700"
                      aria-label={`Copy ${orderIdDisplay}`}
                    >
                      {orderIdDisplay}
                      {copiedOrderId ? <span className="ml-1 text-text-success">✓</span> : null}
                    </button>
                  </HoverTooltip>
                }
                valueTitle={orderIdDisplay}
              />
              {statusLabel || platform ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {statusLabel ? (
                    <PaneHeaderStatusPill tone={toPillTone(statusTone)}>
                      {statusLabel}
                    </PaneHeaderStatusPill>
                  ) : null}
                  {platform ? (
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-role-micro font-semibold uppercase tracking-widest',
                        getOrderPlatformColor(platform),
                        getOrderPlatformBorderColor(platform),
                      )}
                    >
                      {platform}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          {tabs}
        </>
      }
    />
  );
}

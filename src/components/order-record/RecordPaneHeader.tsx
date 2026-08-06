'use client';

/**
 * RecordPaneHeader — the ONE header grammar for order surfaces: desk inspector,
 * search feedback, and the full-page durable record (`/o/[id]`).
 *
 * It replaces `ShippedDetailsHeader` (`shipped/details-panel/`) and
 * `OrderIdentityHeader` (this folder). Legacy section tabs are a `tabs` slot
 * after identity — the desk panel and search feedback pass a strip; `/o` does not.
 *
 * ## Layout — the SoT panel-header grammar
 *
 * `source-of-truth.md` → Right-rail modality → **Panel header grammar**, and
 * `display/right-rail-inspector.md`:
 *
 * ```text
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Row 1 — chrome ONLY (omit when no close and no ↑↓)          │
 * │ [→|] ……………………………… [ 3 / 47 ] [ ↑ ] [ ↓ ]                 │
 * │ DeskRailChromeRow — close top-left; cursor + ↑↓ trailing    │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Row 2 — contextual icons / topic tabs ONLY                  │
 * │ [ contextual icons … ]                                      │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Row 3 — dense identity                                      │
 * │ [▣]  ORDER #                                                │
 * │      1071-4471   [Shipped] [eBay]                           │
 * │ optional legacy section tabs                                │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * - **Close is always top-left** via {@link DeskRailChromeRow} (Unbox twin).
 *   Counter + ↑↓ stay on the trailing edge. Never mix chrome props onto the
 *   contextual ActionBar.
 * - **Open-full-page is an ACTION on Row 2**, not a second control beside close.
 *   It is appended here so no call site has to remember the icon.
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
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import type { StatusTone as HeaderStatusTone } from '@/components/shipped/details-panel/shipped-details-logic';
import {
  getOrderPlatformBorderColor,
  getOrderPlatformColor,
} from '@/utils/order-platform';
import { formatPlatformTooltipLabel } from '@/lib/source-platform';
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
  /** Dismiss — chrome Row 1, top-left `→|` via DeskRailChromeRow. */
  onClose?: () => void;
  /** Optional legacy section tab strip after identity. */
  tabs?: ReactNode;
  /**
   * Row-2 trailing View topics (sheet layout / refine) — sits after contextual
   * action icons, matching Unbox History’s View cluster on the topics row.
   */
  viewTopics?: ReactNode;
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
  viewTopics,
  compact = false,
}: RecordPaneHeaderProps) {
  const gutter = compact ? 'px-4' : 'px-5';
  const platform = String(platformLabel || '').trim();
  const identityTooltip = formatPlatformTooltipLabel(orderIdDisplay, platform);
  const showChrome = Boolean(onClose || onMoveUp || onMoveDown);

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

  const contextBar =
    rowActions.length > 0 ? (
      <PaneHeaderActionBar
        iconOnly
        variant="flat"
        className="w-full px-0 py-0"
        actions={rowActions}
      />
    ) : null;

  const topicsRow =
    showChrome && (contextBar || viewTopics) ? (
      viewTopics ? (
        <div
          className={cn(
            gutter,
            'flex h-9 min-w-0 items-center gap-2 border-t border-border-hairline',
          )}
          role="toolbar"
          aria-label="Order topics"
        >
          {contextBar ? (
            <div className="min-w-0 flex-1 overflow-x-auto">{contextBar}</div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {viewTopics}
        </div>
      ) : (
        <div className={cn(gutter, 'pb-1')}>{contextBar}</div>
      )
    ) : null;

  return (
    <PaneHeader
      className="shrink-0 border-b-0 bg-surface-card/90 backdrop-blur-xl"
      rowClassName="px-0"
      // Chrome Row 1 is DeskRailChromeRow (full bleed optical pl-2). Identity /
      // topics keep the compact/desk gutter below.
      leftSlot={
        showChrome ? (
          <DeskRailChromeRow
            onClose={onClose}
            closeTitle="Hide right panel"
            onPrev={onMoveUp}
            onNext={onMoveDown}
            prevDisabled={prevDisabled}
            nextDisabled={nextDisabled}
            prevTitle="Move up a row"
            nextTitle="Move down a row"
            cursor={<CursorPositionReadout position={position} total={total} />}
          />
        ) : (
          contextBar
        )
      }
      belowSlot={
        <>
          {topicsRow}
          <div className={cn(gutter, 'flex items-center gap-2 pb-2')}>
            <PaneHeaderIconBadge Icon={Package} bg="bg-blue-600" tint="text-white" />
            <div className="flex min-w-0 flex-col gap-1">
              <PaneHeaderLabel
                eyebrow={showExceptionsFallback ? 'Exceptions' : 'Order #'}
                value={
                  <HoverTooltip
                    label={copiedOrderId ? `Copied ${identityTooltip}` : identityTooltip}
                    asChild
                  >
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
                valueTitle={identityTooltip}
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

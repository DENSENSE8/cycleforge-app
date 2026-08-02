'use client';

/**
 * OrderIdentityHeader — the single identity band for order-record surfaces.
 *
 * Order # (click-to-copy) + status + platform live here once. Body cards must
 * not reprint them (see order-record redesign: one identity band).
 */

import { ExternalLink, Package } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  PaneHeader,
  PaneHeaderActionBar,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderStatusPill,
  type PaneHeaderActionBarAction,
  PaneHeaderCloseButton,
  CursorPositionReadout,
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

export function OrderIdentityHeader({
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
  compact = false,
}: {
  orderIdDisplay: string;
  showExceptionsFallback?: boolean;
  statusLabel?: string;
  statusTone?: HeaderStatusTone;
  platformLabel?: string;
  copiedOrderId: boolean;
  onCopyOrderId: () => void;
  actions: PaneHeaderActionBarAction[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /**
   * Ends-of-list state, from the record cursor. Undefined when no surface
   * publishes one — the chevrons then keep today's always-enabled legacy
   * behaviour rather than rendering as permanently dead.
   */
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  /** 1-based position + length of the published cursor; omitted → no readout. */
  position?: number | null;
  total?: number;
  onOpenFullPage?: () => void;
  /** Dismiss control for the non-modal rail — renders the X at the top right. */
  onClose?: () => void;
  /** Tighter horizontal padding for the compact slide-over. */
  compact?: boolean;
}) {
  const gutter = compact ? 'px-4' : 'px-5';
  const platform = String(platformLabel || '').trim();

  return (
    <PaneHeader
      className="shrink-0 border-b-0 bg-surface-card/90 backdrop-blur-xl"
      rowClassName={gutter}
      leftSlot={
        <>
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
            {(statusLabel || platform) ? (
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
        </>
      }
      rightSlot={
        onOpenFullPage || onClose ? (
          <div className="flex items-center gap-1">
            {onOpenFullPage ? (
              <HoverTooltip label="Open full order page" asChild>
                <IconButton
                  icon={<ExternalLink className="h-4 w-4" />}
                  onClick={onOpenFullPage}
                  ariaLabel="Open full order page"
                  className="rounded-md p-1.5 hover:bg-surface-sunken"
                />
              </HoverTooltip>
            ) : null}
            {/* A non-modal panel owns an explicit close in its own header —
                there is no scrim to click off. This header shipped without one,
                so the only dismissals were Escape and un-checking the row.
                SoT: source-of-truth.md → Right-rail modality. */}
            {onClose ? <PaneHeaderCloseButton onClick={onClose} /> : null}
          </div>
        ) : undefined
      }
      belowSlot={
        <div className={cn(gutter, 'py-1.5')}>
          <PaneHeaderActionBar
            iconOnly
            variant="card"
            actions={actions}
            onPrev={onMoveUp}
            onNext={onMoveDown}
            prevDisabled={prevDisabled}
            nextDisabled={nextDisabled}
            rightSlot={<CursorPositionReadout position={position} total={total} />}
            prevTitle="Move up a row"
            nextTitle="Move down a row"
          />
        </div>
      }
    />
  );
}

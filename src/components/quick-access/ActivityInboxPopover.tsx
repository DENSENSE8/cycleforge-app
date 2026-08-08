'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  Copy,
  Check,
  X,
  Inbox,
  RotateCcw,
  Loader2,
} from '@/components/Icons';
import { copyToClipboard } from '@/utils/_dom';
import {
  useActivityInbox,
  type ActivityInboxItem,
  type ActivityInboxItemKind,
} from '@/contexts/ActivityInboxContext';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { CompactActivityRow } from '@/components/ui/CompactActivityRow';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { Button, IconButton } from '@/design-system/primitives';
import { OrderIdChip, TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { platformMetaIconTone } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';
import { InboxQueueLinks } from './InboxQueueLinks';
import { QuickAccessPanelShell } from './QuickAccessPanelShell';

interface ActivityInboxPopoverProps {
  onClose: () => void;
}

/**
 * Kind → leading status-dot class. Compact activity face uses a lifecycle-style
 * mark, never a large kind glyph (truck / wrench) as the left edge.
 */
const KIND_DOT: Record<ActivityInboxItemKind, string> = {
  repair_status: 'bg-amber-500',
  priority_unbox: 'bg-violet-500',
  warranty_claim: 'bg-emerald-500',
  return_pending_test: 'bg-rose-500',
  order_ready_ship: 'bg-emerald-500',
  support_followup: 'bg-violet-500',
  staff_message: 'bg-blue-500',
};

const KIND_LABEL: Record<ActivityInboxItemKind, string> = {
  repair_status: 'Repair',
  priority_unbox: 'Priority',
  warranty_claim: 'Warranty',
  return_pending_test: 'Tech',
  order_ready_ship: 'Ready to ship',
  support_followup: 'Support',
  staff_message: 'Message',
};

function afterSep(title: string): string {
  const i = title.indexOf(' · ');
  return i >= 0 ? title.slice(i + 3) : title;
}

function primaryFor(it: ActivityInboxItem): string {
  switch (it.kind) {
    case 'order_ready_ship':
      return it.productTitle?.trim() || 'Ready to ship';
    case 'return_pending_test':
      return it.productTitle?.trim() || 'Needs testing';
    case 'support_followup':
      return it.ticketSubject?.trim() || (it.ticketId ? `Ticket #${it.ticketId}` : 'Support follow-up');
    case 'priority_unbox':
      return 'Unbox this first';
    case 'warranty_claim':
      return it.claimNumber || afterSep(it.title);
    case 'repair_status':
    case 'staff_message':
    default:
      return afterSep(it.title);
  }
}

/**
 * Identity keys for tech-queue rows — typed CopyChips (last-8 face), never
 * mono prose. OrderIdChip gets the catalog platform label + glyph tone
 * (`usePlatformMeta` / `platformMetaIconTone`) — same contract as rail peeks.
 * Parent row is `pointer-events-none` under the navigate Link, so chips
 * re-enable pointer events (`z-raised`) so copy still works.
 *
 * When there is nothing to paint, renders `emptyFallback` (or null).
 */
function IdentityKeys({
  orderNumber,
  trackingNumber,
  sourcePlatform,
  leading,
  emptyFallback = null,
}: {
  orderNumber?: string | null;
  trackingNumber?: string | null;
  sourcePlatform?: string | null;
  leading?: ReactNode;
  emptyFallback?: ReactNode;
}) {
  const resolvePlatformMeta = usePlatformMeta();
  const order = orderNumber?.trim() || '';
  const tracking = trackingNumber?.trim() || '';
  const platformRaw = (sourcePlatform ?? '').trim();
  const platformMeta = platformRaw ? resolvePlatformMeta(platformRaw) : null;
  const platformLabel = platformRaw && platformMeta ? platformMeta.label : null;
  const platformIconTone = platformMeta ? platformMetaIconTone(platformMeta) : null;

  if (!leading && !order && !tracking) return <>{emptyFallback}</>;

  return (
    <span className="pointer-events-auto relative z-raised flex min-w-0 items-center gap-1.5">
      {leading}
      {order ? (
        <OrderIdChip
          value={order}
          display={getLast8(order)}
          dense
          displayWidth="last8"
          platformLabel={platformLabel}
          iconClass={platformIconTone?.className}
          iconStyle={platformIconTone?.style}
        />
      ) : null}
      {tracking ? <TrackingChip value={tracking} dense displayWidth="last8" /> : null}
    </span>
  );
}

/**
 * Meta under the title. Tech-queue ready/return rows: Check (ready) +
 * OrderIdChip + TrackingChip (house identity SoT). Other kinds stay one prose
 * fact — not a tone-pill / chip parade.
 */
function metaFor(it: ActivityInboxItem): ReactNode {
  switch (it.kind) {
    case 'order_ready_ship':
      return (
        <IdentityKeys
          orderNumber={it.orderNumber}
          trackingNumber={it.trackingNumber}
          sourcePlatform={it.sourcePlatform}
          leading={
            <Check
              className="h-3.5 w-3.5 shrink-0 text-emerald-600"
              aria-label="Ready to ship"
            />
          }
          emptyFallback={
            <span className="truncate font-semibold uppercase tracking-widest text-emerald-600">
              Ready
            </span>
          }
        />
      );
    case 'return_pending_test':
      return (
        <IdentityKeys
          orderNumber={it.orderNumber}
          trackingNumber={it.trackingNumber}
          sourcePlatform={it.sourcePlatform}
          emptyFallback={
            <span className="truncate font-semibold uppercase tracking-widest text-rose-600">
              Needs test
            </span>
          }
        />
      );
    case 'support_followup':
      return (
        <span className="truncate font-semibold uppercase tracking-widest text-violet-600">
          {it.ticketId ? `Follow up · #${it.ticketId}` : 'Follow up'}
        </span>
      );
    case 'repair_status': {
      if (it.undone) {
        return (
          <span className="truncate font-semibold uppercase tracking-widest text-text-faint">
            Reverted
          </span>
        );
      }
      if (it.undoFailed) {
        return (
          <span className="truncate font-semibold uppercase tracking-widest text-rose-600">
            Undo failed
          </span>
        );
      }
      const next = (it.nextStatus || '').trim();
      const prev = (it.previousStatus || '').trim();
      const text =
        prev && next ? `${prev} → ${next}` : next || 'Repair update';
      return (
        <span
          className={cn(
            'truncate font-semibold uppercase tracking-widest',
            next || prev ? 'text-amber-700' : 'text-text-soft',
          )}
        >
          {text}
        </span>
      );
    }
    case 'warranty_claim':
      return (
        <span className="truncate font-semibold uppercase tracking-widest text-emerald-600">
          {(it.claimStatus || 'Claim').trim()}
        </span>
      );
    case 'priority_unbox':
      return (
        <IdentityKeys
          trackingNumber={it.trackingNumber}
          emptyFallback={
            <span className="truncate font-semibold uppercase tracking-widest text-violet-600">
              {(it.sku || 'Priority').trim()}
            </span>
          }
        />
      );
    case 'staff_message':
      return (
        <span className="truncate font-semibold uppercase tracking-widest text-blue-600">
          {(it.senderName || 'Message').trim()}
        </span>
      );
    default:
      return (
        <span className="truncate font-semibold uppercase tracking-widest text-text-soft">
          {KIND_LABEL[it.kind]}
        </span>
      );
  }
}

function hrefFor(it: ActivityInboxItem): string | null {
  if (it.kind === 'support_followup' && it.ticketId) {
    return `/support?ticket=${it.ticketId}`;
  }
  if (it.kind === 'warranty_claim' && it.claimId) return `/support?mode=warranty&open=${it.claimId}`;
  if (
    (it.kind === 'order_ready_ship' ||
      it.kind === 'return_pending_test' ||
      it.kind === 'priority_unbox') &&
    it.receivingId
  ) {
    const line = it.lineId ? `&lineId=${it.lineId}` : '';
    // The Unbox surface (`/unbox`) is where a carton is worked; `?recvId=` focuses it.
    return `/unbox?recvId=${it.receivingId}${line}`;
  }
  if (it.kind === 'return_pending_test') return '/test';
  if (it.kind === 'order_ready_ship') return '/dashboard';
  return null;
}

export function ActivityInboxPopover({ onClose }: ActivityInboxPopoverProps) {
  const { items, dismissItem, clear, undoItem, pendingUndoId } = useActivityInbox();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyBack = async (body: string, id: string) => {
    const ok = await copyToClipboard(body);
    if (ok) {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
    }
  };

  return (
    <QuickAccessPanelShell
      title="Recent activity"
      ariaLabel="Recent activity inbox"
      onClose={onClose}
      widthClass="w-[380px]"
      bodyClassName="px-0 py-0"
      headerActions={
        items.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              clear();
            }}
            className="h-7 px-2 text-role-caption font-semibold leading-none text-text-soft hover:text-text-default"
          >
            Clear all
          </Button>
        ) : null
      }
    >
      {/* "Where my work is", above "what just happened". The strip answers a
          different question from the feed below it and has its own source, so
          it renders in both the empty and the populated branch. */}
      <InboxQueueLinks onNavigate={onClose} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Inbox className="h-5 w-5 text-text-faint" />
          {/* Scoped to the FEED, not to the day. "All caught up" sat directly
              under a queue strip that can be reading "Orders 4", which is a
              contradiction the operator notices before the nuance. */}
          <p className="text-sm font-semibold text-text-default">No new activity</p>
          <p className="max-w-[14rem] text-role-caption text-text-soft">
            Tech items, repair updates, and messages will show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border-hairline">
          {items.map((it) => {
            const href = hrefFor(it);
            const navigable = href != null;
            const primary = primaryFor(it);
            const meta = metaFor(it);
            const kindLabel = KIND_LABEL[it.kind];

            const undoable =
              it.kind === 'repair_status' &&
              !it.undone &&
              !it.undoFailed &&
              !!it.repairId &&
              it.undoUntil > Date.now();
            const undoing = pendingUndoId === it.id;

            return (
              <li key={it.id} className="group relative">
                {navigable ? (
                  <Link
                    href={href}
                    onClick={onClose}
                    aria-label={`${kindLabel}: ${primary}`}
                    className="absolute inset-0 z-0"
                  />
                ) : null}
                <div
                  className={cn(
                    'relative py-1 transition-colors group-hover:bg-surface-hover',
                    navigable && 'pointer-events-none',
                  )}
                >
                  <CompactActivityRow
                    leading={
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-full', KIND_DOT[it.kind])}
                        aria-label={kindLabel}
                      />
                    }
                    activityAt={it.createdAt}
                    actions={
                      <>
                        {undoable ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void undoItem(it.id)}
                            disabled={undoing}
                            className="h-7 px-1.5 text-role-micro font-semibold text-text-soft"
                          >
                            {undoing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Undo
                          </Button>
                        ) : null}

                        {it.kind === 'staff_message' && it.body ? (
                          <HoverTooltip label="Copy message" asChild>
                            <IconButton
                              ariaLabel="Copy message"
                              onClick={() => {
                                if (!it.body) return;
                                void handleCopyBack(it.body, it.id);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-sunken"
                              icon={
                                copiedId === it.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5 text-text-faint" />
                                )
                              }
                            />
                          </HoverTooltip>
                        ) : null}

                        <HoverTooltip label="Dismiss" asChild>
                          <IconButton
                            ariaLabel="Dismiss"
                            onClick={() => dismissItem(it.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-text-faint hover:bg-surface-sunken hover:text-text-muted"
                            icon={<X className="h-3.5 w-3.5" />}
                          />
                        </HoverTooltip>
                      </>
                    }
                  >
                    <RailRowBody
                      vm={{
                        title: primary,
                        titleAttr: primary,
                        meta,
                      }}
                    />
                  </CompactActivityRow>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </QuickAccessPanelShell>
  );
}

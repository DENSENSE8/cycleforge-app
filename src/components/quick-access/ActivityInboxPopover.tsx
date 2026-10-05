'use client';

/** GlobalHeader activity inbox — ephemeral + dismissible feed. */

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Copy,
  Check,
  X,
  Inbox,
  RotateCcw,
  Loader2,
} from '@/components/Icons';
import { copyToClipboard } from '@/utils/_dom';
// Compose the inbox's own deep-link resolver rather than re-deriving routes —
// a second href map is the drift the notification waist exists to prevent.
import { notificationHref } from '@/lib/notifications/notification-href';
import { supportHref } from '@/lib/nav/route-tree';
import { scrubRelayAddresses } from '@/lib/support/contact-face';
import {
  INBOX_ENTITY_NOUN,
  isNotifiableEntityType,
  WORK_TASK_FOLLOW_UP_ALERT,
  type InboxEntityType,
} from '@/lib/notifications/event-vocabulary';
import type { InboxItemDto } from '@/lib/notifications/types';
import {
  DURABLE_INBOX_QUERY_KEY,
  followUpDueLabel,
  useDurableInbox,
} from '@/lib/notifications/use-durable-inbox';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import {
  useActivityInbox,
  type ActivityInboxItem,
  type ActivityInboxItemKind,
} from '@/contexts/ActivityInboxContext';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { platformMetaIconTone, UNKNOWN_PLATFORM } from '@/lib/source-platform';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { CompactActivityRow } from '@/components/ui/CompactActivityRow';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { TrackingChip, OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import { joinStackedIdentityKeys } from '@/components/ui/StackedRowIdentity';
import { Button, IconButton } from '@/design-system/primitives';
import { SubscribeToggle } from '@/components/notifications/SubscribeToggle';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { InboxContactLinks } from '@/components/ui/InboxContactLinks';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { cn } from '@/utils/_cn';
import {
  HEADER_MENU_CAPTION_CLASS,
  HEADER_MENU_ROW_CORNER,
} from '@/components/layout/header-shell';
import { InboxQueueLinks } from './InboxQueueLinks';
import { QuickAccessPanelShell } from './QuickAccessPanelShell';
import { InboxTrackingWatchRow } from './InboxTrackingWatchRow';

interface ActivityInboxPopoverProps {
  onClose: () => void;
}

/** Soft status dots — never large kind glyphs on this face. */
const KIND_DOT: Record<ActivityInboxItemKind, string> = {
  repair_status: 'bg-amber-500',
  priority_unbox: 'bg-violet-500',
  warranty_claim: 'bg-emerald-500',
  return_pending_test: 'bg-rose-500',
  order_ready_ship: 'bg-emerald-500',
  support_followup: 'bg-violet-500',
  staff_message: 'bg-blue-500',
  work_task: 'bg-amber-500',
};

const KIND_LABEL: Record<ActivityInboxItemKind, string> = {
  repair_status: 'Repair',
  priority_unbox: 'Priority',
  warranty_claim: 'Warranty',
  return_pending_test: 'Tech',
  order_ready_ship: 'Tech',
  support_followup: 'Support',
  staff_message: 'Message',
  work_task: 'Task',
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
      return (
        (it.ticketSubject?.trim() && scrubRelayAddresses(it.ticketSubject.trim())) ||
        (it.supportItemId != null ? `Support #${it.supportItemId}` : 'Support follow-up')
      );
    case 'priority_unbox':
      return 'Unbox this first';
    case 'work_task':
      return scrubRelayAddresses(afterSep(it.title)) || 'Handed to you';
    case 'warranty_claim':
      return it.claimNumber || afterSep(it.title);
    case 'repair_status':
    case 'staff_message':
    default:
      return afterSep(it.title);
  }
}

function hrefFor(it: ActivityInboxItem): string | null {
  if (it.kind === 'work_task' && it.entityType && it.entityId) {
    return notificationHref(it.entityType, it.entityId);
  }
  if (it.kind === 'support_followup' && it.ticketId) {
    return it.supportItemId != null ? supportHref({ item: it.supportItemId }) : supportHref({ q: it.ticketId });
  }
  if (it.kind === 'warranty_claim' && it.claimId) return supportHref();
  if (
    (it.kind === 'order_ready_ship' ||
      it.kind === 'return_pending_test' ||
      it.kind === 'priority_unbox') &&
    it.receivingId
  ) {
    const line = it.lineId ? `&lineId=${it.lineId}` : '';
    return `/unbox?recvId=${it.receivingId}${line}`;
  }
  if (it.kind === 'return_pending_test') return '/test';
  if (it.kind === 'order_ready_ship') return '/dashboard';
  return null;
}

function metaFactFor(
  it: ActivityInboxItem,
  platformLabel: string | null,
  platformIconTone: ReturnType<typeof platformMetaIconTone> | null,
): ReactNode {
  if (it.kind === 'order_ready_ship' || it.kind === 'return_pending_test') {
    const identityKeys = joinStackedIdentityKeys([
      it.orderNumber ? (
        <OrderIdChip
          key="order"
          value={it.orderNumber}
          dense
          platformLabel={platformLabel}
          iconClass={platformIconTone?.className}
          iconStyle={platformIconTone?.style}
        />
      ) : null,
      it.trackingNumber ? (
        <TrackingChip
          key="tracking"
          value={it.trackingNumber}
          display={getLast8(it.trackingNumber)}
          dense
        />
      ) : null,
    ]);
    const fallback =
      !it.orderNumber && !it.trackingNumber
        ? it.kind === 'return_pending_test'
          ? 'Needs testing'
          : 'Ready to ship'
        : null;
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
        {it.kind === 'order_ready_ship' ? (
          <Check className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
        ) : null}
        {identityKeys}
        {fallback}
      </span>
    );
  }
  if (it.kind === 'repair_status') {
    const from = it.previousStatus?.trim();
    const to = it.nextStatus?.trim();
    if (from || to) return [from, to].filter(Boolean).join(' → ');
  }
  if (it.kind === 'warranty_claim' && it.claimStatus) return it.claimStatus;
  if (it.kind === 'priority_unbox' && it.sku) return it.sku;
  if (it.kind === 'support_followup' && it.ticketId) return `#${it.ticketId}`;
  if (it.kind === 'staff_message' && it.body) return it.body;
  if (it.kind === 'work_task' && it.urgent) return 'Urgent';
  return (it.subtitle?.trim() && scrubRelayAddresses(it.subtitle.trim())) || KIND_LABEL[it.kind];
}

/** The Inbox's tabs. Every row lands in All; the rest are derived from what a row IS (event key / reason / session kind). */
type InboxTab = 'all' | 'alerts' | 'tasks' | 'mentions' | 'watching';
type DurableTab = Exclude<InboxTab, 'all'>;

const INBOX_TAB_LABEL: Readonly<Record<InboxTab, string>> = {
  all: 'All',
  alerts: 'Alerts',
  tasks: 'Tasks',
  mentions: 'Mentions',
  watching: 'Watching',
};

/**
 * A durable row's face per tab. Watching keeps the hue the receiving workflow
 * already paints on ARRIVED / "Scanned" (`src/lib/receiving/workflow-stages.ts`)
 * — a watched carton landing reads as the same moment here as on the carton.
 */
const DURABLE_FACE: Readonly<Record<DurableTab, { label: string; dot: string }>> = {
  alerts: { label: 'Alert', dot: 'bg-rose-500' },
  tasks: { label: 'Task', dot: KIND_DOT.work_task },
  mentions: { label: 'Mention', dot: 'bg-violet-500' },
  watching: { label: 'Watching', dot: 'bg-sky-500' },
};

function durableTab(item: InboxItemDto): DurableTab {
  if (item.eventKey === WORK_TASK_FOLLOW_UP_ALERT) return 'alerts';
  if (item.reason === 'assigned') return 'tasks';
  if (item.reason === 'mentioned') return 'mentions';
  return 'watching';
}

/** A session row's tab besides All — a handoff is a task, a teammate's message is addressed to you. */
function sessionTab(it: ActivityInboxItem): DurableTab | null {
  if (it.kind === 'work_task' || it.kind === 'support_followup') return 'tasks';
  if (it.kind === 'staff_message') return 'mentions';
  return null;
}

const DURABLE_SECTION_LABEL = 'Unread';

/** A row's trailing icon key — the header dropdown row corner, a hover wash, never a flush square. */
const INBOX_ROW_KEY_CLASS = cn(
  'pointer-events-auto flex h-7 w-7 items-center justify-center transition-colors hover:bg-surface-sunken',
  HEADER_MENU_ROW_CORNER,
);

function DurableInboxRow({
  item,
  onDismiss,
  onNavigate,
}: {
  item: InboxItemDto;
  onDismiss: (id: number) => void;
  onNavigate: () => void;
}) {
  // Server-resolved throughout: the label, the deep link and the tracking
  // number all ride on the DTO, so this face never re-derives a route or
  // re-words an event.
  const occurredMs = new Date(item.lastEventAt || item.occurredAt).getTime();
  const tab = durableTab(item);
  const face = DURABLE_FACE[tab];
  const title = item.title ? `${item.eventLabel}: ${scrubRelayAddresses(item.title)}` : item.eventLabel;
  const { getStaffName } = useStaffNameMap();
  const sender = tab === 'alerts' && item.actorStaffId ? item.actorStaffId : null;
  return (
    <li className="group relative px-2 py-1 hover:bg-surface-hover" data-inbox-item-id={item.id}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-label={`${face.label}: ${title}`}
        className="absolute inset-0 z-0"
      />
      <div className="pointer-events-none relative z-10">
        <CompactActivityRow
          leading={
            <HoverTooltip label={face.label} focusable={false} asChild>
              <span
                className={cn('block h-2 w-2 shrink-0 rounded-full', face.dot)}
                aria-label={face.label}
              />
            </HoverTooltip>
          }
          activityAt={Number.isFinite(occurredMs) ? occurredMs : Date.now()}
          actions={
            <>
              {/* The bell's own docblock says it is "mounted on the HOME INBOX ROW only" — and until this row existed there WAS no home inbox row, so the… */}
              {isNotifiableEntityType(item.entityType) ? (
                <span className="pointer-events-auto">
                  <SubscribeToggle
                    entityType={item.entityType}
                    entityId={item.entityId}
                    knownState={item.subscriptionState ?? undefined}
                  />
                </span>
              ) : null}
              <HoverTooltip label="Dismiss" asChild>
                <IconButton
                  ariaLabel="Dismiss"
                  onClick={() => onDismiss(item.id)}
                  className={cn(INBOX_ROW_KEY_CLASS, 'text-text-faint hover:text-text-muted')}
                  icon={<X className="h-3.5 w-3.5" />}
                />
              </HoverTooltip>
            </>
          }
        >
          <RailRowBody
            vm={{
              title,
              titleAttr: title,
              meta: (
                <>
                <span className="pointer-events-auto relative z-10 min-w-0 truncate text-text-soft">
                  {item.orderNumber ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <OrderIdChip value={item.orderNumber} dense />
                      {item.carrierStatus ? (
                        <span className="truncate">· {item.carrierStatus}</span>
                      ) : null}
                    </span>
                  ) : item.trackingNumber ? (
                    // The tracking number IS the content of a watched arrival —
                    // same chip + last-8 grammar as the rows above.
                    <TrackingChip
                      value={item.trackingNumber}
                      display={getLast8(item.trackingNumber)}
                      dense
                    />
                  ) : (
                    // ONE noun map, and the number the operator quotes — a
                    // durable row reading "support ticket 461" beside a desk
                    // row reading "Ticket 10023" is the same handoff twice.
                    <>
                      {[
                        `${INBOX_ENTITY_NOUN[item.entityType as InboxEntityType] ?? 'Record'} ${
                          item.ticketNumber ?? item.entityId
                        }`,
                        tab === 'alerts' ? followUpDueLabel(item.dueAt) : null,
                        tab === 'alerts' && item.note ? scrubRelayAddresses(item.note) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {sender ? (
                        <>
                          {' · from '}
                          <StaffBadge staffId={sender} name={getStaffName(sender)} className="font-semibold" />
                        </>
                      ) : null}
                    </>
                  )}
                </span>
                {/* R7 — the contacts the task linked when the alert was sent, each a door. */}
                {tab === 'alerts' ? (
                  <InboxContactLinks contacts={item.contacts} surface="desk" className="relative z-10 mt-0.5" />
                ) : null}
                </>
              ),
            }}
          />
        </CompactActivityRow>
      </div>
    </li>
  );
}

export function ActivityInboxPopover({ onClose }: ActivityInboxPopoverProps) {
  const { items: sessionItems, dismissItem, clear, undoItem, pendingUndoId } = useActivityInbox();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxTab>('all');
  const resolvePlatformMeta = usePlatformMeta();
  const queryClient = useQueryClient();
  // The panel is unmounted while the bell is closed, so this fetch happens on
  // open. The Ably `inbox_item` arm in ActivityInboxContext invalidates this
  // same key, which is what makes a watched carton land without a reopen.
  const { data: allDurableItems = [] } = useDurableInbox();

  const tabs = (Object.keys(INBOX_TAB_LABEL) as InboxTab[]).map((id) => ({
    id,
    label: INBOX_TAB_LABEL[id],
    count:
      id === 'all'
        ? undefined
        : sessionItems.filter((it) => sessionTab(it) === id).length +
          allDurableItems.filter((dto) => durableTab(dto) === id).length || undefined,
  }));
  const items = tab === 'all' ? sessionItems : sessionItems.filter((it) => sessionTab(it) === tab);
  const durableItems = tab === 'all' ? allDurableItems : allDurableItems.filter((dto) => durableTab(dto) === tab);

  const dismissDurableItem = async (id: number) => {
    // Optimistic, like the staff-message dismissal: the row leaves the panel
    // now, and the PATCH is what keeps it gone on the next read.
    queryClient.setQueryData<InboxItemDto[]>(DURABLE_INBOX_QUERY_KEY, (prev) =>
      (prev ?? []).filter((x) => x.id !== id),
    );
    try {
      await fetch(`/api/inbox/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read' }),
      });
    } finally {
      void queryClient.invalidateQueries({ queryKey: DURABLE_INBOX_QUERY_KEY });
    }
  };

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
      toolbar={<InboxTrackingWatchRow />}
      headerActions={
        sessionItems.length > 0 ? (
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
      {/* "Your next work order" left this popover 2026-08-08 for the header's pace-and-next button (`HeaderGoalChip`), where it shares one… */}
      <InboxQueueLinks onNavigate={onClose} />
      <div className="border-b border-border-hairline px-2 py-1.5">
        <TabSwitch
          tabs={tabs}
          activeTab={tab}
          onTabChange={(id) => setTab(id as InboxTab)}
          size="sm"
          scrollable
        />
      </div>

      {items.length === 0 && durableItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Inbox className="h-5 w-5 text-text-faint" />
          {/* Scoped to the FEED, not to the day. "All caught up" sat directly
              under a queue strip that can be reading "Orders 4", which is a
              contradiction the operator notices before the nuance. */}
          <p className="text-sm font-semibold text-text-default">
            {tab === 'all' ? 'No new activity' : `No ${INBOX_TAB_LABEL[tab].toLowerCase()}`}
          </p>
          <p className="max-w-[14rem] text-role-caption text-text-soft">
            {tab === 'alerts'
              ? 'When a teammate alerts you to follow up on a task, it shows up here.'
              : 'Tech items, repair updates, and messages will show up here.'}
          </p>
        </div>
      ) : (
        <>
        <ul className="divide-y divide-border-hairline">
          {items.map((it) => {
            const href = hrefFor(it);
            const navigable = href != null;
            const primary = primaryFor(it);
            // `it.sourcePlatform` (tech-queue items only — see ActivityInboxItem's doc) resolves through the same catalog the carton-context peek uses…
            const platformMeta = resolvePlatformMeta(it.sourcePlatform ?? '');
            const platformLabel =
              platformMeta && platformMeta.label !== UNKNOWN_PLATFORM.label
                ? platformMeta.label
                : null;
            const platformIconTone = platformMeta
              ? platformMetaIconTone(platformMeta)
              : null;

            const undoable =
              it.kind === 'repair_status' &&
              !it.undone &&
              !it.undoFailed &&
              !!it.repairId &&
              it.undoUntil > Date.now();
            const undoing = pendingUndoId === it.id;

            const actions = (
              <>
                {undoable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void undoItem(it.id)}
                    disabled={undoing}
                    className="pointer-events-auto h-7 px-1.5 text-role-micro font-semibold text-text-soft"
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
                      className={INBOX_ROW_KEY_CLASS}
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
                    className={cn(INBOX_ROW_KEY_CLASS, 'text-text-faint hover:text-text-muted')}
                    icon={<X className="h-3.5 w-3.5" />}
                  />
                </HoverTooltip>
              </>
            );

            return (
              <li key={it.id} className="group relative px-2 py-1 hover:bg-surface-hover">
                {navigable ? (
                  <Link
                    href={href}
                    onClick={onClose}
                    aria-label={`${KIND_LABEL[it.kind]}: ${primary}`}
                    className="absolute inset-0 z-0"
                  />
                ) : null}
                <div className={cn('relative z-10', navigable && 'pointer-events-none')}>
                  <CompactActivityRow
                    leading={
                      <HoverTooltip label={KIND_LABEL[it.kind]} focusable={false} asChild>
                        <span
                          className={cn('block h-2 w-2 shrink-0 rounded-full', KIND_DOT[it.kind])}
                          aria-label={KIND_LABEL[it.kind]}
                        />
                      </HoverTooltip>
                    }
                    activityAt={it.createdAt}
                    actions={actions}
                  >
                    <RailRowBody
                      vm={{
                        title: primary,
                        titleAttr: primary,
                        meta: (
                          <span className="pointer-events-auto relative z-10 min-w-0 truncate text-text-soft">
                            {metaFactFor(it, platformLabel, platformIconTone)}
                            {it.kind === 'repair_status' && (it.undone || it.undoFailed) ? (
                              // `text-role-eyebrow` bundles its own ~13.2px line-height (taller than this line's `text-role-micro` ~12px), so without `leading-none` a…
                              <span
                                className={cn(
                                  'ml-1.5 text-role-micro font-medium leading-none',
                                  it.undoFailed ? 'text-rose-600' : 'text-text-faint',
                                )}
                              >
                                {it.undoFailed ? 'Undo failed' : 'Reverted'}
                              </span>
                            ) : null}
                          </span>
                        ),
                      }}
                    />
                  </CompactActivityRow>
                </div>
              </li>
            );
          })}
        </ul>
        {durableItems.length > 0 ? (
          // BELOW the session feed: "what just happened to me" stays on top,
          // and the durable ledger — rows the server keeps until they are
          // triaged — reads as its own standing section.
          <section aria-label={DURABLE_SECTION_LABEL} className="border-t border-border-hairline">
            <p className={cn('px-3 pb-0.5 pt-2', HEADER_MENU_CAPTION_CLASS)}>
              {DURABLE_SECTION_LABEL}
            </p>
            <ul className="divide-y divide-border-hairline">
              {durableItems.map((dto) => (
                <DurableInboxRow
                  key={dto.id}
                  item={dto}
                  onDismiss={(id) => void dismissDurableItem(id)}
                  onNavigate={onClose}
                />
              ))}
            </ul>
          </section>
        ) : null}
        </>
      )}
    </QuickAccessPanelShell>
  );
}

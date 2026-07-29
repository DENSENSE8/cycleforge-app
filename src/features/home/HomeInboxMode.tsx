'use client';

/**
 * Home → Inbox. The subscription feed + SLA alerts.
 *
 * Region contract: **Workbench** (pick a row → act → clear it). Density `ops`.
 * The collection map is the list and it never animates; per motion-crossfade.md
 * only a focus surface may crossfade, and this mode has none yet — rows deep
 * link out to the owning station instead of opening an in-place detail pane.
 *
 * Row anatomy is the house one-row shape (title → meta → trailing actions),
 * left-aligned, constant height across states — hover is background only, never
 * a size shift. Type comes from the CF Type roles (`text-role-*`) and colour
 * from theme tokens (`text-text-*` / `bg-surface-*`); the raw-neutral and
 * legacy-px ratchets are the enforcement, and they only ever ratchet DOWN.
 *
 * Four typed states, not one blank: first-use, no-results, errored, and
 * not-enabled each teach something different (workbench.md).
 */

import { useState } from 'react';
import Link from 'next/link';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives/IconButton';
import { Check, Clock, Inbox, Loader2 } from '@/components/Icons';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { DateTimeValue } from '@/design-system/components/DateTimeValue';
import { SubscribeToggle } from '@/components/notifications/SubscribeToggle';
import type { InboxItemDto } from '@/lib/notifications/types';
import {
  InboxDisabledError,
  useHomeInbox,
  useInboxTriage,
  type InboxFilter,
} from './useHomeInbox';

const FILTER_ITEMS = [
  { id: 'active', label: 'Active' },
  { id: 'unread', label: 'Unread' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'done', label: 'Done' },
];

/** Why this row reached you — GitHub's `reason`, in operator language. */
const REASON_LABEL: Record<string, string> = {
  manual: 'You follow this',
  acted: 'You worked on this',
  assigned: 'Assigned to you',
  mentioned: 'You were mentioned',
  rule: 'Matches a rule you set',
  sla: 'Overdue',
};

export function HomeInboxMode() {
  const [filter, setFilter] = useState<InboxFilter>('active');
  const { data, isLoading, error } = useHomeInbox(filter);
  const { triage } = useInboxTriage(filter);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-soft px-4 py-2">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <HorizontalButtonSlider
            items={FILTER_ITEMS}
            value={filter}
            onChange={(id) => setFilter(id as InboxFilter)}
            variant="nav"
            dense
            aria-label="Inbox filters"
          />
          {data && data.counts.unread > 0 ? (
            <span className="rounded bg-surface-accent px-1.5 py-0.5 text-role-micro font-semibold uppercase text-text-accent ring-1 ring-inset ring-border-accent">
              {data.counts.unread} new
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          <InboxBody
            filter={filter}
            items={data?.items ?? []}
            isLoading={isLoading}
            error={error}
            onTriage={triage}
          />
        </div>
      </div>
    </div>
  );
}

function InboxBody({
  filter,
  items,
  isLoading,
  error,
  onTriage,
}: {
  filter: InboxFilter;
  items: InboxItemDto[];
  isLoading: boolean;
  error: unknown;
  onTriage: (id: number, action: 'read' | 'done' | 'snooze') => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-role-body text-text-soft">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  // Not-enabled is its own state, distinct from errored — the org simply has
  // the flag off, which is not a failure and must not read like one.
  if (error instanceof InboxDisabledError) {
    return (
      <EmptyState
        icon={<Inbox className="h-6 w-6 text-text-soft" />}
        title="Inbox isn’t switched on yet"
        description="Subscriptions are enabled per organization. Ask an admin to turn on the Home Inbox for your org."
      />
    );
  }

  if (error) {
    return (
      <div className="mx-4 my-8 rounded-xl border border-dashed border-border-danger bg-surface-danger px-4 py-6 text-center">
        <p className="text-role-body font-semibold text-text-danger">
          Could not load your inbox.
        </p>
        <p className="mt-1 text-role-micro text-text-danger">
          Your work is unaffected — retry from the filter above.
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    // First-use vs no-results are different empties with different CTAs.
    return filter === 'active' ? (
      <EmptyState
        icon={<Inbox className="h-6 w-6 text-text-soft" />}
        title="You’re all caught up"
        description="Follow a carton, order or unit with its bell and updates land here. You’re followed in automatically on anything you work on."
        action={
          <Link
            href="/unbox"
            className="inline-flex items-center rounded-lg border border-border-soft bg-surface-card px-3 py-1.5 text-role-body font-semibold text-text-default transition-colors hover:bg-surface-hover"
          >
            Open Unbox
          </Link>
        }
      />
    ) : (
      <EmptyState
        icon={<Inbox className="h-6 w-6 text-text-soft" />}
        title="Nothing here"
        description={`No ${filter} items right now.`}
      />
    );
  }

  return (
    <ul className="divide-y divide-border-soft">
      {items.map((item) => (
        <InboxRow key={item.id} item={item} onTriage={onTriage} />
      ))}
    </ul>
  );
}

function InboxRow({
  item,
  onTriage,
}: {
  item: InboxItemDto;
  onTriage: (id: number, action: 'read' | 'done' | 'snooze') => void;
}) {
  const unread = item.state === 'unread';

  return (
    <li
      className={`flex items-center gap-2 ${QUEUE_ROW.px} py-1.5 transition-colors hover:bg-surface-hover`}
    >
      {/* Unread dot — the only colour in the row (one-row anatomy). */}
      <HoverTooltip label={unread ? 'Unread' : 'Read'} focusable={false}>
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-accent-bg' : 'bg-transparent'}`}
        />
      </HoverTooltip>

      <Link
        href={item.href}
        onClick={() => unread && onTriage(item.id, 'read')}
        className="min-w-0 flex-1"
      >
        <p className="truncate text-role-caption font-semibold text-text-default">
          {item.eventLabel}
          {item.collapseCount > 1 ? (
            <span className="ml-1.5 text-text-soft">{item.collapseCount}×</span>
          ) : null}
        </p>
        <p className="truncate text-role-micro uppercase text-text-soft">
          {item.entityType.replace(/_/g, ' ')} #{item.entityId}
          {' · '}
          {REASON_LABEL[item.reason] ?? item.reason}
        </p>
      </Link>

      <DateTimeValue value={item.lastEventAt} className="hidden sm:block" />

      <div className="flex shrink-0 items-center gap-0.5">
        {/* Stop following the source of this notification. Renders from the
            state the feed already joined — no per-row request. */}
        <SubscribeToggle
          entityType={item.entityType}
          entityId={item.entityId}
          knownState={item.subscriptionState}
          size="xs"
        />
        <HoverTooltip label="Snooze 24h" focusable={false}>
          <IconButton
            icon={<Clock className="h-3.5 w-3.5" />}
            ariaLabel="Snooze for 24 hours"
            size="xs"
            onClick={() => onTriage(item.id, 'snooze')}
          />
        </HoverTooltip>
        <HoverTooltip label="Mark done" focusable={false}>
          <IconButton
            icon={<Check className="h-3.5 w-3.5" />}
            ariaLabel="Mark done"
            size="xs"
            onClick={() => onTriage(item.id, 'done')}
          />
        </HoverTooltip>
      </div>
    </li>
  );
}

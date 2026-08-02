'use client';

/**
 * "Where my work is" — the per-staff queue doors, at the top of the Inbox
 * popover.
 *
 * These are `MyDayFeed.queueCards`: for each operational queue (Orders ·
 * Arrival · Packing · Testing · FBA prep · Support), how many **actionable
 * rows are waiting for THIS operator**, as a door to that queue's page.
 * Permission-filtered server-side, and a queue with no work is already dropped
 * by `buildQueueCards` — so this strip lists only places that actually want
 * the operator.
 *
 * **Why here and not the MasterNav spine** (ruled 2026-08-02, reversing the
 * chrome-altitude brief's D8). The counts came off Today's workbench band
 * because a door that leaves the surface is navigation, not a control over the
 * rows below it. The spine is the obvious next home and it is the wrong one:
 *  · **The spine root shows SECTIONS, not pages.** Page rows only exist inside
 *    a drill, so a badge on "Orders" is invisible until you drill into
 *    Fulfillment. Rolling up to sections instead merges Arrival + Packing +
 *    Testing into one "Scan Stations" number — strictly less actionable than
 *    the six doors it replaced.
 *  · **The spine's trailing count slot already means something else** —
 *    structural cardinality (how many modes/pages are inside), rendered only
 *    when `> 1` and deliberately `aria-hidden`. A workload count is different
 *    information, must be announced, and must render at 1.
 *  · **Nav is static by construction.** `nav-search.ts` is safe on every
 *    keystroke precisely because the registry is ~40 rows with no I/O; giving
 *    the spine a live per-staff feed would put that property at risk on every
 *    route in the app.
 *
 * The Inbox is already the "be told" channel: always visible, app-wide, and
 * about actionable personal work. This is the same question one layer up —
 * not "what happened" but "where is it".
 *
 * **The badge count is deliberately unchanged.** The header badge counts
 * `ActivityInboxItem`s — discrete things that happened and can be dismissed.
 * A queue depth is neither, and folding it in would inflate a number the
 * operator clears by reading. The strip is what they see once inside.
 *
 * **Cost: none at rest.** The popover mounts only when opened, so this fetches
 * on open rather than on every page load — which also keeps `/api/my-day` off
 * the app-wide path. It shares `useMyDayFeed`'s `['my-day']` query key, so on
 * Today (the feed's other client) it is a cache hit and issues no request.
 */

import Link from 'next/link';
import { useMyDayFeed } from '@/features/my-day/useMyDayFeed';
import { cn } from '@/utils/_cn';

/** Reserve the strip's box while the feed settles, so the list below cannot jump. */
function QueueLinksSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-1 px-2 py-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-7 animate-pulse rounded-md bg-surface-hover" />
      ))}
    </div>
  );
}

export function InboxQueueLinks({ onNavigate }: { onNavigate: () => void }) {
  const { data, isLoading, isError } = useMyDayFeed();
  const cards = data?.queueCards ?? [];

  // Degrade to absence, never to an error box: this is a supplementary strip
  // above the inbox list, and a failed sub-resource must not take the popover
  // down with it (`display/workbench.md` → degrade-not-fail).
  if (isError) return null;
  if (isLoading) return <QueueLinksSkeleton />;
  if (cards.length === 0) return null;

  return (
    <div className="border-b border-border-hairline px-2 py-2">
      <p className="px-1 pb-1 text-role-eyebrow uppercase tracking-widest text-text-soft">
        Your queues
      </p>
      <ul className="grid grid-cols-2 gap-1">
        {cards.map((card) => (
          <li key={card.key} className="min-w-0">
            <Link
              href={card.href}
              onClick={onNavigate}
              // The count IS the information here, so it must be announced —
              // unlike the spine's structural count, which is `aria-hidden`.
              aria-label={`${card.label} — ${card.count} waiting`}
              className={cn(
                'flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5',
                'text-text-muted transition-colors hover:bg-surface-hover hover:text-text-default',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-role-caption font-medium">
                {card.label}
              </span>
              <span
                aria-hidden
                className="shrink-0 text-role-micro font-semibold tabular-nums text-text-soft"
              >
                {card.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

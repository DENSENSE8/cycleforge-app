'use client';

/** "Where my work is" — the per-staff queue doors, at the top of the Inbox popover. */

import Link from 'next/link';
import { useMyDayFeed } from '@/features/my-day/useMyDayFeed';
import { HEADER_MENU_CAPTION_CLASS, HEADER_MENU_ROW_CORNER } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

/** Track count is CONTAINER-relative (`auto-fill`), never a viewport breakpoint. */
const QUEUE_LINK_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1';

/** Reserve the strip's box while the feed settles, so the list below cannot jump. */
function QueueLinksSkeleton() {
  return (
    <div className={cn(QUEUE_LINK_GRID_CLASS, 'px-2 py-2')} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={cn('h-7 animate-pulse bg-surface-hover', HEADER_MENU_ROW_CORNER)} />
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
      <p className={cn('px-1 pb-1', HEADER_MENU_CAPTION_CLASS)}>
        Your queues
      </p>
      <ul className={QUEUE_LINK_GRID_CLASS}>
        {cards.map((card) => (
          <li key={card.key} className="min-w-0">
            <Link
              href={card.href}
              onClick={onNavigate}
              // The count IS the information here, so it must be announced —
              // unlike the spine's structural count, which is `aria-hidden`.
              aria-label={`${card.label} — ${card.count} waiting`}
              className={cn(
                'flex h-7 min-w-0 items-center gap-1.5 px-1.5',
                HEADER_MENU_ROW_CORNER,
                'text-text-muted transition-[background-color,transform] duration-100 hover:bg-surface-hover hover:text-text-default active:translate-y-px active:bg-surface-sunken',
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

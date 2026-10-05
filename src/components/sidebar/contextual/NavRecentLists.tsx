'use client';

/**
 * The staffer's recently pasted lists, in the search bar's dropdown (owner
 * 2026-10-04): when the field opens with no held list, and as a short section
 * under a held list's header. One row per list — when, how many, the first
 * numbers, where it was answered — pressing it restores the list through the
 * SAME paste path (it re-locates here and opens the panel). Each row also
 * opens full screen or leaves the recents; "Clear" empties them. Rows cascade
 * in on the panel's row preset.
 */

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { History, Maximize2, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionDuration, motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { NAV_LOCATOR_SECTION_LABEL, type NavLocateScope } from '@/lib/nav/context/schema';
import { useRecentLists, type RecentList } from '@/lib/nav/locate/recent-lists';
import { timeAgo } from '@/utils/_date';
import { cn } from '@/utils/_cn';
import { ICON_KEY_CLASS } from './NavBulkRow';

const SCOPE_WORD: Readonly<Record<NavLocateScope, string>> = { ...NAV_LOCATOR_SECTION_LABEL, everywhere: 'Everywhere' };

export function NavRecentLists({
  onRestore,
  onOpenFull,
  limit,
  heldId,
  className,
}: {
  /** Hold this list again (the face's paste path) and open its panel. */
  onRestore: (item: RecentList) => void;
  onOpenFull: (item: RecentList) => void;
  /** Rows shown (the held-list section shows a few); all ten when absent. */
  limit?: number;
  /** The list the face holds now (`refs.join('\n')`) — not repeated as a recent. */
  heldId?: string;
  className?: string;
}) {
  const recent = useRecentLists();
  const presence = useMotionPresence(motionPresence.findListRow);
  const settle = useMotionTransition(motionTransition.findListRow);
  const others = heldId ? recent.lists.filter((item) => item.id !== heldId) : recent.lists;
  if (others.length === 0) return null;
  const shown = limit ? others.slice(0, limit) : others;
  return (
    <section data-nav-recent-lists aria-label="Recent lists" className={cn('flex flex-col', className)}>
      <div className="flex h-6 items-center gap-1 px-1.5 text-role-micro text-text-faint">
        <History aria-hidden className="size-3" />
        <span className="flex-1">Recent lists</span>
        <Button size="sm" variant="ghost" onClick={recent.clear} data-nav-recent-clear>
          Clear recent
        </Button>
      </div>
      <AnimatePresence initial>
        {shown.map((item, index) => (
          <motion.div
            key={item.id}
            layout="position"
            initial={presence.initial}
            animate={presence.animate}
            exit={{ ...presence.exit, transition: settle }}
            transition={{ ...settle, delay: index * motionDuration.findListRowStagger }}
            role="button"
            tabIndex={0}
            data-nav-recent-list={index}
            aria-label={`Restore the list of ${item.refs.length} numbers from ${timeAgo(item.at)}`}
            onClick={() => onRestore(item)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onRestore(item);
            }}
            className={cn(
              'group mx-1 flex h-7 cursor-default select-none items-center gap-2 rounded-full pl-2 pr-1 text-role-caption',
              'transition-[background-color,box-shadow] duration-100 ease-out',
              'hover:bg-surface-sunken hover:shadow-sm hover:ring-1 hover:ring-border-soft',
              focusRing('control', 'accent'),
            )}
          >
            <span className="shrink-0 font-semibold tabular-nums text-text-default">{item.refs.length}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-text-muted">
              {item.refs.slice(0, 3).join(', ')}
              {item.refs.length > 3 ? ' …' : ''}
            </span>
            <span className="shrink-0 text-role-micro text-text-faint">
              {SCOPE_WORD[item.scope]} · {timeAgo(item.at)}
            </span>
            <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-visible:flex">
              <HoverTooltip label="Open full screen" focusable={false} asChild>
                <IconButton
                  tabIndex={-1}
                  ariaLabel="Open full screen"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenFull(item);
                  }}
                  className={cn(ICON_KEY_CLASS, 'size-5 rounded-full')}
                  icon={<Maximize2 aria-hidden className="size-3" />}
                />
              </HoverTooltip>
              <HoverTooltip label="Remove from recent" focusable={false} asChild>
                <IconButton
                  tabIndex={-1}
                  ariaLabel="Remove from recent"
                  onClick={(event) => {
                    event.stopPropagation();
                    recent.remove(item.id);
                  }}
                  className={cn(ICON_KEY_CLASS, 'size-5 rounded-full')}
                  icon={<X aria-hidden className="size-3" />}
                />
              </HoverTooltip>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </section>
  );
}

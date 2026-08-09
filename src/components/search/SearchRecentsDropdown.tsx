'use client';

/**
 * SearchRecentsDropdown — the "Recent searches" section of the global header
 * dropdown (docs/unified-global-search-consolidation-plan.md §2.1, §3.3).
 *
 * Presentational: the host owns storage (useSearchRecents) and placement (the
 * header AnchoredLayer). Rows keep an `href` for middle-click / new-tab, but a
 * primary click with `onSelect` stays on the current page (re-run in the field)
 * — never navigate to `/search?q=` before a hit. Anatomy: when a recent
 * resolved to an order, title is primary and the query (order # / tracking)
 * sits on a quiet secondary line; otherwise the query is primary. Relative
 * time sits right. The remove affordance is a sibling button (never nested in
 * the link).
 */

import Link from 'next/link';
import { Clock, Search, ChevronRight, X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { recentRerunHref, formatRelativeTime, type SearchRecentEntry } from '@/lib/search/search-recents';
import { cn } from '@/utils/_cn';

export interface SearchRecentsDropdownProps {
  recents: SearchRecentEntry[];
  onSelect?: (entry: SearchRecentEntry) => void;
  onRemove?: (id: string) => void;
  onClearAll?: () => void;
  className?: string;
  /**
   * Combobox support (header dropdown only): the keyboard-highlighted row
   * index, and an id factory for role="option" / aria-activedescendant. When
   * omitted the list renders as a plain link list.
   */
  activeIndex?: number;
  getOptionId?: (index: number) => string;
}

export function SearchRecentsDropdown({
  recents,
  onSelect,
  onRemove,
  onClearAll,
  className,
  activeIndex,
  getOptionId,
}: SearchRecentsDropdownProps) {
  if (recents.length === 0) return null;
  const asOptions = typeof getOptionId === 'function';

  return (
    <div className={className}>
      <div className="flex items-center justify-between px-3 pb-0.5 pt-1.5">
        <p className="flex items-center gap-1 text-role-micro uppercase tracking-widest text-text-faint">
          <Clock className="h-2.5 w-2.5" />
          Recent searches
        </p>
        {onClearAll && (
          // ds-raw-button: inline eyebrow-text clear action, not a Button
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClearAll();
            }}
            className="-my-0.5 text-role-micro font-semibold uppercase tracking-widest text-text-faint hover:text-text-muted"
          >
            Clear
          </button>
        )}
      </div>
      <ul className="divide-y divide-border-hairline">
        {recents.map((entry, index) => {
          const active = asOptions && index === activeIndex;
          const orderTitle =
            entry.topHit?.entityType === 'order' && entry.topHit.title.trim()
              ? entry.topHit.title.trim()
              : null;
          return (
            <li key={entry.id} className="group relative flex items-center">
              <Link
                href={
                  entry.topHit?.href?.trim()
                    ? entry.topHit.href
                    : recentRerunHref(entry)
                }
                onClick={(e) => {
                  if (!onSelect) return;
                  // Plain primary click → host re-runs in the header field.
                  // Modified clicks keep the href (new tab / middle-click).
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onSelect(entry);
                }}
                role={asOptions ? 'option' : undefined}
                id={asOptions ? getOptionId!(index) : undefined}
                aria-selected={active || undefined}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-left hover:bg-surface-hover',
                  active && 'bg-blue-50 ring-1 ring-inset ring-blue-400',
                  onRemove && 'pr-7',
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <Search className="h-4 w-4 text-text-faint" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-role-caption font-semibold text-text-default">
                    {orderTitle ?? entry.query}
                  </span>
                  {orderTitle ? (
                    <span className="mt-0.5 block truncate text-role-micro font-medium text-text-faint">
                      {entry.query}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                  {formatRelativeTime(entry.timestamp)}
                </span>
                {!onRemove && (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </Link>
              {onRemove && (
                <IconButton
                  size="xs"
                  ariaLabel={`Remove recent search “${entry.query}”`}
                  icon={<X className="h-3.5 w-3.5" />}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(entry.id);
                  }}
                  className="absolute right-1 text-text-faint opacity-0 transition-opacity hover:bg-surface-sunken hover:text-text-muted group-hover:opacity-100"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

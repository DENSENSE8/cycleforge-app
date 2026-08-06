'use client';

/**
 * GlobalSearchDropdown — find dropdown body (WAI-ARIA combobox) for
 * {@link GlobalFindCombobox} (header chrome + `/search` stage).
 *
 * Five states, driven by the host (the combobox owns the query + the
 * flattened option list + activeIndex; this component only renders + reports
 * hover):
 *   recents · first-use · preview · loading · empty
 *
 * The flattened option index model (must match the keyboard nav in the host):
 *   • recents  → option i = recents[i]
 *   • preview  → option 0 = "See all results"; options 1..N = the preview hits
 *                in grouped display order (flattenPreviewGroups)
 *
 * Flush column chrome: `rounded-none`, zero gap under the find cell, width
 * matched to the anchor (`bottom-stretch`). The column is the card — never a
 * floating glass bubble. Motion via the canonical dropdownPanel preset.
 */

import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Search, History } from '@/components/Icons';
import { AnchoredLayer } from '@/design-system';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { SearchRecentEntry } from '@/lib/search/search-recents';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';
import { SearchResultRow } from './SearchResultRow';
import { SearchRecentsDropdown } from './SearchRecentsDropdown';
import type { PreviewGroup } from './search-tabs';

export type GlobalSearchDropdownState =
  | 'recents'
  | 'first-use'
  | 'preview'
  | 'loading'
  | 'empty';

export interface GlobalSearchDropdownProps {
  open: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  listboxId: string;
  optionId: (index: number) => string;
  activeIndex: number;
  state: GlobalSearchDropdownState;
  query: string;
  recents: SearchRecentEntry[];
  previewGroups: PreviewGroup[];
  onClose: () => void;
  onSeeAll: () => void;
  onSelectRecent: (entry: SearchRecentEntry) => void;
  onRemoveRecent: (id: string) => void;
  onClearRecents: () => void;
  onNavigateHit: (hit: AiSearchHit, event: ReactMouseEvent) => void;
  /**
   * Pointer entered/left the portaled panel. Host uses these with field hover
   * to keep empty-query recents open across the anchor → portal bridge.
   */
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

/** Flush header extension — square shell, matched width, soft cast (not glass). */
const FLUSH_PANEL = cn(
  'w-full overflow-hidden rounded-none border border-border-default border-t-0 bg-surface-card',
  elevationClass('raised', 'soft'),
);
const SCROLL = 'max-h-[min(420px,55vh)] overflow-y-auto';
const GROUP_HEADER =
  'px-3 pb-0.5 pt-1.5 text-role-micro font-semibold uppercase tracking-widest text-text-faint';
const FOOTER_LINK =
  'flex items-center gap-1.5 border-t border-border-hairline px-3 py-2.5 text-role-micro font-semibold text-blue-600 hover:bg-surface-sunken';
const RECENTS_COMPACT =
  '[&_.text-role-caption]:text-role-micro [&_.text-role-eyebrow]:text-role-micro [&_li_a]:py-2.5';

export function GlobalSearchDropdown({
  open,
  anchorRef,
  listboxId,
  optionId,
  activeIndex,
  state,
  query,
  recents,
  previewGroups,
  onClose,
  onSeeAll,
  onSelectRecent,
  onRemoveRecent,
  onClearRecents,
  onNavigateHit,
  onHoverStart,
  onHoverEnd,
}: GlobalSearchDropdownProps) {
  const presence = useMotionPresence(framerPresence.dropdownPanel);
  const transition = useMotionTransition(framerTransition.dropdownOpen);

  // Base flat index of each group's first hit (0 = "See all" in preview).
  let running = 0;
  const groupsWithBase = previewGroups.map((group) => {
    const base = running;
    running += group.hits.length;
    return { group, base };
  });

  return (
    <AnchoredLayer
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-stretch"
      gap={0}
      matchWidth
      level="dropdown"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            className={FLUSH_PANEL}
            onMouseEnter={onHoverStart}
            onMouseLeave={onHoverEnd}
            // Keep the input focused when a row is clicked (prevents a blur
            // that would close the dropdown before navigation). Skip for
            // buttons/links so Clear / remove affordances work on first click.
            onMouseDown={(e) => {
              const t = e.target as HTMLElement;
              if (t.closest('button, a, [role="option"]')) return;
              e.preventDefault();
            }}
          >
            <div role="listbox" id={listboxId} className={SCROLL}>
              {state === 'recents' && (
                <SearchRecentsDropdown
                  recents={recents}
                  onSelect={onSelectRecent}
                  onRemove={onRemoveRecent}
                  onClearAll={onClearRecents}
                  activeIndex={activeIndex}
                  getOptionId={optionId}
                  className={RECENTS_COMPACT}
                />
              )}

              {state === 'first-use' && (
                <p className="px-3 py-3 text-center text-role-micro text-text-muted">
                  Search orders, serials, cartons, SKUs…
                </p>
              )}

              {state === 'preview' && (
                <>
                  {/* ds-raw-button: listbox combobox option row (role="option"), not a Button action */}
                  <button
                    type="button"
                    role="option"
                    id={optionId(0)}
                    aria-selected={activeIndex === 0 || undefined}
                    onClick={onSeeAll}
                    className={cn(
                      'flex w-full items-center gap-2 border-b border-border-hairline px-3 py-2.5 text-left text-role-micro font-semibold text-blue-600 hover:bg-surface-sunken',
                      activeIndex === 0 && 'bg-blue-50 ring-1 ring-inset ring-blue-400',
                    )}
                  >
                    <Search className="h-3 w-3" />
                    See all results for &ldquo;{query}&rdquo;
                  </button>
                  {groupsWithBase.map(({ group, base }) => (
                    <section key={group.label}>
                      <p className={GROUP_HEADER} role="presentation">
                        {group.label}
                      </p>
                      <ul className="divide-y divide-border-hairline">
                        {group.hits.map((hit, j) => {
                          const idx = base + j + 1; // +1 → "See all" is 0
                          return (
                            <li key={`${hit.entityType}:${hit.id}`}>
                              <SearchResultRow
                                hit={hit}
                                density="dropdown"
                                active={idx === activeIndex}
                                optionId={optionId(idx)}
                                onNavigate={onNavigateHit}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </>
              )}

              {state === 'loading' && (
                <ul className="divide-y divide-border-hairline" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="h-2 w-2 shrink-0 animate-pulse bg-surface-strong" />
                      <span className="flex-1 space-y-1.5">
                        <span className="block h-2.5 w-1/2 animate-pulse bg-surface-strong" />
                        <span className="block h-2 w-1/3 animate-pulse bg-surface-sunken" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {state === 'empty' && (
                <div className="px-3 py-3 text-center">
                  <p className="text-role-micro font-semibold text-text-default">
                    No matches for &ldquo;{query}&rdquo;
                  </p>
                  <p className="mt-1 text-role-micro font-semibold uppercase tracking-widest text-text-faint">
                    Try a partial serial or the last 8 of a tracking #
                  </p>
                </div>
              )}
            </div>

            {state === 'recents' && (
              <Link href="/search" onClick={onClose} className={FOOTER_LINK}>
                <History className="h-3.5 w-3.5" /> View all recent searches
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </AnchoredLayer>
  );
}

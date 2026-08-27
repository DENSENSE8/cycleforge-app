'use client';

/**
 * GlobalSearchDropdown — find dropdown body (WAI-ARIA combobox) for
 * {@link GlobalFindCombobox}.
 *
 * Five states, driven by the host (the combobox owns the query + the
 * flattened option list + activeIndex; this component only renders + reports
 * hover):
 *   methods · recents · first-use · preview · empty
 *
 * `methods` is the search-by picker (internal id / order / serial / tracking / ticket).
 * It opens from the leading search-by button (always) and on an empty focused
 * field before a method is chosen — never stacked above results. Backspace on
 * an empty scoped field returns here.
 *
 * Preview rows are **title only** — product / item name, no entity group
 * headers, glyphs, id chips, or photo counts. Pack-photo batch reads used to
 * hang the panel open; they are gone so the list paints with the search response.
 *
 * Pending is the field spinner — never a query-trace diary panel.
 *
 * The flattened option index model (must match the keyboard nav in the host):
 *   • methods  → option 0 = Recent searches; option i≥1 = SEARCH_BY_SCOPES[i-1]
 *   • recents  → option i = recents[i]
 *   • preview  → options 0..N-1 = the preview hits in grouped display order
 *                (flattenPreviewGroups). There is no "See all results" row —
 *                the dropdown IS the results list; picking a hit opens `?sel=`.
 *
 * Flush column chrome: `rounded-none`, zero gap under the find cell. The
 * column is the card — never a floating glass bubble. Motion via the canonical
 * dropdownPanel preset.
 *
 * Width MATCHES the find field exactly (`bottom-stretch` + `matchWidth`).
 */

import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
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
import { SearchByMethods } from './SearchByMethods';
import type { PreviewGroup } from './search-tabs';
import { SEARCH_BY_METHOD_LABEL, type SearchByScope } from '@/lib/search/search-by';

export type GlobalSearchDropdownState =
  | 'methods'
  | 'recents'
  | 'first-use'
  | 'preview'
  | 'empty';

export interface GlobalSearchDropdownProps {
  open: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  listboxId: string;
  optionId: (index: number) => string;
  activeIndex: number;
  state: GlobalSearchDropdownState;
  query: string;
  emptyMessage?: string;
  recents: SearchRecentEntry[];
  previewGroups: PreviewGroup[];
  onClose: () => void;
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
  /** Search-by picker (leading button, or empty field before a method is chosen). */
  searchByScope?: SearchByScope;
  onSelectSearchBy?: (scope: SearchByScope) => void;
  onSelectRecents?: () => void;
  recentsPageOpen?: boolean;
}

/** Flush header extension — square shell, matched width, soft cast (not glass). */
const FLUSH_PANEL = cn(
  'w-full overflow-hidden rounded-none border border-border-default border-t-0 bg-surface-card',
  elevationClass('raised', 'soft'),
);
const SCROLL = 'max-h-[min(420px,55vh)] overflow-y-auto';
/**
 * Dropdown density for the recents section. The `.text-role-eyebrow` clause is
 * gone: the recents row now wears `CompactActivityRow` + `RailRowBody`, whose
 * age and meta lines are already `text-role-micro` — it matched nothing.
 */
const RECENTS_COMPACT = '[&_.text-role-caption]:text-role-micro [&_li_a]:py-2.5';

export function GlobalSearchDropdown({
  open,
  anchorRef,
  listboxId,
  optionId,
  activeIndex,
  state,
  query,
  emptyMessage,
  recents,
  previewGroups,
  onClose,
  onSelectRecent,
  onRemoveRecent,
  onClearRecents,
  onNavigateHit,
  onHoverStart,
  onHoverEnd,
  searchByScope = 'internal',
  onSelectSearchBy,
  onSelectRecents,
  recentsPageOpen = false,
}: GlobalSearchDropdownProps) {
  const presence = useMotionPresence(framerPresence.dropdownPanel);
  const transition = useMotionTransition(framerTransition.dropdownOpen);

  // Flat option index — same order the host keyboard-navs.
  let running = 0;
  const flatHits: Array<{ hit: AiSearchHit; idx: number }> = [];
  for (const group of previewGroups) {
    for (const hit of group.hits) {
      flatHits.push({ hit, idx: running });
      running += 1;
    }
  }

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
            {state === 'methods' && onSelectSearchBy ? (
              <div className={SCROLL}>
                <SearchByMethods
                  listboxId={listboxId}
                  optionId={optionId}
                  activeIndex={activeIndex}
                  selected={searchByScope}
                  onSelect={onSelectSearchBy}
                />
              </div>
            ) : (
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
                  Type {searchByScope === 'internal' ? 'an R-id, shipment id, or scan a QR' : `a ${SEARCH_BY_METHOD_LABEL[searchByScope].toLowerCase()}`}
                </p>
              )}

              {state === 'preview' && (
                <ul className="divide-y divide-border-hairline">
                  {flatHits.map(({ hit, idx }) => (
                    <li key={`${hit.entityType}:${hit.id}`}>
                      <SearchResultRow
                        hit={hit}
                        density="dropdown"
                        active={idx === activeIndex}
                        optionId={optionId(idx)}
                        onNavigate={onNavigateHit}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {state === 'empty' && (
                <p className="px-3 py-3 text-center text-role-caption font-semibold text-text-danger">
                  {emptyMessage ?? `No matches for “${query}”`}
                </p>
              )}
            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </AnchoredLayer>
  );
}

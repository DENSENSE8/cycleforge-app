'use client';

/**
 * The phone's recurring "find one thing, then act on it" screen.
 *
 * ## Why this is a shell and not another one-off
 *
 * Every triage job on this product has the same shape — pair a location, pick
 * a product, choose an order, assign a unit: a back header naming what you are
 * doing, a search field pinned under it, and a list you scan with your thumb.
 * Built ad hoc each time, they drift: one gets a sticky footer CTA, another
 * puts search below the fold, a third rebuilds the keyboard-avoidance wrong
 * and hides its own results. Operators then learn three screens instead of one.
 *
 * So the layout is a shell and the screens supply rows. The law it encodes:
 *
 *   - Header is `MobileDetailTopBar` — one back affordance, always top-left.
 *   - Search is STICKY under the header, never scrolled away. The field is the
 *     only control on the screen a person uses more than once.
 *   - The list owns the scroll. `min-h-0` on the flex child, which is the
 *     detail every hand-rolled version gets wrong and then "fixes" by giving
 *     the page a fixed height that the OS keyboard breaks.
 *   - No sticky bottom CTA for the row decision. On a list screen the decision
 *     IS the row, and a screen-wide CTA down there can only mean "the one I
 *     most recently touched", which is a guess about intent. The `dock` slot
 *     is for the way OUT of the list — the verb for when no row is the answer
 *     (pair: "Not in the catalog → SKU exception", operator 2026-09-25). It
 *     is a `DetailDock`, pinned under the thumb, never a row's commit.
 *
 * ## Sections, not one flat list
 *
 * Idle content (recent / nearby / suggested) and search results are different
 * claims and must not be interleaved — a suggestion sitting among matches
 * reads as a match. Callers pass sections with their own headings; the shell
 * shows idle sections only while the query is empty.
 */

import type { ReactNode } from 'react';
import { SearchField } from '@/design-system/primitives/SearchField';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { STATION_EYEBROW_CLASS } from '@/components/mobile/station/station-chrome';
import { cn } from '@/utils/_cn';

export interface TriageSection {
  /** Short heading. Omit for an unlabelled block. */
  heading?: string;
  /** Shown when the section has no rows. Omit to hide the section entirely. */
  empty?: ReactNode;
  rows: ReactNode;
  /** Row count, used to decide whether `empty` applies. */
  count: number;
}

export function MobileTriagePage({
  title,
  subtitle,
  backHref,
  query,
  onQueryChange,
  searchLabel = 'Search',
  isSearching = false,
  sections,
  footer,
  dock,
}: {
  title: string;
  /** The thing being acted ON — a location code, an order number. */
  subtitle?: string;
  backHref?: string;
  query: string;
  onQueryChange: (next: string) => void;
  searchLabel?: string;
  isSearching?: boolean;
  /** Rendered in order. */
  sections: TriageSection[];
  /** Optional block under the list — an escape hatch, never the primary CTA. */
  footer?: ReactNode;
  /** A `DetailDock` pinned to the bottom: the verb for when no row is the answer. */
  dock?: ReactNode;
}) {
  return (
    // Triage mode owns the rows' tokens (rules, press ink) wherever the page
    // mounts — a host without a region drew the commit's rule in currentColor.
    <ModeRegion mode="triage" className={cn('flex min-h-svh flex-col', appMobilePageGroundClass)}>
      {/*
        No `mono`. It used to be `mono={Boolean(subtitle)}` — "has an eyebrow"
        standing in for "the title is an identifier", which is true on a record
        screen (`/m/u/[id]`: a serial) and false on every triage screen, whose
        title is a PAGE NAME in prose ("Pair location", "On hold", "Becomes").
        Mono widened those page names into record identities.
      */}
      <MobileDetailTopBar title={title} subtitle={subtitle} backHref={backHref} />

      {/*
        `z-sticky`, NOT `z-base`. A row's thumb (`ItemRecordThumb`) is
        `position: relative`, so it is a POSITIONED element, and positioned
        elements with `z-index: auto` paint in the same step as this band did at
        `z-base` (0) — resolved by tree order, which the band loses because it
        precedes `<div>`. The result was a Zoho product photo sliding OVER the
        pinned search field while the list scrolled under it (the row's title
        and meta are in flow, so they correctly passed beneath). Between
        `raised` (row chrome) and `header` (the top bar above), so the bar still
        wins and the field never does.
      */}
      <div className="sticky top-14 z-sticky border-b border-border-hairline bg-surface-card px-3 py-2">
        {/* The house search field: magnifier LEADS, clear trails (operator
            2026-09-25: "the search icon … is always most left"). */}
        <SearchField
          value={query}
          onChange={onQueryChange}
          placeholder={searchLabel}
          tone="neutral"
          hideUnderline
          isSearching={isSearching}
        />
      </div>

      {/*
        `min-h-0` is load-bearing: without it this flex child refuses to shrink
        below its content and the page scrolls as a whole, which on a phone
        means the sticky search field leaves the viewport the moment results
        arrive — the exact failure this shell exists to prevent.
      */}
      <div className="flex min-h-0 flex-1 flex-col">
        {sections.map((section, index) => {
          if (section.count === 0 && !section.empty) return null;
          return (
            <section key={section.heading ?? `section-${index}`} className="min-w-0">
              {section.heading && (
                <h2
                  className={cn(
                    // The heading rides the page ground, not a second plane —
                    // it is a LABEL for the rows under it, and a grey band
                    // there read as a gap between two lists.
                    appMobilePageGroundClass,
                    'px-3 pb-1 pt-3 text-role-eyebrow text-text-soft',
                    STATION_EYEBROW_CLASS,
                  )}
                >
                  {section.heading}
                </h2>
              )}
              {section.count === 0 ? (
                <div className="px-3 py-4 text-center text-role-caption text-text-soft">
                  {section.empty}
                </div>
              ) : (
                <ul className="divide-y divide-border-hairline border-y border-border-hairline bg-surface-card">
                  {section.rows}
                </ul>
              )}
            </section>
          );
        })}
        {footer && <div className="px-3 py-4">{footer}</div>}
      </div>
      {dock}
    </ModeRegion>
  );
}

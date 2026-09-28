'use client';

/**
 * The phone's recurring "find one thing, then act on it" screen.
 * (pair: "Not in the catalog → SKU exception", operator 2026-09-25). It
 */

import type { ReactNode } from 'react';
import { SearchField } from '@/design-system/primitives/SearchField';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
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
    <div className={cn('flex min-h-svh flex-col', appMobilePageGroundClass)}>
      {/* No `mono`. It used to be `mono={Boolean(subtitle)}` — "has an eyebrow" standing in for "the title is an identifier", which is true on a… */}
      <MobileDetailTopBar title={title} subtitle={subtitle} backHref={backHref} />

      {/* `z-sticky`, NOT `z-base`. */}
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

      {/* `min-h-0` is load-bearing: */}
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
    </div>
  );
}

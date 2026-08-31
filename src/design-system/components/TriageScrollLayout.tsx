'use client';

import { useRef, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { TriageSections, type TriageSectionSpec } from './TriageSections';
import { TriageScrollKnobs } from './TriageScrollKnobs';

export type { TriageSectionSpec };

/**
 * Scroll host for a dense warehouse triage form. Distinct operational blocks
 * are grouped as {@link TriageSections} cards (`cornerClass('surface')`).
 *
 * ## The jump rail is opt-in
 *
 * The grouping alone IS the scan for a short form, so `knobs` defaults off and
 * a three-section host stays a plain scroll. Pass `knobs` when the pane is
 * fixed-width and the operator works it repeatedly — there the rail earns its
 * column twice over, because {@link TriageScrollKnobs} is also a position
 * readout (an `IntersectionObserver` marks the section under the reader), which
 * a scroll with no rail cannot answer at all.
 *
 * It rides the EDGE, never a button row across the top: vertical space is the
 * scarce axis in a dense form, and a top row either scrolls away or is made
 * sticky and spends that space permanently.
 */
export function TriageScrollLayout({
  header,
  banner,
  sections,
  knobs = false,
  className,
  'data-testid': testId,
}: {
  header?: ReactNode;
  /** Record-level notice above the first card — see {@link TriageSections}. */
  banner?: ReactNode;
  sections: readonly TriageSectionSpec[];
  /** Show the edge jump rail. Off by default — see the note above. */
  knobs?: boolean;
  className?: string;
  'data-testid'?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)} data-testid={testId}>
      {header ? <div className="shrink-0">{header}</div> : null}
      <div className="flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto"
          data-triage-scroll-root=""
        >
          <TriageSections sections={sections} banner={banner} />
        </div>
        {knobs ? <TriageScrollKnobs sections={sections} scrollRef={scrollRef} /> : null}
      </div>
    </div>
  );
}

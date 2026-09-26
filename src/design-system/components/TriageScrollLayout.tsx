'use client';

import { useRef, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { TriageSections, type TriageSectionSpec } from './TriageSections';
import { TriageScrollKnobs } from './TriageScrollKnobs';

export type { TriageSectionSpec };

/** Scroll host for a dense warehouse triage form. */
export function TriageScrollLayout({
  header,
  banner,
  sections,
  knobs = false,
  measure = 'fluid',
  className,
  'data-testid': testId,
}: {
  header?: ReactNode;
  /** Record-level notice above the first card — see {@link TriageSections}. */
  banner?: ReactNode;
  sections: readonly TriageSectionSpec[];
  /** Show the edge jump rail. Off by default — see the note above. */
  knobs?: boolean;
  /** Column measure — see {@link TriageSections}. */
  measure?: 'fluid' | 'fixed';
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
          className={cn(
            'min-h-0 flex-1 overflow-y-auto',
            measure === 'fixed' && 'overflow-x-auto [scrollbar-gutter:stable]',
          )}
          data-triage-scroll-root=""
        >
          <TriageSections sections={sections} banner={banner} measure={measure} />
        </div>
        {knobs ? <TriageScrollKnobs sections={sections} scrollRef={scrollRef} /> : null}
      </div>
    </div>
  );
}

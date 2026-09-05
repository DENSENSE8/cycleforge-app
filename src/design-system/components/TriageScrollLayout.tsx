'use client';

import { useRef, type ReactNode } from 'react';
import { InspectorFormSurface } from './InspectorFormSurface';
import {
  triageMeasureClass,
  TriageSections,
  type TriageMeasureAlign,
  type TriageSectionSpec,
} from './TriageSections';
import { TriageScrollKnobs } from './TriageScrollKnobs';
import { cn } from '@/utils/_cn';

export type { TriageSectionSpec, TriageMeasureAlign };

/**
 * Scroll host for a dense warehouse triage form. Distinct operational blocks
 * are grouped as {@link TriageSections} — a heading and its content, separated
 * by space. Not cards: see that file for why the box went.
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
 *
 * With `knobs`, prefer `measureAlign="start"` so the form sits left of the
 * sticky rail (Order intake stage-fill, Exceptions) instead of centering in
 * the leftover column.
 */
export function TriageScrollLayout({
  header,
  banner,
  sections,
  footer,
  knobs = false,
  measureAlign,
  className,
  'data-testid': testId,
}: {
  header?: ReactNode;
  /** Record-level notice above the first card — see {@link TriageSections}. */
  banner?: ReactNode;
  sections: readonly TriageSectionSpec[];
  /**
   * Sticky foot in the SAME column as the cards (left of knobs). Incoming add
   * parks StationComposerHost here so its width cannot be measured against the
   * full pane. No extra `pb-*` — the host already owns Unbox mouth safe-area pad.
   */
  footer?: ReactNode;
  /** Show the edge jump rail. Off by default — see the note above. */
  knobs?: boolean;
  /**
   * Reading-measure alignment inside the scroll pane. Defaults to `start`
   * when `knobs` is on (form left of the rail), otherwise `center`.
   */
  measureAlign?: TriageMeasureAlign;
  className?: string;
  'data-testid'?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const align = measureAlign ?? (knobs ? 'start' : 'center');

  return (
    <InspectorFormSurface
      header={header}
      className={className}
      bodyClassName="flex min-h-0 overflow-hidden"
      testId={testId}
    >
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
            data-triage-scroll-root=""
          >
            <TriageSections
              sections={sections}
              banner={banner}
              measureAlign={align}
            />
          </div>
          {footer ? (
            <div className={cn(triageMeasureClass(align), 'shrink-0')}>
              {footer}
            </div>
          ) : null}
        </div>
        {knobs ? <TriageScrollKnobs sections={sections} scrollRef={scrollRef} /> : null}
      </div>
    </InspectorFormSurface>
  );
}

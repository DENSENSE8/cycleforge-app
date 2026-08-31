'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';

export type TriageSectionSpec = {
  id: string;
  label: string;
  children: ReactNode;
};

/**
 * Right pane of {@link TriageScrollLayout}. Each block is a native
 * `<section id>` so IntersectionObserver + jump anchors share one id.
 * Inner chrome uses `cornerClass('surface')` — never a raw `rounded-*`.
 *
 * ## Breathing room is deliberate, not decoration
 *
 * The heading is a real heading — `role-body` semibold in sentence case, not
 * an 11px tracked-out eyebrow. A form with a dozen labels and three section
 * markers all set in caps has no hierarchy left: everything shouts, so the
 * reader gets no help deciding what to look at first. Sentence case at a
 * larger size makes the section markers legible AS markers and lets the field
 * labels below them recede.
 *
 * Spacing follows the same logic — the gap BETWEEN sections is larger than the
 * padding inside a card, so the grouping reads as grouping without needing a
 * rule or a heavier border to say it.
 *
 * ## The measure is centred in the pane
 *
 * `mx-auto`, not left-flush. The pane is full-bleed by design (the host reaches
 * the screen edge) while the content keeps a fixed measure — so on anything
 * wider than the measure, a left-flush column puts the whole form against one
 * edge with the entire remainder empty on the other. That reads as a layout
 * that failed rather than one that chose a measure. Centring splits the slack
 * into two equal gutters, which is what makes a fixed measure look deliberate.
 */
export function TriageSections({
  sections,
  banner,
}: {
  sections: readonly TriageSectionSpec[];
  /**
   * Rendered above the first card, inside the same centred measure.
   *
   * For the state of the RECORD, not of a section — "this order is unpaired"
   * is true of the order, so it outranks any one panel and must not be filed
   * under a heading that implies otherwise. Kept in the scroll (not the
   * header) so it scrolls away once read, instead of spending a permanent band
   * on a sentence the operator has already acted on.
   */
  banner?: ReactNode;
}) {
  return (
    // `max-w` on the CONTENT, not the pane: the surface reaches the screen
    // edge while the reading measure stays fixed, so a field never stretches
    // across a 1600px monitor to hold an 8-character SKU. `mx-auto` centres
    // that measure — see the note above.
    <div className="mx-auto w-full max-w-4xl space-y-7 px-6 py-5">
      {banner}
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="scroll-mt-5"
          aria-labelledby={`${section.id}-heading`}
        >
          <h3
            id={`${section.id}-heading`}
            className="text-role-body font-semibold text-text-default"
          >
            {section.label}
          </h3>
          <div
            className={cn(
              'mt-2.5 border border-border-soft bg-surface-card p-5',
              cornerClass('surface'),
            )}
          >
            {section.children}
          </div>
        </section>
      ))}
    </div>
  );
}

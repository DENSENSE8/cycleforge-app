'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export type TriageSectionSpec = {
  id: string;
  label: string;
  /** Optional trailing chrome on the heading row (e.g. a gate badge). */
  labelEnd?: ReactNode;
  children: ReactNode;
};

export type TriageMeasureAlign = 'center' | 'start';

/**
 * Shared reading measure — section cards and a sticky foot (composer) must
 * share this. The gutter is authored narrow-up: 16px until `sm`, 24px above.
 * A 24px gutter on each side of a 380px viewport spends an eighth of the
 * readable width on nothing.
 */
export function triageMeasureClass(align: TriageMeasureAlign = 'center'): string {
  return cn(
    'w-full max-w-4xl px-4 sm:px-6',
    align === 'center' ? 'mx-auto' : 'mr-auto',
  );
}

/**
 * Right pane of {@link TriageScrollLayout}. Each block is a native
 * `<section id>` so IntersectionObserver + jump anchors share one id.
 * A child that genuinely needs its own surface still takes
 * `cornerClass('surface')` — never a raw `rounded-*`.
 *
 * ## The grouping is space, not a box
 *
 * A section is a heading and its content. No border, no fill, no radius: the
 * card was `bg-surface-card` on a `bg-surface-card` panel, so the fill drew
 * nothing and the border was the only thing claiming a card existed — a
 * container asserting itself rather than serving hierarchy. The `space-y-7`
 * between sections is already larger than any padding inside one, which is
 * what makes the grouping read. That argument was written in this file before
 * the border was removed; the border was the part that disagreed with it.
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
 * ## Measure alignment
 *
 * Default `center` (`mx-auto`) — for a lone scroll pane, equal gutters make a
 * fixed measure look deliberate. Pass `start` when a sticky edge rail
 * ({@link TriageScrollKnobs}) already occupies the right: then the form sits
 * left of the knobs (Order intake / Exceptions on a wide stage), not floating
 * in the middle of the leftover column.
 */
export function TriageSections({
  sections,
  banner,
  measureAlign = 'center',
}: {
  sections: readonly TriageSectionSpec[];
  /**
   * Rendered above the first card, inside the same measure.
   *
   * For the state of the RECORD, not of a section — "this order is unpaired"
   * is true of the order, so it outranks any one panel and must not be filed
   * under a heading that implies otherwise. Kept in the scroll (not the
   * header) so it scrolls away once read, instead of spending a permanent band
   * on a sentence the operator has already acted on.
   */
  banner?: ReactNode;
  measureAlign?: TriageMeasureAlign;
}) {
  return (
    // `max-w` on the CONTENT, not the pane: the surface reaches the screen
    // edge while the reading measure stays fixed, so a field never stretches
    // across a 1600px monitor to hold an 8-character SKU.
    <div
      className={cn(triageMeasureClass(measureAlign), 'space-y-7 py-5')}
    >
      {banner}
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="scroll-mt-5"
          aria-labelledby={`${section.id}-heading`}
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              id={`${section.id}-heading`}
              className="text-role-body font-semibold text-text-default"
            >
              {section.label}
            </h3>
            {section.labelEnd ?? null}
          </div>
          <div className="mt-2.5">{section.children}</div>
        </section>
      ))}
    </div>
  );
}

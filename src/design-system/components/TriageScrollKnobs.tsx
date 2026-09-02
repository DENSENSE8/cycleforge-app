'use client';

/**
 * Vertical **scroll-section knobs** — the jump control for
 * {@link TriageScrollLayout}.
 *
 * A rail of ticks down the EDGE of the scrolling pane, not a row of buttons
 * across its top. Two reasons the edge wins for a triage form:
 *
 *   1. A top button row costs a band of vertical space in the one direction a
 *      dense form has none, and it scrolls away or has to be made sticky —
 *      which spends the space permanently.
 *   2. The knobs double as a POSITION READOUT. An `IntersectionObserver` marks
 *      whichever section is under the reader, so the rail answers "where am I"
 *      without being clicked. A button row cannot; it only takes orders.
 *
 * `TriageSections` already renders each block as a native `<section id>`
 * precisely so anchors and an observer can share one id — this consumes that
 * seam rather than introducing a parallel registry of refs.
 *
 * **Motion:** colour only. The active tick changes ink and its label changes
 * weight; nothing tweens width, height or position, so no neighbour moves.
 * Scrolling uses `block: 'start'` with no `behavior: 'smooth'`, matching every
 * other jump in this codebase — a scanning operator wants the destination, not
 * the journey.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { TriageSectionSpec } from './TriageSections';

export function TriageScrollKnobs({
  sections,
  scrollRef,
  className,
}: {
  sections: readonly TriageSectionSpec[];
  /** The scrolling pane the sections live in — the observer's root. */
  scrollRef: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');
  // A click scrolls, which fires the observer, which would fight the click for
  // ~1 frame. The click wins until the scroll settles.
  const clickLockRef = useRef<number>(0);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const nodes = sections
      .map((s) => root.querySelector<HTMLElement>(`#${CSS.escape(s.id)}`))
      .filter((n): n is HTMLElement => n != null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < clickLockRef.current) return;
        // The section nearest the TOP of the pane is the one being read.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const next = visible[0]?.target?.id;
        if (next) setActiveId(next);
      },
      {
        root,
        // Bias the band to the upper third: a section counts as "current" once
        // its heading reaches the reading line, not when its tail is visible.
        rootMargin: '0px 0px -66% 0px',
        threshold: 0,
      },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [sections, scrollRef]);

  const jumpTo = useCallback(
    (id: string) => {
      const root = scrollRef.current;
      const target = root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (!target) return;
      clickLockRef.current = Date.now() + 600;
      setActiveId(id);
      target.scrollIntoView({ block: 'start' });
    },
    [scrollRef],
  );

  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="Jump to section"
      className={cn('shrink-0 self-start pr-3 pt-4', className)}
      data-testid="triage-scroll-knobs"
    >
      <ul className="sticky top-4 flex flex-col gap-1">
        {sections.map((section) => {
          const active = section.id === activeId;
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => jumpTo(section.id)}
                aria-current={active ? 'true' : undefined}
                data-testid={`triage-knob-${section.id}`}
                // Intake e2e historically used the top-nav `triage-jump-*` ids.
                data-triage-jump={section.id}
                className={cn(
                  'ds-raw-button group flex w-full items-center gap-2 px-1 py-1 text-left',
                  'transition-colors duration-100 ease-out',
                  cornerClass('flush'),
                  focusRing('control'),
                )}
              >
                {/*
                  The tick keeps a CONSTANT box in both states — only its ink
                  changes. A knob that grew when active would shift its
                  neighbours, which is the layout tween the house bans.
                */}
                <span
                  aria-hidden
                  className={cn(
                    'h-4 w-0.5 shrink-0 transition-colors duration-100 ease-out',
                    active ? 'bg-accent-bg' : 'bg-border-default group-hover:bg-border-strong',
                  )}
                />
                {/*
                  Sentence case, matching the headings it points at. A rail set
                  in caps while its targets are not reads as a different
                  vocabulary, and the operator has to re-map "CATALOG PAIRING"
                  onto "Catalog pairing" on every glance.
                */}
                <span
                  className={cn(
                    'truncate text-role-caption transition-colors duration-100 ease-out',
                    active
                      ? 'font-semibold text-text-default'
                      : 'font-medium text-text-faint group-hover:text-text-muted',
                  )}
                >
                  {section.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

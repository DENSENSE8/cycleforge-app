'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { TriageNav, type TriageNavItem } from './TriageNav';
import { TriageSections, type TriageSectionSpec } from './TriageSections';

export type { TriageNavItem, TriageSectionSpec };

/**
 * Two-column Grok-style triage host: sticky jump rail + independently scrolling
 * sections. Use when a dense warehouse form exceeds the pane and needs
 * quick-jump navigation across distinct operational blocks.
 *
 * Right-pane cards are rounded through `cornerClass('surface')` inside
 * {@link TriageSections}. Do not square them off with `rounded-none`.
 */
export function TriageScrollLayout({
  header,
  sections,
  className,
  'data-testid': testId,
}: {
  header?: ReactNode;
  sections: readonly TriageSectionSpec[];
  className?: string;
  'data-testid'?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');

  const jumpTo = useCallback((id: string) => {
    const target = rootRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    target?.scrollIntoView({ block: 'start' });
  }, []);

  const sectionIds = sections.map((section) => section.id).join('|');

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !sectionIds) return;
    const ids = sectionIds.split('|');

    const nodes = ids
      .map((id) => root.querySelector<HTMLElement>(`#${CSS.escape(id)}`))
      .filter((node): node is HTMLElement => node != null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit?.target.id) setActiveId(hit.target.id);
      },
      {
        root,
        rootMargin: '-12% 0px -55% 0px',
        threshold: [0, 0.15, 0.35, 0.6, 1],
      },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [sectionIds]);

  const navItems: TriageNavItem[] = sections.map(({ id, label }) => ({ id, label }));

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)} data-testid={testId}>
      {header ? <div className="shrink-0">{header}</div> : null}
      <div className="grid min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        <TriageNav items={navItems} activeId={activeId} onJump={jumpTo} />
        <div
          ref={rootRef}
          className="min-h-0 overflow-y-auto"
          data-triage-scroll-root=""
        >
          <TriageSections sections={sections} />
        </div>
      </div>
    </div>
  );
}

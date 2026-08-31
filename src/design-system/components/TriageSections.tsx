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
 */
export function TriageSections({ sections }: { sections: readonly TriageSectionSpec[] }) {
  return (
    <div className="space-y-4 px-5 py-4">
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="scroll-mt-4"
          aria-labelledby={`${section.id}-heading`}
        >
          <h3
            id={`${section.id}-heading`}
            className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft"
          >
            {section.label}
          </h3>
          <div
            className={cn(
              'mt-2 border border-border-soft bg-surface-card p-4',
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

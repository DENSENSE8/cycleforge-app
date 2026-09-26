'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { DESK_RECORD_MEASURE_CLASS } from '@/design-system/tokens/desk-stage';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';

export type TriageSectionSpec = {
  id: string;
  label: string;
  children: ReactNode;
};

/**
 * Right pane of {@link TriageScrollLayout}.
 * The heading speaks the industrial LABEL voice (owner ruling 2026-09-24 —
 */
export function TriageSections({
  sections,
  banner,
  measure = 'fluid',
}: {
  sections: readonly TriageSectionSpec[];
  /** `fluid` (default): capped at `max-w-4xl`. `fixed`: exactly the desk record measure. */
  measure?: 'fluid' | 'fixed';
  /** Rendered above the first card, inside the same centred measure. */
  banner?: ReactNode;
}) {
  return (
    // `max-w` on the CONTENT, not the pane:
    <div
      className={cn(
        'mx-auto space-y-7 py-5',
        measure === 'fixed'
          ? cn(DESK_RECORD_MEASURE_CLASS, 'shrink-0 px-6')
          : 'w-full max-w-4xl px-6',
      )}
      data-measure={measure}
    >
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
            className={cn(RECORD_LABEL_CLASS, 'text-text-default')}
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

/**
 * A section heading inside the phone order FORM — sentence case, the triage
 * voice (a form uses the readable sentence-case band,
 * `DetailSectionHeading`, for records and operations).
 */

import type { ReactNode } from 'react';

export function MobileFormHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="px-mode-page pb-1.5 pt-5 text-role-caption font-semibold text-text-muted">
      {children}
    </h2>
  );
}

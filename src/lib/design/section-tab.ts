/** Section-tab model — the pure shape behind the station Displays strip. */
import type { ReactNode } from 'react';

export type SectionTabPriority = 'primary' | 'overflow';

export interface SectionTab {
  id: string;
  /** Accessible + visible name on the labeled segment / overflow row. */
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  content: ReactNode;
  count?: number;
  /**
   * `primary` (default) — labeled segment on the strip.
   * `overflow` — listed under the ⋯ menu. Station call sites author this;
   * there is no global "investigation" bucket.
   */
  priority?: SectionTabPriority;
  /** Body-only tab — no strip cell (legacy; Unbox checklist is a Displays leaf). */
  stripHidden?: boolean;
}

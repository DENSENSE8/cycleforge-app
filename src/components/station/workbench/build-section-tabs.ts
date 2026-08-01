/**
 * Generic SectionTabsSlider tab builder — visibility-gated tab defs → SectionTab[].
 *
 * Unbox's `buildUnboxSideTabs` stays domain-specific (content wiring); this helper
 * is the shared waist so Testing / Shipping / Packing can declare the same
 * `{ id, label, icon, content, visible, priority }` shape without hand-filtering.
 */

import type { ReactNode } from 'react';
import type { SectionTab, SectionTabPriority } from '@/design-system/components';

export interface SectionTabDef {
  id: string;
  label: string;
  icon: SectionTab['icon'];
  content: ReactNode;
  count?: number;
  /** When false, the tab is omitted. Default true. */
  visible?: boolean;
  /**
   * `primary` (default) — labeled strip segment.
   * `overflow` — More-displays menu. Authored per station, not a global bucket.
   */
  priority?: SectionTabPriority;
}

/**
 * Filter `visible === false` defs and map to {@link SectionTab} for SectionTabsSlider.
 * Keeps terminal-registry tab ids in lock-step with what the slider shows —
 * call sites must only list ids that the registry knows about.
 */
export function buildSectionTabs(defs: SectionTabDef[]): SectionTab[] {
  return defs
    .filter((d) => d.visible !== false)
    .map(({ id, label, icon, content, count, priority }) => ({
      id,
      label,
      icon,
      content,
      ...(count != null ? { count } : {}),
      ...(priority != null ? { priority } : {}),
    }));
}

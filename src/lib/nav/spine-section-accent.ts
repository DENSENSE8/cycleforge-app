/** MasterNav spine + ⌘K palette row treatment — **monochrome, one ladder**. */

import { appCanvasClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

export type SpineAccentClasses = {
  /** The page you are ON — the strongest fill. */
  activePage: string;
  /**
   * L1 / subgroup that owns the current child — lighter than
   * {@link SpineAccentClasses.activePage}. Never `aria-current`.
   */
  ownsActive: string;
  /** Every other L1 / section row. */
  idlePage: string;
  /** Active L1 icon — SAME ink value as its label. */
  activePageIcon: string;
  /** Idle L1 icon — SAME ink value as its label. */
  idlePageIcon: string;
  /** Active child (page mode / station in a subgroup). */
  childActive: string;
  /** Idle child row — one ink step quieter than an idle parent. */
  childIdle: string;
  /** Active child icon — SAME ink value as its label. */
  childActiveIcon: string;
  /** Idle child icon — SAME ink value as its label. */
  childIdleIcon: string;
  /**
   * ⌘K palette selected-row wash — full `data-[selected=true]:*` tokens so
   * Tailwind scans them (never string-prefix at the consumer).
   */
  cmdkSelected: string;
  /** ⌘K selected-row icon tint — full `group-data-[selected=true]:*` tokens. */
  cmdkSelectedIcon: string;
};

/** Current page: */
const CURRENT_PAGE = `${appCanvasClass} text-text-default`;

/** Parent of the current child — hover-plane wash, quieter than canvas. */
const OWNS_ACTIVE = 'bg-surface-hover text-text-default';

/** ONE rail-line element, TWO tokens (2026-08-16, corrected same day). */
export function spineRailLineClass(active: boolean): string {
  return cn(
    'w-0.5 shrink-0 self-stretch transition-colors duration-150',
    active ? 'bg-text-default' : 'bg-border-soft',
  );
}

/** THE treatment. */
export const SPINE_ACCENT: SpineAccentClasses = {
  activePage: CURRENT_PAGE,
  ownsActive: OWNS_ACTIVE,
  idlePage: 'text-text-default hover:bg-surface-hover',
  activePageIcon: 'text-text-default',
  idlePageIcon: 'text-text-default',
  childActive: CURRENT_PAGE,
  childIdle: 'text-text-default hover:bg-surface-hover',
  childActiveIcon: 'text-text-default',
  childIdleIcon: 'text-text-default',
  cmdkSelected: 'data-[selected=true]:bg-surface-canvas data-[selected=true]:text-text-default',
  cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-text-default',
};

/** The same current-page treatment as {@link SpineAccentClasses.activePage}, expressed as `data-[active=true]:` variants. */
export const SPINE_ACCENT_DATA_ACTIVE = [
  'data-[active=true]:bg-surface-canvas',
  'data-[active=true]:text-text-default',
  // The row you are ON does not lift under the pointer — it is already the strongest fill, and a hover wash on it reads as "this is a…
  'data-[active=true]:hover:bg-surface-canvas',
].join(' ');

/* `SPINE_NEUTRAL_ACCENT` is deleted, not aliased. */

/**
 * Resolve a row's treatment. Takes the section id purely so call sites keep
 * one resolution point; the answer is the same for every section, which is
 * the entire ruling.
 */
export function spineAccentFor(_sectionId?: string | null): SpineAccentClasses {
  return SPINE_ACCENT;
}

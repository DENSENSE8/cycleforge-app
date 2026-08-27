'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import {
  SidebarSectionList,
  type SidebarSection,
} from '@/components/sidebar/SidebarSectionList';

/**
 * THE sidebar facet control — an eyebrow label over a vertical
 * {@link SidebarSectionList} at `density="ops"`, pinned above the scroll body.
 *
 * It replaces the 40px `HorizontalButtonSlider` pill band that route rails used to
 * mount in `SidebarShell`'s `headerRows[]` slot. Rows stay visible at rest with
 * their counts — the band's one real virtue, kept — without its fixed vertical
 * cost or its horizontal truncation past about four values. Vertical rows with
 * trailing counts in the navigator column is also what Linear, Height and
 * Superhuman all do; nobody puts a segmented band *inside* the sidebar.
 *
 * This is a promotion, not an invention: the since-deleted Incoming Views rail
 * and Media Library facet rail ("Sources") each reached for this exact markup
 * independently, and both hand-copied the same wrapper. With the rest of the
 * rails migrating onto it, a third copy would be the fork the rules ban. (Both
 * went rail-less — Media Library 2026-08-09, Incoming 2026-08-10 — so their
 * rows here are history; the live consumers are `VoicemailQueue` and
 * `CallLogSidebar`.)
 *
 * **`density="ops"` is baked in on purpose.** The list's default `comfortable`
 * register is the Settings navigator shape (`py-3`, `text-sm`, a hairline under
 * every row); `ops` is the floor-rail shape (`py-1.5`, `text-role-caption`,
 * `divide-y` on the container, quiet `NAV_ROW.selectedClass`). Passing the wrong
 * one is the mistake this wrapper exists to make impossible.
 *
 * **Never wrap this in an `h-full` host.** `SidebarSectionList` deliberately drops
 * `h-full` under `ops` because it is a pinned block with siblings beneath it;
 * re-adding height makes it claim the column and paint over everything below.
 *
 * Single-select only. A facet that must hold two values at once — or a column
 * carrying three-plus facets — belongs on `SidebarShell`'s first-class `filter`
 * prop (`FilterRefinementBar variant="sidebar"`) instead.
 */
export function SidebarFacetGroup<TId extends string>({
  label,
  sections,
  active,
  onSelect,
  ariaLabel,
  action,
}: {
  label: string;
  sections: SidebarSection<TId>[];
  active: TId | null;
  onSelect: (id: TId) => void;
  ariaLabel: string;
  /** Optional trailing control in the eyebrow row. Bleed its hit box with `-my-1`. */
  action?: ReactNode;
}) {
  return (
    <div className="shrink-0 border-b border-border-hairline">
      <div className={cn(SIDEBAR_GUTTER, 'flex items-center justify-between gap-2 pt-2')}>
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
        {action}
      </div>
      <SidebarSectionList
        sections={sections}
        active={active}
        onSelect={onSelect}
        ariaLabel={ariaLabel}
        density="ops"
      />
    </div>
  );
}

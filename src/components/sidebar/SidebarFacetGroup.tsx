'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import {
  SidebarSectionList,
  type SidebarSection,
} from '@/components/sidebar/SidebarSectionList';

/** THE sidebar facet control — an eyebrow label over a vertical {@link SidebarSectionList} at `density="ops"`, pinned above the scroll body. */
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
        <p className="text-role-eyebrow text-text-soft">{label}</p>
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

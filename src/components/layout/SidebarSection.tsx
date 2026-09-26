import type { ElementType, ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { SIDEBAR_GUTTER, sidebarHeaderPillRowClass } from './header-shell';

interface SidebarSectionProps {
  children: ReactNode;
  /**
   * Render as the shared 40px header band (pill rows, search rows): fixed
   * height + hairline divider + the gutter. Omit for a plain gutter-only row
   * (content, legends, lists).
   */
  band?: boolean;
  /** Extra classes — layout/visuals only. Never re-set the left padding here. */
  className?: string;
  as?: ElementType;
}

/** The single source of the sidebar left gutter. */
export function SidebarSection({
  children,
  band = false,
  className,
  as: Tag = 'div',
}: SidebarSectionProps) {
  return (
    <Tag className={cn(band ? sidebarHeaderPillRowClass : SIDEBAR_GUTTER, className)}>
      {children}
    </Tag>
  );
}

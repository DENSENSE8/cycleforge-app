'use client';

import type { NavSection } from '@/lib/nav/context/schema';
import { navGoLetter } from '@/lib/nav/go-keys';
import { getSidebarPageNav } from '@/lib/sidebar-navigation';
import { NavSwitcherMenu } from './NavSwitcherMenu';

/** A lane door's modes section (`<page>.<lane>.modes`, built by the resolver). */
export function isNavModeSection(section: NavSection): boolean {
  return section.id.endsWith('.modes');
}

/**
 * The lane's MODE — the PARENT tier. Under `‹ <Lane>`, one raised block
 * naming the mode you are in (Shipping); hover or Enter opens the lane's
 * other modes (FBA, Label intake) to the right of the sidebar
 * (`NavSwitcherMenu`), each with its `G` then letter keys (`NavGoKeys`
 * binds them). Each mode is a page with its own panel below this switcher.
 */
export function NavModeSwitcher({ section, currentPageId }: { section: NavSection; currentPageId: string }) {
  const entries = section.items.map((item) => {
    const icon = getSidebarPageNav(item.id)?.icon;
    const letter = navGoLetter(item.id);
    return {
      item,
      glyph: icon ? { icon, tone: 'text-text-muted' } : null,
      keys: letter ? ['G', letter.toUpperCase()] : undefined,
    };
  });
  if (entries.length === 0) return null;
  return (
    <NavSwitcherMenu
      kind="mode"
      name={section.label ?? 'Mode'}
      groups={[{ id: section.id, entries }]}
      currentId={section.items.some((item) => item.id === currentPageId) ? currentPageId : section.items[0]?.id}
    />
  );
}

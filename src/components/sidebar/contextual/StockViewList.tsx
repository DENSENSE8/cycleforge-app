'use client';

import Link from 'next/link';
import type { NavItem } from '@/lib/nav/context/schema';
import { KeyboardKey } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { NAV_BLOCK_CLASS, NAV_CHOICE_SELECTED_CLASS } from './nav-block';
import { navRowGlyph } from './NavSectionList';
import { useViewHotkeys } from './NavViewSwitcher';
import { GO_HINT_LEAD } from './NavGoKeys';

/**
 * Inventory's sidebar: one `[G] then` lead, then the page's views as `1`–`5`.
 * Each row is a real href. Overview is `/inventory/stock`; All stock is
 * `?view=all`, so choosing one always changes the URL.
 */
export function StockViewList({ items }: { items: readonly NavItem[] }) {
  useViewHotkeys(items, items.length > 1);
  return (
    <div className="flex flex-col gap-1" data-nav-stock-views>
      <div className="flex items-center gap-1.5 px-2 py-1 text-role-caption text-text-muted">
        {GO_HINT_LEAD}
        <Link href="/inventory/stock" className="ml-1 inline-flex items-center gap-1 text-text-default">
          <KeyboardKey size="xs">S</KeyboardKey>
          Stock
        </Link>
      </div>
      {items.slice(0, 5).map((item, index) => {
        const glyph = navRowGlyph(item, 'stock');
        const Icon = glyph?.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            data-nav-stock-view={item.id}
            aria-current={item.active ? 'page' : undefined}
            className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body', item.active && NAV_CHOICE_SELECTED_CLASS)}
          >
            <KeyboardKey size="xs">{index + 1}</KeyboardKey>
            {Icon ? <Icon className={cn('size-4 shrink-0', glyph?.tone)} /> : null}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

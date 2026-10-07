'use client';

import Link from 'next/link';
import type { NavItem } from '@/lib/nav/context/schema';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { NAV_BLOCK_CLASS, NAV_CHOICE_SELECTED_CLASS } from './nav-block';
import { navRowGlyph } from './NavSectionList';
import { useViewHotkeys } from './NavViewSwitcher';
import { GO_HINT_LEAD } from './NavGoKeys';

/**
 * Inventory's sidebar: one `[G] then` lead. View keys (`S`, `1`–`5`) sit on
 * hover. Each row is a real href. Overview is `/inventory/stock`; All stock is
 * `?view=all`, so choosing one always changes the URL.
 */
export function StockViewList({ items }: { items: readonly NavItem[] }) {
  useViewHotkeys(items, items.length > 1);
  return (
    <div className="flex flex-col gap-1" data-nav-stock-views>
      <div className="flex items-center gap-1.5 px-2 py-1 text-role-caption text-text-muted">
        {GO_HINT_LEAD}
        <HoverTooltip label="Stock" shortcut="S" asChild>
          <Link href="/inventory/stock" className="ml-1 inline-flex items-center text-text-default" aria-keyshortcuts="S">
            Stock
          </Link>
        </HoverTooltip>
      </div>
      {items.slice(0, 5).map((item, index) => {
        const glyph = navRowGlyph(item, 'stock');
        const Icon = glyph?.icon;
        return (
          <HoverTooltip key={item.id} label={item.label} shortcut={String(index + 1)} asChild>
            <Link
              href={item.href}
              data-nav-stock-view={item.id}
              aria-current={item.active ? 'page' : undefined}
              aria-keyshortcuts={String(index + 1)}
              className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body', item.active && NAV_CHOICE_SELECTED_CLASS)}
            >
              {Icon ? <Icon className={cn('size-4 shrink-0', glyph?.tone)} /> : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          </HoverTooltip>
        );
      })}
    </div>
  );
}

'use client';

import Link from 'next/link';
import type { NavSection } from '@/lib/nav/context/schema';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives';
import { Check, ChevronDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { getSidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { NAV_BLOCK_CLASS } from './nav-block';

/** A lane door's modes section (`<page>.<lane>.modes`, built by the resolver). */
export function isNavModeSection(section: NavSection): boolean {
  return section.id.endsWith('.modes');
}

/**
 * The lane's MODE — under `‹ <Lane>`, one pressable block naming the mode you
 * are in (Shipping), opening the lane's other modes (FBA, Label intake).
 * Each mode is a page with its own contextual panel below this switcher.
 */
export function NavModeSwitcher({ section, currentPageId }: { section: NavSection; currentPageId: string }) {
  const current = section.items.find((item) => item.id === currentPageId) ?? section.items[0];
  if (!current) return null;
  const CurrentIcon = getSidebarPageNav(current.id)?.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-nav-mode
          aria-label={`${section.label ?? 'Mode'}: ${current.label}`}
          className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body font-medium ring-1 ring-border-hairline')}
        >
          {CurrentIcon ? (
            <span aria-hidden className="flex shrink-0">
              <CurrentIcon className={navIconStrokeClass('size-4 text-text-muted')} />
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate">{current.label}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {section.items.map((item) => {
          const Icon = getSidebarPageNav(item.id)?.icon;
          const selected = item.id === current.id;
          return (
            <DropdownMenuItem key={item.id} asChild>
              <Link href={item.href} prefetch={false} aria-current={selected ? 'page' : undefined}>
                {Icon ? (
                  <span aria-hidden className="flex shrink-0">
                    <Icon className={navIconStrokeClass('size-4 text-text-muted')} />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {selected ? <Check aria-hidden className="size-3.5 shrink-0 text-text-default" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

/**
 * The ⋯ More pull-down, after Apple's HIG Pull-down buttons + Menus (researched 2026-10-03):
 *
 * - "Consider using a More pull-down button to present items that don't need prominent positions
 *   in the main interface." The record's secondary verbs (add a person, alert, log a call, link
 *   media …) live here; the ONE primary stays on the screen.
 * - Medium layout: up to three frequent actions as a top row (symbol above a short label), the
 *   rest as a list. Items are grouped by function, separated by a gap band; most-used first.
 * - Labels are title-case verbs, no articles; a label ends with "…" when the action needs more
 *   input in another view. The symbol sits AFTER the label. Destructive items are red and ask
 *   for confirmation in a sheet away from the menu (house `ConfirmSheet`) — never run straight from it.
 * - At least three items, or it is not worth a menu.
 */

import { Fragment } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { IosBarButton } from './IosBar';
import { cn } from '@/utils/_cn';

export interface IosMenuItem {
  id: string;
  /** Title-case verb; end with "…" when it opens another view for input. */
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function IosMoreMenu({
  quick = [],
  groups,
  label = 'More',
}: {
  /** Medium layout: up to three frequent actions as a top row. */
  quick?: readonly IosMenuItem[];
  /** The list, in groups; empty groups are dropped. */
  groups: readonly (readonly IosMenuItem[])[];
  label?: string;
}) {
  const lists = groups.filter((g) => g.length > 0);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <IosBarButton label={label} data-testid="ios-more-menu" data-disclosure-slot="more">
          <MoreHorizontal aria-hidden className="size-5" />
        </IosBarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          'z-elevatedModal w-[min(18rem,calc(100vw-24px))] overflow-hidden border-border-hairline bg-surface-card/95 p-0 shadow-xl backdrop-blur-xl',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 origin-top-right',
        )}
      >
        {quick.length > 0 ? (
          <div className="grid grid-cols-3 gap-px bg-border-hairline">
            {quick.slice(0, 3).map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.id}
                  disabled={item.disabled}
                  onSelect={item.onSelect}
                  data-testid={`ios-menu-${item.id}`}
                  className="min-h-16 flex-col justify-center gap-1 bg-surface-card px-1 py-2 text-role-caption font-medium text-text-default focus:bg-surface-hover [&>svg]:size-5"
                >
                  <Icon aria-hidden />
                  {item.label}
                </DropdownMenuItem>
              );
            })}
          </div>
        ) : null}
        {lists.map((group, gi) => (
          <Fragment key={group[0]!.id}>
            {/* HIG: groups split by a gap in the menu's background, not a hairline. */}
            {gi > 0 || quick.length > 0 ? <div aria-hidden className="h-2 bg-surface-sunken" /> : null}
            <DropdownMenuGroup>
              {group.map((item, ii) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem
                    key={item.id}
                    disabled={item.disabled}
                    onSelect={item.onSelect}
                    data-testid={`ios-menu-${item.id}`}
                    className={cn(
                      'min-h-11 gap-3 px-4 py-2.5 text-role-data focus:bg-surface-hover [&>svg]:size-5',
                      ii > 0 && 'border-t border-border-hairline',
                      item.destructive ? 'text-text-danger' : 'text-text-default',
                    )}
                  >
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <Icon aria-hidden />
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

/**
 * Global Header Add — shadcn/Radix {@link DropdownMenu} with parent → child
 * submenus for first-class creates.
 *
 * Navigates to the owning desk and parks a {@link GlobalAddIntent} the surface
 * consumes (Incoming leaves, Support create, FBA modals).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { useAuth } from '@/contexts/AuthContext';
import {
  GLOBAL_ADD_GROUPS,
  parkGlobalAddIntent,
  type GlobalAddItem,
} from '@/lib/global-add/catalog';
import { FBA_OPEN_CREATE_PLAN, FBA_OPEN_QUICK_ADD_FNSKU } from '@/lib/fba/events';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

function dispatchSurfaceEvents(item: GlobalAddItem) {
  if (!item.intent) return;
  if (item.intent.kind === 'fba-create-plan') {
    window.dispatchEvent(new Event(FBA_OPEN_CREATE_PLAN));
    return;
  }
  if (item.intent.kind === 'fba-quick-add-fnsku') {
    window.dispatchEvent(new CustomEvent(FBA_OPEN_QUICK_ADD_FNSKU, { detail: {} }));
  }
}

export function GlobalHeaderAddMenu() {
  const router = useRouter();
  const { has } = useAuth();
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    return GLOBAL_ADD_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permission || has(item.permission),
      ),
    })).filter((group) => group.items.length > 0);
  }, [has]);

  const onSelect = (item: GlobalAddItem) => {
    setOpen(false);
    if (item.intent) parkGlobalAddIntent(item.intent);
    router.push(item.href);
    queueMicrotask(() => dispatchSurfaceEvents(item));
  };

  // Always paint the trigger — never gate the control on catalog/permissions.
  // Empty groups still open a disabled placeholder inside the menu.
  return (
    <div className={HEADER_ICON_WRAP} data-testid="global-header-add-wrap">
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <IconButton
            type="button"
            size="md"
            ariaLabel="Add"
            title="Add"
            aria-expanded={open}
            data-testid="global-header-add"
            className={cn(
              HEADER_ICON_BTN_CLASS,
              'text-text-default',
              open && cn(HEADER_ICON_BTN_OPEN_CLASS, 'text-emerald-700'),
            )}
            icon={<Plus className={TOP_CHROME_ICON_FACE} />}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={0}
          className="min-w-[11rem]"
          data-testid="global-header-add-menu"
        >
          {groups.length === 0 ? (
            <DropdownMenuItem disabled>No create actions available</DropdownMenuItem>
          ) : (
            groups.map((group) => (
              <DropdownMenuSub key={group.id}>
                <DropdownMenuSubTrigger data-testid={`global-add-group-${group.id}`}>
                  {group.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  sideOffset={0}
                  className="w-72"
                  data-testid={`global-add-submenu-${group.id}`}
                >
                  {group.items.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      data-testid={`global-add-${item.id}`}
                      className="items-start py-2"
                      onSelect={() => onSelect(item)}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-role-caption font-semibold text-text-default">
                          {item.label}
                        </span>
                        <span className="text-role-micro text-text-soft">
                          {item.subtitle}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

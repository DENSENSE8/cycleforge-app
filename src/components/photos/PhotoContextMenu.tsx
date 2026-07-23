'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { cn } from '@/utils/_cn';
import type { ReactNode } from 'react';

export interface PhotoContextMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

/**
 * Cursor-anchored right-click menu for photo library actions.
 * Built on Kinetic Ledger DropdownMenu (Radix) with a 1×1 virtual trigger
 * at the click point — replaces the hand-rolled portal + clamp.
 */
export function PhotoContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: PhotoContextMenuItem[];
  onClose: () => void;
}) {
  return (
    <DropdownMenu
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed h-px w-px opacity-0"
          style={{ left: x, top: y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={0}
        className="min-w-[200px] rounded-xl"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {items.map((item) => (
          <div key={item.key}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              tone={item.danger ? 'danger' : 'default'}
              onSelect={() => {
                item.onClick();
                onClose();
              }}
              className="gap-2.5 px-2.5 py-1.5 text-role-caption font-semibold"
            >
              {item.icon ? (
                <span className={cn('shrink-0', item.danger ? 'text-rose-500' : 'text-text-faint')}>
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

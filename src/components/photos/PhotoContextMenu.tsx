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
  /** A verb the target cannot take right now — painted, never hidden. */
  disabled?: boolean;
  separatorBefore?: boolean;
}

/**
 * Cursor-anchored right-click menu for photo library actions — the same verb
 * set as the bottom PhotoSelectionDock (`usePhotoVerbs`). Built on Kinetic
 * Ledger DropdownMenu (Radix) with a 1×1 virtual trigger at the click point.
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
        className="min-w-[200px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {items.map((item) => (
          <div key={item.key}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              tone={item.danger ? 'danger' : 'default'}
              disabled={item.disabled}
              onSelect={() => {
                item.onClick();
                onClose();
              }}
              className="gap-2.5 px-2.5 py-1.5 text-role-caption font-semibold"
            >
              {item.icon ? (
                <span className={cn('shrink-0 [&_svg]:size-3.5', !item.danger && 'text-text-faint')}>
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

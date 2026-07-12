'use client';

/**
 * ToolbarControlsDisclosure — a contextual slide-in for a board toolbar's
 * secondary controls. Collapsed, it is a single `SlidersHorizontal` toggle; open,
 * the controls slide in horizontally to its left so the resting toolbar stays
 * quiet (just tabs + the primary filter + this gear).
 *
 * Motion: the reveal is a `grid-template-columns` 0fr→1fr transition (the
 * horizontal twin of the sanctioned grid-rows height technique) — NO width/layout
 * animation — plus an opacity fade on the inner cluster. `motion-reduce`
 * collapses both to an instant show/hide. House visual language throughout:
 * `ToolbarButton` trigger, semantic tokens only.
 */

import { useState, type ReactNode } from 'react';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { SlidersHorizontal } from '@/components/Icons';
import { cn } from '@/utils/_cn';

export function ToolbarControlsDisclosure({
  children,
  label = 'Display controls',
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center">
      <div
        className={cn(
          'grid transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div
            aria-hidden={!open}
            className={cn(
              'flex items-center gap-2 pr-2 transition-opacity duration-150 motion-reduce:transition-none',
              open ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            {children}
          </div>
        </div>
      </div>
      <HoverTooltip label={open ? 'Hide controls' : label} focusable={false}>
        <ToolbarButton
          iconOnly
          active={open}
          aria-expanded={open}
          aria-label={label}
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </ToolbarButton>
      </HoverTooltip>
    </div>
  );
}

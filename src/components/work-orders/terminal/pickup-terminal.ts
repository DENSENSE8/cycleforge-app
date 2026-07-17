'use client';

import type { ReactNode } from 'react';
import type { TerminalActionVm } from '@/lib/station-terminal';

interface PickupTerminalContext {
  itemCount: number;
  onAddItem: () => void;
  onReview: () => void;
  addIcon?: ReactNode;
  reviewIcon?: ReactNode;
}

/**
 * Local Pickup terminal — one clear next action per SectionTabs display.
 *
 * Empty intake and the Add display keep the operator in catalog search. Once
 * the Item display has staged lines, the dock advances to review/finalize.
 */
export function resolvePickupTerminal(
  kind: string,
  ctx: PickupTerminalContext,
): TerminalActionVm | null {
  if (kind === 'add-item' || (kind === 'mode-default' && ctx.itemCount === 0)) {
    return {
      label: 'Add item',
      onClick: ctx.onAddItem,
      tone: 'emerald',
      icon: ctx.addIcon,
      maxWidth: 'max-w-[720px]',
      fullWidth: true,
      docked: true,
    };
  }

  if (kind !== 'mode-default') return null;

  return {
    label: `Review ${ctx.itemCount} item${ctx.itemCount === 1 ? '' : 's'}`,
    onClick: ctx.onReview,
    tone: 'emerald',
    icon: ctx.reviewIcon,
    maxWidth: 'max-w-[720px]',
    fullWidth: true,
    docked: true,
  };
}

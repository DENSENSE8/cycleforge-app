'use client';

/**
 * The ONE menu row — verb + optional hint underneath. Tone lives on
 * {@link MENU_ITEM_TONE_CLASS}; this file owns hierarchy (label over caption)
 * so DropdownMenuItem, ContextMenuItem, and Popover menuitems cannot drift.
 *
 * Status commits pass `tone="success" | "warning" | "cancel"` on the host
 * item (pill at rest). Accent verbs pass `tone="accent"` (ink until hover).
 * Destructive verbs stay `tone="danger"` (ink until hover — not a pill).
 *
 * Popover hosts: `<button role="menuitem" className={menuItemClass(tone)}>`
 * wrapping this row. Do not fork a second row component. Do not paint
 * {@link KeyboardKey} here. Group with {@link MorphingMenuSeparator}.
 */

import type { ReactNode } from 'react';
import {
  MENU_ITEM_HINT_CLASS,
  MENU_SEPARATOR_CLASS,
} from '@/design-system/tokens/menu-tone';
import { cn } from '@/utils/_cn';

export type MorphingMenuRowProps = {
  children: ReactNode;
  /** Caption under the verb. */
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function MorphingMenuRow({ children, hint, icon, className }: MorphingMenuRowProps) {
  return (
    <span className={cn('flex min-w-0 flex-1 items-start gap-2', className)}>
      {icon ? (
        <span className="mt-0.5 shrink-0 text-current [&>svg]:size-4" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{children}</span>
        {hint != null && hint !== false && hint !== '' ? (
          <span className={MENU_ITEM_HINT_CLASS}>{hint}</span>
        ) : null}
      </span>
    </span>
  );
}

export function MorphingMenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn(MENU_SEPARATOR_CLASS, className)} />;
}

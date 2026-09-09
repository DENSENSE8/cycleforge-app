'use client';

/**
 * Shared Morphing / dropdown action row — To-ship and Tasks mount this, not a
 * local ghost Button fork. Tone comes from {@link MENU_ITEM_TONE_CLASS}.
 * Teaching keys stay {@link KeyboardKey} (gray sunken face + black letter).
 */

import type { ReactNode } from 'react';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DROPDOWN_ITEM_CORNER } from '@/design-system/tokens/radius';
import { MENU_ITEM_TONE_CLASS, type MenuItemTone } from '@/design-system/tokens/menu-tone';
import { cn } from '@/utils/_cn';

export function MorphingMenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-border-soft" />;
}

export function MorphingMenuRow({
  label,
  hint,
  hotkey,
  onClick,
  lead,
  tone = 'default',
  testId,
}: {
  label: string;
  hint?: string | null;
  hotkey?: string;
  onClick: () => void;
  lead?: ReactNode;
  tone?: MenuItemTone;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      aria-label={
        hotkey
          ? `${label}${hint ? ` — ${hint}` : ''} (press ${hotkey})`
          : hint
            ? `${label} — ${hint}`
            : label
      }
      onClick={onClick}
      className={cn(
        'flex w-full min-w-0 items-center justify-start px-2 py-1.5 text-left text-sm font-semibold outline-none',
        focusRing('control', 'accent'),
        MENU_ITEM_TONE_CLASS[tone],
        DROPDOWN_ITEM_CORNER,
        hint || lead ? 'h-auto' : undefined,
      )}
    >
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="size-2 shrink-0 rounded-full bg-current" aria-hidden />
        {lead}
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="block truncate">{label}</span>
          {hint ? (
            <span className="block truncate text-role-caption font-medium opacity-70">{hint}</span>
          ) : null}
        </span>
        {hotkey ? (
          <KeyboardKey aria-hidden size="sm" className="pointer-events-none ml-auto">
            {hotkey}
          </KeyboardKey>
        ) : null}
      </span>
    </button>
  );
}

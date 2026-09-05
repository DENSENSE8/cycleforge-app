'use client';

/**
 * Discovery CTA for throwing a task — lives in the header's pace-and-next
 * panel, not the account ⋯ menu.
 *
 * Distinct from "Add a task" on the personal `staff_todos` list. This opens
 * {@link ThrowTaskPanel} (scan · pick colleague · send) via the app-wide
 * host so ⌘⇧U and this row share one mount.
 *
 * The panel closes first: stacking the throw overlay on the 290px goal card
 * would hide the scan field behind a popover the operator just left.
 */

import { Send } from '@/components/Icons';
import {
  THROW_TASK_HOTKEY_LABEL,
  openThrowTask,
} from '@/components/quick-access/ThrowTaskHost';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

export function ThrowTaskRow({ onOpen }: { onOpen?: () => void }) {
  return (
    <div className="border-b border-border-hairline">
      <button
        type="button"
        onClick={() => {
          onOpen?.();
          openThrowTask();
        }}
        className={cn(
          'ds-raw-button group flex w-full items-center gap-2 rounded-none px-3.5 py-2.5 text-left transition-colors hover:bg-surface-hover',
          focusRing('control', 'accent'),
        )}
      >
        <Send className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
          Throw a task
        </span>
        <KeyboardKey size="md">{THROW_TASK_HOTKEY_LABEL}</KeyboardKey>
      </button>
    </div>
  );
}

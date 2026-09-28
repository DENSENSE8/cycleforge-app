'use client';

/** Discovery CTA for throwing a task — lives in the header's pace-and-next panel, not the account ⋯ menu. */

import { Send } from '@/components/Icons';
import {
  THROW_TASK_HOTKEY_LABEL,
  openThrowTask,
} from '@/components/quick-access/ThrowTaskHost';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { KeyboardKey } from '@/design-system/primitives';

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
        <KeyboardKey size="xs">
          {THROW_TASK_HOTKEY_LABEL}
        </KeyboardKey>
      </button>
    </div>
  );
}

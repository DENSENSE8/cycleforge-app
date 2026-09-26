'use client';

/** The LIST's `⋯` — the same Telegram-shaped control as the row menu, one rung up: */

import { MoreHorizontal, Check, Trash2 } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { cn } from '@/utils/_cn';

export function TaskListMenu({
  listLabel,
  doneCount,
  total,
  onClearCompleted,
  onDeleteAll,
  touch = false,
}: {
  /** Names the list in the trigger's accessible name ("To-do", "Recurring"). */
  listLabel: string;
  doneCount: number;
  total: number;
  onClearCompleted: () => void;
  onDeleteAll: () => void;
  touch?: boolean;
}) {
  const itemClass = cn('text-role-caption', touch && 'min-h-[44px] px-3 text-role-data');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          size={touch ? 'touch' : 'sm'}
          ariaLabel={`${listLabel} list actions`}
          icon={<MoreHorizontal className={touch ? 'h-5 w-5' : 'h-4 w-4'} />}
          className="shrink-0 text-text-faint transition-colors hover:bg-surface-sunken hover:text-text-default"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={2} className="min-w-[12rem]">
        {/* The "View everything" / "Deleted tasks" deep-links to `/?mode=tasks` were cut with the Tasks mode (2026-09-14): */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={itemClass}
          disabled={doneCount === 0}
          onSelect={onClearCompleted}
        >
          <Check className="h-4 w-4" /> Clear completed{doneCount > 0 ? ` (${doneCount})` : ''}
        </DropdownMenuItem>
        <DropdownMenuItem
          className={itemClass}
          tone="danger"
          disabled={total === 0}
          onSelect={onDeleteAll}
        >
          <Trash2 className="h-4 w-4" /> Delete all{total > 0 ? ` (${total})` : ''}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

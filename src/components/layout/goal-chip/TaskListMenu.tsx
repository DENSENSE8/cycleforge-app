'use client';

/**
 * The LIST's `⋯` — the same Telegram-shaped control as the row menu, one rung
 * up: it carries the verbs that act on the whole list rather than one task.
 *
 * Deliberately the same glyph, the same right-edge position and the same
 * leftward `align="end"` opening as {@link TaskRowMenu}, because it is the same
 * gesture at a different scope. What separates them is only WHERE the dots sit —
 * on a row, or on the list's head.
 *
 * **"View everything" LEAVES this panel.** Every task, sorted, with its deleted
 * half and a record plane, is `Home → Tasks` (`tasks.mine` in the table
 * registry) — a real spreadsheet. Rendering a second archived list inline here
 * would be a hand-rolled twin of that surface's Deleted lane, in 290px, which
 * is the fork this panel was just ported out of. The panel previews and edits
 * the current list; the table is where you triage.
 */

import Link from 'next/link';
import { MoreHorizontal, Archive, Check, Trash2, ExternalLink } from '@/components/Icons';
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
  onNavigate,
  onClearCompleted,
  onDeleteAll,
  touch = false,
}: {
  /** Names the list in the trigger's accessible name ("To-do", "Recurring"). */
  listLabel: string;
  doneCount: number;
  total: number;
  /** Close the popover when a menu item navigates away. */
  onNavigate?: () => void;
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
        <DropdownMenuItem className={itemClass} asChild>
          <Link href="/?mode=tasks" onClick={onNavigate}>
            <ExternalLink className="h-4 w-4" /> View everything
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className={itemClass} asChild>
          <Link href="/?mode=tasks&filter=deleted" onClick={onNavigate}>
            <Archive className="h-4 w-4" /> Deleted tasks
          </Link>
        </DropdownMenuItem>
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

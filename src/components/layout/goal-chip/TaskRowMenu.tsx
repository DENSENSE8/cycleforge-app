'use client';

/**
 * The task row's `⋯` — **one overflow control per row, on the right, opening
 * leftward** (the Telegram message-menu shape the operator already knows).
 *
 * ## Why a menu and not a row of glyphs
 *
 * The row used to carry a single trash can behind `opacity-0 group-hover:` —
 * three problems in one line: it was the ONLY verb a row had (no rename, no
 * restore), it was invisible until hover, and hover does not exist on the phone
 * this panel now has to work on. A touch operator could create and check tasks
 * and could never delete one.
 *
 * So the row's verbs are **declared once, here**, and the same list serves both
 * densities. Adding a verb is adding a row to this file, never a fifth glyph
 * competing for 290px of panel width.
 *
 * ## It opens to the LEFT, and that is structural
 *
 * `align="end"` pins the menu's right edge to the dots, so it expands back
 * across the row it belongs to instead of off the panel edge. In a 290px
 * popover anchored `bottom-end` under the header, any other alignment leaves
 * the viewport.
 */

import { MoreHorizontal, Pencil, Trash2, Check, RotateCcw } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { cn } from '@/utils/_cn';

export interface TaskRowMenuProps {
  /** Row label, so the trigger's accessible name names WHICH task. */
  label: string;
  done: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  /** Archived rows swap Edit/Toggle for a single Restore. */
  onRestore?: () => void;
  /** Sheet density gives every item a 44px touch target. */
  touch?: boolean;
}

export function TaskRowMenu({
  label,
  done,
  onEdit,
  onToggle,
  onDelete,
  onRestore,
  touch = false,
}: TaskRowMenuProps) {
  const itemClass = cn('text-role-caption', touch && 'min-h-[44px] px-3 text-role-data');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          size={touch ? 'touch' : 'sm'}
          ariaLabel={`Task actions — ${label}`}
          icon={<MoreHorizontal className={touch ? 'h-5 w-5' : 'h-4 w-4'} />}
          className="shrink-0 text-text-faint transition-colors hover:bg-surface-sunken hover:text-text-default"
        />
      </DropdownMenuTrigger>
      {/* end-aligned = the menu grows back over the row, never off the panel. */}
      <DropdownMenuContent align="end" side="bottom" sideOffset={2} className="min-w-[10rem]">
        {onRestore ? (
          <DropdownMenuItem className={itemClass} onSelect={onRestore}>
            <RotateCcw className="h-4 w-4" /> Restore
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem className={itemClass} onSelect={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem className={itemClass} onSelect={onToggle}>
              <Check className="h-4 w-4" /> {done ? 'Mark not done' : 'Mark done'}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className={itemClass} tone="danger" onSelect={onDelete}>
          <Trash2 className="h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

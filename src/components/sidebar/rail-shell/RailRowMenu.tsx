'use client';

/** Per-row overflow menu (⋮) for {@link RailRow} — one row, one menu, one action. */

import { Fragment, type ReactNode } from 'react';
import { CheckSquare, Copy, EyeOff, MoreVertical, Share2, Trash2 } from '@/components/Icons';
import { SIDEBAR_RAIL_TRAILING_TRACK_CLASS } from '@/components/layout/header-shell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  RAIL_ROW_ACTION_GROUPS,
  type RailRowAction,
  type RailRowActionIcon,
} from './rail-row-actions';

const ACTION_ICON: Record<RailRowActionIcon, (p: { className?: string }) => ReactNode> = {
  copy: Copy,
  share: Share2,
  hide: EyeOff,
  delete: Trash2,
  select: CheckSquare,
};

function ActionGlyph({ icon }: { icon?: RailRowActionIcon }) {
  if (!icon) return null;
  const Glyph = ACTION_ICON[icon];
  return <Glyph className="h-3.5 w-3.5" />;
}

export function RailRowMenu({
  actions,
  rowLabel,
  open,
  onOpenChange,
  isFocusedRow,
  /** True while the row hover peek is up — the ⋮ sits on the path into that
   *  card; it must not steal the pointer (exceptions copy chips, Unbox peek). */
  peekOpen = false,
}: {
  actions: RailRowAction[];
  /** Row identity for the accessible name — never a bare "More". */
  rowLabel: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  isFocusedRow: boolean;
  peekOpen?: boolean;
}) {
  if (actions.length === 0) return null;

  // Grouped by blast radius, dividers only between groups that both exist —
  // never a leading, trailing or doubled rule when a row happens to lack a verb.
  const groups = RAIL_ROW_ACTION_GROUPS.map((group) =>
    actions.filter((a) => (a.group ?? 'read') === group),
  ).filter((g) => g.length > 0);

  return (
    // modal={false}: a rail row menu must not lock scroll or blank pointer
    // events on the rest of the workbench — the operator can still scan.
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-rail-row-menu=""
          tabIndex={isFocusedRow ? 0 : -1}
          // The listbox above owns Enter / Space / arrows for the ROW. While
          // this trigger holds focus it is driving, not the list, so its keys
          // must not also step or open the row underneath it.
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={`Actions for ${rowLabel}`}
          className={cn(
            'absolute inset-y-0 right-0 z-raised flex items-center justify-end text-text-faint',
            'w-8',
            'opacity-0 transition-opacity duration-100 ease-out',
            peekOpen
              ? 'pointer-events-none group-hover/railrow:pointer-events-none'
              : cn(
                  'pointer-events-none',
                  'group-hover/railrow:pointer-events-auto group-hover/railrow:opacity-100',
                  'hover:text-text-default focus:pointer-events-auto focus:opacity-100',
                ),
            'group-hover/railrow:opacity-100',
            'data-[state=open]:pointer-events-auto data-[state=open]:text-text-default data-[state=open]:opacity-100',
            'coarse:pointer-events-auto coarse:w-11 coarse:opacity-100',
            focusRing('control', 'accent'),
          )}
        >
          <span className={cn(SIDEBAR_RAIL_TRAILING_TRACK_CLASS, 'pointer-events-none')}>
            <MoreVertical className="h-3.5 w-3.5" />
          </span>
        </button>
      </DropdownMenuTrigger>
      {/* Placed like the rail's OWN hover peek ({@link RailPopover}): */}
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={0}
        collisionPadding={8}
        className="min-w-[10rem]"
      >
        {groups.map((group, i) => (
          <Fragment key={group[0].id}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            {group.map((action) => (
              <DropdownMenuItem
                key={action.id}
                data-rail-row-action={action.id}
                tone={action.group === 'danger' ? 'danger' : 'default'}
                className="text-role-caption"
                onSelect={() => action.onSelect()}
              >
                <ActionGlyph icon={action.icon} />
                {action.label}
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

/**
 * Per-row overflow menu (⋮) for {@link RailRow} — one row, one menu, one action.
 *
 * ## Where it sits
 *
 * The trigger is absolutely positioned over the **trailing track**
 * ({@link SIDEBAR_RAIL_TRAILING_TRACK_CLASS}) — the same `w-8` column the row's
 * relative age (`5h`) occupies. Out of flow, so revealing it moves nothing:
 * the AGENTS.md constraint is that nothing may tween a property which triggers
 * reflow, and a row whose neighbours shift on hover is exactly that. Only
 * `opacity` transitions here.
 *
 * **No plate behind it — the glyph and nothing else.** The age it covers is
 * hidden by `RailRow` in the same breath (`data-rail-row-menu-armed` on the
 * row), so the two never overlap. An earlier build painted a gradient wash to
 * mask the age instead; that put a second, softer edge in the rail's right
 * column on every hover, which reads as chrome appearing rather than one mark
 * swapping for another.
 *
 * ## Three ways in, not one
 *
 * Hover-only row actions are unreachable by keyboard and invisible on a
 * touchscreen, so this affordance has three equal entrances:
 *
 *  1. **Pointer** — hover the row (`group-hover/railrow`).
 *  2. **Keyboard** — the rail is a roving-tabindex listbox, so the CURRENT row's
 *     trigger is the rail's one extra tab stop (`tabIndex` 0 only when its row
 *     is focused; every other trigger is -1, or tabbing the sidebar would cost
 *     twenty-five stops). `Shift+F10` / the `ContextMenu` key open it straight
 *     from the focused row — the invocation the ARIA APG names for a
 *     context-specific menu — and Escape closes it and returns focus to the
 *     trigger (Radix).
 *  3. **Touch** — **there is no hover on a touch device.** `/kiosk*` is a
 *     mounted tablet and `/m/*` is a phone, and warehouse operators wear
 *     gloves. Under `coarse:` (`@media (hover: none), (pointer: coarse)`, see
 *     `globals.css`) the ⋮ is permanently resident and widens to a real tap
 *     target. Gated on the INPUT, never on viewport width — a wall tablet is
 *     desktop-width and still has no hover.
 *
 * The trigger is a **sibling** of the row button, never nested inside it: a
 * button inside a button is invalid, and the row's own click must stay "open
 * the record". Radix portals the menu, so selecting an item never bubbles back
 * into the row either.
 */

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
  /** True when this row is the rail's focused (roving-tabindex) row. */
  isFocusedRow,
  onPointerEnter,
}: {
  actions: RailRowAction[];
  /** Row identity for the accessible name — never a bare "More". */
  rowLabel: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  isFocusedRow: boolean;
  /**
   * Fired the moment the pointer reaches the trigger. The host uses it to close
   * the row's hover peek FIRST: the peek opens on a 0ms delay, so it is always
   * up by the time a hand arrives at the ⋮, and letting it unmount in the same
   * commit that mounts the menu made Radix read the churn as an outside
   * interaction and close the menu it had just opened.
   */
  onPointerEnter?: () => void;
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
          onPointerEnter={onPointerEnter}
          aria-label={`Actions for ${rowLabel}`}
          className={cn(
            'absolute inset-y-0 right-0 z-raised flex items-center justify-end text-text-faint',
            // Same `w-8` cell the age occupies, so the ⋮ lands exactly where the
            // resting mark was — one glyph swapping for another, in place.
            'w-8',
            // Opacity only. Never width/margin/inset — those reflow the row.
            'pointer-events-none opacity-0 transition-opacity duration-100 ease-out',
            'group-hover/railrow:pointer-events-auto group-hover/railrow:opacity-100',
            'hover:text-text-default focus:pointer-events-auto focus:opacity-100',
            'data-[state=open]:pointer-events-auto data-[state=open]:text-text-default data-[state=open]:opacity-100',
            // No hover to reveal it with → resident, and at a real tap size. The
            // BOX grows leftward; the glyph below stays pinned to the same
            // track, so touch gets a bigger target at the identical position.
            'coarse:pointer-events-auto coarse:w-11 coarse:opacity-100',
            focusRing('control', 'accent'),
          )}
        >
          <span className={cn(SIDEBAR_RAIL_TRAILING_TRACK_CLASS, 'pointer-events-none')}>
            <MoreVertical className="h-3.5 w-3.5" />
          </span>
        </button>
      </DropdownMenuTrigger>
      {/* Placed like the rail's OWN hover peek ({@link RailPopover}): out to the
          right of the row, flush against the rail edge (`sideOffset={0}`, its
          `GAP = 0`), top-aligned to the row. The peek and the menu are two
          answers to the same row, so they must not arrive from two different
          directions. Radix flips to the left on collision, which is the peek's
          `flipped` branch. `collisionPadding` mirrors its VIEWPORT_PADDING. */}
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

'use client';

import { Fragment, useRef, useState } from 'react';
import Link from 'next/link';
import type { NavItem } from '@/lib/nav/context/schema';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  KeyboardKey,
} from '@/design-system/primitives';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { SIDEBAR_CHIP_CORNER } from '@/design-system/tokens/radius';
import { useHoverSurface } from '@/hooks/useHoverSurface';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { ChevronRight, ChevronsUpDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { cn } from '@/utils/_cn';
import { NAV_BLOCK_CLASS, NAV_CHOICE_PRESS_CLASS, NAV_CHOICE_SELECTED_CLASS } from './nav-block';
import type { Glyph } from './NavSectionList';

/** One choice in a switcher: a lane's mode or a page's view. */
export type NavSwitcherEntry = {
  item: NavItem;
  glyph: Glyph | null;
  /**
   * The keys that open it, painted only in the open menu: `['1']` for a view
   * (bare digit), `['G', 'S']` for a mode (`G` then a letter).
   */
  keys?: readonly string[];
  /** `aria-keyshortcuts` for a single chord; sequences have no ARIA form. */
  ariaKeys?: string;
  /** The entry has a count; its width is held while it loads. */
  countSlot?: boolean;
  count?: number;
};

/** Entries split by a hairline, never a text heading (the category law). */
export type NavSwitcherGroup = { id: string; label?: string; entries: readonly NavSwitcherEntry[] };

/**
 * A sidebar switcher — the lane's MODE (Shipping · FBA · Label intake) or the
 * page's VIEW (Exceptions · PO paired · …). Things you change rarely, so at
 * rest it is ONE pressable block naming where you are. The choices live
 * behind it and open to the RIGHT of the sidebar, outside the column:
 *
 * - hover opens it (the one hover engine, `useHoverSurface`: 0ms open, 150ms
 *   close), so the pointer can run up and down the sidebar and every row
 *   stays where it is — the menu never covers the column;
 * - Enter / Space / ↓ open it from the keyboard (Radix). An open menu takes
 *   focus, so hover never opens it while a field (Find) has focus;
 * - the open menu is where hotkeys are taught: glyph → keys → label (HOTKEY
 *   FIRST), then the count. The trigger never paints a key.
 *
 * Two tiers, told apart before reading (operator 2026-09-27):
 * - PARENT (`mode`, a place): a raised card, the lane icon in full ink (no tile),
 *   semibold, ⇅ ("switch where you are"), keys `G` then a letter;
 * - CHILD (`view`, a list in that place): a hairline block, the view's bare
 *   state glyph, medium weight, its count, › ("pick from a list"), bare
 *   `1`–`9`.
 */
export function NavSwitcherMenu({
  kind,
  name,
  groups,
  currentId,
}: {
  kind: 'mode' | 'view';
  /** What is being switched, for the accessible name ("Mode", "View"). */
  name: string;
  groups: readonly NavSwitcherGroup[];
  currentId: string | undefined;
}) {
  const entries = groups.flatMap((group) => group.entries);
  const parent = kind === 'mode';
  const current = entries.find((entry) => entry.item.id === currentId);
  const hover = useHoverSurface();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openedBy = useRef<'pointer' | 'keyboard'>('pointer');
  const [sideOffset, setSideOffset] = useState(0);

  // At rest the other views are behind the menu, so a view flagged
  // `alertCount` (Exceptions) still beacons on the trigger while > 0.
  const alerts = entries.filter(
    (entry) => entry !== current && entry.glyph?.alertCount && entry.count !== undefined && entry.count > 0,
  );

  // The menu starts at the sidebar column's right edge, not the block's: the
  // head's padding would otherwise let it overlap the column.
  const measure = () => {
    const trigger = triggerRef.current;
    const column = trigger?.closest('[data-contextual-sidebar]');
    if (!trigger || !column) return;
    setSideOffset(Math.max(0, Math.round(column.getBoundingClientRect().right - trigger.getBoundingClientRect().right)));
  };

  const CurrentGlyph = current?.glyph;
  return (
    <DropdownMenu
      modal={false}
      open={hover.isOpen}
      onOpenChange={(next) => {
        if (next) {
          measure();
          hover.open();
        } else hover.close();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-nav-switcher={kind}
          aria-label={[`${name}: ${current?.item.label ?? 'none'}`, ...alerts.map((entry) => `${entry.item.label} ${entry.count}`)].join(', ')}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'mouse') return;
            // An open menu takes focus (Radix); never pull it out of a field
            // the operator is typing in (Find).
            if (isEditableKeyTarget(document.activeElement)) return;
            openedBy.current = 'pointer';
            measure();
            hover.open();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') hover.scheduleClose();
          }}
          onPointerDown={(event) => {
            // Hover already opened it: a click must not toggle it shut.
            if (hover.isOpen && event.pointerType === 'mouse') event.preventDefault();
          }}
          onKeyDown={() => {
            openedBy.current = 'keyboard';
          }}
          className={cn(
            NAV_BLOCK_CLASS,
            'text-role-body',
            parent
              ? 'h-9 bg-surface-card font-semibold shadow-sm ring-1 ring-border-soft'
              : cn('h-8 font-medium ring-1 ring-border-hairline', hover.isOpen && 'bg-surface-card shadow-sm'),
          )}
        >
          {CurrentGlyph ? (
            <span aria-hidden className="flex shrink-0">
              {/* Parent: the lane icon in full ink; child: the view's state colour. */}
              <CurrentGlyph.icon className={navIconStrokeClass(cn('size-4', parent ? 'text-text-default' : CurrentGlyph.tone))} />
            </span>
          ) : null}
          <span className={cn('min-w-0 flex-1 truncate', !current && 'text-text-muted')}>{current?.item.label ?? name}</span>
          {alerts.map((entry) => (
            <AlertBeacon key={entry.item.id} entry={entry} />
          ))}
          {current?.countSlot ? <CountChip entry={current} /> : null}
          {parent ? (
            <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-text-muted" />
          ) : (
            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-text-faint" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={sideOffset}
        data-nav-switcher-menu={kind}
        aria-label={name}
        className="min-w-56"
        onPointerEnter={hover.clearCloseTimer}
        onPointerLeave={hover.scheduleClose}
        onCloseAutoFocus={(event) => {
          if (openedBy.current === 'pointer') event.preventDefault();
        }}
        // A hover-opened menu closes when the pointer leaves it. Focus moving
        // (another switcher's menu mounting as the pointer sweeps past) must
        // not dismiss it.
        onFocusOutside={(event) => {
          if (openedBy.current === 'pointer') event.preventDefault();
        }}
        // The trigger is "outside" the content: pressing it must not dismiss
        // the menu hover already opened (the trigger's own handler keeps it).
        onPointerDownOutside={(event) => {
          if (event.target instanceof Node && triggerRef.current?.contains(event.target)) event.preventDefault();
        }}
      >
        {groups.map((group, index) => {
          const previous = groups[index - 1];
          const hairline = previous !== undefined && (Boolean(group.label) || Boolean(previous.label));
          return (
            <Fragment key={group.id}>
              {hairline ? <DropdownMenuSeparator /> : null}
              {group.entries.map((entry) => (
                <SwitcherItem key={entry.item.id} entry={entry} selected={entry.item.id === current?.item.id} />
              ))}
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One choice. ONE is chosen, so the current one sits PRESSED into the
 * surface (`NAV_CHOICE_SELECTED_CLASS`) — no check (reads as multi-select),
 * no hard outline. Its keys sit at the far right like a Linear menu
 * shortcut, in a column whose width is always held: invisible at rest, they
 * fade in while the row is hovered or keyboard-highlighted (Radix
 * `data-highlighted`) — the label never moves.
 */
function SwitcherItem({ entry, selected }: { entry: NavSwitcherEntry; selected: boolean }) {
  const { item, glyph, keys } = entry;
  return (
    <DropdownMenuItem asChild>
      <Link
        href={item.href}
        prefetch={false}
        aria-current={selected ? 'page' : undefined}
        aria-keyshortcuts={entry.ariaKeys}
        data-nav-switcher-item={item.id}
        className={cn(
          'group/item text-role-body',
          NAV_CHOICE_PRESS_CLASS,
          selected && cn(NAV_CHOICE_SELECTED_CLASS, 'focus:bg-surface-sunken'),
        )}
      >
        {glyph ? (
          <span aria-hidden className="flex shrink-0">
            <glyph.icon className={navIconStrokeClass(cn('size-4', glyph.tone))} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge === 'beta' ? (
          <span className="shrink-0 text-role-micro font-semibold uppercase tracking-wider text-text-faint">Beta</span>
        ) : null}
        {entry.countSlot ? <CountChip entry={entry} /> : null}
        {keys && keys.length > 0 ? (
          <span
            aria-hidden
            data-nav-switcher-keys
            className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-data-[highlighted]/item:opacity-100"
          >
            {keys.map((key, index) => (
              <KeyboardKey key={index} size="xs">
                {key}
              </KeyboardKey>
            ))}
          </span>
        ) : null}
      </Link>
    </DropdownMenuItem>
  );
}

/**
 * A view's unfiltered total, right-aligned; amber only for a view flagged
 * `alertCount` (Exceptions) while > 0. The slot's width is held while loading.
 */
function CountChip({ entry }: { entry: NavSwitcherEntry }) {
  const { count, glyph } = entry;
  return (
    <span className="flex min-w-7 shrink-0 justify-end">
      {count !== undefined ? (
        <span
          data-nav-view-count={entry.item.id}
          className={cn(
            'px-1.5 py-0.5 text-role-micro font-medium tabular-nums',
            SIDEBAR_CHIP_CORNER,
            glyph?.alertCount && count > 0
              ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
              : 'bg-surface-sunken text-text-muted',
          )}
        >
          <AnimatedStat value={count} speed="fast" />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Another view's alert, on the closed trigger: its glyph and count in amber,
 * so "Exceptions: 12" is seen without opening the menu.
 */
function AlertBeacon({ entry }: { entry: NavSwitcherEntry }) {
  const Icon = entry.glyph?.icon;
  return (
    <span
      aria-hidden
      data-nav-view-alert={entry.item.id}
      className={cn(
        'flex shrink-0 items-center gap-0.5 bg-amber-50 px-1 py-0.5 text-role-micro font-medium tabular-nums text-amber-700 ring-1 ring-inset ring-amber-200',
        SIDEBAR_CHIP_CORNER,
      )}
    >
      {Icon ? <Icon className={navIconStrokeClass('size-3')} /> : null}
      <AnimatedStat value={entry.count ?? 0} speed="fast" />
    </span>
  );
}

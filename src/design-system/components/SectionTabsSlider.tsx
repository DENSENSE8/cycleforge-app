'use client';

/**
 * SectionTabsSlider — labeled section displays for Station Workbench (and
 * siblings). Owns the CONTENT too: the caller passes tabs with their
 * `content`, and the slider renders the bar plus the active panel under ONE
 * container — panels stay mounted (`hidden`) so per-panel state survives
 * switching.
 *
 * - Primary tabs render as a labeled {@link TabSwitch} (`fit="hug"`,
 *   `variant="solid"` + `solidTone="accent"`) so the active pill follows
 *   staff / theme accent (`bg-accent-bg`).
 * - Tabs marked `priority: 'overflow'` collapse into a ⋯ trigger **inside**
 *   the same rail. When the active tab is in overflow (inline density), the ⋯
 *   takes the accent fill and the active label shows beside the strip.
 * - With a single tab there is no bar — it renders exactly like the plain
 *   display, and the switcher only appears once a second display exists.
 *
 * ## `density="icon"` — the quiet display switcher (2026-08-02)
 *
 * A **flat icon row**, no rail box: idle cells are icon-only with a
 * {@link HoverTooltip}, and the ACTIVE cell expands to icon + label so the
 * current display always names itself exactly once. The vertical ⋮ leaves the
 * rail and becomes a right-aligned peer of `rightSlot` (flat pencil),
 * separated by a hairline. Scan-progress rings stay pane-anchored — not here.
 *
 * This replaced the `stacked` (icon-over-label) density it briefly shipped
 * with. Stacked fixed the width overflow but bought it with a two-row 44px
 * band and a bordered, shadowed, accent-filled rail — three chrome objects
 * competing on one row inside a 360px push column. Icon cells are narrower
 * still, so the strip never overflows, and the switcher stops out-shouting
 * the display it switches.
 *
 * **Icon-only idle cells are the sanctioned nav-chrome exception**, not a
 * break of `ui-design-system.md` → *Icons: structural and paired*: this is a
 * mode switcher (same job as GlobalHeader Mode / Recents / Pins), each cell
 * carries its label as the tooltip AND the accessible name, and the selected
 * display renders its label as visible text. No display is ever unnamed.
 */

import { useId, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, MoreVertical } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Popover } from '@/design-system/primitives/Popover';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { operatorAccentClasses } from '@/utils/operator-accent';
import { cn } from '@/utils/_cn';
import { TabSwitch } from './TabSwitch';

/**
 * Quiet icon cell geometry (`density="icon"`). 32px tall so the row keeps the
 * existing `min-h-9` band — the switcher must not grow the panel header.
 */
const ICON_CELL_CLASS =
  'relative flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 transition-colors';
/** Compact icon row for Unbox Displays — sits under the pane-anchored ring. */
const ICON_CELL_COMPACT_CLASS =
  'relative flex h-6 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 transition-colors';
const ICON_CELL_IDLE_CLASS =
  'text-text-soft hover:bg-surface-hover hover:text-text-default';
/**
 * Selected cell: neutral wash + full-contrast ink, staff accent kept as an icon
 * TINT rather than a saturated fill. A filled accent pill on a 360px column
 * reads louder than the display it selects, and it fought the state colours
 * inside the body (the checklist's own done/active dots).
 */
const ICON_CELL_ACTIVE_CLASS = 'bg-surface-sunken text-text-default';

export type SectionTabPriority = 'primary' | 'overflow';

export interface SectionTab {
  id: string;
  /** Accessible + visible name on the labeled segment / overflow row. */
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  content: ReactNode;
  count?: number;
  /**
   * `primary` (default) — labeled segment on the strip.
   * `overflow` — listed under the ⋯ menu. Station call sites author this;
   * there is no global "investigation" bucket.
   */
  priority?: SectionTabPriority;
  /** Body-only tab — no strip cell (e.g. Unbox checklist via scan-progress ring). */
  stripHidden?: boolean;
}

function resolveActiveTabId(tabIds: string[], value: string): string | undefined {
  if (tabIds.some((id) => id === value)) return value;
  return tabIds[0];
}

export function partitionSectionTabs(tabs: SectionTab[]): {
  primary: SectionTab[];
  overflow: SectionTab[];
} {
  const primary: SectionTab[] = [];
  const overflow: SectionTab[] = [];
  for (const tab of tabs) {
    if (tab.priority === 'overflow') overflow.push(tab);
    else primary.push(tab);
  }
  // Never leave the strip empty when overflow-only tabs somehow appear —
  // promote the first overflow tab so the control stays operable.
  if (primary.length === 0 && overflow.length > 0) {
    const [first, ...rest] = overflow;
    return { primary: [first], overflow: rest };
  }
  return { primary, overflow };
}

export function SectionTabsSlider({
  tabs,
  value,
  onChange,
  ariaLabel = 'Section displays',
  className,
  headerClassName,
  rightSlot,
  showActiveLabel = false,
  density = 'inline',
  compact = false,
}: {
  tabs: SectionTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  /**
   * Extra class on the strip ROW only — e.g. Unbox Displays flush-edge
   * adjustments (`-mr-4`) so the trailing ⋮ sits on the column edge.
   */
  headerClassName?: string;
  /** Context control pinned to the right of the bar row (e.g. an Edit-PO pencil). */
  rightSlot?: ReactNode;
  /**
   * Optional eyebrow naming the active display beside the strip.
   * Auto-enabled when the active tab lives in overflow (⋯ alone isn't enough).
   * Suppressed for `density="icon"` — the selected cell already names itself.
   */
  showActiveLabel?: boolean;
  /**
   * `inline` (default) — labeled `TabSwitch` segments.
   * `icon` — flat icon row; the selected cell expands to icon + label. Opt-in
   * (Unbox Displays first); do not flip the default without a second adopter.
   */
  density?: 'inline' | 'icon';
  /** Tighter icon row + body gap — Unbox Displays under pane-anchored ring. */
  compact?: boolean;
}) {
  const menuListId = useId();
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const iconRail = density === 'icon';
  const iconCellClass = iconRail && compact ? ICON_CELL_COMPACT_CLASS : ICON_CELL_CLASS;
  const iconSizeClass = iconRail && compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const headerRowMinClass = iconRail && compact ? 'min-h-6' : 'min-h-9';
  const headerRowAlignClass = iconRail && compact ? 'items-end' : 'items-center';
  const rightClusterMinClass = iconRail && compact ? 'min-h-6' : 'min-h-8';
  const bodyGapClass = iconRail && compact ? 'space-y-1' : 'space-y-4';
  const stripTabs = tabs.filter((t) => !t.stripHidden);
  const activeId = resolveActiveTabId(
    tabs.map((t) => t.id),
    value,
  );
  const activeTab = tabs.find((t) => t.id === activeId);
  const { primary, overflow } = partitionSectionTabs(stripTabs);
  const showPills = stripTabs.length > 1;
  const overflowActive = Boolean(activeId && overflow.some((t) => t.id === activeId));
  const activeOverflowTab = overflowActive
    ? overflow.find((t) => t.id === activeId)
    : undefined;
  const primaryActiveId =
    activeId && primary.some((t) => t.id === activeId) ? activeId : '';
  // The icon rail's selected cell already labels itself — a second eyebrow
  // beside it was the CLASSIFY-over-Checklist collision on Unbox Displays.
  const showLabel = !iconRail && (showActiveLabel || overflowActive);

  const closeOverflow = () => setOverflowOpen(false);

  const overflowControl =
    overflow.length > 0 ? (
      <>
        {/* ds-raw-button: overflow ⋯ trigger; Popover owns dismissal */}
        <button
          ref={overflowTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={overflowOpen}
          aria-controls={overflowOpen ? menuListId : undefined}
          aria-label={
            activeOverflowTab
              ? `${activeOverflowTab.label}, more displays`
              : 'More displays'
          }
          onClick={() => setOverflowOpen((open) => !open)}
          className={cn(
            'flex items-center justify-center transition-colors',
            focusRing('control', 'accent'),
            iconRail
              ? cn(
                  iconCellClass,
                  overflowActive ? ICON_CELL_ACTIVE_CLASS : ICON_CELL_IDLE_CLASS,
                )
              : cn(
                  'rounded-full px-2.5',
                  overflowActive
                    ? `${operatorAccentClasses.activePill} text-white`
                    : 'text-text-soft hover:text-text-default',
                ),
          )}
        >
          {iconRail ? (
            <MoreVertical className={iconSizeClass} />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </button>
        <Popover
          open={overflowOpen}
          onClose={closeOverflow}
          anchorRef={overflowTriggerRef}
          placement="bottom-end"
          gap={6}
          padded={false}
          role="menu"
          id={menuListId}
          aria-label="More displays"
          className="min-w-[12rem] py-1 shadow-xl ring-1 ring-border-soft/80"
        >
          {overflow.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === activeId;
            return (
              // ds-raw-button: menu item inside Popover role=menu
              <button
                key={tab.id}
                role="menuitem"
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => {
                  onChange(tab.id);
                  closeOverflow();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                  focusRing('control', 'accent'),
                  selected
                    ? 'bg-surface-hover text-text-default'
                    : 'text-text-default hover:bg-surface-hover',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    selected ? 'text-accent-bg' : 'text-text-muted',
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">
                  {tab.label}
                </span>
                {tab.count != null && tab.count > 0 ? (
                  <span className="tabular-nums text-role-caption text-text-muted">
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </Popover>
      </>
    ) : null;

  const hairline = (
    <span aria-hidden className="my-1.5 w-px shrink-0 self-stretch bg-border-hairline" />
  );

  return (
    <div className={className ? `${bodyGapClass} ${className}` : bodyGapClass}>
      {showPills || rightSlot ? (
        <div
          className={cn(
            'flex justify-between gap-1.5',
            headerRowAlignClass,
            headerRowMinClass,
            headerClassName,
          )}
        >
          <div className={cn('flex min-w-0 items-center', iconRail ? 'gap-0.5' : 'gap-2.5')}>
            {showPills ? (
              iconRail ? (
                <div
                  role="group"
                  aria-label={ariaLabel}
                  className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-hide"
                >
                  {primary.map((tab) => {
                    const Icon = tab.icon;
                    const selected = tab.id === activeId;
                    const count =
                      tab.count != null && tab.count > 0
                        ? tab.count > 99
                          ? '99+'
                          : String(tab.count)
                        : null;
                    const cell = (
                      // ds-raw-button: display-switcher cell (see density="icon" docblock)
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        aria-current={selected ? 'page' : undefined}
                        // Idle cells are icon-only, so the label IS the
                        // accessible name — never drop this for the tooltip.
                        aria-label={tab.label}
                        className={cn(
                          iconCellClass,
                          focusRing('control', 'accent'),
                          selected ? ICON_CELL_ACTIVE_CLASS : ICON_CELL_IDLE_CLASS,
                        )}
                      >
                        <Icon
                          className={cn(
                            `${iconSizeClass} shrink-0`,
                            selected ? 'text-accent-bg' : undefined,
                          )}
                        />
                        {selected ? (
                          // No `leading-none` here. `truncate` carries
                          // `overflow:hidden`, so a line-height of 1 makes the
                          // line box exactly the 10px font size and SHEARS every
                          // descender — "Pairin(g)", "Trackin(g)", "Classif(y)"
                          // all render with their tails cut off. The role's own
                          // 1.2 leading costs nothing: the cell is a fixed `h-6`
                          // / `h-8`, so a taller line box cannot grow the row.
                          <span className="max-w-[7rem] truncate text-role-micro">
                            {tab.label}
                          </span>
                        ) : null}
                        {count ? (
                          <span
                            className={cn(
                              'tabular-nums text-role-micro',
                              selected ? 'opacity-70' : 'opacity-80',
                            )}
                          >
                            {count}
                          </span>
                        ) : null}
                      </button>
                    );
                    // Tooltip only where the label is not already on screen.
                    return selected ? (
                      cell
                    ) : (
                      <HoverTooltip key={tab.id} label={tab.label} asChild focusable={false}>
                        {cell}
                      </HoverTooltip>
                    );
                  })}
                </div>
              ) : (
                <div role="group" aria-label={ariaLabel} className="min-w-0">
                  <TabSwitch
                    tabs={primary.map((tab) => ({
                      id: tab.id,
                      label: tab.label,
                      icon: tab.icon,
                      ...(tab.count != null ? { count: tab.count } : {}),
                    }))}
                    activeTab={primaryActiveId}
                    onTabChange={onChange}
                    variant="solid"
                    solidTone="accent"
                    fit="hug"
                    countStyle="plain"
                    trailing={
                      overflowControl ? (
                        <>
                          {hairline}
                          {overflowControl}
                        </>
                      ) : null
                    }
                  />
                </div>
              )
            ) : null}
            {showLabel && activeTab ? (
              <span className="truncate text-role-eyebrow uppercase tracking-widest text-text-muted">
                {activeTab.label}
              </span>
            ) : null}
          </div>
          {/* Icon rail: ⋯ leaves the rail and becomes a right-aligned peer of
              `rightSlot`, hairline between — they used to overlap once the
              rail overflowed (the accent ⋯ covering the Unbox PO pencil). */}
          {iconRail ? (
            overflowControl || rightSlot ? (
              <div className={cn('flex shrink-0 items-center gap-0.5', rightClusterMinClass)}>
                {overflowControl}
                {overflowControl && rightSlot ? hairline : null}
                {rightSlot}
              </div>
            ) : null
          ) : rightSlot ? (
            <div className="flex shrink-0 items-center">{rightSlot}</div>
          ) : null}
        </div>
      ) : null}

      <div>
        {tabs.map((tab) => (
          <div key={tab.id} role="tabpanel" hidden={tab.id !== activeId}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}

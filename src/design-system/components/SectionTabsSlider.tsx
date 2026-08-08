'use client';

/**
 * SectionTabsSlider — labeled section displays for Station Workbench (and
 * siblings). Owns the CONTENT too: the caller passes tabs with their
 * `content`, and the slider renders the bar plus the active panel under ONE
 * container — panels stay mounted (`hidden`) so per-panel state survives
 * switching.
 *
 * - Primary tabs (`density="inline"`) render as industrial {@link TabDisplay}
 *   `appearance="underline"` (parent weight) — never soft `TabSwitch` pills.
 * - Tabs marked `priority: 'overflow'` collapse into a ⋯ trigger. When the
 *   active tab is in overflow (inline density), the ⋯ takes the active
 *   treatment and the active label shows beside the strip.
 * - With a single tab there is no bar — it renders exactly like the plain
 *   display, and the switcher only appears once a second display exists.
 *
 * ## `density="icon"` — SpaceX Displays topic plate
 *
 * Edge-to-edge **PRIMARY_CHROME_ROW_FACE** instrument plate at the top of a Displays push column —
 * a four-edge **`border-border-default`** frame (readable chrome 1px rule — not
 * near-invisible `border-hairline`, which is for internal row dividers only).
 * Primary cells **share the rail equally** (`flex-1`, icon centered) with a
 * {@link HoverTooltip} when idle; the ACTIVE cell keeps icon + caption label
 * with a bottom underline — layout FLIP + label width/opacity via
 * `motionRole.push.rail` (geometry tween, never a spring). Vertical dividers
 * stay Cybertruck-segment. Trailing **⋮** (`MoreVertical`) + optional
 * `rightSlot` (procedure ring) are a right-edge peer cluster on the same row.
 * Nested verb strips sit `gap-0` flush under this plate — no vertical air
 * between tab rows. No soft sunken pills / corner radius.
 *
 * `compact` only tightens the *selected* cell's horizontal padding — never
 * shortens the plate face (a short strip above nested verb rows / claim mode —
 * inverted hierarchy).
 *
 * **Icon-only idle cells are the sanctioned nav-chrome exception**, not a
 * break of `ui-design-system.md` → *Icons: structural and paired*: this is a
 * mode switcher (same job as GlobalHeader Mode / Recents / Pins), each cell
 * carries its label as the tooltip AND the accessible name, and the selected
 * display renders its label as visible text. No display is ever unnamed.
 */

import { useId, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, MoreVertical } from '@/components/Icons';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Popover } from '@/design-system/primitives/Popover';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  motionRole,
  useMotionPressRole,
  useMotionRole,
} from '@/design-system/motion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { TabDisplay } from './TabDisplay';

const FLUSH = cornerClass('flush');

/**
 * SpaceX topic-plate cell face (`density="icon"`). Always
 * {@link PRIMARY_CHROME_ROW_FACE} — the Displays mode plate must outrank nested
 * verb underlines below. Primary cells share the rail equally (`flex-1`); icons
 * stay centered in each share.
 */
const ICON_CELL_CLASS = cn(
  'relative flex min-w-0 flex-1 items-center justify-center transition-colors',
  PRIMARY_CHROME_ROW_FACE,
  FLUSH,
);
/** Overflow ⋮ / strip `rightSlot` peer — square cell, height from primary face. */
export const SECTION_TAB_ICON_OVERFLOW_CELL_CLASS = cn(
  'relative flex aspect-square items-center justify-center transition-colors',
  PRIMARY_CHROME_ROW_FACE,
  FLUSH,
);
export const SECTION_TAB_ICON_CELL_IDLE_CLASS =
  'border-b-2 border-b-transparent text-text-soft hover:bg-surface-hover hover:text-text-default';
/**
 * Selected topic cell: parent underline. Staff accent stays an icon TINT.
 * Idle cells keep a transparent 2px bottom border so selection does not shift.
 * Bottom-only color (`border-b-*`) — never `border-transparent` / `border-text-*`
 * on all sides (those fight `divide-x` cell seams).
 */
export const SECTION_TAB_ICON_CELL_ACTIVE_CLASS =
  'border-b-2 border-b-text-default font-semibold text-text-default';

const ICON_OVERFLOW_CELL_CLASS = SECTION_TAB_ICON_OVERFLOW_CELL_CLASS;
const ICON_CELL_IDLE_CLASS = SECTION_TAB_ICON_CELL_IDLE_CLASS;
const ICON_CELL_ACTIVE_CLASS = SECTION_TAB_ICON_CELL_ACTIVE_CLASS;

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
  /** Body-only tab — no strip cell (legacy; Unbox checklist is a Displays leaf). */
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
  fillHeight = false,
}: {
  tabs: SectionTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  /**
   * Extra class on the strip ROW only — Unbox Displays cancels host `px-4`
   * with `-mx-4` so the SpaceX plate + trailing ⋮ sit column-edge flush.
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
   * `inline` (default) — labeled industrial `TabDisplay` underline segments.
   * `icon` — SpaceX primary-height edge-to-edge topic plate; selected expands to icon + label.
   * Opt-in (Unbox Displays first); do not flip the default without a second adopter.
   */
  density?: 'inline' | 'icon';
  /**
   * Icon plate only: tighter horizontal padding. Never shortens the primary face —
   * a short strip above nested verb rows / claim mode — inverted hierarchy.
   */
  compact?: boolean;
  /**
   * Fill the host column: strip stays `shrink-0`, the active tab panel owns
   * remaining height (`min-h-0 flex-1`). Opt-in for push columns whose body
   * pins a footer (Unbox Displays → Ticket → Claim). Default stays content-
   * sized so Workbench / Support callers do not change.
   */
  fillHeight?: boolean;
}) {
  const menuListId = useId();
  const layoutGroupId = useId();
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const iconRail = density === 'icon';
  /** Topic-plate geometry reflow — tween on the layout curve (never a spring). */
  const { transition: plateLayoutTransition } = useMotionRole(motionRole.push.rail);
  const whileTap = useMotionPressRole(motionRole.gesture.press);
  const iconSizeClass = 'h-4 w-4';
  const headerRowMinClass = PRIMARY_CHROME_ROW_FACE;
  const headerRowAlignClass = 'items-stretch';
  const rightClusterMinClass = iconRail ? PRIMARY_CHROME_ROW_FACE : 'min-h-8';
  const bodyGapClass = iconRail ? 'space-y-0' : 'space-y-4';
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
                  ICON_OVERFLOW_CELL_CLASS,
                  overflowActive ? ICON_CELL_ACTIVE_CLASS : ICON_CELL_IDLE_CLASS,
                )
              : cn(
                  FLUSH,
                  'px-2.5 py-1.5',
                  overflowActive
                    ? 'border-b-2 border-b-text-default text-text-default'
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
          // Industrial flush plate — square (`rounded-none`) with a four-edge
          // `border-border-default` frame + `divide-y` rows matching the SpaceX
          // topic plate, not a floating `rounded-xl` card. Overrides the Popover
          // primitive default via `cn(base, className)` (twMerge). Full-bleed
          // rows: no menu `py-*`; each row owns its `px-3 py-2.5`.
          className="min-w-[12rem] rounded-none border border-border-default divide-y divide-border-default"
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
    <div
      className={cn(
        bodyGapClass,
        fillHeight && 'flex h-full min-h-0 flex-col',
        className,
      )}
    >
      {showPills || rightSlot ? (
        <div
          className={cn(
            'flex justify-between gap-0',
            fillHeight && 'shrink-0',
            headerRowAlignClass,
            headerRowMinClass,
            iconRail && 'border border-border-default bg-surface-card',
            headerClassName,
          )}
        >
          <div
            className={cn(
              'flex min-w-0 items-stretch',
              iconRail ? 'flex-1 gap-0' : 'items-center gap-2.5',
            )}
          >
            {showPills ? (
              iconRail ? (
                <LayoutGroup id={layoutGroupId}>
                  <div
                    role="group"
                    aria-label={ariaLabel}
                    className="flex h-full min-w-0 flex-1 items-stretch gap-0 divide-x divide-border-default overflow-x-auto scrollbar-hide"
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
                        <motion.button
                          key={tab.id}
                          type="button"
                          layout
                          transition={plateLayoutTransition}
                          whileTap={whileTap}
                          onClick={() => onChange(tab.id)}
                          aria-current={selected ? 'page' : undefined}
                          // Idle cells are icon-only, so the label IS the
                          // accessible name — never drop this for the tooltip.
                          aria-label={tab.label}
                          className={cn(
                            ICON_CELL_CLASS,
                            focusRing('control', 'accent'),
                            selected
                              ? cn(
                                  'gap-1.5',
                                  compact ? 'px-1.5' : 'px-2',
                                  ICON_CELL_ACTIVE_CLASS,
                                )
                              : cn('gap-0 px-0', ICON_CELL_IDLE_CLASS),
                          )}
                        >
                          <motion.span layout="position" className="flex shrink-0 items-center">
                            <Icon
                              className={cn(
                                `${iconSizeClass} shrink-0`,
                                selected ? 'text-accent-bg' : undefined,
                              )}
                            />
                          </motion.span>
                          <AnimatePresence initial={false} mode="popLayout">
                            {selected ? (
                              // No `leading-none` — `overflow:hidden` + line-height 1
                              // shears descenders. Plate cells use PRIMARY_CHROME_ROW_FACE.
                              <motion.span
                                key={`${tab.id}-label`}
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                transition={plateLayoutTransition}
                                className="max-w-[7rem] overflow-hidden whitespace-nowrap text-role-caption font-semibold"
                              >
                                {tab.label}
                              </motion.span>
                            ) : null}
                          </AnimatePresence>
                          {count ? (
                            <span
                              className={cn(
                                'tabular-nums text-role-caption',
                                selected ? 'opacity-70' : 'opacity-80',
                              )}
                            >
                              {count}
                            </span>
                          ) : null}
                        </motion.button>
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
                </LayoutGroup>
              ) : (
                <div role="group" aria-label={ariaLabel} className="min-w-0">
                  <TabDisplay
                    tabs={primary.map((tab) => ({
                      id: tab.id,
                      label: tab.label,
                      icon: tab.icon,
                      ...(tab.count != null ? { count: tab.count } : {}),
                    }))}
                    activeTab={primaryActiveId}
                    onTabChange={onChange}
                    density="nested"
                    fit="hug"
                    appearance="underline"
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
              <div
                className={cn(
                  'flex shrink-0 items-stretch gap-0 border-l border-border-default',
                  rightClusterMinClass,
                )}
              >
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

      <div
        className={cn(fillHeight && 'flex min-h-0 flex-1 flex-col')}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              role="tabpanel"
              hidden={!active}
              className={cn(
                fillHeight && active && 'flex h-full min-h-0 flex-col',
              )}
            >
              {tab.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

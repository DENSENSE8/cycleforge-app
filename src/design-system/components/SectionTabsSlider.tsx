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
 *   the same rail. When the active tab is in overflow, the ⋯ takes the
 *   accent fill and the active label shows beside the strip.
 * - With a single tab there is no bar — it renders exactly like the plain
 *   display, and the switcher only appears once a second display exists.
 */

import { useId, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from '@/components/Icons';
import { Popover } from '@/design-system/primitives/Popover';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { operatorAccentClasses } from '@/utils/operator-accent';
import { cn } from '@/utils/_cn';
import { TabSwitch } from './TabSwitch';

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
  rightSlot,
  showActiveLabel = false,
}: {
  tabs: SectionTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
  /** Context control pinned to the right of the bar row (e.g. an Edit-PO pencil). */
  rightSlot?: ReactNode;
  /**
   * Optional eyebrow naming the active display beside the strip.
   * Auto-enabled when the active tab lives in overflow (⋯ alone isn't enough).
   */
  showActiveLabel?: boolean;
}) {
  const menuListId = useId();
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const activeId = resolveActiveTabId(
    tabs.map((t) => t.id),
    value,
  );
  const activeTab = tabs.find((t) => t.id === activeId);
  const { primary, overflow } = partitionSectionTabs(tabs);
  const showPills = tabs.length > 1;
  const overflowActive = Boolean(activeId && overflow.some((t) => t.id === activeId));
  const activeOverflowTab = overflowActive
    ? overflow.find((t) => t.id === activeId)
    : undefined;
  const primaryActiveId =
    activeId && primary.some((t) => t.id === activeId) ? activeId : '';
  const showLabel = showActiveLabel || overflowActive;

  const closeOverflow = () => setOverflowOpen(false);

  const overflowTrailing =
    overflow.length > 0 ? (
      <>
        <span aria-hidden className="my-1.5 w-px shrink-0 self-stretch bg-border-hairline" />
        {/* ds-raw-button: overflow ⋯ inside TabSwitch rail; Popover owns dismissal */}
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
            'flex items-center justify-center rounded-full px-2.5 transition-colors',
            focusRing('control', 'accent'),
            overflowActive
              ? `${operatorAccentClasses.activePill} text-white`
              : 'text-text-soft hover:text-text-default',
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
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

  return (
    <div className={className ? `space-y-4 ${className}` : 'space-y-4'}>
      {showPills || rightSlot ? (
        <div className="flex min-h-9 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {showPills ? (
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
                  trailing={overflowTrailing}
                />
              </div>
            ) : null}
            {showLabel && activeTab ? (
              <span className="truncate text-role-eyebrow uppercase tracking-widest text-text-muted">
                {activeTab.label}
              </span>
            ) : null}
          </div>
          {rightSlot ? <div className="flex shrink-0 items-center">{rightSlot}</div> : null}
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

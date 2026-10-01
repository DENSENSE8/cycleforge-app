'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  SEGMENTED_CONTROL_CORNER,
  SEGMENTED_CONTROL_FACE_CORNER,
  cornerClass,
} from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';

interface PaneHeaderTab<TValue extends string> {
  value: TValue;
  label: ReactNode;
  count?: number;
}

interface PaneHeaderTabsProps<TValue extends string> {
  tabs: ReadonlyArray<PaneHeaderTab<TValue>>;
  value: TValue;
  onChange: (next: TValue) => void;
  className?: string;
  /** Condensed strip for panes where the tab row competes for vertical space. */
  dense?: boolean;
  /**
   * `soft` is the desktop record-task face; `flush` is reserved for a tab row
   * welded into existing pane chrome.
   */
  appearance?: 'soft' | 'flush';
  ariaLabel?: string;
  /** Expose each real tab button for caller-owned focus return. */
  tabRef?: (value: TValue, node: HTMLButtonElement | null) => void;
  /** Far-right affordance on the tab row. */
  rightSlot?: ReactNode;
}

/** Mutually exclusive tasks inside one open record, with roving keyboard focus. */
export function PaneHeaderTabs<TValue extends string>({
  tabs,
  value,
  onChange,
  className,
  dense = false,
  appearance = 'soft',
  ariaLabel = 'Record tasks',
  tabRef,
  rightSlot,
}: PaneHeaderTabsProps<TValue>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const soft = appearance === 'soft';

  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    if (tabs.length === 0) return;
    const selectedIndex = tabs.findIndex((tab) => tab.value === value);
    const current = selectedIndex >= 0 ? selectedIndex : 0;
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;

    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.value);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div
      className={cn(
        'flex min-w-0 items-center justify-between gap-2',
        soft
          ? cn(SEGMENTED_CONTROL_CORNER, 'bg-surface-sunken p-1')
          : cn(cornerClass('flush'), 'bg-surface-card', dense ? 'px-1 py-0.5' : 'px-2 py-1'),
        className,
      )}
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={moveSelection}
        className={cn('flex min-w-0 items-center', dense ? 'gap-0.5' : 'gap-1')}
      >
        {tabs.map((tab, index) => {
          const active = tab.value === value;
          return (
            // ds-raw-button: segmented tab with roving focus and a shared active face.
            <button
              ref={(node) => {
                buttonRefs.current[index] = node;
                tabRef?.(tab.value, node);
              }}
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.value)}
              className={cn(
                'ds-raw-button inline-flex items-center font-semibold transition-colors',
                soft ? SEGMENTED_CONTROL_FACE_CORNER : cornerClass('flush'),
                focusRing('control', 'accent'),
                dense
                  ? 'gap-1 px-2 py-1 text-role-caption'
                  : 'gap-1.5 px-3 py-1.5 text-role-caption',
                active
                  ? cn('bg-surface-inverse text-text-inverse', elevationClass('raised', 'soft'))
                  : 'text-text-muted hover:bg-surface-card hover:text-text-default',
              )}
            >
              <span>{tab.label}</span>
              {tab.count != null ? (
                <span
                  className={cn(
                    'tabular-nums',
                    active ? 'text-text-inverse/70' : 'text-text-faint',
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {rightSlot ? <div className="flex shrink-0 items-center">{rightSlot}</div> : null}
    </div>
  );
}

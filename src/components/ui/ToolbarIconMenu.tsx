'use client';

/**
 * Icon-only toolbar menu — the twin of {@link QueueSortSwitch} for chrome that
 * should stay one glyph at rest (History drill/list, compare panes, zoom).
 *
 * Trigger: {@link ToolbarButton} `iconOnly` + current-option glyph +
 * {@link HoverTooltip}. Panel: DS {@link Popover} + {@link ToolbarListboxOption}
 * (leading checkmark). Do not hand-roll a second listbox popover for this job.
 */

import { useMemo, useRef, useState, type ComponentType } from 'react';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Popover } from '@/design-system';
import {
  TOOLBAR_LISTBOX_PANEL_CLASS,
  ToolbarListboxOption,
  toolbarListboxOptionKeyDown,
  toolbarListboxTriggerKeyDown,
} from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

type ToolbarIconMenuOption<T extends string> = {
  id: T;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export function ToolbarIconMenu<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  tooltipLabel,
  className,
  testId,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly ToolbarIconMenuOption<T>[];
  /** Accessible name for the listbox panel. */
  ariaLabel: string;
  /**
   * Hover tooltip — defaults to the active option label. Pass a richer string
   * when the control needs a stable noun (e.g. "Spreadsheet zoom").
   */
  tooltipLabel?: string;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const activeOption = useMemo(
    () => options.find((o) => o.id === value) ?? options[0],
    [options, value],
  );

  const dismiss = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleSelect = (next: T) => {
    if (next !== value) onChange(next);
    dismiss();
  };

  if (!activeOption) return null;

  const ActiveIcon = activeOption.icon;
  const tip = tooltipLabel ?? activeOption.label;

  return (
    <div
      className={cn('shrink-0', className)}
      data-toolbar-icon-menu=""
      data-testid={testId}
    >
      <HoverTooltip label={tip} placement="below" asChild>
        <ToolbarButton
          ref={buttonRef}
          type="button"
          iconOnly
          active={open}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${ariaLabel}: ${activeOption.label}`}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(event) =>
            toolbarListboxTriggerKeyDown(event, () => setOpen(true))
          }
        >
          <ActiveIcon className="h-4 w-4" />
        </ToolbarButton>
      </HoverTooltip>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        placement="bottom-end"
        gap={4}
        matchWidth={false}
        padded={false}
        role="listbox"
        aria-label={ariaLabel}
        className={TOOLBAR_LISTBOX_PANEL_CLASS}
      >
        <ul ref={listRef} className="list-none">
          {options.map((o, index) => {
            const OptionIcon = o.icon;
            return (
              <li key={o.id} role="none">
                <ToolbarListboxOption
                  index={index}
                  selected={value === o.id}
                  leading={<OptionIcon className="h-3.5 w-3.5 shrink-0" />}
                  onClick={() => handleSelect(o.id)}
                  onKeyDown={(event) =>
                    toolbarListboxOptionKeyDown(
                      event,
                      index,
                      options.length,
                      listRef,
                      dismiss,
                    )
                  }
                >
                  {o.label}
                </ToolbarListboxOption>
              </li>
            );
          })}
        </ul>
      </Popover>
    </div>
  );
}

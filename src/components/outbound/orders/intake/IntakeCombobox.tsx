'use client';

/**
 * Searchable combobox for the order-intake surface — the canonical shadcn
 * combobox recipe (Button trigger + Popover + Command), composed from the
 * `ui/*` shadcn lane rather than the design-system `SearchableSelectField`.
 *
 * The trigger carries `role="combobox"` + `aria-expanded` exactly as the
 * upstream recipe does, which is also what the E2E-DS check asserts.
 *
 * ## Two modes, one control
 *
 * **Local** (default) — pass `options` and Command filters them itself.
 *
 * **Async** — additionally pass `onQueryChange`, and the caller owns the term:
 * `shouldFilter` goes off, `options` are taken as already-matched server rows,
 * and `loading` renders the pending state in the list. That mode exists because
 * the order-exceptions catalog picker was a second hand-rolled
 * Popover+Command+CommandInput with its own empty/loading/selected markup — a
 * fork of this file that could drift from it on every axis. A combobox that
 * fetches is still a combobox; the difference is who filters, and that is one
 * prop, not a second component.
 */

import * as React from 'react';
import { Check, ChevronDown } from '@/components/Icons';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { triagePanelControl } from '@/design-system/tokens/triage-panel';
import { TRIAGE_PANEL_INNER_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

export interface IntakeComboboxOption {
  value: string;
  label: string;
  group?: string;
  /** Second line under the label — a title beside a SKU, a hint beside a mode. */
  meta?: string;
  /** Render the label in the mono face (identifiers: SKUs, item numbers). */
  mono?: boolean;
}

export function IntakeCombobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches',
  disabled = false,
  ariaLabel,
  testId,
  className,
  triggerId,
  query,
  onQueryChange,
  loading = false,
  footer,
  optionTestId,
  contentClassName,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: readonly IntakeComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  ariaLabel?: string;
  testId?: string;
  className?: string;
  /** Id on the trigger button so a visible `<Label htmlFor>` associates. */
  triggerId?: string;
  /** Async mode: the controlled search term. Requires `onQueryChange`. */
  query?: string;
  /** Async mode: hand the term back so the caller can fetch. Turns filtering off. */
  onQueryChange?: (value: string) => void;
  /** Async mode: results are in flight. */
  loading?: boolean;
  /** Pinned under the list — the "none of these" escape hatch. */
  footer?: React.ReactNode;
  /** `data-testid` per option, e.g. `(o) => \`hit-\${o.value}\``. */
  optionTestId?: (option: IntakeComboboxOption) => string;
  /**
   * Extra classes for the dropdown panel. Pass a corner here whenever the
   * trigger carries one: `Command` fills the panel with its own square
   * background, so a radius on the panel alone paints under it. `overflow-hidden`
   * on the panel is what makes the child take the corner.
   */
  contentClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const async = typeof onQueryChange === 'function';
  const selected = options.find((o) => o.value === value) ?? null;

  const groups = React.useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, IntakeComboboxOption[]>();
    for (const opt of options) {
      const g = opt.group?.trim() ?? '';
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g)!.push(opt);
    }
    return order.map((heading) => ({ heading, items: byGroup.get(heading)! }));
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          data-testid={testId}
          className={cn(triagePanelControl('w-full justify-between px-3 font-normal'), className)}
        >
          <span className={cn('truncate', selected ? 'text-text-default' : 'text-text-faint')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Full var() form — the bare `--var` arbitrary-value shorthand does
        // not compile in this Tailwind setup, which left the panel widthless.
        className={cn(
          'w-[var(--radix-popover-trigger-width)] overflow-hidden p-0',
          TRIAGE_PANEL_INNER_CORNER,
          contentClassName,
        )}
      >
        <Command shouldFilter={!async}>
          <CommandInput
            placeholder={searchPlaceholder}
            {...(async ? { value: query ?? '', onValueChange: onQueryChange } : {})}
          />
          <CommandList>
            {loading ? (
              <div className="px-3 py-2 text-role-micro text-text-faint" role="status">
                Searching…
              </div>
            ) : (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            )}
            {groups.map(({ heading, items }) => (
              <CommandGroup key={heading || '__ungrouped'} heading={heading || undefined}>
                {items.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={async ? opt.value : `${opt.label} ${opt.value}`}
                    data-testid={optionTestId?.(opt)}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate', opt.mono && 'font-mono')}>
                        {opt.label}
                      </span>
                      {opt.meta ? (
                        <span className="block truncate text-role-micro text-text-soft">
                          {opt.meta}
                        </span>
                      ) : null}
                    </span>
                    {opt.value === value ? (
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          {footer ? (
            <div className="border-t border-border-hairline p-1.5">{footer}</div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

'use client';

/**
 * Searchable combobox for the order-intake surface — the canonical shadcn
 * combobox recipe (Button trigger + Popover + Command), composed from the
 * `ui/*` shadcn lane rather than the design-system `SearchableSelectField`.
 *
 * The trigger carries `role="combobox"` + `aria-expanded` exactly as the
 * upstream recipe does, which is also what the E2E-DS check asserts.
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
import { cn } from '@/utils/_cn';

export interface IntakeComboboxOption {
  value: string;
  label: string;
  group?: string;
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
}) {
  const [open, setOpen] = React.useState(false);
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
          className={cn('h-9 w-full justify-between px-3 font-normal', className)}
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
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {groups.map(({ heading, items }) => (
              <CommandGroup key={heading || '__ungrouped'} heading={heading || undefined}>
                {items.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.value}`}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {opt.value === value ? (
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

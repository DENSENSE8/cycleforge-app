'use client';

/** Searchable combobox for the order-intake surface — the canonical shadcn combobox recipe (Button trigger + Popover + Command), composed… */

import * as React from 'react';
import { Check, ChevronDown, Package } from '@/components/Icons';
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
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

export interface IntakeComboboxOption {
  value: string;
  label: string;
  group?: string;
  /** Second line under the label — a title beside a SKU, a hint beside a mode. */
  meta?: string;
  /** Render the label in the mono face (identifiers: SKUs, item numbers). */
  mono?: boolean;
  /**
   * Zoho / catalog product photo. When any option carries one, every option
   * paints a thumb slot so rows stay aligned; text-only comboboxes (platform,
   * channel) stay text-only.
   */
  imageUrl?: string | null;
  /**
   * Leading glyph (kiosk command / stance). Prefer over `imageUrl` when both
   * are set. When any option carries an icon, every option reserves the slot.
   */
  icon?: React.ReactNode;
}

function CatalogOptionThumb({
  imageUrl,
  size,
}: {
  imageUrl?: string | null;
  size: 'trigger' | 'option';
}) {
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden bg-surface-canvas ring-1 ring-border-soft',
        size === 'trigger' ? 'h-6 w-6' : 'h-10 w-10',
        cornerClass('row'),
      )}
      aria-hidden
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog / Zoho proxy host
        <img
          src={imageUrl}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <Package
          className={cn('text-text-faint', size === 'trigger' ? 'h-3 w-3' : 'h-4 w-4')}
        />
      )}
    </span>
  );
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
  triggerVariant = 'outline',
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
  /** Extra classes for the dropdown panel. */
  contentClassName?: string;
  /**
   * `ghost` = label + chevron, no outline, shrink-to-content (kiosk All products).
   * Default `outline` = full-width field (order intake).
   */
  triggerVariant?: 'outline' | 'ghost';
}) {
  const [open, setOpen] = React.useState(false);
  const async = typeof onQueryChange === 'function';
  const selected = options.find((o) => o.value === value) ?? null;
  const showIcons = options.some((o) => o.icon != null);
  const showThumbs = !showIcons && options.some((o) => Boolean(o.imageUrl));

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
          variant={triggerVariant === 'ghost' ? 'ghost' : 'outline'}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          data-testid={testId}
          className={cn(
            'h-9 font-normal',
            triggerVariant === 'ghost'
              ? 'w-auto max-w-full shrink-0 justify-start gap-1.5 px-0'
              : 'w-full justify-between px-3',
            className,
          )}
        >
          <span className={cn('flex min-w-0 items-center gap-2', selected ? 'text-text-default' : 'text-text-faint')}>
            {showIcons && selected?.icon ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-soft" aria-hidden>
                {selected.icon}
              </span>
            ) : selected?.imageUrl ? (
              <CatalogOptionThumb imageUrl={selected.imageUrl} size="trigger" />
            ) : null}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Full var() form — the bare `--var` arbitrary-value shorthand does
        // not compile in this Tailwind setup, which left the panel widthless.
        className={cn(
          triggerVariant === 'ghost' ? 'w-72 min-w-72 p-0' : 'w-[var(--radix-popover-trigger-width)] p-0',
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
                    {showIcons ? (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-soft" aria-hidden>
                        {opt.icon}
                      </span>
                    ) : showThumbs ? (
                      <CatalogOptionThumb imageUrl={opt.imageUrl} size="option" />
                    ) : null}
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

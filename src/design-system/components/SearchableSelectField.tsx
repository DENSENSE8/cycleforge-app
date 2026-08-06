'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import { ChevronDown, Search, Check } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { Popover } from '../primitives/Popover';

interface SearchableSelectOption<T = unknown> {
  value: string | number;
  /** Shown in the trigger when selected + the default search/filter target. */
  label: string;
  /** Optional secondary text (e.g. a staff role) shown muted on the right. */
  meta?: string;
  /** Optional group heading (e.g. "Standard types"). */
  group?: string;
  /** Arbitrary passthrough returned to onChange / renderOption. */
  data?: T;
}

interface SearchableSelectFieldProps<T = unknown> {
  value: string | number | null;
  onChange: (value: string | number | null, option: SearchableSelectOption<T> | null) => void;
  options: ReadonlyArray<SearchableSelectOption<T>>;
  /** Trigger label when nothing is selected. */
  placeholder?: string;
  /** Search input placeholder. */
  searchPlaceholder?: string;
  /** Shown when the query matches nothing. */
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Accent the trigger + active row to match the host surface. */
  tone?: 'default' | 'emerald';
  /**
   * `flush` — sheet-band / dense rail: no radius, no trigger pad, square panel
   * (claim compose golden). Default keeps the padded rounded field chrome.
   */
  appearance?: 'default' | 'flush';
  /** Custom row body. Defaults to label + optional muted meta + check. */
  renderOption?: (opt: SearchableSelectOption<T>, state: { active: boolean }) => ReactNode;
  /** Custom filter predicate. Default: case-insensitive match on label + meta. */
  filter?: (opt: SearchableSelectOption<T>, query: string) => boolean;
}

const TONE_TRIGGER: Record<NonNullable<SearchableSelectFieldProps['tone']>, string> = {
  default:
    'border-border-soft hover:border-blue-300 hover:bg-blue-50/40 focus:border-blue-500 focus:ring-blue-500/20',
  emerald:
    'border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 focus:border-emerald-500 focus:ring-emerald-500/20',
};

const TONE_TRIGGER_FLUSH: Record<NonNullable<SearchableSelectFieldProps['tone']>, string> = {
  default: 'border-border-soft hover:border-border-emphasis focus:border-border-emphasis',
  emerald: 'border-emerald-200 hover:border-emerald-400 focus:border-emerald-500',
};

const TONE_ACTIVE: Record<NonNullable<SearchableSelectFieldProps['tone']>, string> = {
  default: 'bg-blue-50 text-blue-700',
  emerald: 'bg-emerald-50 text-emerald-700',
};

function defaultFilter(opt: SearchableSelectOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return opt.label.toLowerCase().includes(q) || (opt.meta?.toLowerCase().includes(q) ?? false);
}

function groupOptions<T>(options: ReadonlyArray<SearchableSelectOption<T>>) {
  const order: string[] = [];
  const map = new Map<string, SearchableSelectOption<T>[]>();
  for (const opt of options) {
    const g = opt.group?.trim() || '';
    if (!map.has(g)) {
      map.set(g, []);
      order.push(g);
    }
    map.get(g)!.push(opt);
  }
  return order.map((heading) => ({ heading, items: map.get(heading)! }));
}

/**
 * House **searchable combobox** (shadcn/cmdk list + DS Popover).
 * Fully controlled via `value` + `onChange`; owns open + query only.
 * `appearance="flush"` = zero radius, zero pad (claim type golden).
 */
export function SearchableSelectField<T = unknown>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches',
  disabled = false,
  className,
  ariaLabel,
  tone = 'default',
  appearance = 'default',
  renderOption,
  filter,
}: SearchableSelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const flush = appearance === 'flush';

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const predicate = filter ?? defaultFilter;
    return options.filter((o) => predicate(o, query));
  }, [options, query, filter]);

  const groups = useMemo(() => groupOptions(filtered), [filtered]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (opt: SearchableSelectOption<T>) => {
    onChange(opt.value, opt);
    close();
  };

  return (
    <>
      {/* ds-raw-button: field-style combobox trigger; Popover owns dismissal */}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex w-full items-center gap-2 border bg-surface-card text-left transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          flush
            ? cn(
                'h-9 rounded-none border-x-0 border-t-0 border-b px-0 text-role-caption font-semibold focus:ring-0',
                TONE_TRIGGER_FLUSH[tone],
              )
            : cn('h-8 rounded-lg px-2.5 text-role-micro focus:ring-2', TONE_TRIGGER[tone]),
          selected ? 'text-text-default' : 'text-text-faint',
          className,
        )}
      >
        <span className="flex-1 truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-faint transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      <Popover
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        placement="bottom-stretch"
        matchWidth
        padded={false}
        gap={flush ? 0 : 6}
        role="listbox"
        aria-label={ariaLabel ?? placeholder}
        className={cn(flush && '!rounded-none border-t-0 shadow-sm')}
      >
        <Command shouldFilter={false} className="rounded-none bg-transparent">
          <div
            className={cn(
              'flex items-center gap-2 border-b border-border-hairline',
              flush ? 'h-9 gap-1.5 px-0' : 'gap-2 px-2.5 py-2',
            )}
            cmdk-input-wrapper=""
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-text-faint" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              className={cn(
                'w-full bg-transparent text-text-default outline-none placeholder:text-text-faint',
                flush ? 'h-9 px-0 text-role-caption font-medium' : 'text-role-micro',
              )}
            />
          </div>

          <Command.List
            className={cn('max-h-56 overflow-y-auto', flush ? 'p-0' : 'py-1')}
          >
            <Command.Empty
              className={cn(
                'text-center text-role-eyebrow uppercase tracking-wider text-text-faint',
                flush ? 'px-0 py-3' : 'px-3 py-4',
              )}
            >
              {emptyMessage}
            </Command.Empty>

            {groups.map(({ heading, items }) => (
              <Command.Group
                key={heading || '__ungrouped'}
                heading={heading || undefined}
                className={cn(
                  heading &&
                    '[&_[cmdk-group-heading]]:px-0 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-role-eyebrow [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-text-faint',
                  !flush &&
                    heading &&
                    '[&_[cmdk-group-heading]]:px-3',
                )}
              >
                {items.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <Command.Item
                      key={String(opt.value)}
                      value={`${opt.label} ${opt.meta ?? ''} ${opt.value}`}
                      onSelect={() => pick(opt)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2 text-left outline-none transition-colors',
                        'data-[selected=true]:bg-surface-hover',
                        flush ? 'rounded-none px-0 py-2' : 'px-3 py-1.5',
                        active ? TONE_ACTIVE[tone] : 'text-text-muted',
                      )}
                    >
                      {renderOption ? (
                        renderOption(opt, { active })
                      ) : (
                        <>
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate',
                              flush ? 'text-role-caption font-medium' : 'text-role-micro',
                            )}
                          >
                            {opt.label}
                          </span>
                          {opt.meta ? (
                            <span className="shrink-0 text-role-eyebrow uppercase tracking-wide text-text-faint">
                              {opt.meta}
                            </span>
                          ) : null}
                          {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                        </>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </Popover>
    </>
  );
}

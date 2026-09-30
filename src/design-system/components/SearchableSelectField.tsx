'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Command } from 'cmdk';
import { ChevronDown, Search, Check, Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { Popover } from '../primitives/Popover';
import type { AnchoredPlacement } from '../primitives/AnchoredLayer';

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

/** Stretch placements only — combobox list always matches trigger width. */
type SearchableSelectListPlacement = Extract<
  AnchoredPlacement,
  'bottom-stretch' | 'top-stretch'
>;

interface SearchableSelectFieldProps<T = unknown> {
  value: string | number | null;
  onChange: (value: string | number | null, option: SearchableSelectOption<T> | null) => void;
  options: ReadonlyArray<SearchableSelectOption<T>>;
  /** Trigger label when nothing is selected. */
  placeholder?: string;
  /**
   * Floating eyebrow (flush TextField twin). When set, replaces a host-side
   * Platform / Type label row so the face stays one edge-to-edge card cell.
   */
  label?: string;
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
  /**
   * Preferred list panel edge relative to the trigger. Default `bottom-stretch`.
   * The layer flips to the other edge on its own when this one is too short
   * (field near the viewport floor), so pass `top-stretch` only where upward
   * is the design intent (Unbox unfound classify dock).
   */
  placement?: SearchableSelectListPlacement;
  /** Autofocus the trigger on mount (form first field). */
  autoFocus?: boolean;
  /** Custom row body. Defaults to label + optional muted meta + check. */
  renderOption?: (opt: SearchableSelectOption<T>, state: { active: boolean }) => ReactNode;
  /** Custom filter predicate. Default: case-insensitive match on label + meta. */
  filter?: (opt: SearchableSelectOption<T>, query: string) => boolean;
  /** Remote mode. When set, the host owns filtering — the field reports every query change here (debounce + refetch in the host) and stops… */
  onSearchChange?: (query: string) => void;
  /** Remote fetch in flight — shows a searching row instead of the empty state. */
  loading?: boolean;
  /** Stable e2e / test hook on the combobox trigger. */
  testId?: string;
  /** The list opened / closed — hosts load their options just in time on the first open. */
  onOpenChange?: (open: boolean) => void;
}

const TONE_TRIGGER: Record<NonNullable<SearchableSelectFieldProps['tone']>, string> = {
  default:
    'border-border-soft hover:border-blue-300 hover:bg-blue-50/40 focus:border-blue-500',
  emerald:
    'border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50 focus:border-emerald-500',
};

const TONE_TRIGGER_FLUSH: Record<NonNullable<SearchableSelectFieldProps['tone']>, string> = {
  default: 'border-border-soft hover:border-border-emphasis focus:border-border-emphasis',
  emerald: 'border-emerald-200 hover:border-emerald-400 focus:border-emerald-500',
};

const TONE_ACTIVE: Record<NonNullable<SearchableSelectFieldProps['tone']>, string> = {
  default: 'bg-blue-50 text-blue-700',
  emerald: 'bg-emerald-50 text-emerald-700',
};

const TONE_FLOAT: Record<NonNullable<SearchableSelectFieldProps['tone']>, string> = {
  default: 'text-text-soft',
  emerald: 'text-emerald-600',
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

const FOCUSABLE_TAB_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Walk Tab order inside the inspector/form that owns the trigger — not the portaled list. */
function focusAdjacentTabStop(origin: HTMLElement, backward: boolean) {
  const scope =
    origin.closest('aside')
    ?? origin.closest('[role="dialog"]')
    ?? origin.closest('form')
    ?? document.body;
  const items = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_TAB_SELECTOR)).filter(
    (el) => el.getClientRects().length > 0,
  );
  const idx = items.indexOf(origin);
  if (idx === -1) {
    origin.focus();
    return;
  }
  const next = items[idx + (backward ? -1 : 1)];
  next?.focus({ preventScroll: true });
}

/** House **searchable combobox** (shadcn/cmdk list + DS Popover). */
export function SearchableSelectField<T = unknown>({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  label,
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches',
  disabled = false,
  className,
  ariaLabel,
  tone = 'default',
  appearance = 'default',
  placement = 'bottom-stretch',
  autoFocus = false,
  renderOption,
  filter,
  onSearchChange,
  loading = false,
  testId,
  onOpenChange,
}: SearchableSelectFieldProps<T>) {
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const flush = appearance === 'flush';
  const hasLabel = Boolean(label?.trim());
  const remote = typeof onSearchChange === 'function';

  // In remote mode the host reports the query change and refetches; setting the
  // internal state here keeps the input controlled + the typeahead seed working.
  const updateQuery = (next: string) => {
    setQuery(next);
    onSearchChange?.(next);
  };

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    // Remote: the host already filtered — never double-filter the server result.
    if (remote) return options;
    const predicate = filter ?? defaultFilter;
    return options.filter((o) => predicate(o, query));
  }, [remote, options, query, filter]);

  const groups = useMemo(() => groupOptions(filtered), [filtered]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    updateQuery('');
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const pick = (opt: SearchableSelectOption<T>) => {
    onChange(opt.value, opt);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const openList = (seedQuery?: string) => {
    if (disabled) return;
    if (seedQuery != null) updateQuery(seedQuery);
    setOpen(true);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (
      e.key === 'ArrowDown'
      || e.key === 'ArrowUp'
      || e.key === 'Enter'
      || e.key === ' '
    ) {
      e.preventDefault();
      openList();
      return;
    }
    // Typeahead — printable opens + seeds the filter.
    if (
      e.key.length === 1
      && !e.ctrlKey
      && !e.metaKey
      && !e.altKey
    ) {
      e.preventDefault();
      openList(e.key);
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    // The list portals to <body>, so native Tab would wander the page. Close and
    // hand focus to the next/previous trigger in the owning form instead.
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const trigger = triggerRef.current;
      if (!trigger) {
        close(false);
        return;
      }
      close(false);
      requestAnimationFrame(() => focusAdjacentTabStop(trigger, e.shiftKey));
    }
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
        aria-controls={open ? `${labelId}-listbox` : undefined}
        aria-labelledby={hasLabel ? labelId : undefined}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? label ?? placeholder}
        data-testid={testId}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'relative inline-flex w-full items-center gap-2 border bg-surface-card text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          focusRing('control', 'accent'),
          flush
            ? cn(
                'rounded-none border-x-0 border-t-0 border-b px-3.5 text-role-caption font-semibold',
                hasLabel ? 'h-11 pb-1 pt-5' : 'h-9',
                TONE_TRIGGER_FLUSH[tone],
              )
            : cn('h-8 rounded-lg px-2.5 text-role-micro focus:ring-2', TONE_TRIGGER[tone]),
          selected ? 'text-text-default' : 'text-text-faint',
          className,
        )}
      >
        {hasLabel ? (
          <span
            id={labelId}
            className={cn(
              'pointer-events-none absolute left-3.5 top-1.5 text-role-micro font-semibold mode-label-case',
              TONE_FLOAT[tone],
            )}
          >
            {label}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-faint transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      <Popover
        open={open}
        onClose={() => close(true)}
        anchorRef={triggerRef}
        placement={placement}
        matchWidth
        padded={false}
        gap={flush ? 0 : 6}
        role="listbox"
        aria-label={ariaLabel ?? label ?? placeholder}
        className={cn(
          // Column so the list — not the whole panel — gives up height when the
          // layer caps the panel to the room on its side.
          'flex flex-col',
          flush && '!rounded-none shadow-sm',
          // Flush abutment: drop the seam border on the edge that kisses the
          // trigger — whichever side the layer actually opened on.
          flush && '[[data-side=top]>&]:border-b-0 [[data-side=bottom]>&]:border-t-0',
        )}
      >
        <Command
          shouldFilter={false}
          className="flex min-h-0 flex-col rounded-none bg-surface-card"
          onKeyDown={onListKeyDown}
          id={`${labelId}-listbox`}
        >
          <div
            className={cn(
              'flex shrink-0 items-center gap-2 border-b border-border-hairline',
              flush ? 'h-9 gap-1.5 px-3.5' : 'gap-2 px-2.5 py-2',
            )}
            cmdk-input-wrapper=""
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={updateQuery}
              placeholder={searchPlaceholder}
              className={cn(
                'w-full bg-transparent text-text-default outline-none placeholder:text-text-faint',
                flush ? 'h-9 text-role-caption font-medium' : 'text-role-micro',
              )}
            />
          </div>

          <Command.List
            className={cn(
              'max-h-72 min-h-0 overflow-y-auto overscroll-contain',
              flush ? 'p-0' : 'py-1',
            )}
          >
            {loading ? (
              <div
                className={cn(
                  'flex items-center gap-2 text-text-faint',
                  flush ? 'px-3.5 py-2.5' : 'px-3 py-2',
                )}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className={cn(flush ? 'text-role-caption' : 'text-role-micro')}>
                  Searching…
                </span>
              </div>
            ) : (
              <Command.Empty
                className={cn(
                  'text-center text-role-eyebrow mode-label-case text-text-faint',
                  flush ? 'px-3.5 py-3' : 'px-3 py-4',
                )}
              >
                {emptyMessage}
              </Command.Empty>
            )}

            {groups.map(({ heading, items }) => (
              <Command.Group
                key={heading || '__ungrouped'}
                heading={heading || undefined}
                className={cn(
                  heading
                    && '[&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-role-eyebrow [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:mode-label-case [&_[cmdk-group-heading]]:text-text-faint',
                  heading
                    && (flush
                      ? '[&_[cmdk-group-heading]]:px-3.5'
                      : '[&_[cmdk-group-heading]]:px-3'),
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
                        flush ? 'rounded-none px-3.5 py-2' : 'px-3 py-1.5',
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
                            <span className="shrink-0 text-role-eyebrow mode-label-case text-text-faint">
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

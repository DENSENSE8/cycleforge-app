'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { NAV_CONTROL_KINDS, navControlParams, type NavContext, type NavControlKind, type NavFilters as NavFiltersSpec } from '@/lib/nav/context/schema';
import { fetchNavFacets } from '@/lib/nav/context/http-client';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { Collapse } from '@/design-system/components/Collapse';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { StageStaffAssignPopover } from '@/components/staff-assign/StageStaffAssignPopover';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Calendar, Check, ChevronRight, Clock, User } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CHIP_CORNER, SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { parseStaffParam } from '@/lib/station/table-url-params';
import { STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import { parseISODate, toISODate } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import { getCurrentPSTDateKey } from '@/utils/date';
import { peekActiveStaff } from '@/lib/staffCache';
import { cn } from '@/utils/_cn';
import { useReplaceSearchParams } from './useReplaceSearchParams';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';
import { NavSlotError } from './NavSlotError';
import { NAV_BLOCK_CLASS, NAV_CHOICE_PRESS_CLASS, NAV_CHOICE_SELECTED_CLASS } from './nav-block';

const FACETS_STALE_MS = 15_000;

type NavControls = NonNullable<NavContext['controls']>;

/** Every row in the panel: the sidebar's pressable block at 32px. */
const ROW_CLASS = cn(NAV_BLOCK_CLASS, 'h-8 text-role-caption');
const ROW_ICON_CLASS = 'size-3.5 shrink-0 text-text-faint';
const VALUE_CHIP_CLASS = cn(
  'max-w-[8.5rem] shrink-0 truncate bg-surface-sunken px-1.5 py-0.5 text-role-micro font-medium text-text-muted',
  SIDEBAR_CHIP_CORNER,
);

function readValues(raw: string | null, multi: boolean): string[] {
  if (!raw) return [];
  return multi ? raw.split(',').filter(Boolean) : [raw];
}

/** The control kinds in paint order: the declared `controls.order` first, then every other kind in the default order. */
function controlOrder(controls: NavControls | undefined): readonly NavControlKind[] {
  const declared = controls?.order ?? [];
  return [...declared, ...NAV_CONTROL_KINDS.filter((kind) => !declared.includes(kind))];
}

/**
 * What the operator changes often, as buttons — never behind a menu (modes
 * and views, changed rarely, sit in the head's switchers). Top to bottom:
 * the view's saved views as one-click presets, then a hairline with a Reset
 * pill, then one closed row per filter, Vercel Logs style. A row shows its
 * current value as a chip; the options (with counts from
 * `GET /api/nav/facets`) open on click, options with nothing behind them
 * last and dimmed. Staff and date are rows too.
 */
export function NavFilters({
  filters,
  controls,
}: {
  filters: NavFiltersSpec | undefined;
  controls: NavControls | undefined;
}) {
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const staffKey = useNavStaffKey();
  const replace = useReplaceSearchParams();
  const facets = useQuery({
    queryKey: ['nav-facets', staffKey, filters?.facetContext, search],
    queryFn: ({ signal }) => fetchNavFacets(filters!.facetContext, search, signal),
    enabled: filters !== undefined,
    staleTime: FACETS_STALE_MS,
    placeholderData: keepPreviousData,
  });

  // Sort and Group by order / band the list; they are not filters, so Reset and the count leave them.
  const ownedParams = [
    ...(filters?.groups.flatMap((group) => group.excludeParam ? [group.param, group.excludeParam] : [group.param]) ?? []),
    ...navControlParams(controls ? { ...controls, sort: undefined, group: undefined } : undefined),
  ];
  const activeCount = ownedParams.filter((param) => searchParams?.has(param)).length;
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(filters?.groups.filter((group) => searchParams?.has(group.param)).map((group) => group.id)),
  );
  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const reset = () =>
    replace((params) => {
      for (const param of ownedParams) params.delete(param);
    });

  const toggleValue = (group: NavFiltersSpec['groups'][number], value: string) =>
    replace((params) => {
      const current = readValues(params.get(group.param), group.multi);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : group.multi
          ? [...current, value]
          : [value];
      if (next.length === 0) params.delete(group.param);
      else params.set(group.param, next.join(','));
    });

  const toggleExcludedValue = (group: NavFiltersSpec['groups'][number], value: string) =>
    replace((params) => {
      if (!group.excludeParam) return;
      const current = readValues(params.get(group.excludeParam), true);
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      if (next.length) params.set(group.excludeParam, next.join(','));
      else params.delete(group.excludeParam);
      params.delete('page');
    });

  const badgePresence = useMotionPresence(motionPresence.sidebarScopeSwap);
  const badgeTransition = useMotionTransition(motionTransition.sidebarScopeSwap);

  // A context serving several tabs (the Unbox station) answers a group the open tab does not read with no options.
  const hiddenFacetIds = new Set(
    filters?.groups
      .filter((declared) =>
        facets.data?.groups.find((g) => g.id === declared.id)?.options.length === 0 &&
        readValues(searchParams?.get(declared.param) ?? null, declared.multi).length === 0)
      .map((declared) => declared.id),
  );
  // Nothing to paint (no control rows, every facet group empty): no hairline, no padding.
  const paintsRow =
    Boolean(controls?.sort || controls?.group || controls?.exclude) ||
    Boolean(controls?.staff?.length || controls?.dates?.length || controls?.dateRanges?.length || controls?.choices?.length) ||
    Boolean(filters?.groups.some((declared) => !hiddenFacetIds.has(declared.id)));
  if (!paintsRow) return null;

  return (
    <section data-nav-filters aria-label="Filters" aria-busy={facets.isFetching || undefined} className="px-2 pt-2">
      {/* A hairline opens the category, like every other sidebar category — no
          text heading. The live count + Reset ride the line only while a
          filter is on. */}
      <header className="flex h-7 items-center gap-1.5 px-2">
        <span role="separator" className="h-px min-w-0 flex-1 bg-border-hairline" />
        <AnimatePresence initial={false}>
          {activeCount > 0 ? (
            <motion.span
              key="active"
              initial={badgePresence.initial}
              animate={badgePresence.animate}
              exit={badgePresence.exit}
              transition={badgeTransition}
              className="flex shrink-0 items-center gap-1.5"
            >
              <span className={cn('bg-text-default px-1.5 text-role-micro font-semibold text-surface-card', SIDEBAR_CHIP_CORNER)}>
                <AnimatedStat value={activeCount} profile="scanQuantity" />
              </span>
              <button
                type="button"
                data-nav-filters-reset
                onClick={reset}
                className={cn(
                  'ds-raw-button h-6 border border-border-soft bg-surface-card px-2 text-role-micro font-medium text-text-default shadow-sm',
                  'transition-[background-color,transform] hover:bg-surface-hover active:translate-y-px',
                  SIDEBAR_CONTROL_CORNER,
                  focusRing('control', 'accent'),
                )}
              >
                Reset
              </button>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </header>

      <div className="flex flex-col gap-px">
        {controlOrder(controls).map((kind) => {
          switch (kind) {
            case 'sort':
              return controls?.sort ? (
                <SortRow key="sort" id="sort" label="Sort" spec={controls.sort} open={open.has('sort')} onToggle={toggleOpen} />
              ) : null;
            case 'group':
              return controls?.group ? (
                <SortRow key="group" id="group" label="Group by" spec={controls.group} open={open.has('group')} onToggle={toggleOpen} />
              ) : null;
            case 'staff':
              return controls?.staff?.map((row) => <StaffRow key={`staff:${row.id}`} id={row.id} param={row.param} label={row.label} />);
            case 'dates':
              return controls?.dates?.map((row) => <SingleDateRow key={`date:${row.id}`} spec={row} />);
            case 'dateRanges':
              return controls?.dateRanges?.map((range) => <DateRow key={`range:${range.id}`} spec={range} />);
            case 'choices':
              return controls?.choices?.map((choice) => (
                <ChoiceRow key={`choice:${choice.id}`} spec={choice} open={open.has(choice.id)} onToggle={toggleOpen} />
              ));
            case 'exclude':
              return controls?.exclude ? (
                <ExcludeRow
                  key="exclude"
                  spec={controls.exclude}
                  facetGroup={facets.data?.groups.find((group) => group.param === controls.exclude?.param)}
                  open={open.has(controls.exclude.id)}
                  onToggle={toggleOpen}
                />
              ) : null;
            case 'facets':
              return filters?.groups.map((declared) => {
                const group = facets.data?.groups.find((g) => g.id === declared.id);
                const active = readValues(searchParams?.get(declared.param) ?? null, declared.multi);
                const excluded = readValues(searchParams?.get(declared.excludeParam ?? '') ?? null, true);
                if (hiddenFacetIds.has(declared.id)) return null;
                const summary = active.length > 0
                  ? active.length > 1
                    ? `${active.length} selected`
                    : (group?.options.find((o) => o.value === active[0])?.label ?? active[0])
                  : excluded.length > 0
                    ? `${excluded.length} excluded`
                    : null;
                return declared.inline ? (
                  <div key={declared.id} className="py-px">
                    <span className="flex h-7 items-center gap-1.5 px-2 text-role-micro font-semibold uppercase tracking-wide text-text-faint">
                      {declared.label}
                    </span>
                    {group ? (
                      <FacetOptionList declared={declared} group={group} active={active} excluded={excluded} onToggle={toggleValue} onToggleExcluded={toggleExcludedValue} />
                    ) : facets.isError ? (
                      <NavSlotError label="Filters unavailable" onRetry={() => void facets.refetch()} />
                    ) : (
                      <div className="flex flex-col gap-1.5 px-2 py-1.5">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    )}
                  </div>
                ) : (
                  <Disclosure
                    key={declared.id}
                    id={declared.id}
                    label={declared.label}
                    summary={summary}
                    open={open.has(declared.id)}
                    onToggle={toggleOpen}
                  >
                    {group ? (
                      <FacetOptionList declared={declared} group={group} active={active} excluded={excluded} onToggle={toggleValue} onToggleExcluded={toggleExcludedValue} />
                    ) : facets.isError ? (
                      <NavSlotError label="Filters unavailable" onRetry={() => void facets.refetch()} />
                    ) : (
                      <div className="flex flex-col gap-1.5 px-2 py-1.5">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    )}
                  </Disclosure>
                );
              });
          }
        })}
      </div>
    </section>
  );
}

/** A searchable group shows its filter field past this many options (a short list scans faster than it filters). */
const FACET_FILTER_MIN_OPTIONS = 8;

/** The option list a facet group paints — shared by the inline and collapsed rows. */
function FacetOptionList({
  declared,
  group,
  active,
  excluded,
  onToggle,
  onToggleExcluded,
}: {
  declared: NavFiltersSpec['groups'][number];
  group: { options: readonly { value: string; label: string; count: number }[] };
  active: string[];
  excluded: string[];
  onToggle: (group: NavFiltersSpec['groups'][number], value: string) => void;
  onToggleExcluded: (group: NavFiltersSpec['groups'][number], value: string) => void;
}) {
  const [mode, setMode] = useState<'include' | 'exclude'>('include');
  const [needle, setNeedle] = useState('');
  const excluding = mode === 'exclude' && declared.excludeParam != null;
  const selectedValues = excluding ? excluded : active;
  const toggle = excluding ? onToggleExcluded : onToggle;
  // A searchable group (vendors) narrows its options by name; a picked option never hides.
  const filterable = declared.searchable === true && group.options.length > FACET_FILTER_MIN_OPTIONS;
  const query = filterable ? needle.trim().toLowerCase() : '';
  const visible = query
    ? group.options.filter((option) => selectedValues.includes(option.value) || option.label.toLowerCase().includes(query))
    : group.options;
  return (
    <div
      role="group"
      aria-label={declared.label}
      className={cn('divide-y divide-border-hairline border border-border-soft bg-surface-card', SIDEBAR_CONTROL_CORNER)}
    >
      {declared.excludeParam ? (
        <div className="flex h-8 items-center gap-1 border-b border-border-hairline px-1.5" role="group" aria-label={`${declared.label} mode`}>
          <button
            type="button"
            aria-pressed={!excluding}
            onClick={() => setMode('include')}
            className={cn('ds-raw-button h-6 flex-1 px-2 text-role-micro font-medium transition-colors', !excluding ? 'bg-surface-sunken text-text-default' : 'text-text-muted hover:bg-surface-hover', focusRing('control', 'accent'))}
          >
            Include
          </button>
          <button
            type="button"
            aria-pressed={excluding}
            onClick={() => setMode('exclude')}
            className={cn('ds-raw-button h-6 flex-1 px-2 text-role-micro font-medium transition-colors', excluding ? 'bg-surface-sunken text-text-default' : 'text-text-muted hover:bg-surface-hover', focusRing('control', 'accent'))}
          >
            Exclude
          </button>
        </div>
      ) : null}
      {filterable ? (
        <Input
          type="search"
          value={needle}
          onChange={(event) => setNeedle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !needle) return;
            event.stopPropagation();
            setNeedle('');
          }}
          aria-label={`Filter ${declared.label.toLowerCase()} options`}
          placeholder={`Filter ${declared.label.toLowerCase()}…`}
          className="h-8 rounded-mode-control border-0 bg-transparent px-2 text-role-caption"
        />
      ) : null}
      {orderOptions(visible, selectedValues).map((option) => {
        const selected = selectedValues.includes(option.value);
        const empty = option.count === 0 && !selected;
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={selected}
            data-nav-filter-option={option.value}
            data-empty={empty || undefined}
            onClick={() => toggle(declared, option.value)}
            className={cn(
              'ds-raw-button flex h-8 w-full items-center gap-2 px-2 text-left text-role-caption',
              'transition-colors hover:bg-surface-hover',
              selected ? 'text-text-default' : empty ? 'text-text-faint' : 'text-text-muted',
              focusRing('control', 'accent'),
            )}
          >
            <CheckFace checked={selected} />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <span className={cn(VALUE_CHIP_CLASS, 'tabular-nums', option.count === 0 && 'text-text-faint')}>
              <AnimatedStat value={option.count} profile="scanQuantity" />
            </span>
          </button>
        );
      })}
      {query && visible.length === 0 ? (
        <p className="flex h-8 items-center px-2 text-role-caption text-text-faint">No {declared.label.toLowerCase()} matches</p>
      ) : null}
    </div>
  );
}

/**
 * An open group's options in list order, except that options with nothing
 * behind them (count 0) sink to the end — unless selected, which never move
 * under the cursor.
 */
function orderOptions<T extends { value: string; count: number }>(options: readonly T[], active: readonly string[]): T[] {
  const empty = (option: T) => option.count === 0 && !active.includes(option.value);
  return [...options.filter((option) => !empty(option)), ...options.filter(empty)];
}


function CheckFace({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-3.5 shrink-0 place-content-center rounded-sm border transition-colors',
        checked ? 'border-text-default bg-text-default text-surface-card' : 'border-border-strong bg-surface-card',
      )}
    >
      <AnimatePresence initial={false}>
        {checked ? (
          <motion.span
            key="check"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={motionTransition.quantityBump}
            className="grid place-content-center"
          >
            <Check className="size-2.5" />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/** One closed filter row; its body springs open under it. */
function Disclosure({
  id,
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  summary: string | null;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  const chevron = useMotionTransition(motionTransition.upNextChevron);
  const bodyId = `nav-filter-${id}`;
  return (
    <div data-nav-filter={id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onToggle(id)}
        className={ROW_CLASS}
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={chevron} className="grid shrink-0 place-content-center">
          <ChevronRight aria-hidden className={ROW_ICON_CLASS} />
        </motion.span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <AnimatePresence initial={false} mode="popLayout">
          {summary ? (
            <motion.span
              key={summary}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={chevron}
              className={cn(VALUE_CHIP_CLASS, 'text-text-default')}
            >
              {summary}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </button>
      <Collapse open={open}>
        <div id={bodyId} className="pb-1.5 pl-6 pr-0.5 pt-0.5">
          {children}
        </div>
      </Collapse>
    </div>
  );
}

/** One staff ROLE (Assigned, Picked by, Packer, …): one staffer or everyone. */
function StaffRow({ id, param, label }: { id: string; param: string; label: string }) {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const staffId = parseStaffParam(searchParams?.get(param));
  const staffName =
    staffId == null ? null : (peekActiveStaff()?.find((s) => s.id === staffId)?.name ?? `Staff #${staffId}`);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        data-nav-filter={`staff:${id}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={ROW_CLASS}
      >
        <User aria-hidden className={ROW_ICON_CLASS} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className={cn(VALUE_CHIP_CLASS, staffName && 'text-text-default')}>{staffName ?? 'All'}</span>
      </button>
      <StageStaffAssignPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        label={`Filter by ${label.toLowerCase()}`}
        role="all"
        selectedStaffId={staffId}
        onCommit={(next) => {
          replace((params) => {
            if (next == null) params.delete(param);
            else params.set(param, String(next));
          });
          setOpen(false);
        }}
      />
    </>
  );
}

const TIME_KEY = /^([01]\d|2[0-3]):[0-5]\d$/;

function SingleDateRow({ spec }: { spec: NonNullable<NavControls['dates']>[number] }) {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const today = getCurrentPSTDateKey();
  const value = parseISODate(searchParams?.get(spec.param) ?? today);
  return (
    <div className={cn(ROW_CLASS, 'cursor-default pr-0.5')} data-nav-filter={`date:${spec.id}`}>
      <Calendar aria-hidden className={ROW_ICON_CLASS} />
      <span className="min-w-0 flex-1 truncate">{spec.label}</span>
      <DateRangePickerField
        variant="compact"
        value={value}
        ariaLabel={spec.label}
        className="h-7 w-auto max-w-[9.5rem] border-transparent bg-transparent px-1.5 text-role-micro font-medium shadow-none hover:border-border-soft hover:bg-surface-card"
        onChange={(next) => {
          const key = toISODate(next);
          replace((params) => {
            for (const clear of spec.clearParams) params.delete(clear);
            if (!key || key === today) params.delete(spec.param);
            else params.set(spec.param, key);
          });
        }}
      />
    </div>
  );
}

/**
 * One civil-date range (Shipped, Ship by, Ordered). A range that declares
 * time params takes a time of day at each end once a date range is picked.
 */
function DateRow({ spec }: { spec: NonNullable<NavControls['dateRanges']>[number] }) {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const from = parseISODate(searchParams?.get(spec.fromParam) ?? '');
  const to = parseISODate(searchParams?.get(spec.toParam) ?? '');
  const timed = Boolean(spec.fromTimeParam || spec.toTimeParam);
  // A window another param switches off (a pasted list) says so, never the default window it is not using.
  const placeholder = spec.unsetWith && searchParams?.get(spec.unsetWith.param) ? spec.unsetWith.placeholder : spec.placeholder;
  const setTime = (param: string | undefined, value: string) => {
    if (!param) return;
    replace((params) => {
      if (TIME_KEY.test(value)) params.set(param, value);
      else params.delete(param);
    });
  };
  return (
    <div data-nav-filter={`date:${spec.id}`}>
      <div className={cn(ROW_CLASS, 'cursor-default pr-0.5')}>
        <Calendar aria-hidden className={ROW_ICON_CLASS} />
        <span className="min-w-0 flex-1 truncate">{spec.label}</span>
        <DateRangePickerField
          value={from && to ? { from, to } : undefined}
          placeholder={placeholder}
          className="h-7 w-auto max-w-[9.5rem] border-transparent bg-transparent px-1.5 text-role-micro font-medium shadow-none hover:border-border-soft hover:bg-surface-card"
          onChange={(next) => {
            const nextFrom = toISODate(next?.from);
            const nextTo = toISODate(next?.to ?? next?.from);
            replace((params) => {
              for (const key of spec.clearParams) params.delete(key);
              if (nextFrom && nextTo) {
                params.set(spec.fromParam, nextFrom);
                params.set(spec.toParam, nextTo);
              } else {
                params.delete(spec.fromParam);
                params.delete(spec.toParam);
                // A time of day means nothing without its days.
                if (spec.fromTimeParam) params.delete(spec.fromTimeParam);
                if (spec.toTimeParam) params.delete(spec.toTimeParam);
              }
            });
          }}
        />
      </div>
      {timed && from && to ? (
        <div className="flex h-8 items-center gap-1.5 pl-7 pr-0.5 text-role-micro text-text-muted">
          <Clock aria-hidden className={ROW_ICON_CLASS} />
          <TimeField
            label={`${spec.label} from time`}
            value={spec.fromTimeParam ? (searchParams?.get(spec.fromTimeParam) ?? '') : ''}
            onCommit={(value) => setTime(spec.fromTimeParam, value)}
          />
          <span aria-hidden>to</span>
          <TimeField
            label={`${spec.label} to time`}
            value={spec.toTimeParam ? (searchParams?.get(spec.toTimeParam) ?? '') : ''}
            onCommit={(value) => setTime(spec.toTimeParam, value)}
          />
        </div>
      ) : null}
    </div>
  );
}

/** A native `HH:mm` field; commits on blur / Enter so the URL is not rewritten per keystroke. Also the Live feed's time window. */
export function TimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type="time"
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && draft !== value) onCommit(draft);
      }}
      className={cn(
        'h-6 min-w-0 flex-1 bg-surface-sunken px-1 text-role-micro tabular-nums text-text-default ring-1 ring-inset ring-border-hairline',
        SIDEBAR_CHIP_CORNER,
        focusRing('field', 'accent'),
      )}
    />
  );
}

/** The list's order (`controls.sort`) or banding (`controls.group`): one closed row whose single choice opens under it. */
function SortRow({
  id,
  label,
  spec,
  open,
  onToggle,
}: {
  id: string;
  label: string;
  spec: NonNullable<NavControls['sort']> | NonNullable<NavControls['group']>;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const value = searchParams?.get(spec.param) ?? spec.defaultValue;
  const current = spec.options.find((option) => option.value === value) ?? spec.options[0];
  const dirParam = 'dirParam' in spec ? spec.dirParam : undefined;
  return (
    <Disclosure id={id} label={label} summary={current?.label ?? null} open={open} onToggle={onToggle}>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn('divide-y divide-border-hairline border border-border-soft bg-surface-card', SIDEBAR_CONTROL_CORNER)}
      >
        {spec.options.map((option) => {
          const selected = option.value === current?.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              {...{ [`data-nav-${id}-option`]: option.value }}
              onClick={() =>
                replace((params) => {
                  if (option.value === spec.defaultValue) params.delete(spec.param);
                  else params.set(spec.param, option.value);
                  if (!dirParam) return;
                  if ('dir' in option && option.dir) params.set(dirParam, option.dir);
                  else params.delete(dirParam);
                })
              }
              className={cn(
                'ds-raw-button flex h-8 w-full items-center gap-2 px-2 text-left text-role-caption hover:bg-surface-hover',
                NAV_CHOICE_PRESS_CLASS,
                // One order at a time: pressed in, never a check (a check reads as multi-select).
                selected ? cn(NAV_CHOICE_SELECTED_CLASS, 'hover:bg-surface-sunken') : 'text-text-muted',
                focusRing('control', 'accent'),
              )}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </Disclosure>
  );
}

/**
 * A single-choice filter with no counts (`controls.choices`): the facet
 * group's face — a check per option — over a fixed vocabulary. The lit
 * option pressed again clears the param.
 */
function ExcludeRow({
  spec,
  facetGroup,
  open,
  onToggle,
}: {
  spec: NonNullable<NavControls['exclude']>;
  facetGroup: { options: readonly { value: string; label: string; count: number }[] } | undefined;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const active = readValues(searchParams?.get(spec.param) ?? null, true);
  const toggle = (value: string) =>
    replace((params) => {
      const next = active.includes(value) ? active.filter((item) => item !== value) : [...active, value];
      if (next.length) params.set(spec.param, next.join(','));
      else params.delete(spec.param);
      params.delete('page');
    });
  return (
    <Disclosure id={spec.id} label={spec.label} summary={active.length ? `${active.length} hidden` : null} open={open} onToggle={onToggle}>
      <div role="group" aria-label={spec.label} className={cn('divide-y divide-border-hairline border border-border-soft bg-surface-card', SIDEBAR_CONTROL_CORNER)}>
        {spec.options.map((option) => {
          const selected = active.includes(option.value);
          const count = facetGroup?.options.find((item) => item.value === option.value)?.count;
          const tone = (option.tone ?? 'neutral') as StateName;
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={selected}
              onClick={() => toggle(option.value)}
              className={cn('ds-raw-button flex h-8 w-full items-center gap-2 px-2 text-left text-role-caption transition-colors hover:bg-surface-hover', selected ? 'text-text-default' : 'text-text-muted', focusRing('control', 'accent'))}
            >
              <CheckFace checked={selected} />
              <span className={cn('size-2 shrink-0 rounded-full', STATE_TONE_CLASSES[tone].dot)} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {count != null ? (
                <span className={cn(VALUE_CHIP_CLASS, 'tabular-nums', count === 0 && 'text-text-faint')}>
                  <AnimatedStat value={count} profile="scanQuantity" />
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          className={cn('ds-raw-button flex h-8 w-full items-center gap-2 px-2 text-left text-role-caption text-text-muted transition-colors hover:bg-surface-hover', focusRing('control', 'accent'))}
          onClick={() =>
            replace((params) => {
              params.delete(spec.param);
              params.delete('page');
            })
          }
          disabled={active.length === 0}
        >
          <span className="w-3.5" />
          <span>Show all</span>
        </button>
      </div>
    </Disclosure>
  );
}

function ChoiceRow({
  spec,
  open,
  onToggle,
}: {
  spec: NonNullable<NavControls['choices']>[number];
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  // A defaulted choice is never empty: unset reads as `defaultValue`.
  const value = searchParams?.get(spec.param) ?? spec.defaultValue ?? null;
  const current = spec.options.find((option) => option.value === value) ?? null;
  return (
    <Disclosure id={spec.id} label={spec.label} summary={current?.label ?? value} open={open} onToggle={onToggle}>
      <div
        role="group"
        aria-label={spec.label}
        className={cn('divide-y divide-border-hairline border border-border-soft bg-surface-card', SIDEBAR_CONTROL_CORNER)}
      >
        {spec.options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={selected}
              data-nav-choice-option={option.value}
              onClick={() =>
                replace((params) => {
                  // The default (or, with none, the lit option again) clears; a defaulted lit option stays lit.
                  if (option.value === spec.defaultValue || (selected && spec.defaultValue == null)) params.delete(spec.param);
                  else params.set(spec.param, option.value);
                  for (const key of spec.clearParams) params.delete(key);
                })
              }
              className={cn(
                'ds-raw-button flex h-8 w-full items-center gap-2 px-2 text-left text-role-caption',
                'transition-colors hover:bg-surface-hover',
                selected ? 'text-text-default' : 'text-text-muted',
                focusRing('control', 'accent'),
              )}
            >
              <CheckFace checked={selected} />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </Disclosure>
  );
}

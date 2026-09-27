'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { NavContext, NavFilters as NavFiltersSpec } from '@/lib/nav/context/schema';
import { fetchNavFacets } from '@/lib/nav/context/http-client';
import { AnimatePresence, LayoutGroup, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import { useSavedViews } from '@/hooks/useSavedViews';
import { Skeleton } from '@/components/ui/skeleton';
import { Bookmark, Calendar, Check, ChevronRight, Plus, User, X } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CHIP_CORNER, SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { parseISODate, toISODate } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import { peekActiveStaff } from '@/lib/staffCache';
import { cn } from '@/utils/_cn';
import { useReplaceSearchParams } from './useReplaceSearchParams';
import { NavSlotError } from './NavSlotError';
import { NAV_BLOCK_CLASS, NAV_BLOCK_PLATE_CLASS } from './nav-block';

const FACETS_STALE_MS = 15_000;

type NavControls = NonNullable<NavContext['controls']>;
type NavSavedViews = NonNullable<NavContext['savedViews']>;

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

/**
 * The view's filters, Vercel Logs style: a hairline with a Reset pill, then
 * one closed row per filter. A row shows its current value as a chip; the
 * options (with counts from `GET /api/nav/facets`) open on click, options
 * with nothing behind them last and dimmed. Staff and date are rows too;
 * the view's saved views follow as one-click presets.
 */
export function NavFilters({
  filters,
  controls,
  savedViews,
}: {
  filters: NavFiltersSpec | undefined;
  controls: NavControls | undefined;
  savedViews: NavSavedViews | undefined;
}) {
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const replace = useReplaceSearchParams();
  const facets = useQuery({
    queryKey: ['nav-facets', filters?.facetContext, search],
    queryFn: ({ signal }) => fetchNavFacets(filters!.facetContext, search, signal),
    enabled: filters !== undefined,
    staleTime: FACETS_STALE_MS,
    placeholderData: keepPreviousData,
  });

  const ownedParams = [
    ...(filters?.groups.map((group) => group.param) ?? []),
    ...(controls?.staff ? [controls.staff.param] : []),
    ...(controls?.dateRange
      ? [controls.dateRange.fromParam, controls.dateRange.toParam, ...controls.dateRange.clearParams]
      : []),
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

  const badgePresence = useMotionPresence(motionPresence.sidebarScopeSwap);
  const badgeTransition = useMotionTransition(motionTransition.sidebarScopeSwap);

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
                <AnimatedStat value={activeCount} speed="fast" />
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
        {controls?.staff ? <StaffRow param={controls.staff.param} /> : null}
        {controls?.dateRange ? <DateRow spec={controls.dateRange} /> : null}
        {filters
          ? filters.groups.map((declared) => {
              const group = facets.data?.groups.find((g) => g.id === declared.id);
              const active = readValues(searchParams?.get(declared.param) ?? null, declared.multi);
              const summary =
                active.length === 0
                  ? null
                  : active.length > 1
                    ? `${active.length} selected`
                    : (group?.options.find((o) => o.value === active[0])?.label ?? active[0]);
              return (
                <Disclosure
                  key={declared.id}
                  id={declared.id}
                  label={declared.label}
                  summary={summary}
                  open={open.has(declared.id)}
                  onToggle={toggleOpen}
                >
                  {group ? (
                    <div
                      role="group"
                      aria-label={declared.label}
                      className={cn('divide-y divide-border-hairline border border-border-soft bg-surface-card', SIDEBAR_CONTROL_CORNER)}
                    >
                      {orderOptions(group.options, active).map((option) => {
                        const selected = active.includes(option.value);
                        const empty = option.count === 0 && !selected;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="checkbox"
                            aria-checked={selected}
                            data-nav-filter-option={option.value}
                            data-empty={empty || undefined}
                            onClick={() => toggleValue(declared, option.value)}
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
                              <AnimatedStat value={option.count} speed="fast" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
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
            })
          : null}
      </div>
      {savedViews ? <SavedViewPresets storageKey={savedViews.storageKey} paramKeys={savedViews.paramKeys} /> : null}
    </section>
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

/**
 * The view's saved views as one-click presets (`useSavedViews`), under the
 * filter rows: one block per view (Bookmark glyph, lit while the URL matches
 * it, pressing the lit one clears it), a hover × on your own views, and a
 * `Save view` block only while unsaved filters are on. Nothing saved and no
 * filter on → nothing renders.
 */
function SavedViewPresets({ storageKey, paramKeys }: { storageKey: string; paramKeys: readonly string[] }) {
  const { views, activeView, hasActiveFilters, applyView, clearView, saveView, removeView } = useSavedViews({
    storageKey,
    paramKeys,
  });
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const plateTransition = useMotionTransition(motionTransition.sliderIndicator);
  const canSave = hasActiveFilters && !activeView;
  if (views.length === 0 && !canSave) return null;

  const commit = () => {
    if (!draft.trim()) return;
    saveView(draft);
    setDraft('');
    setNaming(false);
  };

  return (
    <div role="group" aria-label="Saved views" data-nav-presets className="flex flex-col gap-px">
      <span role="separator" className="mx-2 my-1.5 h-px bg-border-hairline" />
      <LayoutGroup id={`nav-presets:${storageKey}`}>
        {views.map((view) => {
          const lit = view.id === activeView?.id;
          return (
            <div key={view.id} className="group relative">
              <button
                type="button"
                aria-pressed={lit}
                data-nav-preset={view.id}
                onClick={() => (lit ? clearView() : applyView(view))}
                className={cn(ROW_CLASS, view.isMine && 'pr-8', lit && 'font-medium')}
              >
                {lit ? (
                  <motion.span aria-hidden layoutId="nav-preset-plate" transition={plateTransition} className={NAV_BLOCK_PLATE_CLASS} />
                ) : null}
                <Bookmark aria-hidden className={cn(ROW_ICON_CLASS, lit && 'text-text-default')} />
                <span className="min-w-0 flex-1 truncate" title={view.name}>
                  {view.name}
                </span>
              </button>
              {view.isMine ? (
                <button
                  type="button"
                  aria-label={`Delete view ${view.name}`}
                  data-nav-preset-delete={view.id}
                  onClick={() => removeView(view.id)}
                  className={cn(
                    'ds-raw-button absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-content-center text-text-faint',
                    'opacity-0 transition-opacity hover:text-text-default group-hover:opacity-100 focus-visible:opacity-100',
                    SIDEBAR_CHIP_CORNER,
                    focusRing('control', 'accent'),
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </LayoutGroup>
      {canSave ? (
        naming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              commit();
            }}
            className="flex h-8 items-center gap-2 px-2"
          >
            <Bookmark aria-hidden className={ROW_ICON_CLASS} />
            <input
              autoFocus
              value={draft}
              data-nav-preset-name
              aria-label="Name this view"
              placeholder="Name this view…"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                if (!draft.trim()) setNaming(false);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                setDraft('');
                setNaming(false);
              }}
              className={cn(
                'h-6 min-w-0 flex-1 bg-surface-sunken px-1.5 text-role-caption text-text-default ring-1 ring-inset ring-border-hairline',
                SIDEBAR_CHIP_CORNER,
                focusRing('field', 'accent'),
              )}
            />
          </form>
        ) : (
          <button
            type="button"
            data-nav-preset-save
            onClick={() => setNaming(true)}
            className={cn(ROW_CLASS, 'text-text-muted')}
          >
            <Plus aria-hidden className={ROW_ICON_CLASS} />
            <span className="min-w-0 flex-1 truncate">Save view</span>
          </button>
        )
      ) : null}
    </div>
  );
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
  const presence = useMotionPresence(motionPresence.collapseHeight);
  const transition = useMotionTransition(motionTransition.stationCollapse);
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
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={bodyId}
            key="body"
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            className="overflow-hidden"
          >
            <div className="pb-1.5 pl-6 pr-0.5 pt-0.5">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function StaffRow({ param }: { param: string }) {
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
        data-nav-filter="staff"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={ROW_CLASS}
      >
        <User aria-hidden className={ROW_ICON_CLASS} />
        <span className="min-w-0 flex-1 truncate">Staff</span>
        <span className={cn(VALUE_CHIP_CLASS, staffName && 'text-text-default')}>{staffName ?? 'All'}</span>
      </button>
      <StageStaffAssignPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        label="Filter by staff"
        role="all"
        selectedStaffId={staffId}
        onCommit={(id) => {
          replace((params) => {
            if (id == null) params.delete(param);
            else params.set(param, String(id));
          });
          setOpen(false);
        }}
      />
    </>
  );
}

function DateRow({ spec }: { spec: NonNullable<NavControls['dateRange']> }) {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const from = parseISODate(searchParams?.get(spec.fromParam) ?? '');
  const to = parseISODate(searchParams?.get(spec.toParam) ?? '');
  return (
    <div data-nav-filter="date" className={cn(ROW_CLASS, 'cursor-default pr-0.5')}>
      <Calendar aria-hidden className={ROW_ICON_CLASS} />
      <span className="min-w-0 flex-1 truncate">Date</span>
      <DateRangePickerField
        value={from && to ? { from, to } : undefined}
        placeholder={spec.placeholder}
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
            }
          });
        }}
      />
    </div>
  );
}

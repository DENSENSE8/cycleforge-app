'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { NavContext, NavFilters as NavFiltersSpec } from '@/lib/nav/context/schema';
import { fetchNavFacets } from '@/lib/nav/context/http-client';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import { SavedViewsList } from '@/components/saved-views/SavedViewsList';
import { Skeleton } from '@/components/ui/skeleton';
import { Bookmark, Calendar, Check, ChevronRight, User } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CHIP_CORNER, SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { parseISODate, toISODate } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import { peekActiveStaff } from '@/lib/staffCache';
import { cn } from '@/utils/_cn';
import { useReplaceSearchParams } from './useReplaceSearchParams';
import { NavSlotError } from './NavSlotError';
import { NAV_BLOCK_CLASS } from './nav-block';

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
 * The view's filters, Vercel Logs style: a `Filters` heading with a Reset
 * pill, then one closed row per filter. A row shows its current value as a
 * chip; the options (with counts from `GET /api/nav/facets`, the only place
 * counts appear) open on click. Staff, date and saved views are rows too, so
 * nothing view-level lives anywhere else.
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
      <header className="flex h-7 items-center gap-1.5 px-2">
        <h2 className="text-role-caption font-semibold text-text-muted">Filters</h2>
        <AnimatePresence initial={false}>
          {activeCount > 0 ? (
            <motion.span
              key="count"
              initial={badgePresence.initial}
              animate={badgePresence.animate}
              exit={badgePresence.exit}
              transition={badgeTransition}
              className={cn('bg-text-default px-1.5 text-role-micro font-semibold text-surface-card', SIDEBAR_CHIP_CORNER)}
            >
              <AnimatedStat value={activeCount} speed="fast" />
            </motion.span>
          ) : null}
        </AnimatePresence>
        <button
          type="button"
          data-nav-filters-reset
          onClick={reset}
          disabled={activeCount === 0}
          className={cn(
            'ds-raw-button ml-auto h-6 border border-border-soft bg-surface-card px-2 text-role-micro font-medium text-text-default shadow-sm',
            'transition-colors hover:bg-surface-hover disabled:border-transparent disabled:bg-transparent disabled:text-text-faint disabled:shadow-none',
            SIDEBAR_CONTROL_CORNER,
            focusRing('control', 'accent'),
          )}
        >
          Reset
        </button>
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
                      {group.options.map((option) => {
                        const selected = active.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="checkbox"
                            aria-checked={selected}
                            onClick={() => toggleValue(declared, option.value)}
                            className={cn(
                              'ds-raw-button flex h-8 w-full items-center gap-2 px-2 text-left text-role-caption',
                              'transition-colors hover:bg-surface-hover',
                              selected ? 'text-text-default' : 'text-text-muted',
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
        {savedViews ? (
          <Disclosure
            id="saved-views"
            label="Saved views"
            icon={<Bookmark aria-hidden className={ROW_ICON_CLASS} />}
            summary={null}
            open={open.has('saved-views')}
            onToggle={toggleOpen}
          >
            <SavedViewsList storageKey={savedViews.storageKey} paramKeys={savedViews.paramKeys} hideHeader />
          </Disclosure>
        ) : null}
      </div>
    </section>
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
  icon,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  icon?: ReactNode;
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
        {icon ?? (
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={chevron} className="grid shrink-0 place-content-center">
            <ChevronRight aria-hidden className={ROW_ICON_CLASS} />
          </motion.span>
        )}
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

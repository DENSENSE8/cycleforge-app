'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { navControlParams, type NavContext, type NavFilters as NavFiltersSpec } from '@/lib/nav/context/schema';
import { fetchNavFacets } from '@/lib/nav/context/http-client';
import { AnimatePresence, LayoutGroup, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { Collapse } from '@/design-system/components/Collapse';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { StageStaffAssignPopover } from '@/components/tables/compound/StageStaffAssignPopover';
import { useSavedViews } from '@/hooks/useSavedViews';
import { useOperationsSavedViewPresets } from '@/hooks/useOperationsSavedViews';
import {
  MAX_SAVED_VIEW_DIGIT,
  useSavedViewDigitHotkeys,
  useShiftHeld,
} from '@/hooks/useSavedViewDigitHotkeys';
import { OPERATIONS_SAVED_VIEWS_KEY } from '@/lib/operations/saved-view-presets';
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import { Skeleton } from '@/components/ui/skeleton';
import { Bookmark, Calendar, Check, ChevronRight, Clock, Plus, User, X } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { SIDEBAR_CHIP_CORNER, SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { parseStaffParam } from '@/lib/station/table-url-params';
import { parseISODate, toISODate } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import { getCurrentPSTDateKey } from '@/utils/date';
import { peekActiveStaff } from '@/lib/staffCache';
import { cn } from '@/utils/_cn';
import { useReplaceSearchParams } from './useReplaceSearchParams';
import { NavSlotError } from './NavSlotError';
import { NAV_BLOCK_CLASS, NAV_BLOCK_PLATE_CLASS, NAV_CHOICE_PRESS_CLASS, NAV_CHOICE_SELECTED_CLASS } from './nav-block';

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

  // Sort orders the list; it is not a filter, so Reset and the count leave it.
  const ownedParams = [
    ...(filters?.groups.map((group) => group.param) ?? []),
    ...navControlParams(controls ? { ...controls, sort: undefined } : undefined),
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
      {savedViews ? (
        savedViews.storageKey === OPERATIONS_SAVED_VIEWS_KEY ? (
          <OperationsSavedViewPresets />
        ) : (
          <SavedViewPresets storageKey={savedViews.storageKey} paramKeys={savedViews.paramKeys} />
        )
      ) : null}
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
        {controls?.sort ? (
          <SortRow spec={controls.sort} open={open.has('sort')} onToggle={toggleOpen} />
        ) : null}
        {controls?.staff?.map((row) => <StaffRow key={row.id} id={row.id} param={row.param} label={row.label} />)}
        {controls?.dates?.map((row) => <SingleDateRow key={row.id} spec={row} />)}
        {controls?.dateRanges?.map((range) => <DateRow key={range.id} spec={range} />)}
        {controls?.choices?.map((choice) => (
          <ChoiceRow key={choice.id} spec={choice} open={open.has(choice.id)} onToggle={toggleOpen} />
        ))}
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
                              <AnimatedStat value={option.count} profile="scanQuantity" />
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

/** The presets a surface offers and how to drive them — `useSavedViews`, or a surface's own store. */
interface SavedViewPresetsModel<V extends { id: string; name: string; isMine: boolean }> {
  views: readonly V[];
  activeView: V | null;
  hasActiveFilters: boolean;
  applyView: (view: V) => void;
  clearView: () => void;
  saveView: (name: string) => void;
  removeView: (id: string) => void;
}

function SavedViewPresets({ storageKey, paramKeys }: { storageKey: string; paramKeys: readonly string[] }) {
  const model = useSavedViews({ storageKey, paramKeys });
  return <SavedViewPresetList groupId={storageKey} model={model} />;
}

/** Operations ▸ History keeps its own store (system presets + `/api/operations/saved-views`). */
function OperationsSavedViewPresets() {
  const model = useOperationsSavedViewPresets();
  return <SavedViewPresetList groupId={OPERATIONS_SAVED_VIEWS_KEY} model={model} />;
}

/**
 * The view's saved views as one-click presets, at the top of the body: one
 * block per view (Bookmark glyph, lit while the URL matches it, pressing the
 * lit one clears it), a hover × on your own views, and a `Save view` block
 * only while unsaved filters are on. Nothing saved and no filter on →
 * nothing renders.
 */
function SavedViewPresetList<V extends { id: string; name: string; isMine: boolean }>({
  groupId,
  model,
}: {
  groupId: string;
  model: SavedViewPresetsModel<V>;
}) {
  const { views, activeView, hasActiveFilters, applyView, clearView, saveView, removeView } = model;
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const plateTransition = useMotionTransition(motionTransition.sliderIndicator);
  const canSave = hasActiveFilters && !activeView;
  // Hold Shift: every preset paints its digit, Shift + digit jumps (never
  // while typing — see the hook's gates).
  const shiftHeld = useShiftHeld();
  useSavedViewDigitHotkeys({
    views,
    activeViewId: activeView?.id ?? null,
    applyView,
    clearView,
  });
  if (views.length === 0 && !canSave) return null;

  const commit = () => {
    if (!draft.trim()) return;
    saveView(draft);
    setDraft('');
    setNaming(false);
  };

  return (
    <div role="group" aria-label="Saved views" data-nav-presets className="flex flex-col gap-px">
      <LayoutGroup id={`nav-presets:${groupId}`}>
        {views.map((view, index) => {
          const lit = view.id === activeView?.id;
          // The digit takes the Bookmark's slot while Shift is held — the
          // identifier is READ, never hovered for.
          const digit = shiftHeld && index < MAX_SAVED_VIEW_DIGIT ? index + 1 : null;
          return (
            <div key={view.id} className="group relative">
              <button
                type="button"
                aria-pressed={lit}
                aria-keyshortcuts={index < MAX_SAVED_VIEW_DIGIT ? `Shift+${index + 1}` : undefined}
                data-nav-preset={view.id}
                data-nav-preset-digit={digit ?? undefined}
                onClick={() => (lit ? clearView() : applyView(view))}
                className={cn(ROW_CLASS, view.isMine && 'pr-8', lit && 'font-medium')}
              >
                {lit ? (
                  <motion.span aria-hidden layoutId="nav-preset-plate" transition={plateTransition} className={NAV_BLOCK_PLATE_CLASS} />
                ) : null}
                {digit ? (
                  <KeyboardKey aria-hidden size="xs" className="pointer-events-none">
                    {digit}
                  </KeyboardKey>
                ) : (
                  <Bookmark aria-hidden className={cn(ROW_ICON_CLASS, lit && 'text-text-default')} />
                )}
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

/** A native `HH:mm` field; commits on blur / Enter so the URL is not rewritten per keystroke. */
function TimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
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

/** The list's order, as one closed row whose options open under it. */
function SortRow({
  spec,
  open,
  onToggle,
}: {
  spec: NonNullable<NavControls['sort']>;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const value = searchParams?.get(spec.param) ?? spec.defaultValue;
  const current = spec.options.find((option) => option.value === value) ?? spec.options[0];
  return (
    <Disclosure id="sort" label="Sort" summary={current?.label ?? null} open={open} onToggle={onToggle}>
      <div
        role="radiogroup"
        aria-label="Sort"
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
              data-nav-sort-option={option.value}
              onClick={() =>
                replace((params) => {
                  if (option.value === spec.defaultValue) params.delete(spec.param);
                  else params.set(spec.param, option.value);
                  if (!spec.dirParam) return;
                  if (option.dir) params.set(spec.dirParam, option.dir);
                  else params.delete(spec.dirParam);
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
  const value = searchParams?.get(spec.param) ?? null;
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
                  if (selected) params.delete(spec.param);
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

'use client';

/**
 * Outbound header filter pieces (right cluster, immediately left of All):
 *
 * - {@link OutboundExactFilters} — ◀ + expanded status chips
 * - {@link OutboundAllFilterButton} — All N (only count on this control)
 *
 * Layout in header: … | [Urgent] [filters…] [◀] [All N] | staff / table controls
 *
 * Keyboard (capture, To Ship only, when not typing):
 *   `A` = All · `1`/`2`/`3` = Pending/Tested/Blocked
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Zap } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  FULFILLMENT_STATE_META,
  fulfillmentCountsFromCombos,
  type FulfillmentState,
} from '@/lib/unshipped-state';
import { OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { useShippedScanOutData } from '@/hooks/useShippedScanOutData';
import { useOutboundStatusFilter } from '@/components/shipped/useOutboundStatusFilter';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { cn } from '@/utils/_cn';

type UnshippedLegendKey = FulfillmentState;
type FilterMode = 'unshipped' | 'packed' | 'shipped';

const UNSHIPPED_ITEMS: { state: UnshippedLegendKey; short: string }[] = [
  { state: 'PENDING', short: 'Pending' },
  { state: 'TESTED', short: 'Tested' },
  { state: 'BLOCKED', short: 'Out of stock' },
];

const SHIPPED_ITEMS: { state: OutboundState; short: string; fold?: OutboundState }[] = [
  { state: 'PACKED_STAGED', short: 'Staging' },
  { state: 'SCANNED_OUT', short: 'Out' },
  { state: 'IN_CUSTODY', short: 'Custody' },
  { state: 'DELIVERED', short: 'Delivered' },
  { state: 'ORPHAN', short: 'Orphan' },
  { state: 'EXCEPTION', short: 'Exception', fold: 'PROCESS_GAP' },
];

function parseUstatus(raw: string | null): UnshippedLegendKey | null {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'PENDING' || v === 'TESTED' || v === 'BLOCKED') return v;
  return null;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
  return false;
}

function useToShipFilterActions() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const active = parseUstatus(searchParams.get('ustatus'));
  // Wire param stays `attention` (deep-link / saved-pref stability); meaning is
  // now "urgent only" — operator-flagged expedited rows (orders.is_urgent).
  const urgentOnly =
    searchParams.get('attention') === '1' || searchParams.get('attention') === 'true';

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/dashboard'}?${qs}` : pathname || '/dashboard', {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  const selectAll = useCallback(() => {
    replaceParams((p) => {
      p.delete('ustatus');
      p.delete('stage');
      p.delete('late');
      p.delete('attention');
    });
  }, [replaceParams]);

  const toggle = useCallback(
    (state: UnshippedLegendKey) => {
      replaceParams((p) => {
        if (p.get('ustatus') === state) p.delete('ustatus');
        else {
          p.set('ustatus', state);
          p.delete('stage');
          p.delete('attention');
        }
      });
    },
    [replaceParams],
  );

  /** Urgent = operator-flagged expedited rows (orders.is_urgent). */
  const toggleUrgent = useCallback(() => {
    replaceParams((p) => {
      if (p.get('attention') === '1' || p.get('attention') === 'true') {
        p.delete('attention');
        return;
      }
      p.set('attention', '1');
      p.delete('ustatus');
      p.delete('stage');
      p.delete('late');
    });
  }, [replaceParams]);

  return { active, urgentOnly, selectAll, toggle, toggleUrgent };
}

export function useToShipFilterHotkeys(enabled: boolean) {
  const { selectAll, toggle, toggleUrgent } = useToShipFilterActions();

  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;

      const code = e.code;
      if (code === 'KeyA') {
        e.preventDefault();
        e.stopPropagation();
        selectAll();
        return;
      }
      if (code === 'Digit4' || code === 'Numpad4' || code === 'KeyU') {
        e.preventDefault();
        e.stopPropagation();
        toggleUrgent();
        return;
      }
      const digitMap: Record<string, UnshippedLegendKey> = {
        Digit1: 'PENDING',
        Numpad1: 'PENDING',
        Digit2: 'TESTED',
        Numpad2: 'TESTED',
        Digit3: 'BLOCKED',
        Numpad3: 'BLOCKED',
      };
      const lane = digitMap[code];
      if (lane) {
        e.preventDefault();
        e.stopPropagation();
        toggle(lane);
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, selectAll, toggle, toggleUrgent]);
}

function ExpandFiltersButton({
  open,
  onToggle,
  hot,
  labelOpen,
  labelClosed,
}: {
  open: boolean;
  onToggle: () => void;
  hot?: boolean;
  labelOpen: string;
  labelClosed: string;
}) {
  return (
    <HoverTooltip label={open ? labelOpen : labelClosed} asChild>
      <ToolbarButton
        iconOnly
        active={open || Boolean(hot)}
        aria-expanded={open}
        aria-label={open ? labelOpen : labelClosed}
        onClick={onToggle}
      >
        <motion.span
          className="inline-flex"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </motion.span>
      </ToolbarButton>
    </HoverTooltip>
  );
}

function ExpandedFiltersShell({ open, children }: { open: boolean; children: React.ReactNode }) {
  // Opacity + small x only — no width/layout thrash (house motion law).
  const mount = useMotionTransition(framerTransition.workbenchPaneMount);
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="outbound-exact-filters"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6 }}
          transition={mount}
          className="flex min-w-0 flex-wrap items-center gap-1.5"
          role="group"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Left cluster: hide/show chevron + exact status filters (stays with tabs). */
export function OutboundExactFilters({ mode }: { mode: FilterMode }) {
  if (mode === 'packed') return null;
  return mode === 'shipped' ? <ShippedExactFilters /> : <ToShipExactFilters />;
}

function ToShipExactFilters() {
  const { active, urgentOnly, toggle, toggleUrgent } = useToShipFilterActions();
  const [expanded, setExpanded] = useState(false);
  const hasExactFilter = urgentOnly || active != null;

  useEffect(() => {
    if (hasExactFilter) setExpanded(true);
  }, [hasExactFilter]);

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <HoverTooltip label="Operator-flagged urgent / expedited orders. Shortcut 4 / U" asChild>
        <ToolbarButton
          active={urgentOnly}
          aria-pressed={urgentOnly}
          onClick={toggleUrgent}
          aria-label="Urgent"
        >
          <Zap className={cn('h-3.5 w-3.5 shrink-0 text-amber-500', urgentOnly && 'fill-current')} />
          <span>Urgent</span>
        </ToolbarButton>
      </HoverTooltip>
      <ExpandedFiltersShell open={expanded}>
        {UNSHIPPED_ITEMS.map(({ state, short }) => {
          const isOn = active === state;
          const m = FULFILLMENT_STATE_META[state];
          return (
            <HoverTooltip key={state} label={`${m.label} — ${m.description}`} asChild>
              <ToolbarButton
                active={isOn}
                aria-pressed={isOn}
                onClick={() => toggle(state)}
                aria-label={short}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', m.dot)} />
                <span>{short}</span>
              </ToolbarButton>
            </HoverTooltip>
          );
        })}
      </ExpandedFiltersShell>
      <ExpandFiltersButton
        open={expanded}
        onToggle={() => setExpanded((o) => !o)}
        hot={hasExactFilter}
        labelOpen="Hide filters"
        labelClosed="Show filters · 1 Pending · 2 Tested · 3 Blocked · 4 Urgent"
      />
    </div>
  );
}

function ShippedExactFilters() {
  const { active, toggle } = useOutboundStatusFilter();
  const [expanded, setExpanded] = useState(false);
  const hasExactFilter = active != null;

  useEffect(() => {
    if (hasExactFilter) setExpanded(true);
  }, [hasExactFilter]);

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <ExpandFiltersButton
        open={expanded}
        onToggle={() => setExpanded((o) => !o)}
        hot={hasExactFilter}
        labelOpen="Hide status filters"
        labelClosed="Show status filters"
      />
      <ExpandedFiltersShell open={expanded}>
        {SHIPPED_ITEMS.map(({ state, short }) => {
          const isOn = active === state;
          const m = OUTBOUND_STATE_META[state];
          return (
            <HoverTooltip key={state} label={`${m.label} — ${m.description}`} asChild>
              <ToolbarButton
                active={isOn}
                aria-pressed={isOn}
                onClick={() => toggle(state)}
                aria-label={short}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', m.dot)} />
                <span>{short}</span>
              </ToolbarButton>
            </HoverTooltip>
          );
        })}
      </ExpandedFiltersShell>
    </div>
  );
}

/** Right cluster: All N only (count on this button alone for the strip). */
export function OutboundAllFilterButton({ mode }: { mode: FilterMode }) {
  if (mode === 'packed') return null;
  return mode === 'shipped' ? <ShippedAllButton /> : <ToShipAllButton />;
}

function ToShipAllButton() {
  const { data } = useQuery(unshippedQueueCountsQuery());
  const { active, urgentOnly, selectAll } = useToShipFilterActions();
  const fromCombos = fulfillmentCountsFromCombos(data?.combos ?? []);
  const counts = useMemo(
    () => ({
      PENDING: fromCombos.PENDING || data?.byStage.pending || 0,
      TESTED: fromCombos.TESTED || data?.byStage.tested || 0,
      BLOCKED: fromCombos.BLOCKED,
    }),
    [fromCombos.PENDING, fromCombos.TESTED, fromCombos.BLOCKED, data?.byStage.pending, data?.byStage.tested],
  );
  const allCount = counts.PENDING + counts.TESTED + counts.BLOCKED;
  const allActive = active == null && !urgentOnly;

  return (
    <ToolbarButton
      active={allActive}
      onClick={selectAll}
      aria-label={`All to ship · ${allCount}. Shortcut A`}
      aria-pressed={allActive}
      className="max-w-none"
    >
      <span>All</span>
      <span className={cn('tabular-nums font-black', allActive ? 'text-white/90' : 'text-text-soft')}>
        {allCount > 99 ? '99+' : allCount}
      </span>
    </ToolbarButton>
  );
}

function ShippedAllButton() {
  const { total } = useShippedScanOutData();
  const { active, clear } = useOutboundStatusFilter();
  const allActive = active == null;

  return (
    <ToolbarButton
      active={allActive}
      onClick={clear}
      aria-label={`All shipped · ${total}`}
      aria-pressed={allActive}
      className="max-w-none"
    >
      <span>All</span>
      <span className={cn('tabular-nums font-black', allActive ? 'text-white/90' : 'text-text-soft')}>
        {total > 99 ? '99+' : total}
      </span>
    </ToolbarButton>
  );
}

/** @deprecated Prefer {@link OutboundExactFilters} + {@link OutboundAllFilterButton}. */
export function OutboundFilterStrip({ mode }: { mode: FilterMode }) {
  useToShipFilterHotkeys(mode === 'unshipped');
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <OutboundExactFilters mode={mode} />
      <OutboundAllFilterButton mode={mode} />
    </div>
  );
}

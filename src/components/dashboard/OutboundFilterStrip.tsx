'use client';

/**
 * Outbound header filter pieces (right cluster):
 *
 * - {@link OutboundExactFilters} — icon-only Urgent + Filter popover (lanes / statuses + All)
 *
 * Resting chrome: [⚡] [⫶] — labels + counts live in the popover / tooltips.
 *
 * Keyboard (capture, To Ship only, when not typing):
 *   `A` = All · `1`/`2`/`3` = Pending/Tested/Blocked · `4`/`U` = Urgent
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Zap } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import {
  FULFILLMENT_STATE_META,
  fulfillmentCountsFromCombos,
  type FulfillmentState,
} from '@/lib/unshipped-state';
import { OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { useShippedScanOutData } from '@/hooks/useShippedScanOutData';
import { useOutboundStatusFilter } from '@/components/shipped/useOutboundStatusFilter';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
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

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
  return false;
}

/**
 * Toolbar + hotkey actions for To Ship / Shipping Pending. Lane toggle shares
 * {@link useToShipStatusFilter} with the KPI strips; urgent + "All" (also clears
 * legacy `late`) stay here because KPIs don't drive those.
 */
function useToShipFilterActions() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { active, toggle } = useToShipStatusFilter();
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

/** Icon-only Urgent + Filter popover (lanes / statuses + All). */
export function OutboundExactFilters({ mode }: { mode: FilterMode }) {
  if (mode === 'packed') return null;
  return mode === 'shipped' ? <ShippedExactFilters /> : <ToShipExactFilters />;
}

function ToShipExactFilters() {
  const { active, urgentOnly, selectAll, toggle, toggleUrgent } = useToShipFilterActions();
  const [open, setOpen] = useState(false);
  const { data } = useQuery(unshippedQueueCountsQuery());
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
  const laneHot = active != null;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <HoverTooltip label="Urgent / expedited · 4 / U" asChild>
        <ToolbarButton
          iconOnly
          active={urgentOnly}
          aria-pressed={urgentOnly}
          onClick={toggleUrgent}
          aria-label="Urgent"
        >
          <Zap className={cn('h-3.5 w-3.5 shrink-0 text-amber-500', urgentOnly && 'fill-current text-inherit')} />
        </ToolbarButton>
      </HoverTooltip>

      <WorkbenchFilterPopover
        open={open}
        onOpenChange={setOpen}
        hot={laneHot}
        label="Lane filters · 1 Pending · 2 Tested · 3 Blocked · A All"
      >
        <WorkbenchFilterGroupLabel>Lane</WorkbenchFilterGroupLabel>
        <WorkbenchFilterMenuRow
          label="All"
          count={allCount}
          active={allActive}
          shortcut="A"
          onClick={() => {
            selectAll();
            setOpen(false);
          }}
        />
        <WorkbenchFilterDivider />
        {UNSHIPPED_ITEMS.map(({ state, short }, i) => {
          const isOn = active === state;
          const m = FULFILLMENT_STATE_META[state];
          return (
            <WorkbenchFilterMenuRow
              key={state}
              label={short}
              count={counts[state]}
              active={isOn}
              shortcut={String(i + 1)}
              leading={<span className={cn('h-2 w-2 shrink-0 rounded-full', m.dot)} />}
              onClick={() => {
                toggle(state);
                setOpen(false);
              }}
            />
          );
        })}
      </WorkbenchFilterPopover>
    </div>
  );
}

function ShippedExactFilters() {
  const { active, toggle, clear } = useOutboundStatusFilter();
  const { total } = useShippedScanOutData();
  const [open, setOpen] = useState(false);
  const allActive = active == null;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <WorkbenchFilterPopover
        open={open}
        onOpenChange={setOpen}
        hot={active != null}
        label="Status filters"
      >
        <WorkbenchFilterGroupLabel>Status</WorkbenchFilterGroupLabel>
        <WorkbenchFilterMenuRow
          label="All"
          count={total}
          active={allActive}
          onClick={() => {
            clear();
            setOpen(false);
          }}
        />
        <WorkbenchFilterDivider />
        {SHIPPED_ITEMS.map(({ state, short }) => {
          const isOn = active === state;
          const m = OUTBOUND_STATE_META[state];
          return (
            <WorkbenchFilterMenuRow
              key={state}
              label={short}
              active={isOn}
              leading={<span className={cn('h-2 w-2 shrink-0 rounded-full', m.dot)} />}
              onClick={() => {
                toggle(state);
                setOpen(false);
              }}
            />
          );
        })}
      </WorkbenchFilterPopover>
    </div>
  );
}

/** @deprecated Prefer {@link OutboundExactFilters}. */
export function OutboundFilterStrip({ mode }: { mode: FilterMode }) {
  useToShipFilterHotkeys(mode === 'unshipped');
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <OutboundExactFilters mode={mode} />
    </div>
  );
}

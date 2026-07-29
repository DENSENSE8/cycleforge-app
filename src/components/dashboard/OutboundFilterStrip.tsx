'use client';

/**
 * Outbound header filter pieces (right cluster):
 *
 * - {@link OutboundExactFilters} — icon-only Urgent + Filter popover
 *   (Pending tab: Urgent + Blocked; tabs own Pending / Tested)
 *
 * Resting chrome: [⚡] [⫶] — labels + counts live in the popover / tooltips.
 *
 * Keyboard (capture, Pending/Tested only, when not typing):
 *   `A` = clear filters · `1`/`2` = Pending/Tested tabs · `3` = Blocked · `4`/`U` = Urgent
 */

import { useCallback, useEffect, useState } from 'react';
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
} from '@/lib/unshipped-state';
import { OUTBOUND_STATE_META, type OutboundState } from '@/lib/outbound-state';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { useShippedScanOutData } from '@/hooks/useShippedScanOutData';
import { useOutboundStatusFilter } from '@/components/shipped/useOutboundStatusFilter';
import { useToShipStatusFilter } from '@/components/unshipped/useToShipStatusFilter';
import {
  isPrePackOrderView,
  normalizeDashboardOrderViewParams,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { cn } from '@/utils/_cn';

type FilterMode = 'unshipped' | 'tested' | 'packed' | 'shipped';

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
 * Toolbar + hotkey actions for Pending / Tested. Blocked + urgent share
 * {@link useToShipStatusFilter} / attention URL params; Pending/Tested tabs are
 * first-class views via {@link normalizeDashboardOrderViewParams}.
 *
 * Shared waist with {@link OutboundKpiStrip} queue tiles — one URL write path.
 */
export function useToShipFilterActions() {
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

  const selectLifecycleTab = useCallback(
    (view: 'unshipped' | 'tested') => {
      replaceParams((p) => {
        normalizeDashboardOrderViewParams(p, view);
      });
    },
    [replaceParams],
  );

  const selectAll = useCallback(() => {
    replaceParams((p) => {
      p.delete('ustatus');
      p.delete('stage');
      p.delete('late');
      p.delete('attention');
    });
  }, [replaceParams]);

  /** Full Pending tab — lifecycle view + clear OOS / urgent refines in one write. */
  const selectPendingTab = useCallback(() => {
    replaceParams((p) => {
      normalizeDashboardOrderViewParams(p, 'unshipped');
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

  const toggleBlocked = useCallback(() => {
    // Blocked lives under Pending — jump there if needed, then toggle.
    replaceParams((p) => {
      normalizeDashboardOrderViewParams(p, 'unshipped');
      if (p.get('ustatus') === 'BLOCKED') p.delete('ustatus');
      else {
        p.set('ustatus', 'BLOCKED');
        p.delete('stage');
        p.delete('attention');
      }
    });
  }, [replaceParams]);

  return {
    active,
    urgentOnly,
    selectAll,
    selectPendingTab,
    toggle,
    toggleUrgent,
    toggleBlocked,
    selectLifecycleTab,
  };
}

export function useToShipFilterHotkeys(enabled: boolean) {
  const { selectAll, toggleUrgent, toggleBlocked, selectLifecycleTab } = useToShipFilterActions();

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
      if (code === 'Digit1' || code === 'Numpad1') {
        e.preventDefault();
        e.stopPropagation();
        selectLifecycleTab('unshipped');
        return;
      }
      if (code === 'Digit2' || code === 'Numpad2') {
        e.preventDefault();
        e.stopPropagation();
        selectLifecycleTab('tested');
        return;
      }
      if (code === 'Digit3' || code === 'Numpad3') {
        e.preventDefault();
        e.stopPropagation();
        toggleBlocked();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, selectAll, toggleUrgent, toggleBlocked, selectLifecycleTab]);
}

/** Icon-only Urgent + Filter popover (Blocked + clear). */
export function OutboundExactFilters({ mode }: { mode: FilterMode }) {
  if (mode === 'packed') return null;
  return mode === 'shipped' ? <ShippedExactFilters /> : <ToShipExactFilters mode={mode} />;
}

function ToShipExactFilters({ mode }: { mode: 'unshipped' | 'tested' }) {
  const { active, urgentOnly, selectAll, toggleBlocked, toggleUrgent } = useToShipFilterActions();
  const [open, setOpen] = useState(false);
  const { data } = useQuery(unshippedQueueCountsQuery());
  const fromCombos = fulfillmentCountsFromCombos(data?.combos ?? []);
  const blockedCount = fromCombos.BLOCKED;
  const pendingCount = (fromCombos.PENDING || data?.byStage.pending || 0) + blockedCount;
  const urgentCount = data?.urgent ?? 0;
  const blockedActive = active === 'BLOCKED';
  const allActive = !blockedActive && !urgentOnly;
  const laneHot = blockedActive || urgentOnly;
  const tabCount = mode === 'tested' ? fromCombos.TESTED || data?.byStage.tested || 0 : pendingCount;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <HoverTooltip label="Urgent" asChild>
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

      {/* Just "Filters" — the trigger tooltip does NOT enumerate hotkeys. The
          menu already prints each shortcut as a `kbd` chip on the row it acts
          on, so a trigger-level list is a second copy that drifts (it still
          named Pending/Tested tab jumps long after those became tabs). */}
      <WorkbenchFilterPopover open={open} onOpenChange={setOpen} hot={laneHot} label="Filters">
        <WorkbenchFilterGroupLabel>Filters</WorkbenchFilterGroupLabel>
        <WorkbenchFilterMenuRow
          label={mode === 'tested' ? 'All tested' : 'All on tab'}
          count={tabCount}
          active={allActive}
          shortcut="A"
          onClick={() => {
            selectAll();
            setOpen(false);
          }}
        />
        <WorkbenchFilterDivider />
        <WorkbenchFilterMenuRow
          label="Urgent"
          count={urgentCount}
          active={urgentOnly}
          shortcut="4"
          leading={<span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
          onClick={() => {
            toggleUrgent();
            setOpen(false);
          }}
        />
        {mode === 'unshipped' ? (
          <WorkbenchFilterMenuRow
            label="Out of stock"
            count={blockedCount}
            active={blockedActive}
            shortcut="3"
            leading={
              <span className={cn('h-2 w-2 shrink-0 rounded-full', FULFILLMENT_STATE_META.BLOCKED.dot)} />
            }
            onClick={() => {
              toggleBlocked();
              setOpen(false);
            }}
          />
        ) : null}
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
  useToShipFilterHotkeys(isPrePackOrderView(mode as DashboardOrderView));
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <OutboundExactFilters mode={mode} />
    </div>
  );
}

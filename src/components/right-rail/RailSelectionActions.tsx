'use client';

/** Rail selection band + action region — regions 1 and 4 of the rail anatomy (`docs/todo/order-rail-selection-plane-PLAN.md` §2). */

import { useSyncExternalStore } from 'react';
import { RIGHT_RAIL_HOST_CLOSE_SLOT_CLASS } from '@/components/right-rail/DeskRailChromeRow';
import { Button } from '@/design-system/primitives';
import {
  type PaneHeaderActionBarAction,
} from '@/components/ui/pane-header';
import type { TableStatusSelectionAction } from '@/components/tables/TableStatusBar';
import {
  SELECTION_STATUS_BAR_META,
  SELECTION_STATUS_BAR_ORDER,
} from '@/hooks/useSelectionStatusBarHotkeys';
import { cn } from '@/utils/_cn';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { resolveSelectionAction } from '@/lib/selection/selection-actions';
import {
  getRailActions,
  getServerRailActions,
  subscribeRailActions,
} from '@/lib/right-rail/rail-actions-store';

export function useRailActionSnapshot() {
  return useSyncExternalStore(subscribeRailActions, getRailActions, getServerRailActions);
}

/** How many verbs the CURRENT selection can actually run. */
export function useRailActionCount(): number {
  const { scope, rows, actions } = useRailActionSnapshot();
  if (!scope || rows.length === 0) return 0;
  return actions.filter((action) => !resolveSelectionAction(action, rows).disabled).length;
}

/** The live actions as **header icon** actions for `PaneHeaderActionBar` / Desk chrome trailing slots. */
export function useRailHeaderActions(): PaneHeaderActionBarAction[] {
  const { scope, rows, actions } = useRailActionSnapshot();
  if (!scope || rows.length === 0) return [];
  return actions
    .filter((action) => action.key !== 'delete')
    .map((action) => ({ action, resolved: resolveSelectionAction(action, rows) }))
    .filter(({ resolved }) => !resolved.disabled)
    .map(({ action, resolved }) => ({
      key: `rail-${action.key}`,
      label: resolved.label,
      icon: action.icon,
      title: resolved.reason ? `${resolved.label} — ${resolved.reason}` : resolved.label,
      onClick: () => {
        void action.run(rows, resolved.direction ? { direction: resolved.direction } : undefined);
      },
    }));
}

/** Live selection CTAs for {@link TableStatusBar}'s left cluster. */
export function useRailStatusBarActions(): TableStatusSelectionAction[] {
  const { scope, rows, actions } = useRailActionSnapshot();
  if (!scope || rows.length === 0) return [];
  return actions
    .filter((action) => action.key !== 'export')
    .map((action) => ({ action, resolved: resolveSelectionAction(action, rows) }))
    .filter(({ resolved }) => !resolved.disabled)
    .map(({ action, resolved }) => {
      const meta = SELECTION_STATUS_BAR_META[action.key];
      return {
        key: action.key,
        label: resolved.direction ? resolved.label : (meta?.label ?? action.label),
        icon: action.icon,
        variant: meta?.variant ?? 'secondary',
        hotkey: meta?.hotkey,
        onClick: () => {
          void action.run(rows, resolved.direction ? { direction: resolved.direction } : undefined);
        },
      };
    })
    .sort((a, b) => {
      const ai = SELECTION_STATUS_BAR_ORDER.indexOf(a.key);
      const bi = SELECTION_STATUS_BAR_ORDER.indexOf(b.key);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}

/** Region 1 — the selection band. */
export function RailSelectionBand({
  className,
}: {
  className?: string;
}) {
  const { scope, rows, total } = useRailActionSnapshot();
  const count = rows.length;
  if (!scope || count === 0) return null;

  const allSelected = total > 0 && count >= total;

  return (
    <div
      className={cn(
        // `pr-0`: this band reserves the host `X` cell, which sits at `right-0`.
        'flex items-center gap-2 border-b border-border-soft py-2 pl-4 pr-0',
        className,
      )}
    >
      <p className="min-w-0 flex-1 truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
        {total > 0 ? `${count} of ${total} selected` : `${count} selected`}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        {!allSelected && total > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-my-1"
            onClick={() => emitToggleAll(scope, 'all')}
          >
            Select all
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-my-1"
          onClick={() => emitToggleAll(scope, 'none')}
        >
          Clear
        </Button>
      </div>
      <span
        className={RIGHT_RAIL_HOST_CLOSE_SLOT_CLASS}
        aria-hidden
        data-right-rail-host-close-slot
      />
    </div>
  );
}

/**
 * Region 4 — the action region.
 *
 * Actions whose count / predicate constraints cannot be met are **dropped, not
 * disabled** — the same rule `ContextualSelectionBar` applied.
 */
export function RailActionRegion({ className }: { className?: string }) {
  const { scope, rows, actions } = useRailActionSnapshot();
  const count = rows.length;
  if (!scope || count === 0 || actions.length === 0) return null;

  const live = actions
    .map((action) => ({ action, resolved: resolveSelectionAction(action, rows) }))
    .filter(({ resolved }) => !resolved.disabled);
  if (live.length === 0) return null;

  const danger = live.filter(({ action }) => action.tone === 'red');
  const ordinary = live.filter(({ action }) => action.tone !== 'red');

  // Bands in declaration order; the unnamed one leads so an ungrouped lane is
  // byte-identical to what it rendered before.
  const ordinaryBands: { key: string; actions: typeof ordinary }[] = [];
  for (const entry of ordinary) {
    const key = entry.action.group ?? '';
    const band = ordinaryBands.find((b) => b.key === key);
    if (band) band.actions.push(entry);
    else ordinaryBands.push({ key, actions: [entry] });
  }

  return (
    <div
      className={cn(
        'border-t border-border-soft bg-surface-card px-4 py-3',
        className,
      )}
    >
      {/* Grouped by verb KIND when a lane names them (assign / output / …), so a wall of eight buttons reads as three short shelves. */}
      {ordinaryBands.map((band) => (
        <div key={band.key || 'ungrouped'} className={band.key ? 'mt-2 first:mt-0' : undefined}>
          {band.key ? (
            <p className="pb-1 text-role-micro font-semibold uppercase tracking-widest text-text-faint">
              {band.key}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {band.actions.map(({ action, resolved }) => (
              <Button
                key={action.key}
                type="button"
                variant={action.primary ? 'primary' : 'secondary'}
                size="sm"
                icon={action.icon}
                aria-label={resolved.label}
                title={resolved.reason ? `${resolved.label} — ${resolved.reason}` : undefined}
                onClick={() => {
                  void action.run(
                    rows,
                    resolved.direction ? { direction: resolved.direction } : undefined,
                  );
                }}
              >
                {resolved.label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      {danger.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-soft pt-3">
          {danger.map(({ action, resolved }) => (
            <Button
              key={action.key}
              type="button"
              variant="danger"
              size="sm"
              icon={action.icon}
              aria-label={resolved.label}
              onClick={() => {
                void action.run(
                  rows,
                  resolved.direction ? { direction: resolved.direction } : undefined,
                );
              }}
            >
              {resolved.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

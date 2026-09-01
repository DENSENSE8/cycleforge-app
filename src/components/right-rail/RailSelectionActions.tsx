'use client';

/**
 * Rail selection band + action region — regions 1 and 4 of the rail anatomy
 * (`docs/todo/order-rail-selection-plane-PLAN.md` §2).
 *
 * Shared by the orders selection plane and the receiving-line selection plane.
 * Reads from `rail-actions-store` so inspector hosts (mounted off the root
 * layout) and batch shells can both render the live action set without a prop
 * path between trees.
 *
 * Lifted out of `dashboard/rail/OrderRailActions` so receiving does not import
 * dashboard UI.
 */

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

/**
 * How many verbs the CURRENT selection can actually run.
 *
 * For the table's status bar, which advertises the count from the first checked
 * row. The rail that hosts these verbs only registers at 3+ rows, so an
 * operator who checked one saw a corner offering Copy and had no way to learn
 * that seven more existed — bulk label printing was discoverable only by
 * guessing to select three things.
 *
 * Counts what would really fire (`resolveSelectionAction`), so a lane where
 * half the verbs are out of scope advertises the half that work.
 */
export function useRailActionCount(): number {
  const { scope, rows, actions } = useRailActionSnapshot();
  if (!scope || rows.length === 0) return 0;
  return actions.filter((action) => !resolveSelectionAction(action, rows).disabled).length;
}

/**
 * The live actions as **header icon** actions for `PaneHeaderActionBar` /
 * Desk chrome trailing slots.
 *
 * `delete` is dropped here deliberately: destructive removal of the record in
 * hand belongs to the record's own control, not to the multi-select action set
 * that happens to have one row in it.
 */
export function useRailHeaderActions(): PaneHeaderActionBarAction[] {
  const { scope, rows, actions } = useRailActionSnapshot();
  if (!scope || rows.length === 0) return [];
  return actions
    .filter((action) => action.key !== 'delete')
    .map((action) => ({ action, resolved: resolveSelectionAction(action, rows) }))
    .filter(({ resolved }) => !resolved.disabled)
    .map(({ action }) => ({
      key: `rail-${action.key}`,
      label: action.label,
      icon: action.icon,
      title: action.label,
      onClick: () => {
        void action.run(rows);
      },
    }));
}

/**
 * Live selection CTAs for {@link TableStatusBar}'s left cluster.
 *
 * Assign / Copy / … from the first checked row. Export is omitted — the table
 * toolbar already owns CSV. Delete is kept (danger). Labels / fills / hotkeys
 * come from {@link SELECTION_STATUS_BAR_META} — add a row there for a new verb.
 */
export function useRailStatusBarActions(): TableStatusSelectionAction[] {
  const { scope, rows, actions } = useRailActionSnapshot();
  if (!scope || rows.length === 0) return [];
  return actions
    .filter((action) => action.key !== 'export')
    .map((action) => ({ action, resolved: resolveSelectionAction(action, rows) }))
    .filter(({ resolved }) => !resolved.disabled)
    .map(({ action }) => {
      const meta = SELECTION_STATUS_BAR_META[action.key];
      return {
        key: action.key,
        label: meta?.label ?? action.label,
        icon: action.icon,
        variant: meta?.variant ?? 'secondary',
        hotkey: meta?.hotkey,
        onClick: () => {
          void action.run(rows);
        },
      };
    })
    .sort((a, b) => {
      const ai = SELECTION_STATUS_BAR_ORDER.indexOf(a.key);
      const bi = SELECTION_STATUS_BAR_ORDER.indexOf(b.key);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}

/**
 * Region 1 — the selection band. Carries the affordances the capsule owned and
 * the rail would otherwise lose: the count, select-all, and clear.
 *
 * **It mounts no close.** It used to carry a `→|` at its top-left, and that was
 * the ONLY dismiss that did the right thing: the host's own control ran the
 * lifecycle half only, so it hid the rail and left every row checked with
 * nothing on screen saying so. `closeRightPanel` now runs the occupant's
 * `onClose` too — for these shells that is `emitToggleAll(scope, 'none')` — so
 * the singleton `X` clears the selection and the band's twin is redundant.
 * The trailing cell it reserves is where that `X` paints.
 */
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
  const ordinaryBands: { key: string; actions: typeof ordinary[number]['action'][] }[] = [];
  for (const { action } of ordinary) {
    const key = action.group ?? '';
    const band = ordinaryBands.find((b) => b.key === key);
    if (band) band.actions.push(action);
    else ordinaryBands.push({ key, actions: [action] });
  }

  return (
    <div
      className={cn(
        'border-t border-border-soft bg-surface-card px-4 py-3',
        className,
      )}
    >
      {/*
        Grouped by verb KIND when a lane names them (assign / output / …), so a
        wall of eight buttons reads as three short shelves. Ungrouped actions
        ride the leading band, which is what every lane that sets no `group`
        gets — the render is unchanged for them.
      */}
      {ordinaryBands.map((band) => (
        <div key={band.key || 'ungrouped'} className={band.key ? 'mt-2 first:mt-0' : undefined}>
          {band.key ? (
            <p className="pb-1 text-role-micro font-semibold uppercase tracking-widest text-text-faint">
              {band.key}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {band.actions.map((action) => (
              <Button
                key={action.key}
                type="button"
                variant={action.primary ? 'primary' : 'secondary'}
                size="sm"
                icon={action.icon}
                aria-label={action.label}
                onClick={() => {
                  void action.run(rows);
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      ))}
      {danger.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-soft pt-3">
          {danger.map(({ action }) => (
            <Button
              key={action.key}
              type="button"
              variant="danger"
              size="sm"
              icon={action.icon}
              aria-label={action.label}
              onClick={() => {
                void action.run(rows);
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

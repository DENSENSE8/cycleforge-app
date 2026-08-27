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

  return (
    <div
      className={cn(
        'border-t border-border-soft bg-surface-card px-4 py-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {ordinary.map(({ action }) => (
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

'use client';

/**
 * Rail selection band + action region — regions 1 and 4 of the rail anatomy
 * (`docs/todo/order-rail-selection-plane-PLAN.md` §2).
 *
 * This is the **upgrade of the bottom capsule**, not a relocation of it. The
 * capsule was icon-only with a tooltip, because a pinned glass pill has no room
 * for words; the rail has a full column width, so the same actions carry their
 * labels and the danger action gets separated instead of sitting one pixel from
 * "Copy details".
 *
 * It renders in BOTH rail bodies — inside the 1-row inspector and inside the
 * 2+ shell — so the operator's action set does not move when the selection
 * count crosses a boundary. That is why it reads the selection from
 * `rail-actions-store` rather than taking props: the two hosts live in
 * different React trees (see that module's docblock).
 *
 * `aria-label` on each control is deliberately the action's plain label
 * ("Copy details", "Set ship-by date", …) — the same string the capsule used,
 * because `dashboard-bulk-actions.spec.ts` asserts lane scoping by reading
 * those labels off the DOM. Renaming one silently drops a lane's coverage.
 */

import { useSyncExternalStore } from 'react';
import { Button } from '@/design-system/primitives';
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
 * Region 1 — the selection band. Carries the three affordances the capsule
 * owned and the rail would otherwise lose: the count, select-all, and clear.
 *
 * **Clear is not decoration.** With the capsule gone this is the only control
 * that empties the set, and an operator who cannot see what is selected cannot
 * trust the action region below it.
 */
export function RailSelectionBand({ className }: { className?: string }) {
  const { scope, rows, total } = useRailActionSnapshot();
  const count = rows.length;
  if (!scope || count === 0) return null;

  const allSelected = total > 0 && count >= total;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-b border-border-soft px-4 py-2',
        className,
      )}
    >
      <p className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
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
    </div>
  );
}

/**
 * Region 4 — the action region.
 *
 * Actions whose count / predicate constraints cannot be met are **dropped, not
 * disabled** — the same rule `ContextualSelectionBar` applied. A lane that
 * cannot assign a tester shows no Assign control rather than a dead one, which
 * is what makes "actions diverge by lifecycle stage" legible instead of noisy.
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
        // Separated from the ordinary set: in the capsule the delete icon sat
        // directly beside Copy, one slip away from a confirm dialog over N rows.
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

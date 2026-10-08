import type { ReactNode } from 'react';
import type { StickyActionTone } from '@/design-system/components/StickyActionBar';

/** A verb's direction for one row — the law's do / undo / already-done. */
export type VerbDirection = 'do' | 'undo' | 'done';

/** Tie-break order, so a 50/50 selection resolves deterministically. */
const DIRECTION_PRECEDENCE: readonly VerbDirection[] = ['do', 'undo', 'done'];

/** One contextual bulk action for a selection of table rows. */
export interface SelectionAction<T> {
  /** Stable identity for React keys + analytics. */
  key: string;
  label: string;
  icon?: ReactNode;
  tone?: StickyActionTone;
  /** Marks the CTA. The first `primary` action becomes the big button; the
   *  remainder render in the overflow menu in declaration order. */
  primary?: boolean;
  /** Which KIND of verb this is, as a heading in the rail. */
  group?: string;
  /** The catalog field id this verb WRITES (`orders.scanned_out`, …). */
  writesField?: string;
  /**
   * This row's direction. Omit for a one-way verb.
   *
   * Pure and per row: the selection's direction is resolved from these by
   * majority in {@link resolveSelectionAction}, never by the caller.
   */
  direction?: (row: T) => VerbDirection;
  /** Face per direction — the ONE verb's two labels ("Mark scanned out" / "Undo scan-out"). */
  directionLabels?: Partial<Record<VerbDirection, string>>;
  /** Minimum selected rows for the action to fire. Defaults to 1. */
  minSelected?: number;
  /** Maximum selected rows — e.g. `1` for single-row flows like a claim. */
  maxSelected?: number;
  /** Extra gate beyond the count constraints (e.g. "all share a carton"). */
  enabled?: (rows: T[]) => boolean;
  /** Tooltip shown when the action is disabled, explaining why. */
  disabledReason?: string;
  /** Run the verb over the rows. */
  run: (rows: T[], resolved?: { direction: VerbDirection }) => void | Promise<void>;
  /**
   * OR open this form in the strip's centered picker dialog (`RecordActionVerb.dialog`,
   * operator 2026-10-08) — e.g. choosing a location. The selected rows stay the
   * action's subject; `done` closes the dialog.
   */
  dialog?: (rows: T[], done: () => void) => ReactNode;
}

interface ResolvedSelectionAction<T> {
  action: SelectionAction<T>;
  disabled: boolean;
  /** Why it's disabled — or, when the verb is live over a MIXED selection, which rows it will skip ("4 of 7 already scanned out"). */
  reason?: string;
  /** Majority direction across the selection; undefined for a one-way verb. */
  direction?: VerbDirection;
  /** The face to paint — direction-aware, falling back to `action.label`. */
  label: string;
  /** Rows the resolved direction does NOT cover. */
  minority: T[];
}

/** Most common direction across the rows, ties broken by `do` → `undo` → `done`. */
function majorityDirection<T>(action: SelectionAction<T>, rows: T[]): VerbDirection {
  const tally = new Map<VerbDirection, number>();
  for (const row of rows) {
    const d = action.direction!(row);
    tally.set(d, (tally.get(d) ?? 0) + 1);
  }
  let best: VerbDirection = 'do';
  let bestCount = -1;
  for (const candidate of DIRECTION_PRECEDENCE) {
    const count = tally.get(candidate) ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Apply an action's count + predicate constraints against the current selection and resolve its DIRECTION from the rows, returning whether… */
export function resolveSelectionAction<T>(
  action: SelectionAction<T>,
  rows: T[],
): ResolvedSelectionAction<T> {
  const n = rows.length;
  const min = action.minSelected ?? 1;
  const base = { action, label: action.label, minority: [] as T[] };

  if (n < min) {
    return {
      ...base,
      disabled: true,
      reason: action.disabledReason ?? `Select at least ${min}`,
    };
  }
  if (action.maxSelected != null && n > action.maxSelected) {
    return {
      ...base,
      disabled: true,
      reason:
        action.disabledReason ??
        (action.maxSelected === 1
          ? 'Select a single row'
          : `Select at most ${action.maxSelected}`),
    };
  }
  if (action.enabled && !action.enabled(rows)) {
    return { ...base, disabled: true, reason: action.disabledReason };
  }
  if (!action.direction) return { ...base, disabled: false };

  const direction = majorityDirection(action, rows);
  const minority = rows.filter((row) => action.direction!(row) !== direction);
  const label = action.directionLabels?.[direction] ?? action.label;

  // Every row is already in the terminal state: there is nothing to do and no
  // way back. Disabled with the count, never hidden — the operator asked about
  // these rows and deserves the answer.
  if (direction === 'done') {
    return {
      ...base,
      label,
      disabled: true,
      reason:
        action.disabledReason ??
        `${n === 1 ? 'This row is' : `All ${n} rows are`} already ${action.label.toLowerCase()}`,
    };
  }

  return {
    action,
    label,
    direction,
    minority,
    disabled: false,
    // A mixed selection resolves, it does not hide (TABLE_ENGINE_LAW).
    reason:
      minority.length > 0
        ? `${minority.length} of ${n} skipped — ${
            direction === 'do' ? 'already done' : 'not done yet'
          }`
        : undefined,
  };
}

/** The verbs a surface may offer, given the facts its rows can resolve. */
export function offeredSelectionActions<T>(
  actions: readonly SelectionAction<T>[],
  resolvableFieldIds: Iterable<string>,
): SelectionAction<T>[] {
  const resolvable = new Set(resolvableFieldIds);
  return actions.filter((action) => !action.writesField || resolvable.has(action.writesField));
}

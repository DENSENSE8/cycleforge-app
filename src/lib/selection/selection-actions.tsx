import type { ReactNode } from 'react';
import type { StickyActionTone } from '@/design-system/components/StickyActionBar';

/**
 * A verb's direction for one row — the law's do / undo / already-done.
 *
 * `TABLE_ENGINE_LAW.verbsBindToFields`: "A reversible verb is ONE verb with two
 * directions. 'Mark scanned out' and 'Undo scan-out' are not two verbs on two
 * pages." Direction is a function of ROW STATE and never of the route.
 *
 * - `do`   — the field is unset on this row; the verb writes it.
 * - `undo` — the field is set; the verb clears it.
 * - `done` — the verb has nothing to do here and no way to reverse it
 *            (a one-way write that already landed).
 */
export type VerbDirection = 'do' | 'undo' | 'done';

/** Tie-break order, so a 50/50 selection resolves deterministically. */
const DIRECTION_PRECEDENCE: readonly VerbDirection[] = ['do', 'undo', 'done'];

/**
 * One contextual bulk action for a selection of table rows.
 *
 * ## Declared ONCE, per family — never at a page
 *
 * A verb belongs to its family's catalog and is BOUND by every surface that mounts
 * that family. A `SelectionAction` literal at a page or a mount is the fork
 * this law exists to refuse.
 *
 * ## It binds to a FIELD, not to a lane
 *
 * {@link SelectionAction.writesField} names the catalog fact the verb writes.
 * The offered set on a surface is derived from the fields that surface can
 * resolve ({@link offeredSelectionActions}) — never from a hardcoded per-lane
 * key list. A verb that writes no fact (copy, export, print, delete) declares
 * no field and is offered wherever the family is mounted; it still gates on
 * ROW STATE through {@link SelectionAction.enabled}.
 *
 * Everything that used to be "this lane offers these keys" is now a predicate
 * over the rows: "Set condition" is offered while a selected row is still in
 * the building, not because the URL says `?unshipped`. That is the same
 * answer on every surface, which is the point — a new lane inherits it.
 *
 * ## Bulk is a cardinality, not a mode
 *
 * The row `⋮` menu is this same catalog at n = 1. There is no separate bulk
 * vocabulary, and a mixed selection RESOLVES rather than hiding: the verb
 * offers the direction that applies to the majority and names the remainder
 * in {@link ResolvedSelectionAction.reason}.
 */
export interface SelectionAction<T> {
  /** Stable identity for React keys + analytics. */
  key: string;
  label: string;
  icon?: ReactNode;
  tone?: StickyActionTone;
  /** Marks the CTA. The first `primary` action becomes the big button; the
   *  remainder render in the overflow menu in declaration order. */
  primary?: boolean;
  /**
   * Which KIND of verb this is, as a heading in the rail.
   *
   * A lane can publish eight of these, and eight buttons in one wrap row is a
   * wall an operator has to read end to end every time — they do not divide by
   * what they DO (write a value onto the rows, produce something from them,
   * destroy them), only by which happened to be declared first. Grouping is the
   * cheapest way to make "where is print" a glance instead of a scan.
   *
   * Omit it and the action rides in the unlabelled leading group, so a lane
   * that never sets it renders exactly as it did.
   */
  group?: string;
  /**
   * The catalog field id this verb WRITES (`orders.scanned_out`, …).
   *
   * The gate is whether the mounted surface can RESOLVE the fact for its rows,
   * not whether it paints a column for it — a dock scan-out is offered on
   * To-ship and on Shipped from this one declaration, while To-ship still
   * refuses to paint a `Scanned out` column (`omitShippedOnlyBindings`).
   * Painting is a layout decision; being able to act on a fact the row carries
   * is not. A mount whose rows cannot answer the field never offers the verb.
   *
   * Omit for a verb that writes no fact (copy, export, print, delete).
   */
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
  /**
   * Run the verb over the rows.
   *
   * `resolved.direction` is the majority direction the operator was shown; a
   * reversible verb applies it and skips the rows it does not cover (those are
   * the ones named in {@link ResolvedSelectionAction.reason}). One-way verbs
   * ignore the second argument entirely.
   */
  run: (rows: T[], resolved?: { direction: VerbDirection }) => void | Promise<void>;
}

export interface ResolvedSelectionAction<T> {
  action: SelectionAction<T>;
  disabled: boolean;
  /**
   * Why it's disabled — or, when the verb is live over a MIXED selection, which
   * rows it will skip ("4 of 7 already scanned out"). The law requires the
   * remainder be named rather than silently dropped, so this is populated on
   * an enabled action too and consumers surface it as the tooltip.
   */
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

/**
 * Apply an action's count + predicate constraints against the current
 * selection and resolve its DIRECTION from the rows, returning whether it's
 * disabled and a human reason for the tooltip. Pure — safe to call on every
 * render.
 */
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

/**
 * The verbs a surface may offer, given the facts its rows can resolve.
 *
 * This replaces the per-lane key list the law forbids. A verb that names no
 * field is always offered (it reads the selection rather than writing a fact)
 * and gates on row state through `enabled`; a verb that names one is offered
 * only where that fact is resolvable, so a receiving-line mount never grows a
 * dock scan-out and an orders mount never has to list its keys.
 */
export function offeredSelectionActions<T>(
  actions: readonly SelectionAction<T>[],
  resolvableFieldIds: Iterable<string>,
): SelectionAction<T>[] {
  const resolvable = new Set(resolvableFieldIds);
  return actions.filter((action) => !action.writesField || resolvable.has(action.writesField));
}

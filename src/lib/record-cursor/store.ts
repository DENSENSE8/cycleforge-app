'use client';

/**
 * Record-cursor publisher store — the single owner of "which surface currently
 * defines what up/down means, and where the open record sits in it".
 *
 * A tiny module-level store (subscribe/emit + a cached snapshot per scope for
 * `useSyncExternalStore`), deliberately the same shape as
 * `src/lib/right-rail/store.ts`, `src/lib/overlay-stack/store.ts` and
 * `src/lib/assistant/context-store.ts`.
 *
 * WHY THIS EXISTS
 * Stepping record→record was seven ad-hoc channels (`navigate-shipped-details`,
 * `receiving-navigate-table`, `receiving-navigate-detail-overlay`,
 * `receiving-highlight-line`, `testing-navigate-rail`, prop-drilled
 * `onMoveUp`/`onMoveDown`, and `useSidebarRail`'s private `visibleIndices` walk)
 * carrying five hand-typed copies of `findIndex → ±1 → open`. One of those
 * channels had **no listener at all**, so the receiving details header shipped
 * two permanently dead chevrons — enabled-looking, because nothing computed a
 * bound. See `docs/todo/record-cursor-unification-PLAN.md` §1–2.
 *
 * WHY A MODULE STORE AND NOT REACT CONTEXT
 * The consumer is a right-rail panel, and a panel registers its element into
 * `right-rail/store.ts` for `RightRailHost` to render. Context resolves at the
 * *render* position, so the panel would read the host's tree — not the grid's.
 * The collection surface and the panel that steps through it are siblings in two
 * different subtrees; a module store is the only seam they share. This is the
 * same reason the three stores named above exist.
 *
 * OWNERSHIP IS PRIORITY + SEQ, NOT "LAST MOUNTED WINS"
 * Mount order cannot decide the owner, in either direction:
 *
 *  - React StrictMode double-invokes effects, and a route/mode swap mounts the
 *    incoming surface **before** the outgoing one unmounts. Under naive
 *    last-mounted-wins the stale surface's cleanup then withdraws the *live*
 *    publication and the panel's chevrons go dead with no error. The
 *    per-publication `seq` doubles as an ownership token: a withdraw only fires
 *    while its `seq` still owns the `surfaceId`, so a re-publish under the same
 *    id can never be clobbered by the previous registration's cleanup.
 *  - Visibility cannot decide it either. `ReceivingRightPane` keeps
 *    `ReceivingLinesTable` mounted at `display:none` while the focused workspace
 *    covers it, and that hidden table MUST remain the publisher — stepping
 *    carton→carton with the workspace open is today's `receiving-navigate-table`
 *    behaviour. So the claim is the explicit `enabled` flag at the React seam,
 *    never `display` and never mount order.
 *
 * `RECORD_CURSOR_PRIORITY` breaks the remaining case: a rail and the primary
 * grid on the same route both have a legitimate order, and the grid is the one
 * the operator is reading. Ties inside a tier fall back to `seq`
 * (last-published wins), exactly like `right-rail/store.ts`.
 *
 * SCOPES ARE INDEPENDENT SLOTS
 * Receiving runs two cursors at once with different totals: the grouped table
 * (`'record'`) and the PO-scoped lines inside the OPEN carton (`'sibling'`,
 * whose "Line N of M" readout already ships). One global winner would make the
 * carton header read "3 of 47 cartons" where it must read "2 of 5 lines", so the
 * top publication is resolved **per scope**.
 *
 * RECORDS ARE IMMUTABLE SNAPSHOTS
 * A publication is never mutated in place — an update replaces the record with a
 * new object — so `useSyncExternalStore`'s `Object.is` check detects a real
 * change. Two duties fall out of that, and they pull in OPPOSITE directions:
 *
 *  - `updateRecordCursor` MUST no-op when nothing actually changed. A grid
 *    re-renders on every keystroke in its filter box and allocates a fresh
 *    `RecordCursor` each time, so an unconditional emit would hand
 *    `useSyncExternalStore` a new snapshot forever and tear (or loop). Same
 *    guard `updateRightRailPanelNode` already carries.
 *  - …and it MUST emit on every real change. A gate that misses a field fails
 *    SILENTLY and in the worse direction: the store says "nothing changed", no
 *    subscriber re-renders, and the panel keeps rendering the previous `n / m`
 *    and steps to the previous target id. Appending a row while the operator
 *    stands still moves only `total`; if `total` were uncompared the header
 *    would keep reading "1 of 2" forever.
 *
 * So the comparison is not a hand-maintained `&&` chain — it is a mapped type
 * (`FieldEqMap<T>`) with one comparator per field. Adding a field to
 * `RecordCursor` or `CursorStep` is then a COMPILE error here rather than a
 * field that is silently never compared.
 *
 * SCOPE IS DECLARED TWICE AND MUST AGREE
 * A publication carries `scope` and so does the cursor inside it (the anti-mix-up
 * echo). An echo is only a safety net if something checks it, so publish/update
 * throw on a mismatch rather than seating a `'record'` cursor in the `'sibling'`
 * slot — which is exactly how a "Line 2 of 5" header ends up reading
 * "3 of 47 cartons". Classify at the earliest write.
 *
 * Plan: `docs/todo/record-cursor-unification-PLAN.md` §3.4.
 */

import { recordIdKey } from './cursor-model';
import type { CursorIntent, CursorScope, CursorStep, RecordCursor, RecordId } from './cursor-model';

/**
 * Precedence tiers for a cursor scope. A rail and the primary grid can both be
 * on screen with a legitimate order; the grid is the collection the operator is
 * actually reading, so it wins.
 */
export const RECORD_CURSOR_PRIORITY = {
  /** Sidebar / recent rails. */
  rail: 10,
  /** The primary collection grid — outranks a rail on the same route. */
  grid: 100,
} as const;

/**
 * How a surface opens a record on the cursor's behalf.
 *
 * `intent` is REQUIRED and undefaulted (a
 * safety classification takes no default): it decides whether the open counts as
 * operator navigation. `'click'` clears `scanMatchedRows`, `'step'` must not —
 * that difference is the entire reason `receiving-highlight-line` was forked
 * from `receiving-select-line`, and it is carried as a field here instead of as
 * a second event name.
 *
 * `revealFoldKey` is the fold the SURFACE must expand to make the target
 * visible. Expanding is the grid's job, not the panel's, so the panel cannot
 * hold this — without it, stepping into a collapsed fold opens the record in the
 * panel while the grid still shows the fold shut and highlights nothing, which
 * is the original defect wearing a new mechanism.
 */
export type RecordCursorOpen = (
  id: RecordId,
  ctx: { intent: CursorIntent; revealFoldKey: string | null },
) => void;

export interface RecordCursorPublication {
  /** Stable identity of the publishing surface, e.g. `orders-grid`,
   *  `receiving-lines-table`, `unbox-recent-rail`. */
  surfaceId: string;
  /** Which cursor slot this fills. Scopes never contend with each other. */
  scope: CursorScope;
  /** Higher wins the scope; ties break to the most recently published. */
  priority: number;
  /** The resolved cursor for the currently open record. */
  cursor: RecordCursor;
  /** Opens a record on this surface (and reveals its fold first). */
  open: RecordCursorOpen;
  /** Dismiss the open record. Omitted by surfaces that own close elsewhere. */
  close?: () => void;
  /** Insertion order: deterministic tie-break AND the ownership token. */
  seq: number;
}

type PublicationInput = Omit<RecordCursorPublication, 'seq'>;

const publications = new Map<string, RecordCursorPublication>();
const listeners = new Set<() => void>();
let seq = 0;

/**
 * Cached winner per scope. Rebuilt on every mutation, but the VALUES are the
 * same immutable publication records, so an unchanged scope keeps handing back
 * an identity-stable snapshot to `useSyncExternalStore`.
 *
 * **Never copy a record into the map** (`next.set(p.scope, { ...p })`). That is
 * what keeps receiving's two simultaneous cursors from tearing each other:
 * stepping a LINE must not re-render the carton table. Pinned by the
 * "mutating one scope leaves the OTHER scope snapshot identity-stable" test.
 */
let topByScope = new Map<CursorScope, RecordCursorPublication>();

function recomputeTop(): void {
  const next = new Map<CursorScope, RecordCursorPublication>();
  for (const p of publications.values()) {
    const current = next.get(p.scope);
    if (
      !current ||
      p.priority > current.priority ||
      (p.priority === current.priority && p.seq > current.seq)
    ) {
      next.set(p.scope, p);
    }
  }
  topByScope = next;
}

function emit(): void {
  for (const l of listeners) l();
}

// ─── The equality gate ───────────────────────────────────────────────────────

type FieldEq<V> = (a: V, b: V) => boolean;

/**
 * One comparator per field, with `-?` so optional fields are covered too.
 * **The point is the compile error:** a field added to `RecordCursor` later must
 * be given a comparator here, instead of joining a hand-typed `&&` chain that
 * nothing — not the compiler, not a test — notices it is missing from.
 */
type FieldEqMap<T> = { readonly [K in keyof T]-?: FieldEq<T[K]> };

const strictEq = <V,>(a: V, b: V): boolean => a === b;

function everyFieldEqual<T extends object>(map: FieldEqMap<T>, a: T, b: T): boolean {
  for (const key of Object.keys(map) as Array<keyof T>) {
    const eq = map[key] as FieldEq<T[keyof T]>;
    if (!eq(a[key], b[key])) return false;
  }
  return true;
}

const STEP_FIELD_EQ: FieldEqMap<CursorStep> = {
  /**
   * `===` on a `RecordId` is the exact hazard `recordIdKey` exists to remove,
   * and this module must not ignore its own id SoT: pg hands back `int8` as a
   * **string**, so a server refetch after a numeric optimistic write flips
   * `4822` → `'4822'` for the SAME record. Here that only costs a wasted render
   * (over-emit, not stale data) — but the panel would also re-key its step
   * target for no reason, and the rule is one canonicalization, used everywhere.
   *
   * Two blank ids both canonicalize to `null` and compare equal; a blank id
   * does not name a record, so there is nothing to distinguish.
   */
  id: (a, b) => recordIdKey(a) === recordIdKey(b),
  revealFoldKey: strictEq,
};

/** Field-level equality for the three `CursorStep | null` ends. */
function sameStep(a: CursorStep | null, b: CursorStep | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return everyFieldEqual(STEP_FIELD_EQ, a, b);
}

const CURSOR_FIELD_EQ: FieldEqMap<RecordCursor> = {
  /** Redundant by construction — `assertScopeAgreement` pins `cursor.scope` to
   *  the publication's `scope`, which `updateRecordCursor` already compares. It
   *  is listed because the mapped type requires every field, and because the
   *  redundancy is the invariant's doing, not an omission. */
  scope: strictEq,
  position: strictEq,
  total: strictEq,
  prev: sameStep,
  next: sameStep,
  first: sameStep,
  openRevealFoldKey: strictEq,
};

function sameCursor(a: RecordCursor, b: RecordCursor): boolean {
  if (a === b) return true;
  return everyFieldEqual(CURSOR_FIELD_EQ, a, b);
}

/**
 * A publication declares its scope, and so does the cursor it carries. They are
 * the same fact, so a disagreement is a caller bug that would otherwise ship as
 * a silently wrong readout — the `'sibling'` slot handing a panel a `'record'`
 * cursor makes a carton's "Line 2 of 5" header read "3 of 47". Throw at the
 * earliest write rather than seat it.
 */
function assertScopeAgreement(input: PublicationInput): void {
  if (input.cursor.scope !== input.scope) {
    throw new Error(
      `[record-cursor] surface "${input.surfaceId}" published a '${input.cursor.scope}' ` +
        `cursor into the '${input.scope}' scope. Pass the same scope to ` +
        `resolveRecordCursor() and to the publication.`,
    );
  }
}

/**
 * Claim a cursor scope. Returns a withdraw fn that removes exactly THIS claim:
 * it no-ops when the `surfaceId` has since been re-published, so a stale cleanup
 * (StrictMode's double-invoke, or a remount under the same id) cannot take down
 * the live publication.
 *
 * Content freshness is handled separately by `updateRecordCursor`, so a
 * re-render never withdraws + re-publishes (which would churn the snapshot and,
 * once panels animate on publication identity, retrigger a crossfade).
 */
export function publishRecordCursor(input: PublicationInput): () => void {
  assertScopeAgreement(input);
  seq += 1;
  const mySeq = seq;
  publications.set(input.surfaceId, {
    surfaceId: input.surfaceId,
    scope: input.scope,
    priority: input.priority,
    cursor: input.cursor,
    open: input.open,
    close: input.close,
    seq: mySeq,
  });
  recomputeTop();
  emit();
  return () => {
    const current = publications.get(input.surfaceId);
    if (current && current.seq === mySeq) {
      publications.delete(input.surfaceId);
      recomputeTop();
      emit();
    }
  };
}

/**
 * Refresh a live publication in place, keeping its `seq` (and therefore its
 * ownership + tie-break position).
 *
 * **No-ops when nothing changed, and emits when anything did.** A grid allocates
 * a fresh `RecordCursor` on every render — a keystroke in the filter box is
 * enough — so an unconditional `emit()` would give `useSyncExternalStore` a
 * brand-new snapshot on every render and tear. Missing a field is the worse
 * failure though: no emit means no re-render, so the panel silently keeps the
 * stale `n / m` and steps to the stale target. Comparison therefore runs through
 * `CURSOR_FIELD_EQ` / `STEP_FIELD_EQ` (every field, compile-enforced) plus
 * priority and both callbacks by identity; callbacks are expected to be memoized
 * at the React seam.
 *
 * Also no-ops when the id holds no claim — an update is not a back-door publish.
 */
export function updateRecordCursor(input: PublicationInput): void {
  assertScopeAgreement(input);
  const current = publications.get(input.surfaceId);
  if (!current) return;
  if (
    current.scope === input.scope &&
    current.priority === input.priority &&
    current.open === input.open &&
    current.close === input.close &&
    sameCursor(current.cursor, input.cursor)
  ) {
    return;
  }
  publications.set(input.surfaceId, {
    ...current,
    scope: input.scope,
    priority: input.priority,
    cursor: input.cursor,
    open: input.open,
    close: input.close,
  });
  recomputeTop();
  emit();
}

export function subscribeRecordCursor(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The winning publication for a scope, or null when no surface is publishing it
 * — in which case the panel renders NO chevrons and no `n / m` at all (honest
 * absence), rather than enabled buttons that step a list nobody owns.
 */
export function getRecordCursorTop(scope: CursorScope): RecordCursorPublication | null {
  return topByScope.get(scope) ?? null;
}

/** Server snapshot: a cursor only exists once a client surface has rendered. */
export function getServerRecordCursorTop(): null {
  return null;
}

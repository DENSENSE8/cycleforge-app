'use client';

/** Record-cursor publisher store — the single owner of "which surface currently defines what up/down means, and where the open record sits… */

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

/** How a surface opens a record on the cursor's behalf. */
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

/** Cached winner per scope. */
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

/** One comparator per field, with `-?` so optional fields are covered too. */
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
  /** `===` on a `RecordId` is the exact hazard `recordIdKey` exists to remove, and this module must not ignore its own id SoT: */
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
  /** Redundant by construction — `assertScopeAgreement` pins `cursor.scope` to the publication's `scope`, which `updateRecordCursor` already… */
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

/** A publication declares its scope, and so does the cursor it carries. */
function assertScopeAgreement(input: PublicationInput): void {
  if (input.cursor.scope !== input.scope) {
    throw new Error(
      `[record-cursor] surface "${input.surfaceId}" published a '${input.cursor.scope}' ` +
        `cursor into the '${input.scope}' scope. Pass the same scope to ` +
        `resolveRecordCursor() and to the publication.`,
    );
  }
}

/** Claim a cursor scope. */
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

/** Refresh a live publication in place, keeping its `seq` (and therefore its ownership + tie-break position). */
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

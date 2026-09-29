/**
 * One Exceptions source — a kind's membership, read from the lane's OWN
 * predicate. `list` returns every member (the hub filters, sorts and pages);
 * `count` answers the same predicate without the rows (the nav facets read
 * it), so a badge can never disagree with the list; `record` is one member's
 * row + resolver facts, or null once it has left the kind (resolved).
 */

import { createSingleFlight } from '@/lib/cache/single-flight';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ExceptionFacts } from './facts';
import type { ExceptionKind, ExceptionRow } from './types';

/** Per-request context. `memo` shares one load between kinds that read the same feed (Claim · Short · Unfound). */
export interface ExceptionSourceContext {
  orgId: OrgId;
  memo: Map<string, Promise<unknown>>;
}

export function exceptionSourceContext(orgId: OrgId): ExceptionSourceContext {
  return { orgId, memo: new Map() };
}

/**
 * Concurrent hub reads for one org (the list plus every sidebar facet the
 * page opens at once) share ONE in-flight load per feed — a stampede guard,
 * not a cache: the entry drops when the load settles.
 */
const orgLoads = createSingleFlight<unknown>();

/** Load once per request under `key`, joining any in-flight load of the same org feed. */
export function memoized<T>(ctx: ExceptionSourceContext, key: string, load: () => Promise<T>): Promise<T> {
  let hit = ctx.memo.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = orgLoads.run(`${ctx.orgId}:${key}`, load) as Promise<T>;
    ctx.memo.set(key, hit);
  }
  return hit;
}

export interface ExceptionRecord<F extends ExceptionFacts = ExceptionFacts> {
  row: ExceptionRow;
  facts: F;
}

export interface ExceptionSource<F extends ExceptionFacts = ExceptionFacts> {
  kind: ExceptionKind;
  list(ctx: ExceptionSourceContext): Promise<ExceptionRow[]>;
  count(ctx: ExceptionSourceContext): Promise<number>;
  record(ctx: ExceptionSourceContext, sourceId: string): Promise<ExceptionRecord<F> | null>;
}

/** ISO string or null from a pg timestamp / text. */
export function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A positive integer source id, else null. */
export function positiveIntId(sourceId: string): number | null {
  if (!/^[1-9][0-9]*$/.test(sourceId)) return null;
  const id = Number(sourceId);
  return Number.isSafeInteger(id) ? id : null;
}

/** Non-empty trimmed text or null. */
export function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

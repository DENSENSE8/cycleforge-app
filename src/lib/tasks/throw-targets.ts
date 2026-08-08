/**
 * Scan/paste → **what can I throw at someone**.
 *
 * The throw overlay accepts whatever an operator has in their hand — a tracking
 * number off a label, a PO, a carton sticker, a marketplace order id — and has
 * to turn it into the `(entityType, entityId)` pair `POST /api/tasks` wants.
 * That resolution happens on the server (`POST /api/scan/resolve`); this module
 * is the pure half that reads the answer back.
 *
 * ## Why this is a module and not four lines in the panel
 *
 * The resolve response says what was scanned, not what can be thrown, and the
 * two differ in three places that are each a silent wrong-record bug:
 *
 *  1. **A carton id is only in the redirect.** `routeScan` returns the *raw
 *     scanned string* as `entity.value` — `R-4471`, or a whole
 *     `https://…/m/r/4471` URL — and puts the numeric id solely in
 *     `entity.redirect`. So the id has to be parsed back out of a path.
 *  2. **`handleType: 'receiving'` is not always a carton.** The repair
 *     short-form also types itself `receiving` but redirects to `/m/rs/{id}`,
 *     where the number is a *repair service* id. Matching `/m/r/` loosely — or
 *     matching `handleType` alone — throws a task at carton #{repair id}, which
 *     is a real carton belonging to someone else. Hence an anchored
 *     `^/m/r/{digits}$`.
 *  3. **A receiving-LINE handle has no carton id in it.** `/m/l/{lineId}` is a
 *     line, and the inbox/task vocabulary anchors cartons. Resolving it would
 *     need a lookup this module cannot do, so it yields nothing and the panel
 *     says so — an honest empty beats a plausible wrong target.
 *
 * Pure and dependency-free (`task-vocabulary` only) so the client bundle gets
 * the mapping without a write path, and so every case above is a unit test
 * rather than something you find out about at a bench.
 */

import type { TaskEntityType } from './task-vocabulary';

/** One thing the operator could throw, already in the shape `POST /api/tasks` takes. */
export interface ThrowTarget {
  entityType: TaskEntityType;
  entityId: number;
  /** The durable key an operator recognises — PO number, order id. */
  label: string;
  /** One line of context. Omitted when there is nothing honest to say. */
  sublabel?: string;
}

/**
 * The fields of `/api/scan/resolve`'s response this module reads.
 *
 * Structural on purpose: importing the route's own `ResolveResponse` would drag
 * a server module into the browser bundle to describe a JSON shape.
 */
interface ScanResolveLike {
  kind?: string;
  entity?: Record<string, unknown> | null;
  matches?: ReadonlyArray<{
    id?: unknown;
    order_id?: unknown;
    product_title?: unknown;
    sku?: unknown;
  }> | null;
}

/** `/m/r/4471` → 4471. Anchored, so `/m/rs/4471` (a repair id) never matches. */
const CARTON_PATH = /^\/m\/r\/(\d+)$/;

function positiveInt(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** The carton a resolve answer points at, if it unambiguously points at one. */
function cartonTarget(entity: Record<string, unknown> | null | undefined): ThrowTarget | null {
  if (!entity) return null;

  // Plain-PO branch — the route already did the `receiving_carton` lookup and
  // hands back the id directly. Preferred whenever present: no path parsing.
  const direct = positiveInt(entity.receivingId);
  if (direct) {
    const po = text(entity.po);
    return {
      entityType: 'receiving',
      entityId: direct,
      label: po ? `PO ${po}` : `Carton ${direct}`,
      ...(po ? { sublabel: `Carton ${direct}` } : {}),
    };
  }

  // Printed-handle branch — the id lives in the redirect and nowhere else.
  if (entity.handleType !== 'receiving') return null;
  const id = positiveInt(CARTON_PATH.exec(text(entity.redirect) ?? '')?.[1]);
  return id ? { entityType: 'receiving', entityId: id, label: `Carton ${id}` } : null;
}

/**
 * Every record a resolve answer can be thrown at, best-first.
 *
 * A carton leads when present: a scanned sticker names exactly one, whereas
 * `matches` is a *search* (a tracking number can carry several orders) and the
 * operator may have to choose. Orders keep the server's own ordering — newest
 * first — and are deduped, since the tracking and serial lookups can both
 * surface the same row.
 */
export function resolveThrowTargets(payload: ScanResolveLike | null | undefined): ThrowTarget[] {
  if (!payload) return [];

  const targets: ThrowTarget[] = [];

  const carton = cartonTarget(payload.entity);
  if (carton) targets.push(carton);

  const seen = new Set<number>();
  for (const match of payload.matches ?? []) {
    const id = positiveInt(match?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const orderId = text(match?.order_id);
    targets.push({
      entityType: 'order',
      entityId: id,
      label: orderId ?? `Order ${id}`,
      ...(text(match?.product_title) ? { sublabel: text(match?.product_title) as string } : {}),
    });
  }

  return targets;
}

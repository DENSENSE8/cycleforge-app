/** Scan/paste → **what can I throw at someone**. */

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

/** Every record a resolve answer can be thrown at, best-first. */
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

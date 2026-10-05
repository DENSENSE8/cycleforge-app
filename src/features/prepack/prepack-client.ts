/** Browser reads for the prepack form. Every validation the server repeats at Finish is also checked here first. */

import type {
  PrepackCatalogChoice,
  PrepackKit,
  PrepackUnit,
  PrepackUnitLookup,
} from '@/lib/prepack/types';

export async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

/** The operator-facing text of a failed read or write. */
export function prepackErrorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

const NO_STORE: RequestInit = { credentials: 'include', cache: 'no-store' };

export async function fetchPrepackKit(skuCatalogId: number): Promise<PrepackKit> {
  return readJson<PrepackKit>(await fetch(`/api/prepack/catalog/${skuCatalogId}`, NO_STORE));
}

export async function fetchPrepackUnit(scan: string): Promise<PrepackUnitLookup> {
  const body = await readJson<PrepackUnitLookup>(
    await fetch(`/api/prepack/unit?scan=${encodeURIComponent(scan)}`, NO_STORE),
  );
  return body.unit ? { unit: body.unit, newSerial: null } : { unit: null, newSerial: body.newSerial };
}

/** Find-or-create: a serial never seen before becomes a unit (stamped with the package's product when chosen). */
export async function createPrepackUnit(serial: string, skuCatalogId: number | null): Promise<PrepackUnit> {
  const body = await readJson<{ unit: PrepackUnit }>(
    await fetch('/api/prepack/unit', {
      ...NO_STORE,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial, skuCatalogId }),
    }),
  );
  return body.unit;
}

/** A unit keeps the catalog identity it was received under; prepack refuses to change it. */
export function prepackCatalogMismatch(unit: PrepackUnit, catalog: PrepackCatalogChoice): string | null {
  const idMismatch = unit.skuCatalogId != null && unit.skuCatalogId !== catalog.id;
  const skuMismatch =
    unit.skuCatalogId == null &&
    Boolean(unit.sku?.trim()) &&
    unit.sku!.trim().toUpperCase() !== catalog.sku.trim().toUpperCase();
  if (!idMismatch && !skuMismatch) return null;
  return `${unit.unitUid || unit.serialNumber} belongs to ${unit.title || unit.sku || 'a different product'}, not ${catalog.sku} — scan a ${catalog.sku} serial or change the product.`;
}

/** Shipped or order-allocated units are never prepacked. */
export function prepackUnitRefusal(unit: PrepackUnit): string | null {
  const key = unit.unitUid || unit.serialNumber;
  if (unit.currentStatus === 'SHIPPED') return `${key} already shipped — scan a different serial.`;
  if (unit.orderId) return `${key} is on order ${unit.orderLabel || unit.orderId} — release it from that order first, or scan a different serial.`;
  return null;
}

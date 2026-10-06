'use client';

/** The location record's one read, away from the screen that paints it. */

import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import { locationCode, parseLocationCodeFlat, type LocationSegments } from '@/lib/barcode-routing';
import type { LocationRecord } from './location-bind-types';

export function locationRecordQueryKey(code: string) {
  return ['mobile-location-bind', code] as const;
}

/** `GET /api/locations/[barcode]`'s body as the phone reads it (every field defensive). */
type LocationRecordWire = {
  location?: { id?: number | null; room?: string | null } | null;
  contents?: Array<{
    stockId?: number | null;
    sku?: string;
    qty?: number;
    productTitle?: string | null;
    isProvisional?: boolean;
    imageUrl?: string | null;
    photoIds?: number[];
    lastCounted?: string | null;
    updatedAt?: string | null;
    minQty?: number | null;
  }>;
  handlingUnits?: Array<{
    id?: number;
    code?: string;
    status?: LocationRecord['handlingUnits'][number]['status'];
    totalUnits?: number;
    testedUnits?: number;
    holdUnits?: number;
    pairedOrderId?: number | null;
    createdAt?: string;
  }>;
  walk?: { position?: number; total?: number; previous?: string | null; next?: string | null } | null;
};

/**
 * The record the hub paints from the server payload: stock rows only while
 * they hold units or are a provisional placeholder, containers only with a
 * real id and code, and a walk step only with a 1-based position.
 */
export function locationRecordFromWire(code: string, face: string, json: LocationRecordWire): LocationRecord {
  return {
    id: json.location?.id == null ? null : Number(json.location.id),
    code,
    face,
    room: json.location?.room?.trim() || null,
    contents: (json.contents ?? [])
      .filter((c) => (Number(c.qty) > 0 || c.isProvisional === true) && c.sku)
      .map((c) => ({
        stockId: c.stockId == null ? null : Number(c.stockId),
        sku: String(c.sku),
        qty: Number(c.qty) || 0,
        productTitle: c.productTitle ?? null,
        isProvisional: c.isProvisional === true,
        imageUrl: c.imageUrl?.trim() || null,
        photoIds: (c.photoIds ?? []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0),
        lastCounted: c.lastCounted ?? null,
        lastMoved: c.updatedAt ?? null,
        minQty: c.minQty == null ? null : Number(c.minQty),
      })),
    handlingUnits: (json.handlingUnits ?? [])
      .filter((unit) => Number(unit.id) > 0 && unit.code)
      .map((unit) => ({
        id: Number(unit.id),
        code: String(unit.code),
        status: unit.status ?? 'OPEN',
        totalUnits: Number(unit.totalUnits) || 0,
        testedUnits: Number(unit.testedUnits) || 0,
        holdUnits: Number(unit.holdUnits) || 0,
        pairedOrderId: unit.pairedOrderId == null ? null : Number(unit.pairedOrderId),
        createdAt: String(unit.createdAt || ''),
      })),
    walk: json.walk && Number(json.walk.position) > 0
      ? {
          position: Number(json.walk.position),
          total: Number(json.walk.total) || 0,
          previous: json.walk.previous?.trim() || null,
          next: json.walk.next?.trim() || null,
        }
      : null,
  };
}

/**
 * `segs` is null for a barcode that is not a flat location address (a legacy
 * bin like `QA-PICK-DEMO`): it is read as-is and never auto-registered.
 */
export async function fetchLocationRecord(
  code: string,
  segs: LocationSegments | null,
): Promise<LocationRecord> {
  const face = segs ? locationCode(segs) : code;
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 404) {
    if (!segs) throw new Error(`No location ${code}. Location stickers read zone-aisle-bay-level-position (e.g. C-01-01-1-01).`);
    await registerLocations(`Zone ${segs.zone}`, [segs]);
    return { id: null, code, face, room: `Zone ${segs.zone}`, contents: [], handlingUnits: [], walk: null };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Failed to load location (${res.status})`);
  }
  return locationRecordFromWire(code, face, (await res.json()) as LocationRecordWire);
}

/** A scanned location: its record plus the short-lived proof that lets the phone put / take there. */
export type ScannedLocation = { record: LocationRecord; proof: string; expiresAt: string };

/**
 * One request for a scanned location label: the server registers a new flat
 * address on first scan, mints the scan proof, and returns the record.
 */
export async function scanLocation(code: string): Promise<ScannedLocation> {
  const segs = parseLocationCodeFlat(code);
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}/verify`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as
    | { token?: string; expiresAt?: string; record?: LocationRecordWire; error?: string; message?: string }
    | null;
  if (!res.ok || !body?.token || !body.expiresAt || !body.record) {
    throw new Error(body?.message || body?.error || `Could not verify location ${code} (${res.status})`);
  }
  return {
    record: locationRecordFromWire(code, segs ? locationCode(segs) : code, body.record),
    proof: body.token,
    expiresAt: body.expiresAt,
  };
}

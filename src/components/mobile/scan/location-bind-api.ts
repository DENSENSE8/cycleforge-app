'use client';

/** The location record's one read, away from the screen that paints it. */

import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import {
  locationCode,
  parseLocationCodeFlat,
  printedLocationCode,
  unwrapScannedLocation,
  type LocationSegments,
} from '@/lib/barcode-routing';
import { LocationNotFoundError, type LocationSuggestion } from '@/lib/locations/location-miss';
import type { LocationRecord } from './location-bind-types';

export function locationRecordQueryKey(code: string) {
  return ['mobile-location-bind', code] as const;
}

/** `GET /api/locations/[barcode]`'s body as the phone reads it (every field defensive). */
type LocationRecordWire = {
  location?: { id?: number | null; room?: string | null; barcode?: string | null } | null;
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
    stockUnits?: number;
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
  // A typed code (`c02094`) is answered with the real location: key on its barcode.
  const real = json.location?.barcode?.trim() || code;
  const realSegs = real === code ? null : parseLocationCodeFlat(real);
  return {
    id: json.location?.id == null ? null : Number(json.location.id),
    code: real,
    face: real === code ? face : realSegs ? locationCode(realSegs) : real,
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
        stockUnits: Number(unit.stockUnits) || 0,
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
 * bin like `QA-PICK-DEMO`): it is read as-is. A missing address is registered
 * on first read only with `register` — a printed label's code, never a typed
 * or guessed one.
 */
export async function fetchLocationRecord(
  code: string,
  segs: LocationSegments | null,
  { register = true }: { register?: boolean } = {},
): Promise<LocationRecord> {
  const face = segs ? locationCode(segs) : code;
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 404) {
    const body = (await res.json().catch(() => null)) as { suggestions?: LocationSuggestion[] } | null;
    if (!segs || !register) {
      const suggestions = body?.suggestions ?? [];
      throw new LocationNotFoundError(
        suggestions.length > 0
          ? `No location ${face}. Did you mean ${suggestions[0]!.face}?`
          : `No location ${face}. Location stickers read zone-aisle-bay-level (e.g. C-02-09-4).`,
        suggestions,
      );
    }
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
 * One request for a location the operator scanned or typed: the server reads
 * it in any spelling, mints the scan proof, and returns the record under its
 * real barcode. Only a PRINTED label the camera/wedge read registers a new
 * address on first sight — typed text or an item barcode that merely looks
 * like an address (`P12345`) never mints a location.
 */
export async function scanLocation(raw: string, opts: { typed?: boolean } = {}): Promise<ScannedLocation> {
  const code = unwrapScannedLocation(raw);
  const segs = parseLocationCodeFlat(code);
  const mayRegister = !opts.typed && printedLocationCode(raw) != null;
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}/verify${mayRegister ? '' : '?typed=1'}`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as
    | { token?: string; expiresAt?: string; record?: LocationRecordWire; error?: string; message?: string; suggestions?: LocationSuggestion[] }
    | null;
  if (!res.ok || !body?.token || !body.expiresAt || !body.record) {
    const message = body?.message || body?.error || `Could not verify location ${code} (${res.status})`;
    if (body?.suggestions) throw new LocationNotFoundError(message, body.suggestions);
    throw new Error(message);
  }
  return {
    record: locationRecordFromWire(code, segs ? locationCode(segs) : code, body.record),
    proof: body.token,
    expiresAt: body.expiresAt,
  };
}

/**
 * Client-safe helpers for the portable Location CRUD surface.
 *
 * The DB doors already exist and are NOT re-implemented here:
 *   list   → GET    /api/locations
 *   create → POST   /api/locations
 *   edit   → PATCH  /api/locations/[barcode]/properties
 *   delete → DELETE /api/locations/[barcode]   (409 when the bin holds stock)
 *
 * This module owns only the pure form ⇄ payload shaping and the label-face
 * rules, so the dialog stays presentational and every rule is unit-testable
 * without a DB. Bin-code formatting stays delegated to
 * {@link formatStagedLocationFace} — never re-derived here.
 */

import { parseLocationCodeFlat, type LocationSegments } from '@/lib/barcode-routing';
import { formatStagedLocationFace } from '@/lib/receiving/recent-staged-location';

export type LocationRow = {
  id: number;
  name: string | null;
  display_name?: string | null;
  room: string | null;
  barcode: string | null;
  bin_type?: string | null;
  capacity?: number | null;
  row_label?: string | null;
  col_label?: string | null;
  is_active?: boolean;
  sort_order?: number | null;
};

/** The editable surface of a bin — mirrors LocationPropertiesPatchBody. */
export type LocationFormValues = {
  name: string;
  displayName: string;
  room: string;
  barcode: string;
  binType: string;
  capacity: string;
};

export const EMPTY_LOCATION_FORM: LocationFormValues = {
  name: '',
  displayName: '',
  room: '',
  barcode: '',
  binType: '',
  capacity: '',
};

export function locationRowToForm(row: LocationRow): LocationFormValues {
  return {
    name: row.name ?? '',
    displayName: row.display_name ?? '',
    room: row.room ?? '',
    barcode: row.barcode ?? '',
    binType: row.bin_type ?? '',
    capacity: row.capacity == null ? '' : String(row.capacity),
  };
}

/** Operator-facing face for a row — same rule as the notes-footer pill. */
export function locationRowFace(row: LocationRow): string {
  const nickname = (row.display_name || '').trim();
  if (nickname) return nickname;
  return (
    formatStagedLocationFace({
      name: row.name,
      barcode: row.barcode,
      room: row.room,
      rowLabel: row.row_label,
      colLabel: row.col_label,
    }) || `Location ${row.id}`
  );
}

/** Secondary line under the face — room and bin code, when they add something. */
export function locationRowSubtitle(row: LocationRow): string {
  const parts: string[] = [];
  const face = locationRowFace(row);
  const room = (row.room || '').trim();
  const code = (row.barcode || '').trim();
  const name = (row.name || '').trim();
  if (room) parts.push(room);
  if (code && code !== face) parts.push(code);
  else if (name && name !== face) parts.push(name);
  return parts.join(' · ');
}

type LocationFormError = { field: keyof LocationFormValues; message: string };

/**
 * Validate a form. `name` is the only always-required field (a location must
 * always have one); capacity must be a non-negative integer when present.
 */
export function validateLocationForm(
  values: LocationFormValues,
): LocationFormError | null {
  if (!values.name.trim()) {
    return { field: 'name', message: 'Name is required' };
  }
  const cap = values.capacity.trim();
  if (cap) {
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 0) {
      return { field: 'capacity', message: 'Capacity must be a whole number ≥ 0' };
    }
  }
  return null;
}

/** POST /api/locations body for a brand-new bin. */
export function buildCreateLocationBody(
  values: LocationFormValues,
): Record<string, unknown> {
  const cap = values.capacity.trim();
  return {
    name: values.name.trim(),
    room: values.room.trim() || null,
    barcode: values.barcode.trim() || null,
    binType: values.binType.trim() || null,
    capacity: cap ? Number(cap) : null,
  };
}

/**
 * PATCH body for an edit — **changed fields only**, because the properties
 * route is `.strict()` and rejects an empty object. Returns null when nothing
 * changed so the caller can skip the request entirely.
 *
 * `displayName` / `barcode` / `binType` are nullable-clearable; `name` is not.
 * `room` is deliberately absent — the properties route does not accept it.
 */
export function buildUpdateLocationBody(
  original: LocationFormValues,
  next: LocationFormValues,
): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};

  if (next.name.trim() !== original.name.trim()) body.name = next.name.trim();
  if (next.displayName.trim() !== original.displayName.trim()) {
    body.displayName = next.displayName.trim() || null;
  }
  if (next.barcode.trim() !== original.barcode.trim()) {
    body.barcode = next.barcode.trim() || null;
  }
  if (next.binType.trim() !== original.binType.trim()) {
    body.binType = next.binType.trim() || null;
  }
  const capNext = next.capacity.trim();
  if (capNext !== original.capacity.trim()) {
    body.capacity = capNext ? Number(capNext) : null;
  }

  return Object.keys(body).length > 0 ? body : null;
}

/**
 * Segments for a printable sticker, when the bin code is a rack address
 * (`Z AA BB L PP`). Free-form bins (`RECEIVING-1`) have no segments — the
 * print card falls back to a code-only face rather than inventing an address.
 */
export function locationPrintSegments(row: LocationRow): LocationSegments | null {
  const code = (row.barcode || '').trim();
  if (!code) return null;
  return parseLocationCodeFlat(code.replace(/[^A-Za-z0-9]/g, ''));
}

/** Case-insensitive filter over face / name / room / bin code. */
export function filterLocations(
  rows: readonly LocationRow[],
  query: string,
): LocationRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) => {
    const hay = [row.display_name, row.name, row.room, row.barcode, row.bin_type]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

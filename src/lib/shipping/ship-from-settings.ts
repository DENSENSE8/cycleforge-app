/**
 * The organization ship-from address (`organizations.settings.shipFrom`) — the
 * warehouse origin every ShipStation rate and label is quoted from
 * (`resolveShipFrom`, src/lib/shipping/shipstation/config.ts).
 *
 * Written from Settings → Organization → Ship-from address
 * (`PATCH /api/admin/organization/profile`). An address is either EMPTY (the
 * org falls back to the SHIPSTATION_SHIP_FROM_* env vars) or COMPLETE — line 1,
 * city, state and ZIP — because a half-filled one saves fine and then still
 * answers every rate request with SHIP_FROM_NOT_CONFIGURED.
 *
 * Pure: no DB, no env.
 */

import { z } from 'zod';
import { ShipFromSchema } from '@/lib/tenancy/settings';

export type ShipFromValue = z.infer<typeof ShipFromSchema>;

/** Where the operator is sent to fix a missing origin. */
export const SHIP_FROM_SETTINGS_PATH = '/settings/organization#ship-from';

const REQUIRED: ReadonlyArray<[keyof ShipFromValue, string]> = [
  ['addressLine1', 'address line 1'],
  ['city', 'city'],
  ['state', 'state'],
  ['postalCode', 'ZIP / postal code'],
];

export type ParseShipFromResult =
  | { ok: true; value: ShipFromValue; empty: boolean }
  | { ok: false; error: string };

export function parseShipFromInput(raw: unknown): ParseShipFromResult {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'shipFrom must be an object' };
  }
  const trimmed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    trimmed[key] = typeof value === 'string' ? value.trim() : value;
  }
  if (typeof trimmed.country === 'string') trimmed.country = trimmed.country.toUpperCase() || 'US';
  if (typeof trimmed.state === 'string') trimmed.state = trimmed.state.toUpperCase();

  const parsed = ShipFromSchema.safeParse(trimmed);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Ship-from ${issue?.path.join('.') || 'address'}: ${issue?.message ?? 'invalid'}` };
  }
  const value = parsed.data;
  const addressFields: Array<keyof ShipFromValue> = ['addressLine1', 'addressLine2', 'city', 'state', 'postalCode'];
  const empty = addressFields.every((k) => !value[k]);
  if (empty) return { ok: true, value, empty: true };

  const missing = REQUIRED.filter(([k]) => !value[k]).map(([, label]) => label);
  if (missing.length > 0) {
    return { ok: false, error: `Ship-from address is incomplete — add ${missing.join(', ')}.` };
  }
  if (!/^[A-Z]{2}$/.test(value.country)) {
    return { ok: false, error: 'Ship-from country must be a 2-letter code (e.g. US).' };
  }
  return { ok: true, value, empty: false };
}

/** True when rates can be quoted from this address. */
export function isShipFromComplete(value: Partial<ShipFromValue> | null | undefined): boolean {
  return Boolean(value?.addressLine1 && value.city && value.state && value.postalCode);
}

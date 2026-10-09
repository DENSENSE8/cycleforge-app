/**
 * The counter's ship-to address — the full postal fields a repair is shipped
 * back to, carried through the kiosk session as ONE string.
 *
 * The session wire (`customer.address`, PATCH /api/kiosk/session/customer,
 * the cart snapshot, POST /api/kiosk/intake) is a single string and its old
 * events replay as-is, so the fields travel encoded: `encodeShipToAddress`
 * writes JSON, `decodeShipToAddress` reads JSON back and reads any older
 * free-typed address as the street line. Server writes land in the
 * `customers.shipping_*` columns field by field (`submitCounterTransaction`).
 */

import { postalLines } from '@/lib/customers/customer-display';

export interface ShipToAddress {
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
}

export const SHIP_TO_FIELDS = ['address1', 'address2', 'city', 'state', 'postalCode'] as const;

export const EMPTY_SHIP_TO: ShipToAddress = {
  address1: '',
  address2: '',
  city: '',
  state: '',
  postalCode: '',
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function isShipToBlank(address: ShipToAddress): boolean {
  return SHIP_TO_FIELDS.every((field) => address[field].trim() === '');
}

/** The session string for `address`; `''` when every field is blank. */
export function encodeShipToAddress(address: ShipToAddress): string {
  if (isShipToBlank(address)) return '';
  return JSON.stringify({
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
  });
}

/** The fields behind a session `address` string. A non-JSON string is a street line. */
export function decodeShipToAddress(raw: string | null | undefined): ShipToAddress {
  const value = String(raw ?? '');
  if (!value.trim()) return { ...EMPTY_SHIP_TO };
  if (value.trimStart().startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        return {
          address1: text(record.address1),
          address2: text(record.address2),
          city: text(record.city),
          state: text(record.state),
          postalCode: text(record.postalCode),
        };
      }
    } catch {
      // Not ours — fall through and keep what was typed.
    }
  }
  return { ...EMPTY_SHIP_TO, address1: value };
}

/** Trimmed copy — what the server writes. */
export function trimShipToAddress(address: ShipToAddress): ShipToAddress {
  return {
    address1: address.address1.trim(),
    address2: address.address2.trim(),
    city: address.city.trim(),
    state: address.state.trim(),
    postalCode: address.postalCode.trim(),
  };
}

/** Street line, then `City ST 12345` — blank lines dropped. */
export function shipToAddressLines(address: ShipToAddress): string[] {
  return postalLines({
    line1: address.address1,
    line2: address.address2,
    city: address.city,
    state: address.state,
    postal: address.postalCode,
    country: null,
  });
}

/** One printable line: `12 Main St, Apt 4, Springfield IL 62701`. */
export function formatShipToOneLine(address: ShipToAddress): string {
  return shipToAddressLines(address).join(', ');
}

/**
 * ShipStation v2 `POST /addresses/validate` — the response schema and its
 * mapping to the app's {@link AddressCheckResult}, plus the address key the
 * client caches checks under. Pure: no fetch, no DB.
 */

import { z } from 'zod';
import type { ShipAddress } from './types';

export type AddressCheckStatus = 'verified' | 'unverified' | 'warning' | 'error';

export type AddressCheckResult = {
  status: AddressCheckStatus;
  /** The carrier-standardized address (ZIP+4, USPS casing); null when none was matched. */
  matched: ShipAddress | null;
  messages: string[];
};

const SsAddressSchema = z
  .object({
    name: z.string().nullish(),
    phone: z.string().nullish(),
    company_name: z.string().nullish(),
    address_line1: z.string().nullish(),
    address_line2: z.string().nullish(),
    address_line3: z.string().nullish(),
    city_locality: z.string().nullish(),
    state_province: z.string().nullish(),
    postal_code: z.string().nullish(),
    country_code: z.string().nullish(),
    address_residential_indicator: z.string().nullish(),
  })
  .passthrough();

const SsMessageSchema = z
  .object({
    code: z.string().nullish(),
    message: z.string().nullish(),
    type: z.string().nullish(),
    detail_code: z.string().nullish(),
  })
  .passthrough();

const SsValidationSchema = z
  .object({
    status: z.string(),
    original_address: SsAddressSchema.nullish(),
    matched_address: SsAddressSchema.nullish(),
    messages: z.array(SsMessageSchema).nullish(),
  })
  .passthrough();

export const ValidateAddressesResponseSchema = z.array(SsValidationSchema);

const STATUSES: readonly AddressCheckStatus[] = ['verified', 'unverified', 'warning', 'error'];

function text(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function fromSsAddress(raw: z.infer<typeof SsAddressSchema>, fallback: ShipAddress | undefined): ShipAddress | null {
  const addressLine1 = text(raw.address_line1);
  const cityLocality = text(raw.city_locality);
  if (!addressLine1 || !cityLocality) return null;
  const residential = text(raw.address_residential_indicator).toLowerCase();
  return {
    // The validator echoes contact fields back blank more often than not;
    // the check is about the postal lines, so the caller's contact survives.
    name: text(raw.name) || fallback?.name || '',
    phone: text(raw.phone) || fallback?.phone || null,
    company: text(raw.company_name) || fallback?.company || null,
    addressLine1,
    addressLine2: [text(raw.address_line2), text(raw.address_line3)].filter(Boolean).join(' ') || null,
    cityLocality,
    stateProvince: text(raw.state_province),
    postalCode: text(raw.postal_code),
    countryCode: text(raw.country_code).toUpperCase() || fallback?.countryCode || '',
    residential: residential === 'yes' ? true : residential === 'no' ? false : fallback?.residential ?? null,
  };
}

/** One validation entry → the app's result. Unknown statuses read as 'error' (never silently verified). */
export function mapAddressValidation(
  raw: z.infer<typeof SsValidationSchema>,
  original?: ShipAddress,
): AddressCheckResult {
  const status = STATUSES.find((s) => s === raw.status.trim().toLowerCase()) ?? 'error';
  const messages: string[] = [];
  for (const m of raw.messages ?? []) {
    const line = text(m.message);
    if (line && !messages.includes(line)) messages.push(line);
  }
  return {
    status,
    matched: raw.matched_address ? fromSsAddress(raw.matched_address, original) : null,
    messages,
  };
}

/** Parse a whole `/addresses/validate` response; entries line up with the request's addresses. */
export function mapValidateAddressesResponse(json: unknown, originals: readonly ShipAddress[]): AddressCheckResult[] {
  return ValidateAddressesResponseSchema.parse(json).map((entry, i) => mapAddressValidation(entry, originals[i]));
}

/** A check that never reached the validator (not connected, engine error). */
export function addressCheckError(message: string): AddressCheckResult {
  return { status: 'error', matched: null, messages: [message] };
}

/**
 * Cache key for one address's check: the postal lines only (contact fields do
 * not change deliverability), whitespace-collapsed and upper-cased.
 */
export function addressCheckKey(address: ShipAddress): string {
  const norm = (value: string | null | undefined) => text(value).replace(/\s+/g, ' ').toUpperCase();
  return [
    address.addressLine1,
    address.addressLine2,
    address.cityLocality,
    address.stateProvince,
    address.postalCode,
    address.countryCode,
  ]
    .map(norm)
    .join('|');
}

const COUNTRY_NAMES: Record<string, string> = {
  'UNITED STATES': 'US',
  'UNITED STATES OF AMERICA': 'US',
  USA: 'US',
  'U.S.': 'US',
  'U.S.A.': 'US',
  CANADA: 'CA',
  'UNITED KINGDOM': 'GB',
  UK: 'GB',
  MEXICO: 'MX',
  AUSTRALIA: 'AU',
};

/** ISO alpha-2 from what the customer book stores ('US', 'us', 'United States'); blank → 'US' (the floor ships domestic). */
export function normalizeCountryCode(raw: string | null | undefined): string | null {
  const value = text(raw).toUpperCase();
  if (!value) return 'US';
  if (/^[A-Z]{2}$/.test(value)) return value;
  return COUNTRY_NAMES[value] ?? null;
}

/** The customer book's ship-to as a {@link ShipAddress}; null when it has no street + city or an unreadable country. */
export function shipAddressFromBook(book: {
  name: string;
  phone?: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}): ShipAddress | null {
  const addressLine1 = text(book.address1);
  const cityLocality = text(book.city);
  const countryCode = normalizeCountryCode(book.country);
  if (!addressLine1 || !cityLocality || !countryCode) return null;
  return {
    name: text(book.name) || 'Customer',
    phone: text(book.phone) || null,
    company: null,
    addressLine1,
    addressLine2: text(book.address2) || null,
    cityLocality,
    stateProvince: text(book.state),
    postalCode: text(book.postalCode),
    countryCode,
    residential: null,
  };
}

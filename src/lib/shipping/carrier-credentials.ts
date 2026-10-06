/**
 * Carrier API credentials as a CONFIGURATION fact, not a per-package one.
 *
 * A missing client id/secret fails every poll of that carrier identically, so
 * it is detected once (per cron run, per resync, per on-demand poll) before any
 * shipment is touched: no row's consecutive_error_count or next_check_at moves
 * for it, and the run reports `carrier_credentials_missing` instead of a
 * backlog of identical row errors (2026-10-05: prod ran with empty UPS/FedEx
 * values and backed off every open row 12h while reporting `ok`).
 */

/** The env names each polled carrier's OAuth client needs. USPS (disabled) and UNKNOWN have none here. */
const CARRIER_CREDENTIAL_ENV = {
  UPS: ['UPS_CLIENT_ID', 'UPS_CLIENT_SECRET'],
  FEDEX: ['FEDEX_CLIENT_ID', 'FEDEX_CLIENT_SECRET'],
} as const satisfies Record<string, readonly string[]>;

export const CARRIER_CREDENTIALS_MISSING = 'CARRIER_CREDENTIALS_MISSING';

/** The run-level reason a carrier was not polled. */
export type CarrierConfigFaultReason = 'carrier_credentials_missing';

export interface CarrierConfigFault {
  carrier: string;
  reason: CarrierConfigFaultReason;
  /** The env names that are unset or blank. */
  missing: string[];
}

type Env = Readonly<Record<string, string | undefined>>;

function credentialEnvOf(carrier: string): readonly string[] {
  const token = carrier.trim().toUpperCase();
  return token === 'UPS' || token === 'FEDEX' ? CARRIER_CREDENTIAL_ENV[token] : [];
}

/** The carrier's credential env names that are unset or blank in `env`. */
export function missingCarrierCredentials(carrier: string, env: Env = process.env): string[] {
  return credentialEnvOf(carrier).filter((name) => !env[name]?.trim());
}

/**
 * The provider's message for missing credentials. Stable on purpose: rows
 * backed off under it before 2026-10-06 are released by
 * `shippingCredentialRecoveryPredicate` once the values exist.
 */
export function carrierCredentialsMessage(carrier: string): string {
  return `${credentialEnvOf(carrier).join(' and ')} are required`;
}

/** Thrown by a provider asked to authenticate without its credentials. */
export class CarrierCredentialsMissingError extends Error {
  readonly code = CARRIER_CREDENTIALS_MISSING;

  constructor(
    readonly carrier: string,
    readonly missing: string[],
  ) {
    super(carrierCredentialsMessage(carrier));
    this.name = 'CarrierCredentialsMissingError';
  }
}

/**
 * The carrier's credential values (trimmed, in `CARRIER_CREDENTIAL_ENV` order);
 * throws {@link CarrierCredentialsMissingError} when any is unset or blank.
 */
export function requireCarrierCredentials(carrier: string, env: Env = process.env): string[] {
  const missing = missingCarrierCredentials(carrier, env);
  if (missing.length > 0) throw new CarrierCredentialsMissingError(carrier, missing);
  return credentialEnvOf(carrier).map((name) => (env[name] ?? '').trim());
}

/** One fault per carrier in `carriers` (upper-cased, de-duplicated) whose credentials are missing. */
export function carrierConfigFaults(carriers: readonly string[], env: Env = process.env): CarrierConfigFault[] {
  const faults: CarrierConfigFault[] = [];
  for (const carrier of new Set(carriers.map((c) => c.trim().toUpperCase()))) {
    const missing = missingCarrierCredentials(carrier, env);
    if (missing.length > 0) faults.push({ carrier, reason: 'carrier_credentials_missing', missing });
  }
  return faults;
}

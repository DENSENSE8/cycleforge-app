/** Credential operation allowlist (Wave 5). */

import type { IntegrationProvider } from './credentials';

export type CredentialOperation = `${string}.${'read' | 'write'}`;

/**
 * Allowed operations per provider credential. Empty/missing provider entry ⇒ no
 * operations allowed (deny-by-default) — adding a provider here is a deliberate,
 * reviewable step.
 */
const ALLOWLIST: Partial<Record<IntegrationProvider, ReadonlySet<CredentialOperation>>> = {
  zoho: new Set<CredentialOperation>([
    // Inbound (receiving) sync — Waves 2-4.
    'purchaseorders.read',
    'purchaseorders.write',
    'purchasereceives.read',
    // Posting a purchase receive IS the "mark received in Zoho" write; it must
    // be allowlisted or wrapping that path in withZohoCredential would deny it.
    'purchasereceives.write',
    'bills.read',
    'organizations.read',
  ]),
  ebay: new Set<CredentialOperation>([
    'orders.read',
    'purchases.read',
    'identity.read',
    'tokens.write',
  ]),
  amazon: new Set<CredentialOperation>([
    'orders.read',
    'identity.read',
    'tokens.write',
  ]),
};

/** Whether `operation` is allowed for `provider`'s credential. Pure + in-memory. */
export function isOperationAllowed(
  provider: IntegrationProvider,
  operation: CredentialOperation,
): boolean {
  return ALLOWLIST[provider]?.has(operation) ?? false;
}

/** The allowed operation set for a provider (empty set when none declared). */
export function allowedOperations(provider: IntegrationProvider): ReadonlySet<CredentialOperation> {
  return ALLOWLIST[provider] ?? new Set<CredentialOperation>();
}

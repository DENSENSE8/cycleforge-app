/**
 * Which app providers are backed by Nango, mapped to Nango's provider config
 * key (the integration id you create in the Nango dashboard / self-host).
 *
 * This module is intentionally dependency-free (no @nangohq/node) so it can be
 * imported from both server code and client components. The server seam
 * (`./nango.ts`) layers the SDK on top of this registry.
 *
 * Additive principle: a provider only routes through Nango when it appears
 * here AND Nango is configured (env present). Remove an entry to fall straight
 * back to the hand-built credential path — no other code changes needed.
 */

import type { IntegrationProvider } from './credentials';

/** app provider key → Nango provider config key. */
export const NANGO_BACKED_PROVIDERS: Partial<Record<IntegrationProvider, string>> = {
  // Pilot: Square's OAuth connect flow was the one real gap. Note the Nango
  // catalog key is "squareup", not "square".
  square: 'squareup',
  // Shopify declares authKind 'nango' in the connector registry, so it must
  // appear here or its hosted connect flow is unreachable — the session route
  // rejects any provider absent from this map, meaning the org could never get
  // a connection marker and shopifySync always threw "No Nango connection".
  // Pinned by registry-parity.test.ts.
  //
  // PREREQUISITE (external, not code): a Shopify integration with this exact
  // config key and the `read_orders` scope must exist in the Nango dashboard
  // before the connect button can complete. Until then orgs stay on the vault
  // paste-key path, which shopifyGraphql now falls back to correctly.
  shopify: 'shopify',
};

export function isNangoBackedProvider(provider: string): provider is IntegrationProvider {
  return Object.prototype.hasOwnProperty.call(NANGO_BACKED_PROVIDERS, provider);
}

export function nangoProviderConfigKey(provider: IntegrationProvider): string | null {
  return NANGO_BACKED_PROVIDERS[provider] ?? null;
}

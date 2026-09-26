/** Which app providers are backed by Nango, mapped to Nango's provider config key (the integration id you create in the Nango dashboard /… */

import type { IntegrationProvider } from './credentials';

/** app provider key → Nango provider config key. */
const NANGO_BACKED_PROVIDERS: Partial<Record<IntegrationProvider, string>> = {
  // Pilot: Square's OAuth connect flow was the one real gap. Note the Nango
  // catalog key is "squareup", not "square".
  square: 'squareup',
  // Shopify declares authKind 'nango' in the connector registry, so it must appear here or its hosted connect flow is unreachable — the…
  shopify: 'shopify',
};

export function isNangoBackedProvider(provider: string): provider is IntegrationProvider {
  return Object.prototype.hasOwnProperty.call(NANGO_BACKED_PROVIDERS, provider);
}

export function nangoProviderConfigKey(provider: IntegrationProvider): string | null {
  return NANGO_BACKED_PROVIDERS[provider] ?? null;
}

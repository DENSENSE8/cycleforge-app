import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_CATALOG } from '@/app/settings/integrations/registry';
import { VAULT_UPSERT_PROVIDERS } from './credential-schemas';
import { getConnector, listConnectors } from './connectors/registry';
import { isNangoBackedProvider } from './nango-providers';

describe('integration registry parity', () => {
  it('every catalog provider has a connector entry', () => {
    for (const def of PROVIDER_CATALOG) {
      const connector = getConnector(def.key);
      assert.ok(connector, `missing connector for catalog provider ${def.key}`);
    }
  });

  it('every vault upsert provider has a connector entry', () => {
    for (const key of VAULT_UPSERT_PROVIDERS) {
      assert.ok(getConnector(key), `missing connector for vault upsert provider ${key}`);
    }
  });

  // Regression: shopify shipped with authKind 'nango' but was never added to NANGO_BACKED_PROVIDERS, so its hosted connect flow was…
  it("every authKind 'nango' connector is registered in NANGO_BACKED_PROVIDERS", () => {
    for (const connector of listConnectors()) {
      if (connector.authKind !== 'nango') continue;
      assert.ok(
        isNangoBackedProvider(connector.provider),
        `connector ${connector.provider} declares authKind 'nango' but is missing from ` +
          'NANGO_BACKED_PROVIDERS — its hosted connect flow is unreachable',
      );
    }
  });

  it('vault catalog providers with connect=vault are in upsert enum or oauth-handled', () => {
    const vaultCatalog = PROVIDER_CATALOG.filter((p) => p.connect === 'vault').map((p) => p.key);
    for (const key of vaultCatalog) {
      const inUpsert = (VAULT_UPSERT_PROVIDERS as readonly string[]).includes(key);
      assert.ok(inUpsert, `vault catalog provider ${key} missing from VAULT_UPSERT_PROVIDERS`);
    }
  });
});

/**
 * Integration manifest guard — the invariants a byte-comparison cannot see.
 *
 * Three layers protect this artifact, and they answer different questions. Keep
 * them separate; collapsing them produces a guard that goes green for the wrong
 * reason:
 *
 *   - `registry-parity.test.ts`  — does every CATALOG entry have a connector?
 *     (catalog → connector, already covered there; not repeated here)
 *   - `--check` in verify.mjs    — is the committed JSON stale?
 *   - THIS FILE                  — is every provider ACCOUNTED FOR, and are the
 *     exclusions still honest?
 *
 * Why the third is not redundant: `--check` compares bytes, so it passes the
 * instant someone re-emits — including an emit that silently dropped a provider
 * off the marketing site. Byte equality proves the file matches the code; it
 * proves nothing about whether the code's coverage is complete.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PROVIDER_CATALOG } from '@/app/settings/integrations/registry';
import { listConnectors } from '@/lib/integrations/connectors/registry';
import {
  INFRASTRUCTURE_ONLY,
  INTEGRATION_MANIFEST_PATH,
  buildIntegrationManifest,
  findUnaccountedProviders,
  serializeIntegrationManifest,
} from './manifest';

describe('integration manifest', () => {
  // The direction `registry-parity.test.ts` does NOT cover. That test walks
  // catalog → connector; a provider added to the vault enum with no catalog
  // card passes it happily and then never reaches the marketing site, because
  // the manifest is built by mapping over PROVIDER_CATALOG. Silent omission is
  // the failure mode — nothing throws, a page just never exists.
  it('every connector is either in the display catalog or declared infrastructure', () => {
    const unaccounted = findUnaccountedProviders();
    assert.deepEqual(
      unaccounted,
      [],
      `provider(s) with no PROVIDER_CATALOG entry and no INFRASTRUCTURE_ONLY reason: ${unaccounted.join(', ')}. ` +
        'Add a catalog card (it is tenant-facing) or an INFRASTRUCTURE_ONLY entry with a reason (it is not).',
    );
  });

  // An exclusion list outlives what it excludes. Once a provider leaves the
  // enum, its INFRASTRUCTURE_ONLY row is a claim about something that no longer
  // exists — and the next reader trusts it.
  it('every INFRASTRUCTURE_ONLY entry names a real connector', () => {
    const connectorKeys = new Set(listConnectors().map((c) => c.provider as string));
    for (const key of Object.keys(INFRASTRUCTURE_ONLY)) {
      assert.ok(
        connectorKeys.has(key),
        `INFRASTRUCTURE_ONLY names '${key}', which is not a connector — stale entry, remove it.`,
      );
    }
  });

  // A blank reason is the same as no reason: it defeats the point of making the
  // list explicit rather than a silent filter.
  it('every INFRASTRUCTURE_ONLY entry carries a reason', () => {
    for (const [key, reason] of Object.entries(INFRASTRUCTURE_ONLY)) {
      assert.ok(
        reason.trim().length > 0,
        `INFRASTRUCTURE_ONLY['${key}'] has an empty reason — say why it is not tenant-facing.`,
      );
    }
  });

  // The manifest is the marketing site's input. A provider with no label or no
  // category renders as a blank card or falls out of the grouped hub entirely.
  it('every manifest provider has the fields a page needs', () => {
    for (const p of buildIntegrationManifest().providers) {
      assert.ok(p.key.trim().length > 0, 'provider with empty key');
      assert.ok(p.label.trim().length > 0, `provider '${p.key}' has no label`);
      assert.ok(p.description.trim().length > 0, `provider '${p.key}' has no description`);
      assert.ok(p.category.trim().length > 0, `provider '${p.key}' has no category`);
    }
  });

  // The hub groups by category and iterates `categories` for order. A provider
  // whose category is not in that list renders in no group at all — it does not
  // error, it just silently stops being on the marketing site. Same failure
  // shape as an unaccounted provider, one level down.
  it('every provider category appears in the ordered category list', () => {
    const manifest = buildIntegrationManifest();
    const known = new Set(manifest.categories);
    for (const p of manifest.providers) {
      assert.ok(
        known.has(p.category),
        `provider '${p.key}' has category '${p.category}', which is not in INTEGRATION_CATEGORIES — ` +
          'it would render in no group on the marketing hub.',
      );
    }
  });

  // The hub renders capability WORDS, not raw keys. A capability with no label
  // would print `orders` at a buyer, or crash a lookup — and capability-first
  // copy (never vendor sentences) is exactly what these labels exist to serve.
  it('every capability used by a provider has a display label', () => {
    const manifest = buildIntegrationManifest();
    for (const p of manifest.providers) {
      for (const cap of p.capabilities) {
        assert.ok(
          manifest.capabilityLabels[cap],
          `capability '${cap}' on provider '${p.key}' has no entry in capabilityLabels.`,
        );
      }
    }
  });

  // Sorting is what makes the bytes a pure function of the registries. Without
  // it, reordering a card in Settings shows up as manifest drift and sends
  // someone hunting for a behavior change that never happened.
  it('providers are sorted by key so the bytes are order-independent', () => {
    const keys = buildIntegrationManifest().providers.map((p) => p.key);
    assert.deepEqual(keys, [...keys].sort((a, b) => a.localeCompare(b)));
  });

  // Flows are read off the connector's own optional methods, so the manifest
  // cannot advertise a data flow that was never wired. This pins the direction
  // of that derivation: presence of a hook, never a hand-set boolean.
  it('flows are derived from connector hooks, not asserted by hand', () => {
    const connectors = new Map(listConnectors().map((c) => [c.provider as string, c]));
    for (const p of buildIntegrationManifest().providers) {
      const c = connectors.get(p.key);
      assert.equal(p.flows.pullsData, Boolean(c?.sync), `${p.key}: pullsData disagrees with sync()`);
      assert.equal(
        p.flows.pushesInventory,
        Boolean(c?.pushInventory),
        `${p.key}: pushesInventory disagrees with pushInventory()`,
      );
      assert.equal(
        p.flows.refreshesTokens,
        Boolean(c?.refresh),
        `${p.key}: refreshesTokens disagrees with refresh()`,
      );
      assert.equal(p.flows.reconciles, Boolean(c?.reconcile), `${p.key}: reconciles disagrees with reconcile()`);
    }
  });

  // Belt-and-braces with verify.mjs's `--check`. Duplicated deliberately: the
  // gate lives in a script a developer can forget to run locally, and this puts
  // the same failure in the unit-test run they already do run.
  it('the committed manifest matches the live registries', () => {
    const expected = serializeIntegrationManifest(buildIntegrationManifest());
    let committed: string;
    try {
      committed = readFileSync(INTEGRATION_MANIFEST_PATH, 'utf8');
    } catch {
      assert.fail(
        `${INTEGRATION_MANIFEST_PATH} is missing. Run \`npm run integrations:manifest -- --emit\` and commit it.`,
      );
    }
    assert.equal(
      committed,
      expected,
      'Integration manifest is stale. Run `npm run integrations:manifest -- --emit` and commit the result.',
    );
  });

  // Cheap sanity floor: the catalog is the manifest's input, so an empty or
  // collapsed catalog would emit a valid-but-empty file and every assertion
  // above would vacuously pass.
  it('the catalog is non-empty and every key is unique', () => {
    assert.ok(PROVIDER_CATALOG.length > 0, 'PROVIDER_CATALOG is empty');
    const keys = PROVIDER_CATALOG.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length, 'duplicate key in PROVIDER_CATALOG');
  });
});
